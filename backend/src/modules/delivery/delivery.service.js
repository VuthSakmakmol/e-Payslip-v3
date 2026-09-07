import { DeliveryLog } from './DeliveryLog.js'
import { sendPayslipEmail } from './email.service.js'
import { sendPayslipDocument } from './telegram.service.js'

function maskEmail(email) {
  const [name, domain] = String(email || '').split('@')
  if (!domain) return ''
  return `${name.slice(0, 2)}***@${domain}`
}

function maskTelegram(chatId) {
  const value = String(chatId || '')
  return value ? `***${value.slice(-4)}` : ''
}

export async function deliverPayslip({ employee, pdfBuffer, filename, periodLabel, context }) {
  const channel = String(employee?.preferredDelivery || '').trim().toUpperCase()

  // Delivery destination always comes from Employee Master.
  if (!['EMAIL', 'TELEGRAM'].includes(channel)) {
    throw new Error(`Employee ${context.employeeCode} has no valid delivery method in Employee Master`)
  }

  let status = 'SENT'
  let errorMessage = ''

  try {
    if (channel === 'EMAIL') {
      if (!employee.companyEmail) throw new Error('Employee company email is not configured')

      // EMAIL keeps its existing PDF delivery behavior.
      // FOREIGNER + EMAIL receives the password-protected in-memory PDF.
      await sendPayslipEmail({
        to: employee.companyEmail,
        employeeName: employee.fullName,
        periodLabel,
        pdfBuffer,
        filename,
        passwordProtected: Boolean(context.pdfPasswordProtected)
      })
    } else {
      if (!employee.telegramChatId) throw new Error('Employee Telegram is not verified')

      // SECURITY RULE: Telegram is notification-only.
      // Never attach or transmit the payslip PDF or payroll amounts to Telegram.
      await sendPayslipDocument({
        chatId: employee.telegramChatId,
        employeeName: employee.fullName,
        periodLabel, pdfBuffer, filename
      })
    }
  } catch (error) {
    status = 'FAILED'
    errorMessage = error.message
  }

  const log = await DeliveryLog.create({
    employeeId: employee._id || employee.id,
    employeeCode: context.employeeCode,
    staffCategory: context.staffCategory,
    year: context.year,
    month: context.month,
    payPeriodId: context.payPeriodId || null,
    batchId: context.batchId || null,
    channel,
    destinationMasked: channel === 'EMAIL'
      ? maskEmail(employee.companyEmail)
      : maskTelegram(employee.telegramChatId),
    status,
    errorMessage,
    releasedBy: context.releasedBy,
    sentAt: status === 'SENT' ? new Date() : null
  })

  return [log]
}
