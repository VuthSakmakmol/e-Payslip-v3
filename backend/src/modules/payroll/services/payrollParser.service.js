import XLSX from 'xlsx'
import { COMPANY_PAYROLL_LAYOUT, PAYROLL_COLUMN_COUNT } from '../constants/companyPayrollLayout.js'
import { AppError } from '../../../utils/AppError.js'

const normalizeHeader = (value) => String(value ?? '')
  .replace(/\u00a0/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase()

function cellAt(sheet, rowZeroBased, columnOneBased) {
  return sheet[XLSX.utils.encode_cell({ r: rowZeroBased, c: columnOneBased - 1 })]
}

function displayCell(cell) {
  if (!cell) return ''
  const value = XLSX.utils.format_cell(cell)
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function findHeaderRow(sheet) {
  for (let r = 0; r < 25; r += 1) {
    const c1 = normalizeHeader(displayCell(cellAt(sheet, r, 1)))
    const c2 = normalizeHeader(displayCell(cellAt(sheet, r, 2)))
    const c3 = normalizeHeader(displayCell(cellAt(sheet, r, 3)))
    if (c1 === 'no' && c2.includes('name') && c3 === 'code') return r
  }
  throw new AppError('Cannot find payroll header row. Expected No / Name-Surname / Code.', 422)
}

function validateHeaders(sheet, headerRow) {
  const errors = []

  for (const field of COMPANY_PAYROLL_LAYOUT) {
    if (!field.validateHeader || !field.header) continue
    const actual = displayCell(cellAt(sheet, headerRow, field.column))
    if (normalizeHeader(actual) !== normalizeHeader(field.header)) {
      errors.push({
        column: field.column,
        expected: field.header,
        actual
      })
    }
  }

  // Protect the fixed 87-column contract without failing because of worksheet formatting outside the data area.
  for (let column = PAYROLL_COLUMN_COUNT + 1; column <= PAYROLL_COLUMN_COUNT + 10; column += 1) {
    const extra = displayCell(cellAt(sheet, headerRow, column))
    if (extra) errors.push({ column, expected: '(no column)', actual: extra })
  }

  if (errors.length) {
    throw new AppError('Payroll template headers do not match the fixed 87-column company layout.', 422, errors)
  }
}

function decimalFromCell(cell) {
  if (!cell || cell.v === null || cell.v === undefined || cell.v === '') return null
  if (typeof cell.v === 'number' && Number.isFinite(cell.v)) return String(cell.v)

  const cleaned = String(cell.v)
    .replace(/,/g, '')
    .replace(/\$/g, '')
    .trim()

  if (!cleaned) return null
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return undefined
  return cleaned
}

function integerFromCell(cell) {
  const decimal = decimalFromCell(cell)
  if (decimal === null || decimal === undefined) return decimal
  const number = Number(decimal)
  if (!Number.isInteger(number)) return undefined
  return String(number)
}

function dateFromCell(cell) {
  if (!cell || cell.v === null || cell.v === undefined || cell.v === '') return null
  if (cell.v instanceof Date && !Number.isNaN(cell.v.valueOf())) return cell.v

  if (typeof cell.v === 'number') {
    const parsed = XLSX.SSF.parse_date_code(cell.v)
    if (parsed) return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d))
  }

  const text = displayCell(cell)
  const match = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/)
  if (match) {
    const [, dd, mm, yyyy] = match
    const date = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)))
    if (!Number.isNaN(date.valueOf())) return date
  }

  const fallback = new Date(text)
  return Number.isNaN(fallback.valueOf()) ? undefined : fallback
}

function parseValue(field, cell, rowNumber, errors) {
  const raw = displayCell(cell)
  const result = { raw, decimal: null, date: null }

  if (field.type === 'DECIMAL') {
    const value = decimalFromCell(cell)
    if (value === undefined) {
      errors.push({ row: rowNumber, column: field.column, field: field.label, message: `Expected number, got "${raw}"` })
    } else {
      result.decimal = value
    }
  }

  if (field.type === 'INTEGER') {
    const value = integerFromCell(cell)
    if (value === undefined) {
      errors.push({ row: rowNumber, column: field.column, field: field.label, message: `Expected whole number, got "${raw}"` })
    } else {
      result.decimal = value
    }
  }

  if (field.type === 'DATE') {
    const value = dateFromCell(cell)
    if (value === undefined) {
      errors.push({ row: rowNumber, column: field.column, field: field.label, message: `Invalid date "${raw}"` })
    } else {
      result.date = value
    }
  }

  if (field.required && !raw) {
    errors.push({ row: rowNumber, column: field.column, field: field.label, message: 'Required value is blank' })
  }

  return result
}

export function parsePayrollWorkbook(buffer) {
  let workbook
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, cellNF: true, cellText: true })
  } catch (error) {
    throw new AppError(`Cannot read Excel workbook: ${error.message}`, 422)
  }

  const sheetName = workbook.SheetNames[0]
  if (!sheetName) throw new AppError('Workbook has no worksheets', 422)
  const sheet = workbook.Sheets[sheetName]
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1')
  const headerRow = findHeaderRow(sheet)
  validateHeaders(sheet, headerRow)

  const rows = []
  const errors = []
  const seenCodes = new Set()

  for (let r = headerRow + 1; r <= range.e.r; r += 1) {
    const rowNumber = r + 1
    const name = displayCell(cellAt(sheet, r, 2))
    const code = displayCell(cellAt(sheet, r, 3))

    if (!name && !code) continue

    const values = {}
    for (const field of COMPANY_PAYROLL_LAYOUT) {
      values[field.key] = parseValue(field, cellAt(sheet, r, field.column), rowNumber, errors)
    }

    const employeeCode = values.employeeCode.raw
    if (employeeCode) {
      if (seenCodes.has(employeeCode)) {
        errors.push({ row: rowNumber, column: 3, field: 'Code', message: `Duplicate employee code ${employeeCode}` })
      }
      seenCodes.add(employeeCode)
    }

    rows.push({
      sourceRow: rowNumber,
      employeeCode,
      employeeName: values.employeeName.raw,
      values
    })
  }

  if (!rows.length) throw new AppError('No payroll employee rows were found', 422)
  if (errors.length) throw new AppError('Payroll data validation failed', 422, errors.slice(0, 500))

  return { sheetName, headerRow: headerRow + 1, rows }
}
