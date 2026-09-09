import XLSX from 'xlsx'
import { AppError } from '../../utils/AppError.js'

export const EMPLOYEE_IMPORT_HEADERS = [
  'Employee ID',
  'Full Name',
  'Date Join',
  'Category',
  'Department',
  'Line',
  'Position',
  'Delivery Channel',
  'Email Address',
  'Status'
]

function normalizeHeader(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function excelDateToIso(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (parsed?.y && parsed?.m && parsed?.d) {
      return `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`
    }
  }

  const text = String(value ?? '').trim()
  if (!text) return ''

  let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(text)
  if (match) {
    return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`
  }

  match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(text)
  if (match) {
    return `${match[3]}-${String(match[2]).padStart(2, '0')}-${String(match[1]).padStart(2, '0')}`
  }

  return text
}

function normalizeCategory(value) {
  const text = String(value ?? '').trim().toUpperCase().replace(/\s+/g, ' ')
  if (text === 'LOCAL STAFF') return 'LOCAL'
  return text
}

function normalizeDelivery(value) {
  return String(value ?? '').trim().toUpperCase().replace(/\s+/g, ' ')
}

function normalizeStatus(value) {
  const text = String(value ?? '').trim().toUpperCase()
  if (!text || ['ACTIVE', 'YES', 'TRUE', '1'].includes(text)) return true
  if (['INACTIVE', 'NO', 'FALSE', '0'].includes(text)) return false
  return value
}

function isBlankRow(row) {
  return EMPLOYEE_IMPORT_HEADERS.every((header) => String(row?.[header] ?? '').trim() === '')
}

export function parseEmployeeImportWorkbook(buffer) {
  let workbook
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  } catch {
    throw new AppError('Employee import file could not be read. Please use a valid XLSX file.', 400)
  }

  const sheetName = workbook.SheetNames.find((name) => normalizeHeader(name) === 'employees') || workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) throw new AppError('Employee import workbook does not contain a worksheet.', 400)

  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true })
  if (!matrix.length) throw new AppError('Employee import worksheet is empty.', 400)

  const rawHeaders = matrix[0].map((value) => String(value ?? '').trim())
  const actualByNormalized = new Map(rawHeaders.map((header, index) => [normalizeHeader(header), index]))
  const missing = EMPLOYEE_IMPORT_HEADERS.filter((header) => !actualByNormalized.has(normalizeHeader(header)))
  if (missing.length) {
    throw new AppError('Employee import template is invalid.', 400, missing.map((header) => ({
      row: 1,
      column: header,
      message: `Missing required column: ${header}`
    })))
  }

  const rows = []
  for (let index = 1; index < matrix.length; index += 1) {
    const source = matrix[index]
    const row = {}
    for (const header of EMPLOYEE_IMPORT_HEADERS) {
      const colIndex = actualByNormalized.get(normalizeHeader(header))
      row[header] = source[colIndex] ?? ''
    }
    if (isBlankRow(row)) continue

    rows.push({
      rowNumber: index + 1,
      body: {
        employeeCode: String(row['Employee ID'] ?? '').trim(),
        fullName: String(row['Full Name'] ?? '').trim(),
        dateJoin: excelDateToIso(row['Date Join']),
        staffCategory: normalizeCategory(row.Category),
        department: String(row.Department ?? '').trim(),
        line: String(row.Line ?? '').trim(),
        position: String(row.Position ?? '').trim(),
        preferredDelivery: normalizeDelivery(row['Delivery Channel']),
        companyEmail: String(row['Email Address'] ?? '').trim().toLowerCase(),
        active: normalizeStatus(row.Status)
      }
    })
  }

  if (!rows.length) throw new AppError('Employee import contains no employee rows.', 400)
  if (rows.length > 5000) throw new AppError('Employee import is limited to 5,000 employees per file.', 400)
  return rows
}

function setColumnWidths(sheet, widths) {
  sheet['!cols'] = widths.map((wch) => ({ wch }))
  sheet['!autofilter'] = { ref: `A1:J1` }
  sheet['!freeze'] = { xSplit: 0, ySplit: 1 }
}

export function buildEmployeeImportTemplate() {
  const workbook = XLSX.utils.book_new()

  const employeesSheet = XLSX.utils.aoa_to_sheet([EMPLOYEE_IMPORT_HEADERS])
  setColumnWidths(employeesSheet, [18, 30, 15, 16, 24, 20, 24, 19, 32, 14])
  XLSX.utils.book_append_sheet(workbook, employeesSheet, 'Employees')

  const examples = [
    EMPLOYEE_IMPORT_HEADERS,
    ['52520351', 'Vuth Sakmakmol', '10/08/2012', 'LOCAL', 'HR and Payroll', 'Office', 'HRSS Officer', 'EMAIL', 'employee.personal@gmail.com', 'ACTIVE'],
    ['F00001', 'Sample Foreigner', '01/09/2026', 'FOREIGNER', 'Production', 'Line 12', 'Supervisor', 'TELEGRAM', '', 'ACTIVE']
  ]
  const exampleSheet = XLSX.utils.aoa_to_sheet(examples)
  setColumnWidths(exampleSheet, [18, 30, 15, 16, 24, 20, 24, 19, 32, 14])
  XLSX.utils.book_append_sheet(workbook, exampleSheet, 'Example')

  const instructions = [
    ['Employee Import Instructions', ''],
    ['Rule', 'Requirement'],
    ['Import mode', 'New employees only. Existing Employee IDs are blocked; this import does not overwrite Employee Master records.'],
    ['All-or-nothing', 'If any row is invalid, no employees from the file are created. Fix the file and import again.'],
    ['Employee ID', 'Required and unique in both the file and Employee Master.'],
    ['Full Name', 'Required.'],
    ['Date Join', 'Required. Use an Excel date, DD/MM/YYYY, or YYYY-MM-DD.'],
    ['Category', 'LOCAL or FOREIGNER. "LOCAL STAFF" is also accepted and becomes LOCAL.'],
    ['Department', 'Required. Must match payroll spelling used for strict reconciliation.'],
    ['Line', 'Optional Employee Master organization field. It is not part of payroll reconciliation.'],
    ['Position', 'Required. Must match payroll spelling used for strict reconciliation.'],
    ['Delivery Channel', 'EMAIL or TELEGRAM.'],
    ['Email Address', 'Required only for EMAIL. Personal and company email addresses are both allowed. Email is automatically saved in lowercase. Leave blank for TELEGRAM.'],
    ['Status', 'Optional. ACTIVE or INACTIVE. Blank defaults to ACTIVE.'],
    ['e-PaySlip Password', 'Every imported employee receives one unique 6-digit password such as 483271. The same password opens the PDF and is used for first-time Telegram verification. No hyphens are used.']
  ]
  const instructionsSheet = XLSX.utils.aoa_to_sheet(instructions)
  instructionsSheet['!cols'] = [{ wch: 22 }, { wch: 100 }]
  XLSX.utils.book_append_sheet(workbook, instructionsSheet, 'Instructions')

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
}
