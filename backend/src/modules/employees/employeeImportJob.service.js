import crypto from 'node:crypto'
import { Employee } from './Employee.js'
import { PayslipCredential } from '../auth/PayslipCredential.js'
import { createPayslipCredential } from '../auth/payslipCredential.service.js'
import { AppError } from '../../utils/AppError.js'
import { parseEmployeeImportWorkbook } from './employeeImport.service.js'
import { validateEmployeeInput } from './employeeValidation.service.js'

const jobs = new Map()
const JOB_TTL_MS = 2 * 60 * 60 * 1000
const CANCELLED_ERROR_CODE = 'EMPLOYEE_IMPORT_CANCELLED'

function nowIso() {
  return new Date().toISOString()
}

function cleanupExpiredJobs() {
  const cutoff = Date.now() - JOB_TTL_MS
  for (const [id, job] of jobs.entries()) {
    const updatedAt = Date.parse(job.updatedAt || job.createdAt || '')
    if (Number.isFinite(updatedAt) && updatedAt < cutoff) jobs.delete(id)
  }
}

function setJob(job, patch) {
  Object.assign(job, patch, { updatedAt: nowIso() })
}

function isTerminalStatus(status) {
  return ['COMPLETED', 'FAILED', 'CANCELLED'].includes(status)
}

function publicJob(job) {
  return {
    id: job.id,
    fileName: job.fileName,
    status: job.status,
    phase: job.phase,
    progress: job.progress,
    message: job.message,
    totalRows: job.totalRows,
    validatedRows: job.validatedRows,
    createdEmployees: job.createdEmployees,
    currentEmployeeCode: job.currentEmployeeCode,
    errors: job.errors,
    result: job.result,
    canCancel: !isTerminalStatus(job.status) && !job.cancelRequested,
    cancelRequested: Boolean(job.cancelRequested),
    cancelRequestedAt: job.cancelRequestedAt,
    cancelledAt: job.cancelledAt,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt,
  }
}

function progressBetween(start, end, completed, total) {
  if (!total) return start
  const ratio = Math.min(Math.max(completed / total, 0), 1)
  return Math.round(start + (end - start) * ratio)
}

function cancellationError() {
  const error = new Error('Employee import cancelled by user')
  error.code = CANCELLED_ERROR_CODE
  return error
}

function throwIfCancelled(job) {
  if (job.cancelRequested) throw cancellationError()
}

async function rollbackEmployees(employeeIds) {
  if (!employeeIds.length) return
  await PayslipCredential.deleteMany({ employeeId: { $in: employeeIds } })
  await Employee.deleteMany({ _id: { $in: employeeIds } })
}

async function processEmployeeImport(job, buffer) {
  const createdEmployeeIds = []
  try {
    setJob(job, {
      status: 'RUNNING',
      phase: 'READING_WORKBOOK',
      progress: 3,
      message: 'Reading employee workbook…',
      startedAt: nowIso(),
    })
    throwIfCancelled(job)

    const parsedRows = parseEmployeeImportWorkbook(buffer)
    throwIfCancelled(job)

    setJob(job, {
      totalRows: parsedRows.length,
      phase: 'VALIDATING_ROWS',
      progress: 7,
      message: `Validating 0 of ${parsedRows.length} employee rows…`,
    })

    const normalized = []
    const errors = []

    for (let index = 0; index < parsedRows.length; index += 1) {
      throwIfCancelled(job)
      const row = parsedRows[index]
      try {
        if (typeof row.body.active !== 'boolean') {
          throw new AppError('Status must be ACTIVE or INACTIVE', 400)
        }
        normalized.push({
          rowNumber: row.rowNumber,
          input: validateEmployeeInput(row.body),
        })
      } catch (error) {
        errors.push({
          row: row.rowNumber,
          column: 'Employee',
          employeeCode: row.body.employeeCode || '',
          message: error.message || 'Invalid employee row',
        })
      }

      const validatedRows = index + 1
      setJob(job, {
        validatedRows,
        progress: progressBetween(7, 25, validatedRows, parsedRows.length),
        message: `Validating ${validatedRows} of ${parsedRows.length} employee rows…`,
        currentEmployeeCode: row.body.employeeCode || '',
      })
    }

    throwIfCancelled(job)
    setJob(job, {
      phase: 'CHECKING_DUPLICATES',
      progress: 28,
      message: 'Checking duplicate Employee IDs in the import file…',
      currentEmployeeCode: '',
    })

    const seen = new Map()
    for (const row of normalized) {
      throwIfCancelled(job)
      const key = row.input.employeeCode.toUpperCase()
      if (seen.has(key)) {
        errors.push({
          row: row.rowNumber,
          column: 'Employee ID',
          employeeCode: row.input.employeeCode,
          message: `Duplicate Employee ID in import file (also row ${seen.get(key)})`,
        })
      } else {
        seen.set(key, row.rowNumber)
      }
    }

    if (!errors.length) {
      throwIfCancelled(job)
      setJob(job, {
        phase: 'CHECKING_EMPLOYEE_MASTER',
        progress: 34,
        message: 'Checking Employee IDs against Employee Master…',
      })

      const employeeCodes = normalized.map((row) => row.input.employeeCode)
      const existing = await Employee.find({ employeeCode: { $in: employeeCodes } })
        .select('employeeCode')
        .lean()
      throwIfCancelled(job)

      const existingSet = new Set(
        existing.map((employee) => String(employee.employeeCode).toUpperCase()),
      )

      for (const row of normalized) {
        throwIfCancelled(job)
        if (existingSet.has(row.input.employeeCode.toUpperCase())) {
          errors.push({
            row: row.rowNumber,
            column: 'Employee ID',
            employeeCode: row.input.employeeCode,
            message: 'Employee ID already exists in Employee Master',
          })
        }
      }
    }

    throwIfCancelled(job)
    if (errors.length) {
      setJob(job, {
        status: 'FAILED',
        phase: 'VALIDATION_FAILED',
        progress: 100,
        message: 'Employee import blocked. Fix all errors and upload the file again. No employees were created.',
        errors,
        currentEmployeeCode: '',
        completedAt: nowIso(),
      })
      return
    }

    let emailEmployees = 0
    let telegramEmployees = 0
    let inactiveEmployees = 0

    setJob(job, {
      phase: 'SAVING_EMPLOYEES',
      progress: 40,
      createdEmployees: 0,
      message: `Creating 0 of ${normalized.length} employees…`,
    })

    for (let index = 0; index < normalized.length; index += 1) {
      throwIfCancelled(job)
      const row = normalized[index]
      setJob(job, {
        currentEmployeeCode: row.input.employeeCode,
        message: `Creating employee ${index + 1} of ${normalized.length} · ${row.input.employeeCode}`,
      })

      const employee = await Employee.create({
        ...row.input,
        telegramChatId: '',
        telegramProfile: null,
      })
      createdEmployeeIds.push(employee._id)
      throwIfCancelled(job)

      // Every employee receives one private six-digit e-PaySlip password.
      // The exact same value protects the PDF and verifies Telegram on first link.
      await createPayslipCredential(employee)
      throwIfCancelled(job)

      if (!employee.active) inactiveEmployees += 1
      if (employee.preferredDelivery === 'TELEGRAM') {
        telegramEmployees += 1
      } else {
        emailEmployees += 1
      }

      const createdEmployees = index + 1
      setJob(job, {
        createdEmployees,
        progress: progressBetween(40, 98, createdEmployees, normalized.length),
        message: `Created ${createdEmployees} of ${normalized.length} employees…`,
      })
    }

    throwIfCancelled(job)
    const result = {
      imported: normalized.length,
      emailEmployees,
      telegramEmployees,
      inactiveEmployees,
      message: `${normalized.length} employees imported successfully`,
    }

    setJob(job, {
      status: 'COMPLETED',
      phase: 'COMPLETED',
      progress: 100,
      message: result.message,
      currentEmployeeCode: '',
      result,
      completedAt: nowIso(),
    })
  } catch (error) {
    const wasCancelled = error?.code === CANCELLED_ERROR_CODE || job.cancelRequested
    let rollbackError = null

    if (createdEmployeeIds.length) {
      setJob(job, {
        status: wasCancelled ? 'CANCELLING' : job.status,
        phase: 'ROLLING_BACK',
        message: wasCancelled
          ? `Cancelling import. Removing ${createdEmployeeIds.length} employee record(s) created by this import…`
          : `Import stopped. Removing ${createdEmployeeIds.length} partially created employee record(s)…`,
        currentEmployeeCode: '',
      })
      try {
        await rollbackEmployees(createdEmployeeIds)
        setJob(job, { createdEmployees: 0 })
      } catch (cleanupError) {
        rollbackError = cleanupError
        console.error('[employee-import] rollback failed', cleanupError)
      }
    }

    if (wasCancelled && !rollbackError) {
      const removed = createdEmployeeIds.length
      setJob(job, {
        status: 'CANCELLED',
        phase: 'CANCELLED',
        message: removed
          ? `Import cancelled. ${removed} employee record(s) created by this import were removed. No employees from this import were kept.`
          : 'Import cancelled. No employees were created.',
        errors: [],
        result: null,
        currentEmployeeCode: '',
        cancelledAt: nowIso(),
        completedAt: nowIso(),
      })
      return
    }

    const details = Array.isArray(error?.details) ? error.details : []
    setJob(job, {
      status: 'FAILED',
      phase: 'FAILED',
      progress: 100,
      message: rollbackError
        ? `${error?.message || 'Employee import failed'}. Automatic rollback also failed; check the server log before retrying.`
        : error?.message || 'Employee import failed',
      errors: details,
      currentEmployeeCode: '',
      completedAt: nowIso(),
    })
    console.error('[employee-import] job failed', error)
  }
}

export function startEmployeeImportJob({ buffer, fileName = '' }) {
  cleanupExpiredJobs()
  const createdAt = nowIso()
  const job = {
    id: crypto.randomUUID(),
    fileName,
    status: 'QUEUED',
    phase: 'QUEUED',
    progress: 1,
    message: 'Employee import queued…',
    totalRows: 0,
    validatedRows: 0,
    createdEmployees: 0,
    currentEmployeeCode: '',
    errors: [],
    result: null,
    cancelRequested: false,
    cancelRequestedAt: null,
    cancelledAt: null,
    createdAt,
    startedAt: null,
    updatedAt: createdAt,
    completedAt: null,
  }

  jobs.set(job.id, job)

  // Do not keep the HTTP request open while hundreds of credentials are created.
  // The import continues independently and the browser polls the job status.
  setImmediate(() => {
    processEmployeeImport(job, buffer).catch((error) => {
      console.error('[employee-import] unexpected background failure', error)
      setJob(job, {
        status: 'FAILED',
        phase: 'FAILED',
        progress: 100,
        message: error?.message || 'Employee import failed',
        completedAt: nowIso(),
      })
    })
  })

  return publicJob(job)
}

export function getEmployeeImportJob(jobId) {
  cleanupExpiredJobs()
  const job = jobs.get(String(jobId || ''))
  if (!job) {
    throw new AppError('Employee import job was not found or has expired.', 404)
  }
  return publicJob(job)
}

export function cancelEmployeeImportJob(jobId) {
  cleanupExpiredJobs()
  const job = jobs.get(String(jobId || ''))
  if (!job) {
    throw new AppError('Employee import job was not found or has expired.', 404)
  }

  if (isTerminalStatus(job.status)) return publicJob(job)
  if (job.cancelRequested) return publicJob(job)

  setJob(job, {
    cancelRequested: true,
    cancelRequestedAt: nowIso(),
    status: 'CANCELLING',
    phase: 'CANCELLING',
    message: job.createdEmployees > 0
      ? `Cancellation requested. ${job.createdEmployees} created employee record(s) will be removed…`
      : 'Cancellation requested. Stopping employee import…',
    currentEmployeeCode: '',
  })

  return publicJob(job)
}
