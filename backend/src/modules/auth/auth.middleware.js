import jwt from 'jsonwebtoken'
import { env } from '../../config/env.js'
import { User } from './User.js'
import { EmployeeAccount } from './EmployeeAccount.js'
import { Employee } from '../employees/Employee.js'
import { AppError } from '../../utils/AppError.js'
import { asyncHandler } from '../../utils/asyncHandler.js'

export const requireAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) throw new AppError('Authentication required', 401)

  let payload
  try {
    payload = jwt.verify(token, env.JWT_SECRET)
  } catch {
    throw new AppError('Invalid or expired token', 401)
  }

  if (payload.accountType === 'EMPLOYEE') {
    const account = await EmployeeAccount.findById(payload.sub)
    if (!account || account.status !== 'ACTIVE' || account.mustChangePassword) {
      throw new AppError('Employee account is not active', 401)
    }

    const employee = await Employee.findById(account.employeeId)
    if (!employee || !employee.active) throw new AppError('Employee is not active', 401)
    if (employee.staffCategory === 'FOREIGNER' && employee.preferredDelivery === 'EMAIL') {
      throw new AppError('This employee does not have portal access', 401)
    }
    if (employee.preferredDelivery === 'TELEGRAM' && !account.telegramVerified) {
      throw new AppError('Telegram verification is required', 401)
    }

    req.employeeAccount = account
    req.employee = employee
    req.user = {
      _id: account._id,
      role: 'EMPLOYEE',
      name: employee.fullName,
      loginId: account.loginId
    }
    return next()
  }

  // Backward compatible with tokens created before accountType was introduced.
  const user = await User.findById(payload.sub)
  if (!user || !user.active) throw new AppError('User is not active', 401)

  req.user = user
  next()
})

export function requireRootAdmin(req, res, next) {
  if (req.user?.role !== 'ROOT_ADMIN') return next(new AppError('Root admin access required', 403))
  next()
}

export function requireEmployee(req, res, next) {
  if (req.user?.role !== 'EMPLOYEE' || !req.employee || !req.employeeAccount) {
    return next(new AppError('Employee access required', 403))
  }
  next()
}
