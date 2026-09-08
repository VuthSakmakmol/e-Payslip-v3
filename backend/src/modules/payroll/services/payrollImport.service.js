import { PayPeriod } from '../../payPeriods/PayPeriod.js'
import { PayrollBatch } from '../models/PayrollBatch.js'
import { PayrollRecord } from '../models/PayrollRecord.js'
import { PAYROLL_TEMPLATE_VERSION } from '../constants/companyPayrollLayout.js'
import { parsePayrollWorkbook } from './payrollParser.service.js'
import { createTransientPayroll } from './transientPayroll.service.js'
import { reconcilePayrollRows, publicReconciliation } from './payrollReconciliation.service.js'
import {
  normalizeReleaseMode,
  findPreviousFullRelease,
  requirePreviousFullRelease,
  nextCorrectionNumber
} from './payrollReleasePolicy.service.js'
import { AppError } from '../../../utils/AppError.js'

async function requireCleanReconciliation(rows, expectedCategory, releaseMode) {
  const reconciliation = await reconcilePayrollRows({ rows, expectedCategory, releaseMode })
  if (!reconciliation.clean) {
    throw new AppError('Payroll reconciliation required', 422, {
      reconciliation: publicReconciliation(reconciliation)
    })
  }
  return reconciliation
}

export async function importLocalPayroll({
  buffer,
  fileName,
  year,
  month,
  payPeriodId,
  releaseMode = 'FULL',
  userId
}) {
  const mode = normalizeReleaseMode(releaseMode)
  const payPeriod = await PayPeriod.findOne({ _id: payPeriodId, active: true })
  if (!payPeriod) throw new AppError('Active pay period not found', 400)

  let correctionNumber = 0
  let correctionOfBatchId = null

  if (mode === 'FULL') {
    const duplicate = await PayrollBatch.findOne({
      staffCategory: 'LOCAL',
      year,
      month,
      payPeriodId,
      status: { $in: ['READY', 'RELEASED'] },
      $or: [
        { releaseMode: 'FULL' },
        { releaseMode: { $exists: false } },
        { releaseMode: null }
      ]
    })
    if (duplicate) {
      throw new AppError(
        'A Full Payroll already exists for this month and pay period. Use Update / Correction only when correcting selected employees after the Full Payroll is released.',
        409
      )
    }
  } else {
    const previous = await requirePreviousFullRelease({
      staffCategory: 'LOCAL',
      year,
      month,
      payPeriodId
    })
    correctionNumber = await nextCorrectionNumber({
      staffCategory: 'LOCAL',
      year,
      month,
      payPeriodId
    })
    correctionOfBatchId = previous.batchId || null
  }

  const parsed = parsePayrollWorkbook(buffer)
  const reconciliation = await requireCleanReconciliation(parsed.rows, 'LOCAL', mode)

  const batch = await PayrollBatch.create({
    staffCategory: 'LOCAL',
    year,
    month,
    payPeriodId,
    releaseMode: mode,
    correctionNumber,
    correctionOfBatchId,
    templateVersion: PAYROLL_TEMPLATE_VERSION,
    sourceFileName: fileName,
    employeeCount: parsed.rows.length,
    importedBy: userId,
    status: 'READY'
  })

  try {
    await PayrollRecord.insertMany(
      parsed.rows.map((row) => {
        const employee = reconciliation.employeeByCode.get(row.employeeCode)
        return {
          batchId: batch._id,
          employeeId: employee._id,
          employeeCode: row.employeeCode,
          templateVersion: PAYROLL_TEMPLATE_VERSION,
          sourceRow: row.sourceRow,
          values: row.values
        }
      }),
      { ordered: true }
    )
  } catch (error) {
    await PayrollRecord.deleteMany({ batchId: batch._id })
    await PayrollBatch.deleteOne({ _id: batch._id })
    throw error
  }

  return batch.populate('payPeriodId')
}

export async function importForeignerPayroll({
  buffer,
  fileName,
  year,
  month,
  releaseMode = 'FULL',
  userId
}) {
  const mode = normalizeReleaseMode(releaseMode)

  if (mode === 'FULL') {
    const previous = await findPreviousFullRelease({
      staffCategory: 'FOREIGNER',
      year,
      month
    })
    if (previous.exists) {
      throw new AppError(
        'A Full Foreigner Payroll has already been released for this month. Use Update / Correction for selected employees.',
        409
      )
    }
  } else {
    await requirePreviousFullRelease({
      staffCategory: 'FOREIGNER',
      year,
      month
    })
  }

  const parsed = parsePayrollWorkbook(buffer)
  const reconciliation = await requireCleanReconciliation(parsed.rows, 'FOREIGNER', mode)

  // IMPORTANT: foreigner payroll rows remain memory-only. Release history stores metadata only.
  return createTransientPayroll({
    staffCategory: 'FOREIGNER',
    year,
    month,
    releaseMode: mode,
    sourceFileName: fileName,
    templateVersion: PAYROLL_TEMPLATE_VERSION,
    importedBy: userId,
    rows: parsed.rows.map((row) => {
      const employee = reconciliation.employeeByCode.get(row.employeeCode)
      return {
        sourceRow: row.sourceRow,
        employeeCode: row.employeeCode,
        employeeName: row.employeeName,
        employee: {
          id: employee._id.toString(),
          fullName: employee.fullName,
          companyEmail: employee.companyEmail,
          telegramChatId: employee.telegramChatId,
          preferredDelivery: employee.preferredDelivery
        },
        values: row.values
      }
    })
  })
}
