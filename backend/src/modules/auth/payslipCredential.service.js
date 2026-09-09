import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import { PayslipCredential } from './PayslipCredential.js'
import { env } from '../../config/env.js'
import { AppError } from '../../utils/AppError.js'
import { decryptTemporaryPassword, encryptTemporaryPassword } from './temporaryCredentialCrypto.js'

const normalize = (value) => String(value || '').replace(/[^0-9]/g, '')
const fingerprint = (digits) => crypto
  .createHmac('sha256', env.JWT_SECRET)
  .update(`payslip:${digits}`)
  .digest('hex')

async function generateUniquePassword() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    // Exactly six numeric characters. Example: 483271 (never 48-32-71).
    const password = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')
    const passwordFingerprint = fingerprint(password)
    if (!(await PayslipCredential.exists({ passwordFingerprint }))) {
      return { password, passwordFingerprint }
    }
  }
  throw new AppError('Could not generate a unique 6-digit e-PaySlip password', 500)
}

export function readPayslipPassword(credential) {
  if (!credential?.passwordEncrypted) return null
  return decryptTemporaryPassword(credential.passwordEncrypted)
}

async function loadCredential(employeeOrCredential) {
  if (!employeeOrCredential) return null
  if (employeeOrCredential?.employeeId && employeeOrCredential?._id) {
    return PayslipCredential.findById(employeeOrCredential._id)
      .select('+passwordHash +passwordFingerprint +passwordEncrypted')
  }
  const employeeId = employeeOrCredential?._id || employeeOrCredential?.id || employeeOrCredential
  return PayslipCredential.findOne({ employeeId })
    .select('+passwordHash +passwordFingerprint +passwordEncrypted')
}

async function ensurePasswordHash(credential, password) {
  if (credential.passwordHash) return credential
  credential.passwordHash = await bcrypt.hash(password, 12)
  await credential.save()
  return credential
}

export async function createPayslipCredential(employee) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const generated = await generateUniquePassword()
    try {
      const credential = await PayslipCredential.create({
        employeeId: employee._id || employee.id,
        passwordHash: await bcrypt.hash(generated.password, 12),
        passwordFingerprint: generated.passwordFingerprint,
        passwordEncrypted: encryptTemporaryPassword(generated.password)
      })
      return { credential, password: generated.password }
    } catch (error) {
      if (error?.code === 11000 && error?.keyPattern?.employeeId) {
        const existing = await PayslipCredential.findOne({
          employeeId: employee._id || employee.id
        }).select('+passwordHash +passwordEncrypted +passwordFingerprint')
        if (existing) {
          const password = readPayslipPassword(existing)
          if (/^\d{6}$/.test(String(password || ''))) {
            await ensurePasswordHash(existing, password)
            return { credential: existing, password }
          }
        }
      }
      if (error?.code !== 11000) throw error
    }
  }
  throw new AppError('Could not create the employee e-PaySlip password', 500)
}

export async function ensurePayslipCredential(employee) {
  let credential = await PayslipCredential.findOne({
    employeeId: employee._id || employee.id
  }).select('+passwordHash +passwordEncrypted +passwordFingerprint')

  if (!credential) return createPayslipCredential(employee)

  const password = readPayslipPassword(credential)
  if (!/^\d{6}$/.test(String(password || ''))) {
    const nextPassword = await resetPayslipPassword(credential)
    credential = await PayslipCredential.findById(credential._id)
      .select('+passwordHash +passwordEncrypted +passwordFingerprint')
    return { credential, password: nextPassword }
  }

  await ensurePasswordHash(credential, password)
  return { credential, password }
}

export async function ensurePayslipPassword(employee) {
  return (await ensurePayslipCredential(employee)).password
}

export async function resetPayslipPassword(credentialOrEmployee) {
  let credential = await loadCredential(credentialOrEmployee)
  if (!credential) {
    return (await createPayslipCredential(credentialOrEmployee)).password
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const generated = await generateUniquePassword()
    credential.passwordHash = await bcrypt.hash(generated.password, 12)
    credential.passwordFingerprint = generated.passwordFingerprint
    credential.passwordEncrypted = encryptTemporaryPassword(generated.password)
    credential.telegramFailedAttempts = 0
    credential.telegramLockedUntil = null
    credential.telegramVerifiedAt = null
    credential.rotatedAt = new Date()
    try {
      await credential.save()
      return generated.password
    } catch (error) {
      if (error?.code !== 11000) throw error
    }
  }

  throw new AppError('Could not reset the employee e-PaySlip password', 500)
}

export async function verifyPayslipPasswordForTelegram(employee, value) {
  const { credential, password } = await ensurePayslipCredential(employee)
  if (credential.telegramLockedUntil && credential.telegramLockedUntil > new Date()) {
    throw new AppError('Too many attempts. Try again later.', 429)
  }

  const entered = normalize(value)
  const valid = /^\d{6}$/.test(entered) && await bcrypt.compare(entered, credential.passwordHash)
  if (!valid) {
    credential.telegramFailedAttempts = Number(credential.telegramFailedAttempts || 0) + 1
    if (credential.telegramFailedAttempts >= 5) {
      credential.telegramFailedAttempts = 0
      credential.telegramLockedUntil = new Date(Date.now() + 15 * 60 * 1000)
    }
    await credential.save()
    return false
  }

  // Keep the encrypted password permanently because the same value is also
  // required for future password-protected PDFs.
  credential.telegramFailedAttempts = 0
  credential.telegramLockedUntil = null
  credential.telegramVerifiedAt = new Date()
  await credential.save()
  return true
}

export async function payslipPasswordsForEmployees(employees) {
  const list = Array.isArray(employees) ? employees : []
  if (!list.length) return new Map()

  const ids = list.map((employee) => employee._id || employee.id)
  const credentials = await PayslipCredential.find({ employeeId: { $in: ids } })
    .select('+passwordHash +passwordEncrypted')
  const credentialMap = new Map(credentials.map((item) => [String(item.employeeId), item]))
  const result = new Map()

  for (const employee of list) {
    const key = String(employee._id || employee.id)
    const credential = credentialMap.get(key)
    if (credential) {
      const password = readPayslipPassword(credential)
      if (/^\d{6}$/.test(String(password || ''))) {
        if (!credential.passwordHash) await ensurePasswordHash(credential, password)
        result.set(key, password)
        continue
      }
    }
    result.set(key, await ensurePayslipPassword(employee))
  }

  return result
}

export async function cleanupLegacyTelegramCredentialCollection() {
  const db = mongoose.connection.db
  if (!db) return 0
  const matches = await db.listCollections({ name: 'telegramcredentials' }, { nameOnly: true }).toArray()
  if (!matches.length) return 0
  const collection = db.collection('telegramcredentials')
  const count = await collection.countDocuments({})
  if (count > 0) await collection.deleteMany({})
  return count
}
