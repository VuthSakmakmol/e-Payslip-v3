import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { TelegramCredential } from './TelegramCredential.js'
import { env } from '../../config/env.js'
import { AppError } from '../../utils/AppError.js'
import { decryptTemporaryPassword, encryptTemporaryPassword } from './temporaryCredentialCrypto.js'

const normalize = (value) => String(value || '').replace(/[^0-9]/g, '')
const display = (digits) => `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4, 6)}`
const fingerprint = (digits) => crypto.createHmac('sha256', env.JWT_SECRET).update(digits).digest('hex')

async function generate() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const digits = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')
    const passwordFingerprint = fingerprint(digits)
    if (!(await TelegramCredential.exists({ passwordFingerprint }))) {
      return { digits, shown: display(digits), passwordFingerprint }
    }
  }
  throw new AppError('Could not generate a unique Telegram verification password', 500)
}

export async function createTelegramCredential(employee) {
  const generated = await generate()
  const credential = await TelegramCredential.create({
    employeeId: employee._id,
    passwordHash: await bcrypt.hash(generated.digits, 12),
    passwordFingerprint: generated.passwordFingerprint,
    passwordEncrypted: encryptTemporaryPassword(generated.shown),
    status: employee.active === false ? 'DISABLED' : 'PENDING'
  })
  return { credential, password: generated.shown }
}

export function readTelegramPassword(credential) {
  if (!credential || credential.status !== 'PENDING' || !credential.passwordEncrypted) return null
  return decryptTemporaryPassword(credential.passwordEncrypted)
}

export async function resetTelegramCredential(credential) {
  const generated = await generate()
  credential.passwordHash = await bcrypt.hash(generated.digits, 12)
  credential.passwordFingerprint = generated.passwordFingerprint
  credential.passwordEncrypted = encryptTemporaryPassword(generated.shown)
  credential.status = 'PENDING'
  credential.failedAttempts = 0
  credential.lockedUntil = null
  credential.verifiedAt = null
  await credential.save()
  return generated.shown
}

export async function verifyTelegramPassword(credential, value) {
  if (!credential || credential.status !== 'PENDING') return false
  if (credential.lockedUntil && credential.lockedUntil > new Date()) throw new AppError('Too many attempts. Try again later.', 429)
  const valid = await bcrypt.compare(normalize(value), credential.passwordHash)
  if (!valid) {
    credential.failedAttempts += 1
    if (credential.failedAttempts >= 5) {
      credential.failedAttempts = 0
      credential.lockedUntil = new Date(Date.now() + 15 * 60 * 1000)
    }
    await credential.save()
  }
  return valid
}

export async function consumeTelegramCredential(credential) {
  credential.status = 'USED'
  credential.passwordEncrypted = ''
  credential.failedAttempts = 0
  credential.lockedUntil = null
  credential.verifiedAt = new Date()
  await credential.save()
}
