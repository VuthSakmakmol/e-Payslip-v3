import { PayrollRelease } from '../models/PayrollRelease.js'
import { DeliveryLog } from '../../delivery/DeliveryLog.js'
import { AppError } from '../../../utils/AppError.js'

export function normalizeReleaseMode(value) {
  const mode = String(value || 'FULL').trim().toUpperCase()
  if (!['FULL', 'UPDATE'].includes(mode)) {
    throw new AppError('releaseMode must be FULL or UPDATE', 400)
  }
  return mode
}

function idString(value) {
  if (!value) return ''
  return String(value?._id || value)
}

export function payrollPeriodKey({ staffCategory, year, month, payPeriodId = null }) {
  const category = String(staffCategory || '').toUpperCase()
  if (category === 'LOCAL') {
    const period = idString(payPeriodId)
    if (!period) throw new AppError('Pay period is required for local payroll', 400)
    return `LOCAL:${Number(year)}:${Number(month)}:${period}`
  }
  return `FOREIGNER:${Number(year)}:${Number(month)}`
}

export async function findPreviousFullRelease({ staffCategory, year, month, payPeriodId = null }) {
  const category = String(staffCategory || '').toUpperCase()
  const periodKey = payrollPeriodKey({ staffCategory: category, year, month, payPeriodId })

  const release = await PayrollRelease.findOne({ periodKey, releaseMode: 'FULL' })
    .sort({ releasedAt: -1 })
    .lean()

  if (release) {
    return {
      exists: true,
      source: 'RELEASE_HISTORY',
      employeeCount: release.employeeCount || 0,
      releasedAt: release.releasedAt || release.createdAt,
      releaseId: release._id?.toString?.() || null
    }
  }

  // Backward compatibility for releases made before PayrollRelease existed.
  // Delivery logs contain no salary values, so they are safe to retain as proof
  // that a previous full payroll was released.
  const legacyFilter = {
    staffCategory: category,
    year: Number(year),
    month: Number(month),
    ...(category === 'LOCAL' ? { payPeriodId: payPeriodId?._id || payPeriodId } : {}),
    $or: [
      { releaseMode: 'FULL' },
      { releaseMode: { $exists: false } },
      { releaseMode: null }
    ]
  }

  const [latest, distinctEmployees] = await Promise.all([
    DeliveryLog.findOne(legacyFilter).sort({ createdAt: -1 }).lean(),
    DeliveryLog.distinct('employeeCode', legacyFilter)
  ])

  if (latest) {
    return {
      exists: true,
      source: 'LEGACY_DELIVERY_HISTORY',
      employeeCount: distinctEmployees.length,
      releasedAt: latest.createdAt,
      releaseId: null
    }
  }

  return { exists: false, source: '', employeeCount: 0, releasedAt: null, releaseId: null }
}

export async function requirePreviousFullRelease(period) {
  const previous = await findPreviousFullRelease(period)
  if (!previous.exists) {
    throw new AppError(
      'Update / Correction is only allowed after a Full Payroll has already been released for this exact payroll period.',
      409
    )
  }
  return previous
}

export async function nextCorrectionNumber({ staffCategory, year, month, payPeriodId = null }) {
  const periodKey = payrollPeriodKey({ staffCategory, year, month, payPeriodId })
  const latestRelease = await PayrollRelease.findOne({ periodKey, releaseMode: 'UPDATE' })
    .sort({ correctionNumber: -1 })
    .select('correctionNumber')
    .lean()

  return (latestRelease?.correctionNumber || 0) + 1
}

export async function createReleaseHistory({
  staffCategory,
  year,
  month,
  payPeriodId = null,
  releaseMode,
  correctionNumber = 0,
  sourceFileName = '',
  employeeCount = 0,
  deliveries = [],
  releasedBy
}) {
  const mode = normalizeReleaseMode(releaseMode)
  const periodKey = payrollPeriodKey({ staffCategory, year, month, payPeriodId })
  const sentCount = deliveries.filter((item) => item.status === 'SENT').length
  const failedCount = deliveries.filter((item) => item.status === 'FAILED').length

  const number = mode === 'UPDATE' ? Number(correctionNumber || 1) : 0
  return PayrollRelease.findOneAndUpdate(
    { periodKey, releaseMode: mode, correctionNumber: number },
    {
      $setOnInsert: {
        staffCategory: String(staffCategory).toUpperCase(),
        year: Number(year),
        month: Number(month),
        payPeriodId: payPeriodId?._id || payPeriodId || null,
        periodKey,
        releaseMode: mode,
        correctionNumber: number
      },
      $set: {
        sourceFileName,
        employeeCount: Number(employeeCount || 0),
        sentCount,
        failedCount,
        releasedBy,
        releasedAt: new Date()
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )
}
