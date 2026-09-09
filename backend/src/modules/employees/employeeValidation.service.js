import { AppError } from '../../utils/AppError.js'

export function normalizeEmployeeDateOnly(value, label = 'Date Join') {
  if (!value) throw new AppError(`${label} is required`, 400)
  const match = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) throw new AppError(`${label} is invalid`, 400)

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  if (
    date.getUTCFullYear() !== Number(match[1]) ||
    date.getUTCMonth() !== Number(match[2]) - 1 ||
    date.getUTCDate() !== Number(match[3])
  ) {
    throw new AppError(`${label} is invalid`, 400)
  }
  return date
}

export function validateEmployeeInput(body) {
  const preferredDelivery = String(body.preferredDelivery || '').toUpperCase()
  const companyEmail = preferredDelivery === 'EMAIL'
    ? String(body.companyEmail || '').trim().toLowerCase()
    : ''

  const value = {
    employeeCode: String(body.employeeCode || '').trim(),
    fullName: String(body.fullName || '').trim(),
    staffCategory: String(body.staffCategory || '').toUpperCase(),
    dateJoin: normalizeEmployeeDateOnly(body.dateJoin, 'Date Join'),
    department: String(body.department || '').trim(),
    line: String(body.line || '').trim(),
    position: String(body.position || '').trim(),
    preferredDelivery,
    companyEmail,
    active: body.active !== false,
  }

  if (!value.employeeCode) throw new AppError('Employee ID is required', 400)
  if (!value.fullName) throw new AppError('Full Name is required', 400)
  if (!value.department) throw new AppError('Department is required', 400)
  if (!value.position) throw new AppError('Position is required', 400)
  if (!['LOCAL', 'FOREIGNER'].includes(value.staffCategory)) {
    throw new AppError('Employee Category must be LOCAL or FOREIGNER', 400)
  }
  if (!['EMAIL', 'TELEGRAM'].includes(preferredDelivery)) {
    throw new AppError('Payslip delivery must be EMAIL or TELEGRAM', 400)
  }
  if (preferredDelivery === 'EMAIL') {
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(companyEmail)
    if (!validEmail) throw new AppError('Email address is required and must be valid', 400)
  }

  return value
}
