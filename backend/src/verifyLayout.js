import { COMPANY_PAYROLL_LAYOUT, PAYROLL_COLUMN_COUNT } from './modules/payroll/constants/companyPayrollLayout.js'

const expected = new Map([
  [32, 'pensionRiel'],
  [51, 'grossPayBeforeDeduct'],
  [53, 'actualWages'],
  [77, 'accountNo'],
  [87, 'totalRiel']
])

if (COMPANY_PAYROLL_LAYOUT.length !== PAYROLL_COLUMN_COUNT) {
  throw new Error(`Expected ${PAYROLL_COLUMN_COUNT} payroll columns, got ${COMPANY_PAYROLL_LAYOUT.length}`)
}

for (const [column, key] of expected) {
  const field = COMPANY_PAYROLL_LAYOUT[column - 1]
  if (!field || field.column !== column || field.key !== key) {
    throw new Error(`Payroll column ${column} must be ${key}`)
  }
}

console.log('[verify] fixed payroll layout OK: 87 columns')
console.log('[verify] col 32 Pension (Riel)')
console.log('[verify] col 51 GrossPayBeforDeduct')
console.log('[verify] col 53 Actual Wages')
console.log('[verify] col 77 AccountNo')
console.log('[verify] col 87 Total Riel')
