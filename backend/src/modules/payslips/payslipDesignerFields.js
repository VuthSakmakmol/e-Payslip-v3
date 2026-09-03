import { getDesignerFields as getPayrollDesignerFields } from '../payroll/constants/companyPayrollLayout.js'

const SYSTEM_FIELDS = [
  { key: 'system.periodLabel', label: 'Payroll Period', type: 'TEXT', group: 'PAYSLIP', designer: true, sampleValue: 'September 2026 - Week 1' },
  { key: 'system.monthYear', label: 'Month', type: 'TEXT', group: 'PAYSLIP', designer: true, sampleValue: 'September 2026' },
  { key: 'system.payPeriod', label: 'Pay Period', type: 'TEXT', group: 'PAYSLIP', designer: true, sampleValue: 'Week 1' },
  { key: 'system.generatedOn', label: 'Generated On', type: 'TEXT', group: 'PAYSLIP', designer: true, sampleValue: '03/09/2026 15:35' }
]

const SAMPLES = {
  employeeName: 'Vuth Sakmakmol',
  employeeCode: '52520351',
  sex: 'M',
  dateJoin: '10/08/2012',
  division: 'Production Direct - Sewing',
  department: 'HR and Payroll',
  section: 'Sewing',
  position: 'HRSS Officer',
  payrollType: 'TC-42',
  basicWage: '212.00',
  seniorityAllowance: '5.50',
  workingDays: '13.00',
  officeDay: '0.00',
  monthEarned: '106.00',
  alSlLeave: '0.00',
  sickLeave: '0.00',
  paidLeave: '0.00',
  otherLeave: '0.00',
  normalOt: '12.00',
  weekendOt: '0.00',
  holidayOt: '0.00',
  sick100ExtraOt: '0.00',
  otDetail1Hours: '26.00',
  otDetail1Amount: '39.75',
  otDetail2Hours: '0.00',
  otDetail2Amount: '0.00',
  otDetail3Hours: '0.00',
  otDetail3Amount: '0.00',
  otDetail4Hours: '0.00',
  otDetail4Amount: '0.00',
  pensionRiel: '22,865.00',
  pensionUsd: '5.66',
  transportation: '4.75',
  responseAllowance: '0.00',
  skillAllowance: '1.50',
  foodAllowance: '6.50',
  attendanceAllowance: '0.00',
  incentive: '0.00',
  shiftAllowance: '0.00',
  refund: '0.00',
  deduction: '1.00',
  annualLeaveAmount: '0.00',
  paymentedOf5Percent: '0.00',
  advance: '0.00',
  tax: '0.00',
  union: '0.00',
  otherDeduction: '1.00',
  grossPayBeforeDeduct: '176.50',
  actualWages: '176.50',
  cash: '177.00',
  usd: '176.00',
  cent: '0.50',
  alExtra: '0.00',
  adjustedAlAmountExtra: '0.00',
  alUsePerMonth: '0.00',
  adjustedAlAmountMonth: '0.00',
  totalRielN: '26,200.00',
  usdN: '170.00',
  medical: '0.00',
  benefix: '0.00',
  taxBenefix: '0.00',
  netBenefix: '0.00',
  srIdem: '0.00',
  srPayback: '0.00',
  meal: '12.50',
  adjustedAmountOfAl: '0.00',
  accountNo: '006965114',
  totalRiel: '2,000.00'
}

export function getPayslipDesignerFields() {
  const payroll = getPayrollDesignerFields().map((field) => ({
    ...field,
    sampleValue: SAMPLES[field.key] ?? (field.type === 'TEXT' ? field.label : '0.00')
  }))
  return [...SYSTEM_FIELDS, ...payroll]
}

export const PAYSLIP_SYSTEM_FIELD_BY_KEY = new Map(SYSTEM_FIELDS.map((field) => [field.key, field]))
