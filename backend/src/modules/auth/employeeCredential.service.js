import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { EmployeeAccount } from './EmployeeAccount.js'
import { User } from './User.js'
import { EmployeePdfCredential } from './EmployeePdfCredential.js'
import { env } from '../../config/env.js'
import { AppError } from '../../utils/AppError.js'
import { normalizeLoginId } from './auth.service.js'
import {
  decryptTemporaryPassword,
  encryptTemporaryPassword
} from './temporaryCredentialCrypto.js'

function normalizeTemporaryPassword(value) {
  return String(value || '').replace(/[^0-9]/g, '')
}

function formatTemporaryPassword(digits) {
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4, 6)}`
}

function fingerprint(digits) {
  return crypto.createHmac('sha256', env.JWT_SECRET).update(digits).digest('hex')
}

async function generateUniqueTemporaryPassword() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const digits = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')
    const temporaryPasswordFingerprint = fingerprint(digits)
    const [accountExists, pdfExists] = await Promise.all([
      EmployeeAccount.exists({ temporaryPasswordFingerprint }),
      EmployeePdfCredential.exists({ passwordFingerprint: temporaryPasswordFingerprint })
    ])
    if (!accountExists && !pdfExists) {
      return {
        displayedPassword: formatTemporaryPassword(digits),
        normalizedPassword: digits,
        temporaryPasswordFingerprint
      }
    }
  }

  throw new AppError('Could not generate a unique temporary password. Please try again.', 500)
}

export function readEmployeeTemporaryPassword(account) {
  if (!account) return null
  if (!account.mustChangePassword || account.status !== 'FIRST_LOGIN') return null
  if (!account.temporaryPasswordEncrypted) return null
  return decryptTemporaryPassword(account.temporaryPasswordEncrypted)
}

export async function createEmployeeAccount(employee) {
  const loginId = normalizeLoginId(employee.employeeCode)
  if (!loginId) throw new AppError('Employee Code is required for account creation', 400)

  const [employeeAccountExists, adminExists] = await Promise.all([
    EmployeeAccount.exists({ loginId }),
    User.exists({ loginId })
  ])

  if (employeeAccountExists || adminExists) {
    throw new AppError('Login ID already exists', 409)
  }

  const generated = await generateUniqueTemporaryPassword()
  const passwordHash = await bcrypt.hash(generated.normalizedPassword, 12)

  const account = await EmployeeAccount.create({
    employeeId: employee._id,
    loginId,
    passwordHash,
    temporaryPasswordFingerprint: generated.temporaryPasswordFingerprint,
    temporaryPasswordEncrypted: encryptTemporaryPassword(generated.displayedPassword),
    status: employee.active === false ? 'DISABLED' : 'FIRST_LOGIN',
    mustChangePassword: true,
    telegramVerified: false
  })

  return {
    account,
    temporaryPassword: generated.displayedPassword
  }
}

export async function resetEmployeeTemporaryPassword(account) {
  const generated = await generateUniqueTemporaryPassword()
  account.passwordHash = await bcrypt.hash(generated.normalizedPassword, 12)
  account.temporaryPasswordFingerprint = generated.temporaryPasswordFingerprint
  account.temporaryPasswordEncrypted = encryptTemporaryPassword(generated.displayedPassword)
  account.mustChangePassword = true
  account.passwordChangedAt = null
  account.status = account.status === 'DISABLED' ? 'DISABLED' : 'FIRST_LOGIN'
  await account.save()

  return generated.displayedPassword
}

export async function compareEmployeeLoginPassword(account, password) {
  if (account.mustChangePassword || account.status === 'FIRST_LOGIN') {
    return bcrypt.compare(normalizeTemporaryPassword(password), account.passwordHash)
  }
  return bcrypt.compare(String(password || ''), account.passwordHash)
}

export async function setPermanentEmployeePassword(account, newPassword) {
  const password = String(newPassword || '')
  if (password.length < 8) throw new AppError('New password must be at least 8 characters', 400)

  const sameAsCurrent = account.mustChangePassword
    ? await bcrypt.compare(normalizeTemporaryPassword(password), account.passwordHash)
    : await bcrypt.compare(password, account.passwordHash)

  if (sameAsCurrent) throw new AppError('New password must be different from the temporary password', 400)

  account.passwordHash = await bcrypt.hash(password, 12)
  account.mustChangePassword = false
  account.status = 'ACTIVE'
  account.passwordChangedAt = new Date()

  // The recoverable first password must no longer exist after activation.
  account.temporaryPasswordEncrypted = ''
  await account.save()
}
