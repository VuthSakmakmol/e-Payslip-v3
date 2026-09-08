const latin = 'Arial'
const khmerBody = 'Khmer OS Content'
const khmerTitle = 'Khmer OS Moul Light'

const base = {
  fontFamily: latin,
  fontSize: 8.2,
  fontWeight: 'normal',
  align: 'left',
  verticalAlign: 'middle',
  paddingPx: 0,
  borderWidth: 0,
  textColor: '#111111',
  backgroundColor: 'transparent',
  borderColor: '#111111',
  groupId: '',
  zIndex: 0,
  lineHeight: 1.05,
  characterSpacing: 0,
  opacity: 1,
  rotation: 0
}

const T = (text, xMm, yMm, widthMm, options = {}) => ({
  ...base,
  type: 'TEXT',
  text,
  xMm,
  yMm,
  widthMm,
  heightMm: options.heightMm ?? 5.5,
  ...options
})

const F = (fieldKey, xMm, yMm, widthMm, options = {}) => ({
  ...base,
  type: 'FIELD',
  fieldKey,
  showLabel: options.showLabel ?? false,
  showValue: options.showValue ?? true,
  labelText: options.labelText ?? '',
  xMm,
  yMm,
  widthMm,
  heightMm: options.heightMm ?? 5.5,
  ...options
})

const L = (xMm, yMm, widthMm, options = {}) => ({
  ...base,
  type: 'LINE',
  xMm,
  yMm,
  widthMm,
  heightMm: 0.5,
  borderWidth: options.borderWidth ?? 0.65,
  paddingPx: 0,
  ...options
})

const englishLabel = { fontFamily: latin, fontSize: 8.7, fontWeight: 'bold' }
const khmerLabel = { fontFamily: khmerBody, fontSize: 8.1 }
const valueStyle = { fontFamily: latin, fontSize: 8.4 }

function infoRow(khmer, english, key, yMm, { side = 'left', boldValue = false, valueFont = latin } = {}) {
  const x = side === 'left' ? 9 : 174
  const khmerW = side === 'left' ? 31 : 32
  const englishW = side === 'left' ? 42 : 38
  const valueW = side === 'left' ? 78 : 42
  return [
    T(khmer, x, yMm, khmerW, khmerLabel),
    T(english, x + khmerW, yMm, englishW, englishLabel),
    F(key, x + khmerW + englishW, yMm, valueW, {
      ...valueStyle,
      fontFamily: valueFont,
      fontWeight: boldValue ? 'bold' : 'normal'
    })
  ]
}

function amountRow(khmer, english, key, yMm, { bold = false } = {}) {
  return [
    T(khmer, 9, yMm, 39, { ...khmerLabel, fontSize: 7.9 }),
    T(english, 48, yMm, 73, { fontFamily: latin, fontSize: 8.1, fontWeight: bold ? 'bold' : 'normal' }),
    F(key, 121, yMm, 43, {
      fontFamily: latin,
      fontSize: 8.2,
      fontWeight: bold ? 'bold' : 'normal',
      align: 'right'
    })
  ]
}

function deductionRow(khmer, english, key, yMm, { bold = false } = {}) {
  return [
    T(khmer, 174, yMm, 38, { ...khmerLabel, fontSize: 7.9 }),
    T(english, 212, yMm, 42, { fontFamily: latin, fontSize: 8.1, fontWeight: bold ? 'bold' : 'normal' }),
    F(key, 254, yMm, 32, {
      fontFamily: latin,
      fontSize: 8.2,
      fontWeight: bold ? 'bold' : 'normal',
      align: 'right'
    })
  ]
}

export function createDefaultPayslipDesign() {
  return {
    name: 'TRAX Default Payslip',
    pageSize: 'A4',
    pageOrientation: 'landscape',
    active: true,
    templateRevision: 2,
    elements: [
      // Header — intentionally close to the company paper payslip layout.
      F('system.generatedOn', 7, 3.2, 53, { fontSize: 7.3, align: 'left' }),
      T('ប័ណ្ណប្រាក់ខែ', 89, 3, 119, {
        fontFamily: khmerTitle,
        fontSize: 11.5,
        fontWeight: 'normal',
        align: 'center',
        heightMm: 8
      }),
      T('TRAX APPAREL (CAMBODIA) CO., LTD.', 70, 11.5, 158, {
        fontFamily: latin,
        fontSize: 15.2,
        fontWeight: 'bold',
        align: 'center',
        heightMm: 8
      }),
      T('USD:', 246, 7, 18, { ...englishLabel, fontSize: 10.2, align: 'right' }),
      F('usd', 265, 7, 21, { fontSize: 10.2, fontWeight: 'bold', align: 'right' }),
      T('Riel:', 243, 15, 21, { ...englishLabel, fontSize: 10.2, align: 'right' }),
      F('totalRiel', 265, 15, 21, { fontSize: 10.2, fontWeight: 'bold', align: 'right' }),

      // Employee / payroll information.
      ...infoRow('ខែ', 'Month', 'system.monthYear', 24),
      ...infoRow('ផ្នែក', 'Code/Dept', 'section', 31),
      ...infoRow('លេខសម្គាល់', 'ID No.', 'employeeCode', 38, { boldValue: false }),
      ...infoRow('ប្រាក់គោល', 'Basic Pay', 'basicWage', 45),
      ...infoRow('ថ្ងៃធ្វើការ', 'Working', 'workingDays', 52),

      ...infoRow('ថ្ងៃបើកប្រាក់', 'Payslip On', 'system.generatedOn', 24, { side: 'right' }),
      ...infoRow('ឈ្មោះ', 'Name', 'employeeName', 31, { side: 'right' }),
      ...infoRow('ថ្ងៃចូលធ្វើការ', 'Date Join', 'dateJoin', 38, { side: 'right' }),
      ...infoRow('មុខតំណែង', 'Position', 'position', 45, { side: 'right' }),
      ...infoRow('អត្រាប្រាក់គោល', 'Basic Rate', 'basicWage', 52, { side: 'right', boldValue: true }),

      // Additions / welfare.
      T('បូក (+)', 9, 61, 39, { fontFamily: khmerBody, fontSize: 9.1, fontWeight: 'bold' }),
      T('Add (+)', 48, 61, 50, { fontFamily: latin, fontSize: 10.6, fontWeight: 'bold' }),
      T('Amount ($)', 121, 61, 43, { fontFamily: latin, fontSize: 8.8, fontWeight: 'bold', align: 'right' }),
      L(9, 68, 155, { borderWidth: 0.75 }),

      ...amountRow('ប្រាក់អាហារ', 'Food Allowance:', 'foodAllowance', 70.5),
      ...amountRow('ប្រាក់វត្តមាន', 'Attendance Allowance:', 'attendanceAllowance', 76.5),
      ...amountRow('ប្រាក់ធ្វើដំណើរ', 'Transportation:', 'transportation', 82.5),
      ...amountRow('ប្រាក់ជំនាញ', 'Skill Allowance:', 'skillAllowance', 88.5),
      ...amountRow('ប្រាក់ទទួលខុសត្រូវ', 'Response Allowance:', 'responseAllowance', 94.5),
      ...amountRow('ប្រាក់លើកទឹកចិត្ត', 'Incentive:', 'incentive', 100.5),
      ...amountRow('ប្រាក់វេន', 'Shift Allowance:', 'shiftAllowance', 106.5),
      ...amountRow('ប្រាក់សងវិញ', 'Refund:', 'refund', 112.5),
      ...amountRow('ច្បាប់ប្រចាំឆ្នាំ', 'Annual / Special Leave:', 'alSlLeave', 118.5),
      ...amountRow('ច្បាប់ឈឺ', 'Sick Leave:', 'sickLeave', 124.5),
      ...amountRow('ប្រាក់អតីតភាព', 'Seniority Allowance:', 'seniorityAllowance', 130.5, { bold: true }),
      L(9, 137.5, 155, { borderWidth: 0.75 }),

      // Overtime table.
      T('ម៉ោងបន្ថែម', 9, 141, 39, { fontFamily: khmerBody, fontSize: 8.2 }),
      T('Over Time', 48, 141, 50, { fontFamily: latin, fontSize: 9, fontWeight: 'bold' }),
      T('Hour(s)', 111, 141, 23, { fontFamily: latin, fontSize: 8.3, fontWeight: 'bold', align: 'right' }),
      T('Amount', 137, 141, 27, { fontFamily: latin, fontSize: 8.3, fontWeight: 'bold', align: 'right' }),
      L(9, 147.5, 155, { borderWidth: 0.75 }),

      T('ធម្មតា', 9, 150, 39, { ...khmerLabel, fontSize: 7.9 }),
      T('Normal', 48, 150, 52, { fontSize: 8.2 }),
      F('otDetail1Hours', 111, 150, 23, { fontSize: 8.2, align: 'right' }),
      F('otDetail1Amount', 137, 150, 27, { fontSize: 8.2, align: 'right' }),

      T('ថ្ងៃសម្រាក', 9, 156, 39, { ...khmerLabel, fontSize: 7.9 }),
      T('Extra OT', 48, 156, 52, { fontSize: 8.2 }),
      F('otDetail2Hours', 111, 156, 23, { fontSize: 8.2, align: 'right' }),
      F('otDetail2Amount', 137, 156, 27, { fontSize: 8.2, align: 'right' }),

      T('ថ្ងៃបុណ្យ', 9, 162, 39, { ...khmerLabel, fontSize: 7.9 }),
      T('Public Holiday', 48, 162, 52, { fontSize: 8.2 }),
      F('otDetail3Hours', 111, 162, 23, { fontSize: 8.2, align: 'right' }),
      F('otDetail3Amount', 137, 162, 27, { fontSize: 8.2, align: 'right' }),
      L(9, 169, 155, { borderWidth: 0.75 }),

      T('ប្រាក់សរុបមុនកាត់', 9, 171.5, 53, { ...khmerLabel, fontSize: 7.7 }),
      T('Gross Pay before deduct other:', 62, 171.5, 73, { fontSize: 7.9 }),
      F('grossPayBeforeDeduct', 137, 171.5, 27, { fontSize: 9.3, fontWeight: 'bold', align: 'right' }),
      T('ប្រាក់សោធន', 9, 178, 53, { ...khmerLabel, fontSize: 7.7 }),
      T('Pension', 62, 178, 48, { fontSize: 8.1 }),
      F('pensionRiel', 108, 178, 27, { fontSize: 8.1, align: 'right' }),
      F('pensionUsd', 137, 178, 27, { fontSize: 8.1, align: 'right' }),
      T('ប្រាក់សរុបក្រោយកាត់', 9, 184.5, 53, { ...khmerLabel, fontSize: 7.7 }),
      T('Gross Pay after deduct other:', 62, 184.5, 73, { fontSize: 7.9 }),
      F('actualWages', 137, 184.5, 27, { fontSize: 11, fontWeight: 'bold', align: 'right' }),
      L(9, 191.5, 155, { borderWidth: 0.95 }),

      // Deductions.
      T('ការកាត់ប្រាក់', 174, 61, 39, { fontFamily: khmerBody, fontSize: 8.4, fontWeight: 'bold' }),
      T('Deduction (-)', 212, 61, 74, { fontFamily: latin, fontSize: 10.6, fontWeight: 'bold', align: 'center' }),
      L(174, 68, 112, { borderWidth: 0.75 }),
      ...deductionRow('ប្រាក់បុរេប្រទាន', 'Advance', 'advance', 70.5),
      ...deductionRow('ពន្ធ', 'Tax', 'tax', 76.5),
      ...deductionRow('សហជីព', 'Union', 'union', 82.5),
      ...deductionRow('ផ្សេងៗ', 'Others', 'otherDeduction', 88.5),
      ...deductionRow('សរុបកាត់', 'Total Deduction', 'deduction', 95, { bold: true }),
      L(174, 102, 112, { borderWidth: 0.95 }),

      // Benefit / adjustment area in the same visual place as the paper form's family/benefit section.
      T('អត្ថប្រយោជន៍ / កែតម្រូវ', 174, 105, 54, { fontFamily: khmerBody, fontSize: 8.1, fontWeight: 'bold' }),
      T('Benefits / Adjustments', 227, 105, 59, { fontFamily: latin, fontSize: 9.3, fontWeight: 'bold', align: 'center' }),
      L(174, 112, 112, { borderWidth: 0.75 }),
      ...deductionRow('ពិនិត្យសុខភាព', 'Medical', 'medical', 114.5),
      ...deductionRow('អត្ថប្រយោជន៍', 'Benefix', 'benefix', 120.5),
      ...deductionRow('ពន្ធអត្ថប្រយោជន៍', 'Tax of Benefix', 'taxBenefix', 126.5),
      ...deductionRow('សុទ្ធអត្ថប្រយោជន៍', 'Net Benefix', 'netBenefix', 132.5),
      ...deductionRow('អតីតភាព', 'SR Indemnity', 'srIdem', 138.5),
      ...deductionRow('សងអតីតភាព', 'SR Pay back', 'srPayback', 144.5),
      ...deductionRow('កែតម្រូវច្បាប់', 'Adj. AL Amount', 'adjustedAmountOfAl', 150.5),
      ...deductionRow('ទូទាត់ 5%', 'Paymented Of 5%', 'paymentedOf5Percent', 156.5),
      L(174, 164, 112, { borderWidth: 0.75 }),

      T('ប្រាក់សុទ្ធ', 174, 168, 44, { fontFamily: khmerBody, fontSize: 9.5, fontWeight: 'bold' }),
      T('Net Pay', 218, 168, 36, { fontFamily: latin, fontSize: 11.2, fontWeight: 'bold' }),
      F('actualWages', 254, 168, 32, { fontFamily: latin, fontSize: 11.5, fontWeight: 'bold', align: 'right' }),
      L(174, 177, 112, { borderWidth: 0.95 }),

      // Signatures.
      L(9, 195, 277, { borderWidth: 0.75 }),
      T('រៀបចំដោយ', 18, 197, 48, { fontFamily: khmerBody, fontSize: 7.7, align: 'center' }),
      T('Prepared By', 18, 202, 48, { fontFamily: latin, fontSize: 8.2, align: 'center' }),
      T('ត្រួតពិនិត្យដោយ', 117, 197, 56, { fontFamily: khmerBody, fontSize: 7.7, align: 'center' }),
      T('Checked By', 117, 202, 56, { fontFamily: latin, fontSize: 8.2, align: 'center' }),
      T('និយោជិត', 220, 197, 56, { fontFamily: khmerBody, fontSize: 7.7, align: 'center' }),
      T('Employee By', 220, 202, 56, { fontFamily: latin, fontSize: 8.2, align: 'center' })
    ]
  }
}
