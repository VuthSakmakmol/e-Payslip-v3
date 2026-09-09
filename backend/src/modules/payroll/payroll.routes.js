import { Router } from 'express'
import multer from 'multer'
import { Employee } from '../employees/Employee.js'
import { ensurePayslipPassword } from '../auth/payslipCredential.service.js'
import { PayrollRelease } from './models/PayrollRelease.js'
import { PayslipDesign } from '../payslips/PayslipDesign.js'
import { renderPayslipPdf } from '../payslips/payslipRenderer.service.js'
import { deliverPayslip } from '../delivery/delivery.service.js'
import { importLocalPayroll, importForeignerPayroll } from './services/payrollImport.service.js'
import { reconcilePayrollRows, publicReconciliation } from './services/payrollReconciliation.service.js'
import {
  normalizeReleaseMode,
  findPreviousFullRelease,
  requirePreviousFullRelease,
  nextCorrectionNumber,
  createReleaseHistory
} from './services/payrollReleasePolicy.service.js'
import {
  getTransientPayroll,
  approveTransientPayroll,
  destroyTransientPayroll
} from './services/transientPayroll.service.js'
import { AppError } from '../../utils/AppError.js'
import { asyncHandler } from '../../utils/asyncHandler.js'

const router = Router()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 }
})

const monthName = (month) => new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date(Date.UTC(2020, month - 1, 1)))

async function activeDesign() {
  const design = await PayslipDesign.findOne({ active: true }).sort({ updatedAt: -1 })
  if (!design) throw new AppError('No active payslip design. Create and activate a design first.', 400)
  return design
}

function periodArgs(session) {
  return {
    staffCategory: session.staffCategory,
    year: session.year,
    month: session.month,
    payPeriodId: session.staffCategory === 'LOCAL' ? session.payPeriodId : null
  }
}

function periodLabel(session) {
  const monthYear = `${monthName(session.month)} ${session.year}`
  return session.staffCategory === 'LOCAL' && session.payPeriodName
    ? `${monthYear} - ${session.payPeriodName}`
    : monthYear
}

function publicSession(session, reconciliation = null) {
  return {
    id: session.id,
    staffCategory: session.staffCategory,
    year: session.year,
    month: session.month,
    payPeriodId: session.payPeriodId || null,
    payPeriodName: session.payPeriodName || '',
    releaseMode: session.releaseMode || 'FULL',
    employeeCount: session.rows.length,
    approved: session.approved,
    approvedAt: session.approvedAt || null,
    expiresAt: new Date(session.expiresAt),
    rows: session.rows,
    ...(reconciliation ? { reconciliation: publicReconciliation(reconciliation) } : {})
  }
}

router.get('/release-mode-availability', asyncHandler(async (req, res) => {
  const staffCategory = String(req.query.staffCategory || '').toUpperCase()
  const year = Number(req.query.year)
  const month = Number(req.query.month)
  const payPeriodId = req.query.payPeriodId || null

  if (!['LOCAL', 'FOREIGNER'].includes(staffCategory)) throw new AppError('staffCategory must be LOCAL or FOREIGNER', 400)
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new AppError('Invalid payroll year', 400)
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new AppError('Invalid payroll month', 400)
  if (staffCategory === 'LOCAL' && !payPeriodId) {
    return res.json({ fullReleaseExists: false, updateAllowed: false, reason: 'Select a pay period first.' })
  }

  const previous = await findPreviousFullRelease({ staffCategory, year, month, payPeriodId })
  res.json({
    fullReleaseExists: previous.exists,
    updateAllowed: previous.exists,
    fullEmployeeCount: previous.employeeCount || 0,
    fullReleasedAt: previous.releasedAt || null
  })
}))

router.post('/import', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file?.buffer) throw new AppError('Payroll XLSX file is required', 400)
  const staffCategory = String(req.body.staffCategory || '').toUpperCase()
  const year = Number(req.body.year)
  const month = Number(req.body.month)
  const releaseMode = normalizeReleaseMode(req.body.releaseMode)

  if (!['LOCAL', 'FOREIGNER'].includes(staffCategory)) throw new AppError('staffCategory must be LOCAL or FOREIGNER', 400)
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new AppError('Invalid payroll year', 400)
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new AppError('Invalid payroll month', 400)

  const session = staffCategory === 'LOCAL'
    ? await importLocalPayroll({
      buffer: req.file.buffer,
      fileName: req.file.originalname,
      year,
      month,
      payPeriodId: req.body.payPeriodId,
      releaseMode,
      userId: req.user._id
    })
    : await importForeignerPayroll({
      buffer: req.file.buffer,
      fileName: req.file.originalname,
      year,
      month,
      releaseMode,
      userId: req.user._id
    })

  // PRIVACY RULE: every payroll category is memory-only.
  res.status(201).json({
    mode: 'TRANSIENT',
    session: {
      id: session.id,
      staffCategory: session.staffCategory,
      releaseMode: session.releaseMode,
      employeeCount: session.rows.length,
      approved: session.approved,
      expiresAt: new Date(session.expiresAt)
    }
  })
}))

// Non-salary audit history only. No payroll rows or payslip values are returned/stored here.
router.get('/releases', asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1)
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100)
  const staffCategory = String(req.query.staffCategory || '').trim().toUpperCase()
  const releaseMode = String(req.query.releaseMode || '').trim().toUpperCase()
  const filter = {}
  if (['LOCAL', 'FOREIGNER'].includes(staffCategory)) filter.staffCategory = staffCategory
  if (['FULL', 'UPDATE'].includes(releaseMode)) filter.releaseMode = releaseMode

  const [items, total] = await Promise.all([
    PayrollRelease.find(filter)
      .populate('payPeriodId', 'name')
      .populate('releasedBy', 'name adminId')
      .sort({ releasedAt: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    PayrollRelease.countDocuments(filter)
  ])

  res.json({ items, total, page, limit })
}))

router.get('/transient/:id', asyncHandler(async (req, res) => {
  const session = getTransientPayroll(req.params.id)
  const reconciliation = await reconcilePayrollRows({
    rows: session.rows,
    expectedCategory: session.staffCategory,
    releaseMode: session.releaseMode || 'FULL'
  })
  res.setHeader('Cache-Control', 'no-store')
  res.json({ session: publicSession(session, reconciliation) })
}))

router.get('/transient/:id/preview/:employeeCode', asyncHandler(async (req, res) => {
  const session = getTransientPayroll(req.params.id)
  const row = session.rows.find((item) => item.employeeCode === req.params.employeeCode)
  if (!row) throw new AppError('Temporary payroll employee not found', 404)

  const design = await activeDesign()
  const label = periodLabel(session)
  const pdfBuffer = await renderPayslipPdf({
    design,
    payrollValues: row.values,
    context: {
      year: session.year,
      month: session.month,
      monthYear: `${monthName(session.month)} ${session.year}`,
      payPeriod: session.payPeriodName || '',
      periodLabel: label
    }
  })

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Content-Disposition', `inline; filename="Payslip-${row.employeeCode}.pdf"`)
  res.once('finish', () => pdfBuffer.fill(0))
  res.once('close', () => pdfBuffer.fill(0))
  res.send(pdfBuffer)
}))

router.post('/transient/:id/approve', asyncHandler(async (req, res) => {
  const current = getTransientPayroll(req.params.id)

  if ((current.releaseMode || 'FULL') === 'UPDATE') {
    await requirePreviousFullRelease(periodArgs(current))
  }

  const reconciliation = await reconcilePayrollRows({
    rows: current.rows,
    expectedCategory: current.staffCategory,
    releaseMode: current.releaseMode || 'FULL'
  })

  if (!reconciliation.clean) {
    throw new AppError('Payroll reconciliation is not clean. Approval is blocked.', 409, {
      reconciliation: publicReconciliation(reconciliation)
    })
  }

  const session = approveTransientPayroll(req.params.id, req.user._id.toString())
  res.json({ id: session.id, approved: session.approved, approvedAt: session.approvedAt })
}))

router.post('/transient/:id/release', asyncHandler(async (req, res) => {
  const session = getTransientPayroll(req.params.id)
  if (!session.approved) throw new AppError('Payroll must be previewed and approved before release', 409)

  const releaseMode = session.releaseMode || 'FULL'
  let correctionNumber = 0
  const period = periodArgs(session)

  if (releaseMode === 'UPDATE') {
    await requirePreviousFullRelease(period)
    correctionNumber = await nextCorrectionNumber(period)
  } else {
    const previous = await findPreviousFullRelease(period)
    if (previous.exists) {
      throw new AppError('A Full Payroll has already been released for this exact period. Use Update / Correction.', 409)
    }
  }

  const reconciliation = await reconcilePayrollRows({
    rows: session.rows,
    expectedCategory: session.staffCategory,
    releaseMode
  })
  if (!reconciliation.clean) {
    throw new AppError('Payroll reconciliation is not clean. Release is blocked.', 409, {
      reconciliation: publicReconciliation(reconciliation)
    })
  }

  const design = await activeDesign()
  const label = periodLabel(session)
  const deliveryResults = []

  const employeeIds = session.rows.map((row) => row.employee.id)
  const currentEmployees = await Employee.find({
    _id: { $in: employeeIds },
    active: true,
    staffCategory: session.staffCategory
  })
  const currentEmployeeMap = new Map(currentEmployees.map((employee) => [employee._id.toString(), employee]))

  try {
    for (const row of session.rows) {
      const employee = currentEmployeeMap.get(row.employee.id)
      if (!employee) {
        throw new AppError(`Employee ${row.employeeCode} is missing, inactive, or in the wrong category at release time`, 409)
      }

      const pdfPassword = await ensurePayslipPassword(employee)
      const pdfBuffer = await renderPayslipPdf({
        design,
        payrollValues: row.values,
        password: pdfPassword,
        context: {
          year: session.year,
          month: session.month,
          monthYear: `${monthName(session.month)} ${session.year}`,
          payPeriod: session.payPeriodName || '',
          periodLabel: label
        }
      })

      try {
        const logs = await deliverPayslip({
          employee,
          pdfBuffer,
          filename: `e-PaySlip-${row.employeeCode}-${session.year}-${String(session.month).padStart(2, '0')}.pdf`,
          periodLabel: label,
          context: {
            employeeCode: row.employeeCode,
            staffCategory: session.staffCategory,
            year: session.year,
            month: session.month,
            payPeriodId: session.payPeriodId || null,
            releaseMode,
            correctionNumber,
            pdfPasswordProtected: Boolean(pdfPassword),
            releasedBy: req.user._id
          }
        })
        deliveryResults.push(...logs.map((log) => ({
          employeeCode: row.employeeCode,
          channel: log.channel,
          status: log.status,
          errorMessage: log.errorMessage
        })))
      } finally {
        // Do not retain generated PDF bytes in process memory longer than necessary.
        pdfBuffer.fill(0)
      }
    }

    await createReleaseHistory({
      staffCategory: session.staffCategory,
      year: session.year,
      month: session.month,
      payPeriodId: session.payPeriodId || null,
      releaseMode,
      correctionNumber,
      sourceFileName: session.sourceFileName,
      employeeCount: session.rows.length,
      deliveries: deliveryResults,
      releasedBy: req.user._id
    })
  } finally {
    // ALL payroll rows are transient for LOCAL and FOREIGNER.
    destroyTransientPayroll(session.id)
  }

  res.json({
    released: true,
    staffCategory: session.staffCategory,
    releaseMode,
    correctionNumber,
    employeeCount: session.rows.length,
    deliveries: deliveryResults,
    payrollRetained: false
  })
}))

export default router
