import { Router } from 'express'
import multer from 'multer'
import { Employee } from '../employees/Employee.js'
import { PayrollBatch } from './models/PayrollBatch.js'
import { PayrollRecord } from './models/PayrollRecord.js'
import { PayslipDesign } from '../payslips/PayslipDesign.js'
import { renderPayslipPdf } from '../payslips/payslipRenderer.service.js'
import { deliverPayslip } from '../delivery/delivery.service.js'
import { importLocalPayroll, importForeignerPayroll } from './services/payrollImport.service.js'
import { reconcilePayrollRows, publicReconciliation } from './services/payrollReconciliation.service.js'
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

function dobPdfPassword(employee) {
  const value = employee?.dateOfBirth
  const date = value instanceof Date ? value : new Date(value)
  if (!value || Number.isNaN(date.getTime())) throw new AppError(`Date of Birth is missing for employee ${employee?.employeeCode || ''}`, 409)
  return `${String(date.getUTCDate()).padStart(2, '0')}${String(date.getUTCMonth() + 1).padStart(2, '0')}${date.getUTCFullYear()}`
}

async function activeDesign() {
  const design = await PayslipDesign.findOne({ active: true }).sort({ updatedAt: -1 })
  if (!design) throw new AppError('No active payslip design. Create and activate a design first.', 400)
  return design
}

router.post('/import', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file?.buffer) throw new AppError('Payroll XLSX file is required', 400)
  const staffCategory = String(req.body.staffCategory || '').toUpperCase()
  const year = Number(req.body.year)
  const month = Number(req.body.month)

  if (!['LOCAL', 'FOREIGNER'].includes(staffCategory)) throw new AppError('staffCategory must be LOCAL or FOREIGNER', 400)
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new AppError('Invalid payroll year', 400)
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new AppError('Invalid payroll month', 400)

  if (staffCategory === 'LOCAL') {
    const batch = await importLocalPayroll({
      buffer: req.file.buffer,
      fileName: req.file.originalname,
      year,
      month,
      payPeriodId: req.body.payPeriodId,
      userId: req.user._id
    })
    return res.status(201).json({ mode: 'STORED', batch })
  }

  const session = await importForeignerPayroll({
    buffer: req.file.buffer,
    fileName: req.file.originalname,
    year,
    month,
    userId: req.user._id
  })

  res.status(201).json({
    mode: 'TRANSIENT',
    session: {
      id: session.id,
      employeeCount: session.rows.length,
      approved: session.approved,
      expiresAt: new Date(session.expiresAt)
    }
  })
}))

router.get('/batches', asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1)
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100)
  const [items, total] = await Promise.all([
    PayrollBatch.find().populate('payPeriodId').sort({ year: -1, month: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    PayrollBatch.countDocuments()
  ])
  res.json({ items, total, page, limit })
}))

router.get('/batches/:id', asyncHandler(async (req, res) => {
  const item = await PayrollBatch.findById(req.params.id).populate('payPeriodId')
  if (!item) throw new AppError('Payroll batch not found', 404)
  res.json({ item })
}))

router.get('/batches/:id/records', asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1)
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100)
  const filter = { batchId: req.params.id }
  const [items, total] = await Promise.all([
    PayrollRecord.find(filter).sort({ employeeCode: 1 }).skip((page - 1) * limit).limit(limit),
    PayrollRecord.countDocuments(filter)
  ])
  res.json({ items, total, page, limit })
}))

router.get('/batches/:id/reconciliation', asyncHandler(async (req, res) => {
  const batch = await PayrollBatch.findById(req.params.id)
  if (!batch) throw new AppError('Payroll batch not found', 404)
  const records = await PayrollRecord.find({ batchId: batch._id }).sort({ employeeCode: 1 })
  const reconciliation = await reconcilePayrollRows({ rows: records, expectedCategory: 'LOCAL' })
  res.json({ reconciliation: publicReconciliation(reconciliation) })
}))

router.get('/batches/:id/preview/:employeeCode', asyncHandler(async (req, res) => {
  const [batch, record, design] = await Promise.all([
    PayrollBatch.findById(req.params.id).populate('payPeriodId'),
    PayrollRecord.findOne({ batchId: req.params.id, employeeCode: req.params.employeeCode }),
    activeDesign()
  ])
  if (!batch || !record) throw new AppError('Payroll record not found', 404)
  const pdfBuffer = await renderPayslipPdf({
    design,
    payrollValues: record.values,
    context: {
      year: batch.year,
      month: batch.month,
      monthYear: `${monthName(batch.month)} ${batch.year}`,
      payPeriod: batch.payPeriodId?.name || '',
      periodLabel: `${monthName(batch.month)} ${batch.year} - ${batch.payPeriodId?.name || 'Pay Period'}`
    }
  })
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename="Payslip-${record.employeeCode}.pdf"`)
  res.send(pdfBuffer)
}))

router.post('/batches/:id/release', asyncHandler(async (req, res) => {
  const batch = await PayrollBatch.findById(req.params.id).populate('payPeriodId')
  if (!batch) throw new AppError('Payroll batch not found', 404)
  if (batch.status === 'RELEASED') throw new AppError('Payroll batch is already released', 409)
  if (batch.status !== 'READY') throw new AppError('Payroll batch is not ready for release', 409)

  const design = await activeDesign()
  const records = await PayrollRecord.find({ batchId: batch._id }).sort({ employeeCode: 1 })
  const reconciliation = await reconcilePayrollRows({ rows: records, expectedCategory: 'LOCAL' })
  if (!reconciliation.clean) {
    throw new AppError('Payroll reconciliation is not clean. Release is blocked.', 409, {
      reconciliation: publicReconciliation(reconciliation)
    })
  }
  const employeeMap = reconciliation.employeeByCode
  const periodLabel = `${monthName(batch.month)} ${batch.year} - ${batch.payPeriodId?.name || 'Pay Period'}`
  const deliveryResults = []

  for (const record of records) {
    const employee = employeeMap.get(record.employeeCode)
    if (!employee) continue
    const pdfBuffer = await renderPayslipPdf({
      design,
      payrollValues: record.values,
      password: dobPdfPassword(employee),
      context: {
        year: batch.year,
        month: batch.month,
        monthYear: `${monthName(batch.month)} ${batch.year}`,
        payPeriod: batch.payPeriodId?.name || '',
        periodLabel
      }
    })
    const logs = await deliverPayslip({
      employee,
      pdfBuffer,
      filename: `e-PaySlip-${record.employeeCode}-${batch.year}-${String(batch.month).padStart(2, '0')}.pdf`,
      periodLabel,
      context: {
        employeeCode: record.employeeCode,
        staffCategory: 'LOCAL',
        year: batch.year,
        month: batch.month,
        payPeriodId: batch.payPeriodId?._id,
        batchId: batch._id,
        pdfPasswordProtected: true,
        releasedBy: req.user._id
      }
    })
    deliveryResults.push(...logs.map((log) => ({ employeeCode: record.employeeCode, channel: log.channel, status: log.status, errorMessage: log.errorMessage })))
  }

  batch.status = 'RELEASED'
  batch.releasedBy = req.user._id
  batch.releasedAt = new Date()
  await batch.save()

  res.json({ batch, deliveries: deliveryResults })
}))

router.get('/transient/:id', asyncHandler(async (req, res) => {
  const session = getTransientPayroll(req.params.id)
  const reconciliation = await reconcilePayrollRows({ rows: session.rows, expectedCategory: 'FOREIGNER' })
  res.json({
    session: {
      id: session.id,
      year: session.year,
      month: session.month,
      employeeCount: session.rows.length,
      approved: session.approved,
      expiresAt: new Date(session.expiresAt),
      rows: session.rows,
      reconciliation: publicReconciliation(reconciliation)
    }
  })
}))

router.get('/transient/:id/preview/:employeeCode', asyncHandler(async (req, res) => {
  const session = getTransientPayroll(req.params.id)
  const row = session.rows.find((item) => item.employeeCode === req.params.employeeCode)
  if (!row) throw new AppError('Temporary payroll employee not found', 404)
  const design = await activeDesign()
  const periodLabel = `${monthName(session.month)} ${session.year}`
  const pdfBuffer = await renderPayslipPdf({
    design,
    payrollValues: row.values,
    context: {
      year: session.year,
      month: session.month,
      monthYear: periodLabel,
      payPeriod: '',
      periodLabel
    }
  })
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Disposition', `inline; filename="Payslip-${row.employeeCode}.pdf"`)
  res.send(pdfBuffer)
}))

router.post('/transient/:id/approve', asyncHandler(async (req, res) => {
  const current = getTransientPayroll(req.params.id)
  const reconciliation = await reconcilePayrollRows({ rows: current.rows, expectedCategory: 'FOREIGNER' })
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
  if (!session.approved) throw new AppError('Foreigner payroll must be previewed and approved before release', 409)
  const reconciliation = await reconcilePayrollRows({ rows: session.rows, expectedCategory: 'FOREIGNER' })
  if (!reconciliation.clean) {
    throw new AppError('Payroll reconciliation is not clean. Release is blocked.', 409, {
      reconciliation: publicReconciliation(reconciliation)
    })
  }
  const design = await activeDesign()
  const periodLabel = `${monthName(session.month)} ${session.year}`
  const deliveryResults = []

  const employeeIds = session.rows.map((row) => row.employee.id)
  const currentEmployees = await Employee.find({ _id: { $in: employeeIds }, active: true })
  const currentEmployeeMap = new Map(currentEmployees.map((employee) => [employee._id.toString(), employee]))

  try {
    for (const row of session.rows) {
      // Always use the employee's CURRENT delivery setting/contact at release time.
      // This prevents a stale transient import from keeping an old email or unverified Telegram Chat ID.
      const employee = currentEmployeeMap.get(row.employee.id)
      if (!employee) {
        throw new AppError(`Employee ${row.employeeCode} is missing or inactive at release time`, 409)
      }
      const pdfPassword = dobPdfPassword(employee)

      const pdfBuffer = await renderPayslipPdf({
        design,
        payrollValues: row.values,
        password: pdfPassword,
        context: {
          year: session.year,
          month: session.month,
          monthYear: periodLabel,
          payPeriod: '',
          periodLabel
        }
      })
      try {
        const logs = await deliverPayslip({
          employee,
          pdfBuffer,
          filename: `e-PaySlip-${row.employeeCode}-${session.year}-${String(session.month).padStart(2, '0')}.pdf`,
          periodLabel,
          context: {
            employeeCode: row.employeeCode,
            staffCategory: 'FOREIGNER',
            year: session.year,
            month: session.month,
            pdfPasswordProtected: Boolean(pdfPassword),
            releasedBy: req.user._id
          }
        })
        deliveryResults.push(...logs.map((log) => ({ employeeCode: row.employeeCode, channel: log.channel, status: log.status, errorMessage: log.errorMessage })))
      } finally {
        // Best-effort overwrite after SMTP/Telegram delivery completes.
        pdfBuffer.fill(0)
      }
    }
  } finally {
    // Foreign payroll and PDF buffers are intentionally not retained by the application.
    destroyTransientPayroll(session.id)
  }

  res.json({ released: true, deliveries: deliveryResults, payrollRetained: false })
}))

export default router
