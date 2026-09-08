import crypto from 'node:crypto'
import { PayslipCredential } from '../auth/PayslipCredential.js'
import { env } from '../../config/env.js'
import { AppError } from '../../utils/AppError.js'
import { decryptTemporaryPassword, encryptTemporaryPassword } from './temporaryCredentialCrypto.js'

const fingerprint = (digits) => crypto
  .createHmac('sha256', env.JWT_SECRET)
  .update(`payslip:${digits}`)
  .digest('hex')

async function generateUniquePassword() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    // Always exactly six numeric characters. Example: 483271 (no hyphens).
    const password = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')
    const passwordFingerprint = fingerprint(password)
    if (!(await PayslipCredential.exists({ passwordFingerprint }))) {
      return { password, passwordFingerprint }
    }
  }
  throw new AppError('Could not generate a unique 6-digit PDF password', 500)
}

export async function createPayslipCredential(employee) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const generated = await generateUniquePassword()
    try {
      const credential = await PayslipCredential.create({
        employeeId: employee._id || employee.id,
        passwordFingerprint: generated.passwordFingerprint,
        passwordEncrypted: encryptTemporaryPassword(generated.password)
      })
      return { credential, password: generated.password }
    } catch (error) {
      // Another request may have created the employee credential at the same time.
      if (error?.code === 11000 && error?.keyPattern?.employeeId) {
        const existing = await PayslipCredential.findOne({
          employeeId: employee._id || employee.id
        }).select('+passwordEncrypted')
        if (existing) return { credential: existing, password: readPayslipPassword(existing) }
      }
      if (error?.code !== 11000) throw error
    }
  }
  throw new AppError('Could not create the employee PDF password', 500)
}

export function readPayslipPassword(credential) {
  if (!credential?.passwordEncrypted) return null
  return decryptTemporaryPassword(credential.passwordEncrypted)
}

export async function ensurePayslipPassword(employee) {
  let credential = await PayslipCredential.findOne({
    employeeId: employee._id || employee.id
  }).select('+passwordEncrypted')

  if (!credential) {
    return (await createPayslipCredential(employee)).password
  }

  const password = readPayslipPassword(credential)
  if (!/^\d{6}$/.test(String(password || ''))) {
    return resetPayslipPassword(credential)
  }
  return password
}

export async function resetPayslipPassword(credentialOrEmployee) {
  let credential = credentialOrEmployee
  const isCredential = Boolean(credentialOrEmployee?.passwordEncrypted || credentialOrEmployee?.passwordFingerprint)

  if (!isCredential) {
    credential = await PayslipCredential.findOne({
      employeeId: credentialOrEmployee?._id || credentialOrEmployee?.id
    }).select('+passwordEncrypted +passwordFingerprint')
    if (!credential) return (await createPayslipCredential(credentialOrEmployee)).password
  } else if (!credential.passwordEncrypted || !credential.passwordFingerprint) {
    credential = await PayslipCredential.findById(credential._id).select('+passwordEncrypted +passwordFingerprint')
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const generated = await generateUniquePassword()
    credential.passwordFingerprint = generated.passwordFingerprint
    credential.passwordEncrypted = encryptTemporaryPassword(generated.password)
    credential.rotatedAt = new Date()
    try {
      await credential.save()
      return generated.password
    } catch (error) {
      if (error?.code !== 11000) throw error
    }
  }

  throw new AppError('Could not reset the employee PDF password', 500)
}

export async function payslipPasswordsForEmployees(employees) {
  const list = Array.isArray(employees) ? employees : []
  if (!list.length) return new Map()

  const ids = list.map((employee) => employee._id || employee.id)
  const credentials = await PayslipCredential.find({ employeeId: { $in: ids } })
    .select('+passwordEncrypted')
  const credentialMap = new Map(credentials.map((item) => [String(item.employeeId), item]))
  const result = new Map()

  for (const employee of list) {
    const key = String(employee._id || employee.id)
    const credential = credentialMap.get(key)
    if (credential) {
      const password = readPayslipPassword(credential)
      if (/^\d{6}$/.test(String(password || ''))) {
        result.set(key, password)
        continue
      }
    }
    result.set(key, await ensurePayslipPassword(employee))
  }

  return result
}
