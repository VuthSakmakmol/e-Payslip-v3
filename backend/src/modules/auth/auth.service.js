import jwt from 'jsonwebtoken'
import { env } from '../../config/env.js'
import { AppError } from '../../utils/AppError.js'

export function normalizeLoginId(value) {
  return String(value || '').trim().toUpperCase()
}

export function issueSessionToken({ subject, role, accountType }) {
  return jwt.sign(
    { role, accountType },
    env.JWT_SECRET,
    { subject: String(subject), expiresIn: env.JWT_EXPIRES_IN }
  )
}

export function issueOnboardingToken(accountId) {
  return jwt.sign(
    { purpose: 'EMPLOYEE_ONBOARDING', accountType: 'EMPLOYEE' },
    env.JWT_SECRET,
    { subject: String(accountId), expiresIn: '30m' }
  )
}

export function verifyOnboardingToken(token) {
  if (!token) throw new AppError('Employee onboarding session is required', 401)

  try {
    const payload = jwt.verify(token, env.JWT_SECRET)
    if (payload.purpose !== 'EMPLOYEE_ONBOARDING' || payload.accountType !== 'EMPLOYEE') {
      throw new Error('Invalid onboarding token')
    }
    return payload
  } catch {
    throw new AppError('Employee onboarding session is invalid or expired', 401)
  }
}

export function rootAdminPayload(user) {
  return {
    id: user._id,
    name: user.name,
    loginId: user.loginId,
    role: 'ROOT_ADMIN',
    accountType: 'ROOT_ADMIN'
  }
}

export function employeePayload(account, employee) {
  return {
    id: account._id,
    employeeId: employee._id,
    name: employee.fullName,
    loginId: account.loginId,
    employeeCode: employee.employeeCode,
    role: 'EMPLOYEE',
    accountType: 'EMPLOYEE',
    staffCategory: employee.staffCategory,
    preferredDelivery: employee.preferredDelivery,
    telegramVerified: account.telegramVerified
  }
}
