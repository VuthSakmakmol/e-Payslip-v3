const font = 'Times New Roman'
const khmerBody = 'Khmer OS Battambang'
const khmerTitle = 'Khmer OS Moul'

const base = {
  fontFamily: font,
  fontSize: 8.5,
  fontWeight: 'normal',
  align: 'left',
  paddingPx: 3,
  borderWidth: 0,
  decimalPlaces: 2,
  groupId: '',
  zIndex: 0
}

const T = (text, xMm, yMm, widthMm, options = {}) => ({
  ...base,
  type: 'TEXT',
  text,
  xMm,
  yMm,
  widthMm,
  heightMm: options.heightMm ?? 6,
  ...options
})

const F = (fieldKey, xMm, yMm, widthMm, options = {}) => ({
  ...base,
  type: 'FIELD',
  fieldKey,
  showLabel: options.showLabel ?? true,
  showValue: options.showValue ?? true,
  labelText: options.labelText ?? '',
  labelSeparator: options.labelSeparator ?? ': ',
  prefix: options.prefix ?? '',
  suffix: options.suffix ?? '',
  xMm,
  yMm,
  widthMm,
  heightMm: options.heightMm ?? 6,
  ...options
})

const L = (xMm, yMm, widthMm, options = {}) => ({
  ...base,
  type: 'LINE',
  xMm,
  yMm,
  widthMm,
  heightMm: 1,
  borderWidth: options.borderWidth ?? 0.8,
  paddingPx: 0,
  ...options
})

const B = (xMm, yMm, widthMm, heightMm, options = {}) => ({
  ...base,
  type: 'RECTANGLE',
  xMm,
  yMm,
  widthMm,
  heightMm,
  borderWidth: options.borderWidth ?? 0.8,
  paddingPx: 0,
  ...options
})

export function createDefaultPayslipDesign() {
  return {
    name: 'TRAX Default Payslip',
    pageSize: 'A4',
    pageOrientation: 'landscape',
    active: true,
    elements: [
      // Header
      T('ប័ណ្ណប្រាក់ខែ', 94, 4, 109, { fontFamily: khmerTitle, fontSize: 11, fontWeight: 'bold', align: 'center', heightMm: 8 }),
      T('TRAX APPAREL (CAMBODIA) CO., LTD.', 62, 12, 173, { fontSize: 15, fontWeight: 'bold', align: 'center', heightMm: 9 }),
      F('usd', 238, 5, 48, { labelText: 'USD', fontSize: 10.5, fontWeight: 'bold', align: 'right' }),
      F('totalRiel', 228, 13, 58, { labelText: 'Riel', fontSize: 10.5, fontWeight: 'bold', align: 'right', decimalPlaces: 0 }),

      F('system.monthYear', 10, 24, 89, { labelText: 'Month', fontSize: 9, fontWeight: 'bold' }),
      F('section', 10, 32, 89, { labelText: 'Section', fontSize: 8.5 }),
      F('employeeCode', 10, 40, 89, { labelText: 'ID No.', fontSize: 9, fontWeight: 'bold' }),
      F('basicWage', 10, 48, 89, { labelText: 'Basic Pay', fontSize: 9, fontWeight: 'bold' }),
      F('workingDays', 10, 56, 89, { labelText: 'Working', fontSize: 9, fontWeight: 'bold' }),

      F('system.generatedOn', 174, 24, 112, { labelText: 'Payslip On', fontSize: 8.5 }),
      F('employeeName', 174, 32, 112, { labelText: 'Name', fontSize: 9, fontWeight: 'bold' }),
      F('dateJoin', 174, 40, 112, { labelText: 'Date Join', fontSize: 9, fontWeight: 'bold', decimalPlaces: 0 }),
      F('position', 174, 48, 112, { labelText: 'Position', fontSize: 8.5 }),
      F('basicWage', 174, 56, 112, { labelText: 'Basic Rate', fontSize: 9, fontWeight: 'bold' }),

      // Left additions
      T('បូក (+)', 10, 66, 35, { fontFamily: khmerBody, fontSize: 9, fontWeight: 'bold' }),
      T('Add (+)', 44, 66, 42, { fontSize: 11, fontWeight: 'bold' }),
      T('Amount ($)', 129, 66, 34, { fontSize: 8.5, fontWeight: 'bold', align: 'right' }),
      L(10, 73, 154),
      F('foodAllowance', 10, 76, 154, { labelText: 'Food Allowance', align: 'right' }),
      F('attendanceAllowance', 10, 83, 154, { labelText: 'Attendance Allowance', align: 'right' }),
      F('transportation', 10, 90, 154, { labelText: 'Transportation', align: 'right' }),
      F('skillAllowance', 10, 97, 154, { labelText: 'Skill Allowance', align: 'right' }),
      F('responseAllowance', 10, 104, 154, { labelText: 'Response Allowance', align: 'right' }),
      F('incentive', 10, 111, 154, { labelText: 'Incentive', align: 'right' }),
      F('shiftAllowance', 10, 118, 154, { labelText: 'Shift Allowance', align: 'right' }),
      F('refund', 10, 125, 154, { labelText: 'Refund', align: 'right' }),
      F('alSlLeave', 10, 132, 154, { labelText: 'Annual / Special Leave', align: 'right' }),
      F('sickLeave', 10, 139, 154, { labelText: 'Sick Leave', align: 'right' }),
      F('seniorityAllowance', 10, 146, 154, { labelText: 'Seniority Allowance', fontWeight: 'bold', align: 'right' }),
      L(10, 153, 154),

      // Overtime
      T('Over Time', 10, 156, 50, { fontSize: 10, fontWeight: 'bold' }),
      T('Hour(s)', 101, 156, 24, { fontSize: 8.5, fontWeight: 'bold', align: 'right' }),
      T('Amount', 132, 156, 31, { fontSize: 8.5, fontWeight: 'bold', align: 'right' }),
      L(10, 163, 154),
      F('normalOt', 10, 166, 115, { labelText: 'Normal OT', align: 'right' }),
      F('otDetail1Amount', 129, 166, 34, { showLabel: false, showValue: true, align: 'right' }),
      F('weekendOt', 10, 173, 115, { labelText: 'Extra OT', align: 'right' }),
      F('otDetail2Amount', 129, 173, 34, { showLabel: false, showValue: true, align: 'right' }),
      F('holidayOt', 10, 180, 115, { labelText: 'Public Holiday', align: 'right' }),
      F('otDetail3Amount', 129, 180, 34, { showLabel: false, showValue: true, align: 'right' }),
      L(10, 187, 154),
      F('grossPayBeforeDeduct', 10, 190, 154, { labelText: 'Gross Pay before deduct', fontWeight: 'bold', align: 'right' }),
      F('pensionUsd', 10, 197, 154, { labelText: 'Pension (USD)', align: 'right' }),
      F('actualWages', 10, 202, 154, { labelText: 'Gross Pay after deduct', fontSize: 10.5, fontWeight: 'bold', align: 'right', heightMm: 7 }),

      // Right deductions / benefits
      T('ដក (-)', 174, 66, 33, { fontFamily: khmerBody, fontSize: 9, fontWeight: 'bold' }),
      T('Deduction (-)', 205, 66, 81, { fontSize: 11, fontWeight: 'bold', align: 'center' }),
      L(174, 73, 112),
      F('advance', 174, 76, 112, { labelText: 'Advance', align: 'right' }),
      F('tax', 174, 83, 112, { labelText: 'Tax', align: 'right' }),
      F('union', 174, 90, 112, { labelText: 'Union', align: 'right' }),
      F('otherDeduction', 174, 97, 112, { labelText: 'Others', align: 'right' }),
      F('deduction', 174, 105, 112, { labelText: 'Total Deduction', fontWeight: 'bold', align: 'right' }),
      L(174, 113, 112),

      T('Benefits / Adjustments', 174, 116, 112, { fontSize: 10.5, fontWeight: 'bold', align: 'center' }),
      L(174, 123, 112),
      F('medical', 174, 126, 112, { labelText: 'Medical', align: 'right' }),
      F('benefix', 174, 133, 112, { labelText: 'Benefix', align: 'right' }),
      F('taxBenefix', 174, 140, 112, { labelText: 'Tax of Benefix', align: 'right' }),
      F('netBenefix', 174, 147, 112, { labelText: 'Net Benefix', align: 'right' }),
      F('srIdem', 174, 154, 112, { labelText: 'SR Indemnity', align: 'right' }),
      F('srPayback', 174, 161, 112, { labelText: 'SR Pay back', align: 'right' }),
      F('adjustedAmountOfAl', 174, 168, 112, { labelText: 'Adj. AL Amount', align: 'right' }),
      F('paymentedOf5Percent', 174, 175, 112, { labelText: 'Paymented Of 5%', align: 'right' }),
      L(174, 184, 112, { borderWidth: 1.1 }),
      T('ប្រាក់សុទ្ធ', 174, 187, 45, { fontFamily: khmerBody, fontSize: 10, fontWeight: 'bold' }),
      F('actualWages', 212, 186, 74, { labelText: 'Net Pay', fontSize: 12, fontWeight: 'bold', align: 'right', heightMm: 9 }),
      L(174, 197, 112, { borderWidth: 1.1 }),

      // Bottom signatures
      L(10, 209, 276, { borderWidth: 0.8 }),
      T('Prepared By', 18, 201, 55, { fontSize: 8.5, align: 'center' }),
      T('Checked By', 119, 201, 55, { fontSize: 8.5, align: 'center' }),
      T('Employee By', 220, 201, 55, { fontSize: 8.5, align: 'center' })
    ]
  }
}
