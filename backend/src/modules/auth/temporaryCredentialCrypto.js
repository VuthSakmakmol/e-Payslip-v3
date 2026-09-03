import crypto from 'node:crypto'
import { env } from '../../config/env.js'
import { AppError } from '../../utils/AppError.js'

const ALGORITHM = 'aes-256-gcm'
const VERSION = 'v1'

function encryptionKey() {
  const source = env.CREDENTIAL_ENCRYPTION_SECRET || env.JWT_SECRET
  return crypto.createHash('sha256').update(source).digest()
}

export function encryptTemporaryPassword(value) {
  const plainText = String(value || '')
  if (!plainText) throw new AppError('Temporary password is required for encryption', 500)

  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey(), iv)
  const encrypted = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final()
  ])
  const authTag = cipher.getAuthTag()

  return [
    VERSION,
    iv.toString('base64url'),
    authTag.toString('base64url'),
    encrypted.toString('base64url')
  ].join('.')
}

export function decryptTemporaryPassword(payload) {
  const value = String(payload || '')
  if (!value) return null

  try {
    const [version, ivValue, tagValue, encryptedValue] = value.split('.')
    if (version !== VERSION || !ivValue || !tagValue || !encryptedValue) {
      throw new Error('Invalid encrypted credential format')
    }

    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      encryptionKey(),
      Buffer.from(ivValue, 'base64url')
    )
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'))

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, 'base64url')),
      decipher.final()
    ])

    return decrypted.toString('utf8')
  } catch {
    throw new AppError(
      'Temporary password cannot be decrypted. Keep CREDENTIAL_ENCRYPTION_SECRET unchanged or reset this employee temporary password.',
      500
    )
  }
}
