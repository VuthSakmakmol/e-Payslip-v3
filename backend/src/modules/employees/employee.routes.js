import { Router } from 'express'
import XLSX from 'xlsx'
import { Employee } from './Employee.js'
import { EmployeeAccount } from '../auth/EmployeeAccount.js'
import { EmployeePdfCredential } from '../auth/EmployeePdfCredential.js'
import { User } from '../auth/User.js'
import {
  createEmployeeAccount,
  readEmployeeTemporaryPassword,
  resetEmployeeTemporaryPassword
} from '../auth/employeeCredential.service.js'
import {
  createEmployeePdfCredential,
  readEmployeePdfPassword,
  resetEmployeePdfPassword
} from '../auth/pdfCredential.service.js'
import { normalizeLoginId } from '../auth/auth.service.js'
import { allowedEmailDomains } from '../../config/env.js'
import { AppError } from '../../utils/AppError.js'
import { asyncHandler } from '../../utils/asyncHandler.js'

const router = Router()

function normalizeDateOnly(value, label = 'Date Join') {
  if (!value) throw new AppError(`${label} is required`, 400)

  // Treat employee join date as a calendar date, not a timestamp. The frontend
  // sends YYYY-MM-DD so local timezone (for example UTC+7) cannot move it to
  // the previous/next day during JSON serialization.
  if (typeof value === 'string') {
    const text = value.trim()

    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
    if (iso) {
      const year = Number(iso[1])
      const month = Number(iso[2])
      const day = Number(iso[3])
      const date = new Date(Date.UTC(year, month - 1, day))
      if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
      ) throw new AppError(`${label} is invalid`, 400)
      return date
    }

    // Backward compatibility for an older frontend that may still send a full
    // ISO timestamp. Use its UTC calendar components consistently.
    const parsed = new Date(text)
    if (!Number.isNaN(parsed.getTime())) {
      return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()))
    }
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()))
  }

  throw new AppError(`${label} is invalid`, 400)
}

function normalizeDelivery(value) {
  const channel = String(value || '').toUpperCase()
  if (!['EMAIL', 'TELEGRAM'].includes(channel)) {
    throw new AppError('Payslip delivery must be EMAIL or TELEGRAM', 400)
  }
  return channel
}

function validateEmployeeBody(body) {
  const employeeCode = String(body.employeeCode || '').trim()
  const fullName = String(body.fullName || '').trim()
  const staffCategory = String(body.staffCategory || '').toUpperCase()
  const dateJoin = normalizeDateOnly(body.dateJoin)
  const department = String(body.department || '').trim()
  const position = String(body.position || '').trim()
  const preferredDelivery = normalizeDelivery(body.preferredDelivery)
  const companyEmail = preferredDelivery === 'EMAIL'
    ? String(body.companyEmail || '').trim().toLowerCase()
    : ''

  if (!employeeCode) throw new AppError('Employee ID is required', 400)
  if (!fullName) throw new AppError('Full Name is required', 400)
  if (!department) throw new AppError('Department is required', 400)
  if (!position) throw new AppError('Position is required', 400)
  if (!['LOCAL', 'FOREIGNER'].includes(staffCategory)) {
    throw new AppError('Employee Category must be LOCAL or FOREIGNER', 400)
  }

  if (preferredDelivery === 'EMAIL') {
    if (!companyEmail) throw new AppError('Company email is required for email delivery', 400)
    const parts = companyEmail.split('@')
    if (parts.length !== 2 || !parts[0] || !parts[1]) throw new AppError('Company email is invalid', 400)

    if (allowedEmailDomains.length && !allowedEmailDomains.includes(parts[1])) {
      throw new AppError(`Email domain must be one of: ${allowedEmailDomains.join(', ')}`, 400)
    }
  }

  return {
    employeeCode,
    fullName,
    staffCategory,
    dateJoin,
    department,
    position,
    preferredDelivery,
    companyEmail,
    active: body.active !== false
  }
}

function isPdfOnlyEmployee(value) {
  return value?.staffCategory === 'FOREIGNER' && value?.preferredDelivery === 'EMAIL'
}

function readableTemporaryPassword(account) {
  if (!account || account.status !== 'FIRST_LOGIN' || !account.mustChangePassword) return null
  try {
    return readEmployeeTemporaryPassword(account)
  } catch (error) {
    console.warn(`[credentials] cannot decrypt temporary password for ${account.loginId}: ${error.message}`)
    return null
  }
}

function readablePdfPassword(credential, employeeCode = '') {
  if (!credential || credential.status !== 'ACTIVE') return null
  try {
    return readEmployeePdfPassword(credential)
  } catch (error) {
    console.warn(`[credentials] cannot decrypt PDF password for ${employeeCode}: ${error.message}`)
    return null
  }
}

function telegramSummary(employee, account) {
  const profile = employee.telegramProfile || null
  return {
    verified: Boolean(account?.telegramVerified && employee.telegramChatId),
    username: profile?.username || '',
    firstName: profile?.firstName || '',
    lastName: profile?.lastName || '',
    userId: profile?.userId || '',
    chatId: employee.telegramChatId || profile?.chatId || '',
    linkedAt: profile?.linkedAt || null,
    lastSeenAt: profile?.lastSeenAt || null
  }
}

async function attachCredentialState(employees) {
  const ids = employees.map((employee) => employee._id)
  const [accounts, pdfCredentials] = await Promise.all([
    EmployeeAccount.find({ employeeId: { $in: ids } }).select('+temporaryPasswordEncrypted'),
    EmployeePdfCredential.find({ employeeId: { $in: ids } }).select('+passwordEncrypted')
  ])

  const accountMap = new Map(accounts.map((account) => [account.employeeId.toString(), account]))
  const pdfMap = new Map(pdfCredentials.map((credential) => [credential.employeeId.toString(), credential]))

  return employees.map((employee) => {
    const employeeId = employee._id.toString()
    const account = accountMap.get(employeeId)
    const pdfCredential = pdfMap.get(employeeId)
    const pdfOnly = isPdfOnlyEmployee(employee)
    const base = employee.toObject()

    if (base.telegramProfile) {
      delete base.telegramProfile.fromSnapshot
      delete base.telegramProfile.chatSnapshot
    }

    if (pdfOnly) {
      const pdfPassword = readablePdfPassword(pdfCredential, employee.employeeCode)
      return {
        ...base,
        accessMode: 'PDF_ONLY',
        credentialType: 'PDF_PASSWORD',
        accountStatus: 'NO_PORTAL',
        mustChangePassword: false,
        telegramVerified: false,
        telegramSummary: telegramSummary(employee, null),
        temporaryPassword: null,
        temporaryPasswordAvailable: false,
        pdfPassword,
        pdfPasswordAvailable: Boolean(pdfPassword)
      }
    }

    const temporaryPassword = readableTemporaryPassword(account)
    return {
      ...base,
      accessMode: 'PORTAL',
      credentialType: 'LOGIN_PASSWORD',
      accountStatus: account?.status || 'MISSING',
      mustChangePassword: account?.mustChangePassword ?? true,
      telegramVerified: account?.telegramVerified ?? false,
      telegramSummary: telegramSummary(employee, account),
      temporaryPassword,
      temporaryPasswordAvailable: Boolean(temporaryPassword),
      pdfPassword: null,
      pdfPasswordAvailable: false
    }
  })
}

async function exportCredentials(req, res) {
  const employees = await Employee.find({ active: true }).sort({ employeeCode: 1 })
  const ids = employees.map((employee) => employee._id)

  const [accounts, pdfCredentials] = await Promise.all([
    EmployeeAccount.find({
      employeeId: { $in: ids },
      status: 'FIRST_LOGIN',
      mustChangePassword: true
    }).select('+temporaryPasswordEncrypted'),
    EmployeePdfCredential.find({
      employeeId: { $in: ids },
      status: 'ACTIVE'
    }).select('+passwordEncrypted')
  ])

  const accountMap = new Map(accounts.map((account) => [account.employeeId.toString(), account]))
  const pdfMap = new Map(pdfCredentials.map((credential) => [credential.employeeId.toString(), credential]))
  const rows = []
  const unavailable = []

  for (const employee of employees) {
    const id = employee._id.toString()

    if (isPdfOnlyEmployee(employee)) {
      const pdfPassword = readablePdfPassword(pdfMap.get(id), employee.employeeCode)
      if (!pdfPassword) {
        unavailable.push(`${employee.employeeCode} (PDF password)`)
        continue
      }

      rows.push({
        'Employee ID': employee.employeeCode,
        'Employee Name': employee.fullName,
        'Date Join': employee.dateJoin ? new Date(employee.dateJoin).toISOString().slice(0, 10) : '',
        'Department': employee.department || '',
        'Position': employee.position || '',
        'Category': employee.staffCategory,
        'Delivery': employee.preferredDelivery,
        'Credential Type': 'PDF Password',
        'Password': pdfPassword,
        'Company Email': employee.companyEmail,
        'Access': 'NO PORTAL'
      })
      continue
    }

    const account = accountMap.get(id)
    if (!account) continue
    const temporaryPassword = readableTemporaryPassword(account)
    if (!temporaryPassword) {
      unavailable.push(`${employee.employeeCode} (first login)`)
      continue
    }

    rows.push({
      'Employee ID': employee.employeeCode,
      'Employee Name': employee.fullName,
      'Date Join': employee.dateJoin ? new Date(employee.dateJoin).toISOString().slice(0, 10) : '',
      'Department': employee.department || '',
      'Position': employee.position || '',
      'Category': employee.staffCategory,
      'Delivery': employee.preferredDelivery,
      'Credential Type': 'First Login',
      'Password': temporaryPassword,
      'Company Email': employee.preferredDelivery === 'EMAIL' ? employee.companyEmail : '',
      'Access': account.status
    })
  }

  if (unavailable.length) {
    throw new AppError(
      `Credential is unavailable for: ${unavailable.join(', ')}. Reset those credentials before exporting.`,
      409
    )
  }

  const headers = [
    'Employee ID',
    'Employee Name',
    'Date Join',
    'Department',
    'Position',
    'Category',
    'Delivery',
    'Credential Type',
    'Password',
    'Company Email',
    'Access'
  ]

  const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers })
  worksheet['!cols'] = [
    { wch: 18 },
    { wch: 30 },
    { wch: 14 },
    { wch: 26 },
    { wch: 26 },
    { wch: 14 },
    { wch: 14 },
    { wch: 20 },
    { wch: 18 },
    { wch: 34 },
    { wch: 16 }
  ]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Employee Credentials')
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  const date = new Date().toISOString().slice(0, 10)

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="e-PaySlip-Employee-Credentials-${date}.xlsx"`)
  res.send(buffer)
}

router.get('/export-credentials', asyncHandler(exportCredentials))
// Backward-compatible route used by older frontend builds.
router.get('/export-first-login', asyncHandler(exportCredentials))

router.get('/', asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1)
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100)
  const search = String(req.query.search || '').trim()
  const staffCategory = String(req.query.staffCategory || '').trim().toUpperCase()
  const preferredDelivery = String(req.query.preferredDelivery || '').trim().toUpperCase()

  const conditions = []
  if (search) {
    conditions.push({
      $or: [
        { employeeCode: { $regex: search, $options: 'i' } },
        { fullName: { $regex: search, $options: 'i' } },
        { department: { $regex: search, $options: 'i' } },
        { position: { $regex: search, $options: 'i' } },
        { companyEmail: { $regex: search, $options: 'i' } },
        { 'telegramProfile.username': { $regex: search, $options: 'i' } }
      ]
    })
  }
  if (['LOCAL', 'FOREIGNER'].includes(staffCategory)) conditions.push({ staffCategory })
  if (['EMAIL', 'TELEGRAM'].includes(preferredDelivery)) conditions.push({ preferredDelivery })

  const filter = conditions.length ? { $and: conditions } : {}

  const [employees, total, totalEmployees, activeEmployees, telegramLinked, firstLogin, pdfOnly] = await Promise.all([
    Employee.find(filter)
      .select('-telegramProfile.fromSnapshot -telegramProfile.chatSnapshot')
      .sort({ employeeCode: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Employee.countDocuments(filter),
    Employee.countDocuments({}),
    Employee.countDocuments({ active: true }),
    Employee.countDocuments({ preferredDelivery: 'TELEGRAM', telegramChatId: { $ne: '' } }),
    EmployeeAccount.countDocuments({ status: 'FIRST_LOGIN', mustChangePassword: true }),
    Employee.countDocuments({ staffCategory: 'FOREIGNER', preferredDelivery: 'EMAIL', active: true })
  ])

  const items = await attachCredentialState(employees)
  res.json({
    items,
    total,
    page,
    limit,
    summary: {
      totalEmployees,
      activeEmployees,
      telegramLinked,
      firstLogin,
      pdfOnly
    }
  })
}))

router.get('/:id/telegram-profile', asyncHandler(async (req, res) => {
  const employee = await Employee.findById(req.params.id)
  if (!employee) throw new AppError('Employee not found', 404)

  const account = await EmployeeAccount.findOne({ employeeId: employee._id })
  const profile = employee.telegramProfile?.toObject?.() || employee.telegramProfile || null

  res.json({
    employee: {
      employeeCode: employee.employeeCode,
      fullName: employee.fullName,
      dateJoin: employee.dateJoin,
      department: employee.department,
      position: employee.position,
      preferredDelivery: employee.preferredDelivery
    },
    verified: Boolean(account?.telegramVerified && employee.telegramChatId),
    activeChatId: employee.telegramChatId || '',
    profile
  })
}))

router.post('/', asyncHandler(async (req, res) => {
  const input = validateEmployeeBody(req.body)
  const loginId = normalizeLoginId(input.employeeCode)
  const pdfOnly = isPdfOnlyEmployee(input)

  const [employeeExists, accountExists, adminExists] = await Promise.all([
    Employee.exists({ employeeCode: input.employeeCode }),
    EmployeeAccount.exists({ loginId }),
    User.exists({ loginId })
  ])

  if (employeeExists) throw new AppError('Employee ID already exists', 409)
  if (accountExists || adminExists) throw new AppError('Employee ID conflicts with an existing login ID', 409)

  const employee = await Employee.create({
    ...input,
    telegramChatId: '',
    telegramProfile: null,
    telegramLinkTokenHash: '',
    telegramLinkExpiresAt: null
  })

  try {
    if (pdfOnly) {
      const { pdfPassword } = await createEmployeePdfCredential(employee)
      return res.status(201).json({
        employee: {
          ...employee.toObject(),
          accessMode: 'PDF_ONLY',
          credentialType: 'PDF_PASSWORD',
          accountStatus: 'NO_PORTAL',
          mustChangePassword: false,
          telegramVerified: false,
          pdfPassword
        },
        issuedCredentials: {
          type: 'PDF_PASSWORD',
          employeeCode: employee.employeeCode,
          password: pdfPassword
        }
      })
    }

    const { account, temporaryPassword } = await createEmployeeAccount(employee)
    return res.status(201).json({
      employee: {
        ...employee.toObject(),
        accessMode: 'PORTAL',
        credentialType: 'LOGIN_PASSWORD',
        accountStatus: account.status,
        mustChangePassword: account.mustChangePassword,
        telegramVerified: account.telegramVerified,
        temporaryPassword
      },
      issuedCredentials: {
        type: 'LOGIN_PASSWORD',
        employeeCode: employee.employeeCode,
        loginId: account.loginId,
        password: temporaryPassword
      },
      // Backward compatibility for older UI.
      temporaryCredentials: {
        loginId: account.loginId,
        temporaryPassword
      }
    })
  } catch (error) {
    await Promise.all([
      Employee.deleteOne({ _id: employee._id }),
      EmployeeAccount.deleteOne({ employeeId: employee._id }),
      EmployeePdfCredential.deleteOne({ employeeId: employee._id })
    ])
    throw error
  }
}))

router.put('/:id', asyncHandler(async (req, res) => {
  const input = validateEmployeeBody(req.body)
  const employee = await Employee.findById(req.params.id)
  if (!employee) throw new AppError('Employee not found', 404)

  const [account, pdfCredential] = await Promise.all([
    EmployeeAccount.findOne({ employeeId: employee._id }).select('+temporaryPasswordEncrypted'),
    EmployeePdfCredential.findOne({ employeeId: employee._id }).select('+passwordEncrypted +passwordFingerprint')
  ])

  const wasPdfOnly = isPdfOnlyEmployee(employee)
  const nextPdfOnly = isPdfOnlyEmployee(input)
  const nextLoginId = normalizeLoginId(input.employeeCode)

  if (!nextPdfOnly && nextLoginId !== account?.loginId) {
    const [accountExists, adminExists] = await Promise.all([
      EmployeeAccount.exists({ loginId: nextLoginId, _id: account ? { $ne: account._id } : { $exists: true } }),
      User.exists({ loginId: nextLoginId })
    ])
    if (accountExists || adminExists) throw new AppError('Login ID already exists', 409)
  }

  const deliveryChanged = employee.preferredDelivery !== input.preferredDelivery
  const leavingTelegram = employee.preferredDelivery === 'TELEGRAM' && input.preferredDelivery !== 'TELEGRAM'

  employee.employeeCode = input.employeeCode
  employee.fullName = input.fullName
  employee.staffCategory = input.staffCategory
  employee.dateJoin = input.dateJoin
  employee.department = input.department
  employee.position = input.position
  employee.preferredDelivery = input.preferredDelivery
  employee.companyEmail = input.companyEmail
  employee.active = input.active

  if (deliveryChanged || input.preferredDelivery === 'EMAIL') {
    employee.telegramChatId = ''
    employee.telegramLinkTokenHash = ''
    employee.telegramLinkExpiresAt = null
  }

  if (leavingTelegram && employee.telegramProfile) {
    employee.telegramProfile.unlinkedAt = new Date()
  }

  await employee.save()

  let issuedCredentials = null
  let currentAccount = account
  let currentPdfCredential = pdfCredential

  if (nextPdfOnly) {
    if (!currentPdfCredential) {
      const created = await createEmployeePdfCredential(employee)
      currentPdfCredential = created.credential
      issuedCredentials = {
        type: 'PDF_PASSWORD',
        employeeCode: employee.employeeCode,
        password: created.pdfPassword
      }
    } else {
      currentPdfCredential.status = input.active ? 'ACTIVE' : 'DISABLED'
      await currentPdfCredential.save()
    }

    if (currentAccount) {
      await EmployeeAccount.deleteOne({ _id: currentAccount._id })
      currentAccount = null
    }
  } else {
    if (!currentAccount) {
      const created = await createEmployeeAccount(employee)
      currentAccount = created.account
      issuedCredentials = {
        type: 'LOGIN_PASSWORD',
        employeeCode: employee.employeeCode,
        loginId: created.account.loginId,
        password: created.temporaryPassword
      }
    } else {
      currentAccount.loginId = nextLoginId
      if (deliveryChanged) currentAccount.telegramVerified = false
      if (!input.active) {
        currentAccount.status = 'DISABLED'
      } else if (currentAccount.status === 'DISABLED') {
        currentAccount.status = currentAccount.mustChangePassword ? 'FIRST_LOGIN' : 'ACTIVE'
      }
      await currentAccount.save()
    }

    if (currentPdfCredential) {
      await EmployeePdfCredential.deleteOne({ _id: currentPdfCredential._id })
      currentPdfCredential = null
    }
  }

  if (nextPdfOnly) {
    const credential = currentPdfCredential || await EmployeePdfCredential.findOne({ employeeId: employee._id }).select('+passwordEncrypted')
    return res.json({
      ...employee.toObject(),
      accessMode: 'PDF_ONLY',
      credentialType: 'PDF_PASSWORD',
      accountStatus: 'NO_PORTAL',
      mustChangePassword: false,
      telegramVerified: false,
      pdfPassword: readablePdfPassword(credential, employee.employeeCode),
      issuedCredentials
    })
  }

  return res.json({
    ...employee.toObject(),
    accessMode: 'PORTAL',
    credentialType: 'LOGIN_PASSWORD',
    accountStatus: currentAccount?.status || 'MISSING',
    mustChangePassword: currentAccount?.mustChangePassword ?? true,
    telegramVerified: currentAccount?.telegramVerified ?? false,
    temporaryPassword: readableTemporaryPassword(currentAccount),
    issuedCredentials
  })
}))

router.post('/:id/reset-temporary-password', asyncHandler(async (req, res) => {
  const employee = await Employee.findById(req.params.id)
  if (!employee) throw new AppError('Employee not found', 404)

  if (isPdfOnlyEmployee(employee)) {
    const credential = await EmployeePdfCredential.findOne({ employeeId: employee._id })
      .select('+passwordEncrypted +passwordFingerprint')
    if (!credential) throw new AppError('Employee PDF credential is missing', 409)
    if (!employee.active || credential.status === 'DISABLED') {
      throw new AppError('Activate the employee before resetting the PDF password', 409)
    }

    const pdfPassword = await resetEmployeePdfPassword(credential)
    return res.json({
      credentialType: 'PDF_PASSWORD',
      employeeCode: employee.employeeCode,
      pdfPassword,
      password: pdfPassword
    })
  }

  const account = await EmployeeAccount.findOne({ employeeId: employee._id })
    .select('+passwordHash +temporaryPasswordFingerprint +temporaryPasswordEncrypted')
  if (!account) throw new AppError('Employee account is missing', 409)
  if (account.status === 'DISABLED') throw new AppError('Activate the employee before resetting the password', 409)

  const temporaryPassword = await resetEmployeeTemporaryPassword(account)

  res.json({
    credentialType: 'LOGIN_PASSWORD',
    loginId: account.loginId,
    temporaryPassword,
    password: temporaryPassword
  })
}))

export default router
