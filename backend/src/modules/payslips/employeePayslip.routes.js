import { Router } from 'express'
import { PayrollRecord } from '../payroll/models/PayrollRecord.js'
import { PayslipDesign } from './PayslipDesign.js'
import { renderPayslipPdf } from './payslipRenderer.service.js'
import { AppError } from '../../utils/AppError.js'
import { asyncHandler } from '../../utils/asyncHandler.js'

const router = Router()

const monthName = (month) => new Intl.DateTimeFormat('en-US', { month: 'long' })
  .format(new Date(Date.UTC(2020, Number(month) - 1, 1)))

function normalizeCode(value) {
  return String(value ?? '').trim().toUpperCase()
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function periodName(batch) {
  return batch?.payPeriodId?.name || 'Pay Period'
}

function fileSafe(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

async function activeDesign() {
  const design = await PayslipDesign.findOne({ active: true }).sort({ updatedAt: -1 })
  if (!design) throw new AppError('No active payslip design is available', 409)
  return design
}

function employeeRecordFilter(employee) {
  const code = normalizeCode(employee?.employeeCode)
  const filters = [{ employeeId: employee._id }]

  if (code) {
    filters.unshift({
      employeeCode: {
        $regex: `^${escapeRegex(code)}$`,
        $options: 'i'
      }
    })
  }

  return { $or: filters }
}

function recordBelongsToEmployee(record, employee) {
  if (!record || !employee) return false

  const codeMatches = normalizeCode(record.employeeCode) === normalizeCode(employee.employeeCode)
  const idMatches = String(record.employeeId || '') === String(employee._id || '')
  return codeMatches || idMatches
}

async function repairEmployeeReference(record, employee) {
  if (!recordBelongsToEmployee(record, employee)) return
  if (String(record.employeeId || '') === String(employee._id)) return

  try {
    await PayrollRecord.updateOne(
      { _id: record._id },
      {
        $set: {
          employeeId: employee._id,
          employeeCode: employee.employeeCode
        }
      }
    )
  } catch (error) {
    console.warn(`[employee-payslips] reference repair skipped for ${employee.employeeCode}: ${error.message}`)
  }
}

async function findEmployeeReleasedRecords(employee) {
  // Start from the authenticated business identity (Employee ID), not from a
  // pre-filtered batch list. This makes portal history resilient to old/stale
  // Mongo ObjectId references while keeping ownership tied to Employee Master.
  const records = await PayrollRecord.find(employeeRecordFilter(employee))
    .select('_id batchId employeeId employeeCode')
    .populate({
      path: 'batchId',
      select: 'year month payPeriodId releasedAt status staffCategory',
      populate: {
        path: 'payPeriodId',
        select: 'code name sequence'
      }
    })
    .lean()

  return records.filter((record) => {
    if (!recordBelongsToEmployee(record, employee)) return false
    if (!record.batchId) return false
    return record.batchId.status === 'RELEASED'
  })
}

/**
 * Employee released payslip history.
 *
 * Security:
 * - authenticated Employee Master identity is the source of ownership;
 * - Employee ID/code is the stable payroll business key;
 * - only records whose PayrollBatch is RELEASED are returned;
 * - foreign EMAIL employees never reach this route because they have no portal account.
 */
router.get('/', asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1)
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50)

  const released = await findEmployeeReleasedRecords(req.employee)

  released.sort((a, b) => {
    const ba = a.batchId
    const bb = b.batchId
    if (Number(bb.year) !== Number(ba.year)) return Number(bb.year) - Number(ba.year)
    if (Number(bb.month) !== Number(ba.month)) return Number(bb.month) - Number(ba.month)
    const seqA = Number(ba.payPeriodId?.sequence || 0)
    const seqB = Number(bb.payPeriodId?.sequence || 0)
    if (seqB !== seqA) return seqB - seqA
    return new Date(bb.releasedAt || 0) - new Date(ba.releasedAt || 0)
  })

  await Promise.all(released.map((record) => repairEmployeeReference(record, req.employee)))

  const total = released.length
  const start = (page - 1) * limit
  const items = released.slice(start, start + limit).map((record) => {
    const batch = record.batchId
    return {
      id: record._id,
      employeeCode: req.employee.employeeCode,
      year: batch.year,
      month: batch.month,
      monthName: monthName(batch.month),
      payPeriod: batch.payPeriodId
        ? {
            id: batch.payPeriodId._id,
            code: batch.payPeriodId.code,
            name: batch.payPeriodId.name,
            sequence: batch.payPeriodId.sequence
          }
        : null,
      periodLabel: `${monthName(batch.month)} ${batch.year} - ${periodName(batch)}`,
      releasedAt: batch.releasedAt,
      status: 'RELEASED'
    }
  })

  res.json({ items, total, page, limit })
}))

/**
 * Stream one released Local payslip to its authenticated owner.
 */
router.get('/:recordId/pdf', asyncHandler(async (req, res) => {
  const record = await PayrollRecord.findById(req.params.recordId).populate({
    path: 'batchId',
    select: 'year month payPeriodId releasedAt status staffCategory',
    populate: {
      path: 'payPeriodId',
      select: 'code name sequence'
    }
  })

  if (!record || !record.batchId) throw new AppError('Payslip not found', 404)
  if (!recordBelongsToEmployee(record, req.employee)) {
    throw new AppError('Payslip does not belong to this employee', 403)
  }
  if (record.batchId.status !== 'RELEASED') {
    throw new AppError('Payslip is not released', 403)
  }

  await repairEmployeeReference(record, req.employee)

  const design = await activeDesign()
  const monthYear = `${monthName(record.batchId.month)} ${record.batchId.year}`
  const payPeriod = record.batchId.payPeriodId?.name || ''
  const pdfBuffer = await renderPayslipPdf({
    design,
    payrollValues: record.values,
    context: {
      year: record.batchId.year,
      month: record.batchId.month,
      monthYear,
      payPeriod,
      periodLabel: payPeriod ? `${monthYear} - ${payPeriod}` : monthYear
    }
  })

  const period = record.batchId.payPeriodId?.code || record.batchId.payPeriodId?.name || 'period'
  const filename = fileSafe(
    `e-PaySlip-${req.employee.employeeCode}-${record.batchId.year}-${String(record.batchId.month).padStart(2, '0')}-${period}.pdf`
  )
  const download = String(req.query.download || '') === '1'

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Cache-Control', 'private, no-store, max-age=0')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${filename}"`)
  res.send(pdfBuffer)
}))

export default router
