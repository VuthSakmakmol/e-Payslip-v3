import { PayPeriod } from '../../payPeriods/PayPeriod.js'
import { PAYROLL_TEMPLATE_VERSION } from '../constants/companyPayrollLayout.js'
import { parsePayrollWorkbook } from './payrollParser.service.js'
import { createTransientPayroll } from './transientPayroll.service.js'
import { reconcilePayrollRows, publicReconciliation } from './payrollReconciliation.service.js'
import {
  normalizeReleaseMode,
  findPreviousFullRelease,
  requirePreviousFullRelease
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

function transientRows(parsedRows, reconciliation) {
  return parsedRows.map((row) => {
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

  if (mode === 'FULL') {
    const previous = await findPreviousFullRelease({
      staffCategory: 'LOCAL',
      year,
      month,
      payPeriodId: payPeriod._id
    })
    if (previous.exists) {
      throw new AppError(
        'A Full Local Payroll has already been released for this month and pay period. Use Update / Correction for selected employees.',
        409
      )
    }
  } else {
    await requirePreviousFullRelease({
      staffCategory: 'LOCAL',
      year,
      month,
      payPeriodId: payPeriod._id
    })
  }

  const parsed = parsePayrollWorkbook(buffer)
  const reconciliation = await requireCleanReconciliation(parsed.rows, 'LOCAL', mode)

  // PRIVACY RULE: LOCAL payroll is now memory-only, exactly like FOREIGNER payroll.
  // No PayrollBatch or PayrollRecord document is created.
  return createTransientPayroll({
    staffCategory: 'LOCAL',
    year,
    month,
    payPeriodId: payPeriod._id.toString(),
    payPeriodName: payPeriod.name,
    releaseMode: mode,
    sourceFileName: fileName,
    templateVersion: PAYROLL_TEMPLATE_VERSION,
    importedBy: userId,
    rows: transientRows(parsed.rows, reconciliation)
  })
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

  return createTransientPayroll({
    staffCategory: 'FOREIGNER',
    year,
    month,
    payPeriodId: null,
    payPeriodName: '',
    releaseMode: mode,
    sourceFileName: fileName,
    templateVersion: PAYROLL_TEMPLATE_VERSION,
    importedBy: userId,
    rows: transientRows(parsed.rows, reconciliation)
  })
}
