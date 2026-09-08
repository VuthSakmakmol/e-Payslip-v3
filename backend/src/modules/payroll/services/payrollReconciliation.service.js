import { Employee } from '../../employees/Employee.js'

function normalizeCode(value) {
  return String(value ?? '').trim()
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function dateOnly(value) {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function payrollValue(row, key) {
  const values = row?.values
  if (!values) return null
  if (typeof values.get === 'function') return values.get(key) || null
  return values[key] || null
}

function payrollRaw(row, key) {
  return String(payrollValue(row, key)?.raw ?? '').trim()
}

function payrollDate(row, key) {
  const value = payrollValue(row, key)
  return dateOnly(value?.date || value?.raw)
}

function employeeDate(employee) {
  return dateOnly(employee?.dateJoin)
}

function fieldComparison(field, label, payroll, master, match) {
  return { field, label, payroll: payroll || '', master: master || '', match: Boolean(match) }
}

function issueBase(status, row, employee = null) {
  return {
    status,
    employeeCode: normalizeCode(row?.employeeCode || employee?.employeeCode),
    employeeName: payrollRaw(row, 'employeeName') || employee?.fullName || '',
    payrollRow: row?.sourceRow || null,
    masterEmployeeId: employee?._id?.toString?.() || null
  }
}

function publicEmployee(employee) {
  return {
    employeeCode: employee.employeeCode,
    employeeName: employee.fullName,
    dateJoin: employeeDate(employee),
    department: employee.department || '',
    position: employee.position || '',
    staffCategory: employee.staffCategory,
    active: employee.active !== false
  }
}

export function publicReconciliation(result) {
  return {
    clean: result.clean,
    releaseMode: result.releaseMode,
    summary: result.summary,
    issues: result.issues,
    rows: result.rows
  }
}

/**
 * FULL: strict two-way completeness. Every active employee in the selected
 * category must appear in payroll and every payroll row must match Master.
 *
 * UPDATE: strict validation only for the uploaded correction population.
 * Employees outside the uploaded file are deliberately ignored, but every
 * uploaded row must still exist in Master and match ID/Date Join/Department/Position.
 */
export async function reconcilePayrollRows({ rows, expectedCategory, releaseMode = 'FULL' }) {
  const category = String(expectedCategory || '').toUpperCase()
  const mode = String(releaseMode || 'FULL').toUpperCase() === 'UPDATE' ? 'UPDATE' : 'FULL'
  const payrollCodes = new Set(rows.map((row) => normalizeCode(row.employeeCode)).filter(Boolean))
  const codes = [...payrollCodes]

  const [expectedEmployees, payrollCandidates] = await Promise.all([
    Employee.find({ staffCategory: category, active: true })
      .select('_id employeeCode fullName dateJoin dateOfBirth department position staffCategory active preferredDelivery companyEmail telegramChatId telegramProfile')
      .lean(),
    codes.length
      ? Employee.find({ employeeCode: { $in: codes } })
        .select('_id employeeCode fullName dateJoin dateOfBirth department position staffCategory active preferredDelivery companyEmail telegramChatId telegramProfile')
        .lean()
      : []
  ])

  const candidateMap = new Map(payrollCandidates.map((employee) => [normalizeCode(employee.employeeCode), employee]))
  const employeeByCode = new Map()
  const issues = []
  const rowStatuses = []
  let verifiedCount = 0
  let payrollOnlyCount = 0
  let mismatchCount = 0

  for (const row of rows) {
    const code = normalizeCode(row.employeeCode)
    const candidate = candidateMap.get(code)

    if (!candidate) {
      payrollOnlyCount += 1
      const issue = {
        ...issueBase('PAYROLL_ONLY', row),
        reason: 'Employee not in Employee Master',
        fields: [
          fieldComparison('employeeCode', 'Employee ID', code, '', false),
          fieldComparison('dateJoin', 'Date Join', payrollDate(row, 'dateJoin'), '', false),
          fieldComparison('department', 'Department', payrollRaw(row, 'department'), '', false),
          fieldComparison('position', 'Position', payrollRaw(row, 'position'), '', false)
        ]
      }
      issues.push(issue)
      rowStatuses.push({ employeeCode: code, status: 'PAYROLL_ONLY', reason: issue.reason })
      continue
    }

    if (candidate.active === false || candidate.staffCategory !== category) {
      mismatchCount += 1
      const fields = []
      if (candidate.active === false) fields.push(fieldComparison('active', 'Status', 'Payroll Row', 'Inactive', false))
      if (candidate.staffCategory !== category) fields.push(fieldComparison('staffCategory', 'Category', category, candidate.staffCategory, false))
      const issue = {
        ...issueBase('MISMATCH', row, candidate),
        reason: candidate.active === false ? 'Employee is inactive' : 'Employee category mismatch',
        fields
      }
      issues.push(issue)
      rowStatuses.push({ employeeCode: code, status: 'MISMATCH', reason: issue.reason })
      continue
    }

    const payrollJoin = payrollDate(row, 'dateJoin')
    const masterJoin = employeeDate(candidate)
    const payrollDepartment = payrollRaw(row, 'department')
    const masterDepartment = candidate.department || ''
    const payrollPosition = payrollRaw(row, 'position')
    const masterPosition = candidate.position || ''

    const comparisons = [
      fieldComparison('employeeCode', 'Employee ID', code, normalizeCode(candidate.employeeCode), code === normalizeCode(candidate.employeeCode)),
      fieldComparison('dateJoin', 'Date Join', payrollJoin, masterJoin, Boolean(payrollJoin && masterJoin && payrollJoin === masterJoin)),
      fieldComparison('department', 'Department', payrollDepartment, masterDepartment, Boolean(payrollDepartment && masterDepartment && normalizeText(payrollDepartment) === normalizeText(masterDepartment))),
      fieldComparison('position', 'Position', payrollPosition, masterPosition, Boolean(payrollPosition && masterPosition && normalizeText(payrollPosition) === normalizeText(masterPosition)))
    ]

    const failed = comparisons.filter((item) => !item.match)
    if (failed.length) {
      mismatchCount += 1
      const issue = {
        ...issueBase('MISMATCH', row, candidate),
        reason: `${failed.map((item) => item.label).join(', ')} mismatch`,
        fields: comparisons
      }
      issues.push(issue)
      rowStatuses.push({ employeeCode: code, status: 'MISMATCH', reason: issue.reason })
      continue
    }

    verifiedCount += 1
    employeeByCode.set(code, candidate)
    rowStatuses.push({ employeeCode: code, status: 'VERIFIED', reason: '' })
  }

  const notUploaded = expectedEmployees.filter((employee) => !payrollCodes.has(normalizeCode(employee.employeeCode)))
  const masterOnly = mode === 'FULL' ? notUploaded : []

  for (const employee of masterOnly) {
    const details = publicEmployee(employee)
    issues.push({
      status: 'MASTER_ONLY',
      employeeCode: details.employeeCode,
      employeeName: details.employeeName,
      payrollRow: null,
      masterEmployeeId: employee._id?.toString?.() || null,
      reason: 'Employee missing from Payroll',
      fields: [
        fieldComparison('employeeCode', 'Employee ID', '', details.employeeCode, false),
        fieldComparison('dateJoin', 'Date Join', '', details.dateJoin, false),
        fieldComparison('department', 'Department', '', details.department, false),
        fieldComparison('position', 'Position', '', details.position, false)
      ]
    })
  }

  const summary = {
    expectedEmployees: expectedEmployees.length,
    payrollRows: rows.length,
    verified: verifiedCount,
    payrollOnly: payrollOnlyCount,
    masterOnly: masterOnly.length,
    ignoredMaster: mode === 'UPDATE' ? notUploaded.length : 0,
    mismatch: mismatchCount
  }

  return {
    releaseMode: mode,
    clean: summary.payrollOnly === 0 && summary.masterOnly === 0 && summary.mismatch === 0 && summary.verified === rows.length,
    summary,
    issues,
    rows: rowStatuses,
    employeeByCode
  }
}
