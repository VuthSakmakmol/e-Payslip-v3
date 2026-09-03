import { env } from '../../config/env.js'
import { AppError } from '../../utils/AppError.js'

function requireToken() {
  if (!env.TELEGRAM_BOT_TOKEN) throw new AppError('Telegram bot is not configured', 400)
}

async function telegramCall(method, body = undefined) {
  requireToken()

  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    body
  })

  const data = await response.json()
  if (!response.ok || !data.ok) {
    throw new AppError(data.description || `Telegram ${method} failed`, 502)
  }

  return data.result
}

function basePayslipUrl() {
  return String(env.TELEGRAM_RETURN_URL || env.FRONTEND_ORIGIN || '')
    .trim()
    .replace(/\/$/, '')
}

function employeePortalUrl() {
  const base = basePayslipUrl()
  return base ? `${base}/employee` : ''
}

function canUseInlineUrl(url) {
  if (!url) return false

  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()

    if (['localhost', '127.0.0.1', '::1'].includes(host)) return false
    return parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export async function getTelegramBotInfo() {
  return telegramCall('getMe')
}

export async function getTelegramWebhookInfo() {
  return telegramCall('getWebhookInfo')
}

export async function deleteTelegramWebhook({ dropPendingUpdates = false } = {}) {
  const form = new URLSearchParams({
    drop_pending_updates: dropPendingUpdates ? 'true' : 'false'
  })
  return telegramCall('deleteWebhook', form)
}

export async function getTelegramUpdates({ offset, timeoutSeconds = 25 } = {}) {
  const form = new URLSearchParams({
    timeout: String(timeoutSeconds),
    allowed_updates: JSON.stringify(['message'])
  })

  if (Number.isInteger(offset) && offset > 0) {
    form.append('offset', String(offset))
  }

  return telegramCall('getUpdates', form)
}

export async function sendTelegramMessage(chatId, text, options = {}) {
  if (!chatId) throw new AppError('Telegram chat ID is required', 400)

  const form = new URLSearchParams({
    chat_id: String(chatId),
    text: String(text)
  })

  if (options.replyMarkup) {
    form.append('reply_markup', JSON.stringify(options.replyMarkup))
  }

  if (options.disableWebPagePreview === true) {
    form.append('link_preview_options', JSON.stringify({ is_disabled: true }))
  }

  return telegramCall('sendMessage', form)
}

/**
 * Telegram is notification-only for released payslips.
 * Salary values and PDF files must never be sent to Telegram.
 */
export async function sendPayslipAvailableNotification({ chatId, employeeName, periodLabel }) {
  if (!chatId) throw new AppError('Employee Telegram is not verified', 400)

  const loginUrl = employeePortalUrl()
  const lines = [
    '✅ Your e-PaySlip is available.',
    '',
    employeeName ? `Employee: ${employeeName}` : '',
    periodLabel ? `Payroll: ${periodLabel}` : '',
    '',
    'Sign in to e-PaySlip to view your payslip.'
  ].filter((line, index, all) => line !== '' || (index > 0 && all[index - 1] !== ''))

  if (!canUseInlineUrl(loginUrl)) {
    if (loginUrl) {
      lines.push('', 'e-PaySlip:', loginUrl)
    }

    return sendTelegramMessage(chatId, lines.join('\n'), {
      disableWebPagePreview: true
    })
  }

  return sendTelegramMessage(chatId, lines.join('\n'), {
    disableWebPagePreview: true,
    replyMarkup: {
      inline_keyboard: [[
        {
          text: 'View e-PaySlip',
          url: loginUrl
        }
      ]]
    }
  })
}
