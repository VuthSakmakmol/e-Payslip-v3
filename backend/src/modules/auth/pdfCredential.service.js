import crypto from 'node:crypto'
import { EmployeeAccount } from './EmployeeAccount.js'
import { EmployeePdfCredential } from './EmployeePdfCredential.js'
import { env } from '../../config/env.js'
import { AppError } from '../../utils/AppError.js'
import {
  decryptTemporaryPassword,
  encryptTemporaryPassword
} from './temporaryCredentialCrypto.js'

function formatCredential(digits) {
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4, 6)}`
}

function fingerprint(digits) {
  return crypto.createHmac('sha256', env.JWT_SECRET).update(digits).digest('hex')
}

async function generateUniquePdfPassword() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const digits = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')
    const passwordFingerprint = fingerprint(digits)
    const [accountExists, pdfExists] = await Promise.all([
      EmployeeAccount.exists({ temporaryPasswordFingerprint: passwordFingerprint }),
      EmployeePdfCredential.exists({ passwordFingerprint })
    ])

    if (!accountExists && !pdfExists) {
      return {
        displayedPassword: formatCredential(digits),
        passwordFingerprint
      }
    }
  }

  throw new AppError('Could not generate a unique PDF password. Please try again.', 500)
}

export function readEmployeePdfPassword(credential) {
  if (!credential || credential.status !== 'ACTIVE' || !credential.passwordEncrypted) return null
  return decryptTemporaryPassword(credential.passwordEncrypted)
}

export async function createEmployeePdfCredential(employee) {
  const exists = await EmployeePdfCredential.exists({ employeeId: employee._id })
  if (exists) throw new AppError('Employee PDF credential already exists', 409)

  const generated = await generateUniquePdfPassword()
  const credential = await EmployeePdfCredential.create({
    employeeId: employee._id,
    passwordFingerprint: generated.passwordFingerprint,
    passwordEncrypted: encryptTemporaryPassword(generated.displayedPassword),
    status: employee.active === false ? 'DISABLED' : 'ACTIVE'
  })

  return { credential, pdfPassword: generated.displayedPassword }
}

export async function resetEmployeePdfPassword(credential) {
  const generated = await generateUniquePdfPassword()
  credential.passwordFingerprint = generated.passwordFingerprint
  credential.passwordEncrypted = encryptTemporaryPassword(generated.displayedPassword)
  credential.rotatedAt = new Date()
  await credential.save()
  return generated.displayedPassword
}
