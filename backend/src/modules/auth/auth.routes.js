import { Router } from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { rateLimit } from 'express-rate-limit'
import { User } from './User.js'
import { EmployeeAccount } from './EmployeeAccount.js'
import { Employee } from '../employees/Employee.js'
import { env } from '../../config/env.js'
import { AppError } from '../../utils/AppError.js'
import { asyncHandler } from '../../utils/asyncHandler.js'
import { requireAuth } from './auth.middleware.js'
import {
  employeePayload,
  issueOnboardingToken,
  issueSessionToken,
  normalizeLoginId,
  rootAdminPayload,
  verifyOnboardingToken
} from './auth.service.js'
import {
  compareEmployeeLoginPassword,
  setPermanentEmployeePassword
} from './employeeCredential.service.js'

const router = Router()
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 50, standardHeaders: true, legacyHeaders: false })

function bearerToken(req) {
  const header = req.headers.authorization || ''
  return header.startsWith('Bearer ') ? header.slice(7) : ''
}

async function loadOnboardingAccount(req) {
  const payload = verifyOnboardingToken(bearerToken(req))
  const account = await EmployeeAccount.findById(payload.sub).select('+passwordHash')
  if (!account || account.status === 'DISABLED' || account.status === 'LOCKED') {
    throw new AppError('Employee account is not available', 401)
  }

  const employee = await Employee.findById(account.employeeId)
  if (!employee || !employee.active) throw new AppError('Employee is not active', 401)
  if (employee.staffCategory === 'FOREIGNER' && employee.preferredDelivery === 'EMAIL') {
    throw new AppError('This employee does not have portal access', 401)
  }
  return { account, employee }
}

function employeeSession(account, employee) {
  const token = issueSessionToken({
    subject: account._id,
    role: 'EMPLOYEE',
    accountType: 'EMPLOYEE'
  })

  return { token, user: employeePayload(account, employee), nextStep: 'PORTAL' }
}

router.post('/login', limiter, asyncHandler(async (req, res) => {
  const loginId = normalizeLoginId(req.body.loginId)
  const password = String(req.body.password || '')
  if (!loginId || !password) throw new AppError('Login ID and password are required', 400)

  const admin = await User.findOne({ loginId }).select('+passwordHash')
  if (admin) {
    if (!admin.active || !(await bcrypt.compare(password, admin.passwordHash))) {
      throw new AppError('Invalid Login ID or password', 401)
    }

    const token = issueSessionToken({
      subject: admin._id,
      role: 'ROOT_ADMIN',
      accountType: 'ROOT_ADMIN'
    })

    return res.json({ token, user: rootAdminPayload(admin), nextStep: 'PORTAL' })
  }

  const account = await EmployeeAccount.findOne({ loginId }).select('+passwordHash')
  if (!account || account.status === 'DISABLED' || account.status === 'LOCKED') {
    throw new AppError('Invalid Login ID or password', 401)
  }

  const employee = await Employee.findById(account.employeeId)
  if (!employee || !employee.active) throw new AppError('Invalid Login ID or password', 401)
  if (employee.staffCategory === 'FOREIGNER' && employee.preferredDelivery === 'EMAIL') {
    throw new AppError('Invalid Login ID or password', 401)
  }

  const valid = await compareEmployeeLoginPassword(account, password)
  if (!valid) throw new AppError('Invalid Login ID or password', 401)

  account.lastLoginAt = new Date()
  await account.save()

  if (account.mustChangePassword || account.status === 'FIRST_LOGIN') {
    return res.json({
      nextStep: 'CHANGE_PASSWORD',
      onboardingToken: issueOnboardingToken(account._id),
      employee: {
        name: employee.fullName,
        employeeCode: employee.employeeCode,
        preferredDelivery: employee.preferredDelivery
      }
    })
  }

  if (employee.preferredDelivery === 'TELEGRAM' && !account.telegramVerified) {
    return res.json({
      nextStep: 'TELEGRAM_VERIFY',
      onboardingToken: issueOnboardingToken(account._id),
      employee: {
        name: employee.fullName,
        employeeCode: employee.employeeCode,
        preferredDelivery: employee.preferredDelivery
      }
    })
  }

  return res.json(employeeSession(account, employee))
}))

router.post('/employee/change-first-password', limiter, asyncHandler(async (req, res) => {
  const { account, employee } = await loadOnboardingAccount(req)
  if (!account.mustChangePassword && account.status !== 'FIRST_LOGIN') {
    throw new AppError('First password change has already been completed', 409)
  }

  await setPermanentEmployeePassword(account, req.body.newPassword)

  if (employee.preferredDelivery === 'TELEGRAM' && !account.telegramVerified) {
    return res.json({
      nextStep: 'TELEGRAM_VERIFY',
      onboardingToken: issueOnboardingToken(account._id),
      employee: {
        name: employee.fullName,
        employeeCode: employee.employeeCode,
        preferredDelivery: employee.preferredDelivery
      }
    })
  }

  return res.json(employeeSession(account, employee))
}))

router.post('/employee/telegram-link', limiter, asyncHandler(async (req, res) => {
  if (!env.TELEGRAM_BOT_USERNAME) throw new AppError('TELEGRAM_BOT_USERNAME is not configured', 400)

  const { account, employee } = await loadOnboardingAccount(req)
  if (account.mustChangePassword) throw new AppError('Change your temporary password first', 409)
  if (employee.preferredDelivery !== 'TELEGRAM') throw new AppError('This employee is configured for email delivery', 409)

  if (account.telegramVerified && employee.telegramChatId) {
    return res.json({ alreadyVerified: true })
  }

  const token = crypto.randomBytes(24).toString('hex')
  employee.telegramLinkTokenHash = crypto.createHash('sha256').update(token).digest('hex')
  employee.telegramLinkExpiresAt = new Date(Date.now() + 15 * 60 * 1000)
  await employee.save()

  res.json({
    url: `https://t.me/${env.TELEGRAM_BOT_USERNAME}?start=${token}`,
    expiresInMinutes: 15
  })
}))

router.get('/employee/onboarding-status', limiter, asyncHandler(async (req, res) => {
  const { account, employee } = await loadOnboardingAccount(req)

  if (account.mustChangePassword || account.status === 'FIRST_LOGIN') {
    return res.json({ complete: false, nextStep: 'CHANGE_PASSWORD' })
  }

  if (employee.preferredDelivery === 'TELEGRAM' && !account.telegramVerified) {
    return res.json({ complete: false, nextStep: 'TELEGRAM_VERIFY' })
  }

  res.json({ complete: true, ...employeeSession(account, employee) })
}))

router.get('/me', requireAuth, (req, res) => {
  if (req.user.role === 'ROOT_ADMIN') {
    return res.json({ user: rootAdminPayload(req.user) })
  }

  res.json({ user: employeePayload(req.employeeAccount, req.employee) })
})

export default router
