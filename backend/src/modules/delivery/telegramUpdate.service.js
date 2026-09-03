import crypto from 'node:crypto'
import { Employee } from '../employees/Employee.js'
import { EmployeeAccount } from '../auth/EmployeeAccount.js'
import { env } from '../../config/env.js'
import { sendTelegramMessage } from './telegram.service.js'

function returnToPayslipUrl() {
  const origin = String(env.TELEGRAM_RETURN_URL || env.FRONTEND_ORIGIN || '').replace(/\/$/, '')
  return `${origin}/telegram/complete`
}

function canUseTelegramInlineUrl(url) {
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname.toLowerCase()
    if (['localhost', '127.0.0.1', '::1'].includes(hostname)) return false
    return parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function cloneTelegramObject(value) {
  if (!value || typeof value !== 'object') return null
  return JSON.parse(JSON.stringify(value))
}

function telegramMessageDate(message) {
  const seconds = Number(message?.date)
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : new Date()
}

function updateTelegramProfile(employee, update, { verified = false } = {}) {
  const message = update?.message || {}
  const from = message.from || {}
  const chat = message.chat || {}
  const now = new Date()
  const messageDate = telegramMessageDate(message)
  const current = employee.telegramProfile?.toObject?.() || employee.telegramProfile || {}

  const next = {
    ...current,
    userId: from.id !== undefined ? String(from.id) : (current.userId || ''),
    chatId: chat.id !== undefined ? String(chat.id) : (current.chatId || ''),
    username: String(from.username || chat.username || current.username || ''),
    firstName: String(from.first_name || chat.first_name || current.firstName || ''),
    lastName: String(from.last_name || chat.last_name || current.lastName || ''),
    languageCode: String(from.language_code || current.languageCode || ''),
    isBot: Boolean(from.is_bot),
    isPremium: Boolean(from.is_premium),
    chatType: String(chat.type || current.chatType || ''),
    linkedAt: verified ? now : (current.linkedAt || null),
    verifiedAt: verified ? now : (current.verifiedAt || null),
    unlinkedAt: verified ? null : (current.unlinkedAt || null),
    lastSeenAt: messageDate,
    lastUpdateId: Number.isFinite(Number(update?.update_id)) ? Number(update.update_id) : (current.lastUpdateId ?? null),
    lastMessageId: Number.isFinite(Number(message?.message_id)) ? Number(message.message_id) : (current.lastMessageId ?? null),
    lastMessageDate: messageDate,
    fromSnapshot: cloneTelegramObject(from),
    chatSnapshot: cloneTelegramObject(chat)
  }

  employee.set('telegramProfile', next)
}

async function refreshAlreadyLinkedProfile(update) {
  const chatId = update?.message?.chat?.id
  if (chatId === undefined || chatId === null) return null

  const employee = await Employee.findOne({ telegramChatId: String(chatId) })
  if (!employee) return null

  updateTelegramProfile(employee, update)
  await employee.save()
  return employee
}

async function sendVerificationSuccess({ chatId, employeeName }) {
  const returnUrl = returnToPayslipUrl()
  const text = [
    `✅ Telegram verified successfully for ${employeeName}.`,
    '',
    'Your e-PaySlip account is now ready.',
    '',
    'Return to e-PaySlip:',
    returnUrl
  ].join('\n')

  if (canUseTelegramInlineUrl(returnUrl)) {
    try {
      await sendTelegramMessage(chatId, text, {
        disableWebPagePreview: true,
        replyMarkup: {
          inline_keyboard: [[{ text: 'Return to e-PaySlip', url: returnUrl }]]
        }
      })
      return
    } catch (error) {
      console.warn('[telegram] return button rejected; sending visible return URL instead:', error.message)
    }
  }

  try {
    await sendTelegramMessage(chatId, text, { disableWebPagePreview: true })
  } catch (error) {
    console.warn('[telegram] verification saved but confirmation message failed:', error.message)
  }
}

function parseStartPayload(text) {
  const value = String(text || '').trim()
  const start = value.match(/^\/start(?:@\w+)?(?:\s+(.+))?$/i)
  if (!start) return { isStart: false, token: '' }
  return { isStart: true, token: String(start[1] || '').trim() }
}

export async function processTelegramUpdate(update) {
  const message = update?.message
  if (!message?.chat?.id) return

  const chatId = String(message.chat.id)

  // Any later message from an already-linked employee refreshes the Telegram
  // identity snapshot (username/name/language/etc.) without storing message text.
  const alreadyLinkedEmployee = await refreshAlreadyLinkedProfile(update)

  const { isStart, token } = parseStartPayload(message.text)
  if (!isStart) return

  if (!token) {
    if (alreadyLinkedEmployee) {
      await sendTelegramMessage(
        chatId,
        `Your Telegram account is already linked to e-PaySlip for ${alreadyLinkedEmployee.fullName}.`
      )
      return
    }

    await sendTelegramMessage(
      chatId,
      'Welcome to e-PaySlip.\n\nTo verify this Telegram account, return to the e-PaySlip website and click “Open Telegram & Verify”. Then press START from that private link.'
    )
    return
  }

  if (!/^[a-f0-9]{48}$/i.test(token)) {
    await sendTelegramMessage(
      chatId,
      'This e-PaySlip verification link is invalid. Return to e-PaySlip and generate a new Telegram verification link.'
    )
    return
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const employee = await Employee.findOne({ telegramLinkTokenHash: tokenHash })
    .select('+telegramLinkTokenHash +telegramLinkExpiresAt')

  if (!employee || !employee.telegramLinkExpiresAt || employee.telegramLinkExpiresAt < new Date()) {
    await sendTelegramMessage(
      chatId,
      'This e-PaySlip verification link is invalid or expired. Return to e-PaySlip and request a new Telegram link.'
    )
    return
  }

  if (employee.preferredDelivery !== 'TELEGRAM') {
    employee.telegramLinkTokenHash = ''
    employee.telegramLinkExpiresAt = null
    await employee.save()

    await sendTelegramMessage(chatId, 'This employee is configured for company email delivery, not Telegram.')
    return
  }

  const account = await EmployeeAccount.findOne({ employeeId: employee._id })
  if (!account || account.mustChangePassword || account.status !== 'ACTIVE') {
    await sendTelegramMessage(
      chatId,
      'Please complete your e-PaySlip first password setup before verifying Telegram.'
    )
    return
  }

  const linkedToAnotherEmployee = await Employee.exists({
    _id: { $ne: employee._id },
    telegramChatId: chatId
  })

  if (linkedToAnotherEmployee) {
    employee.telegramLinkTokenHash = ''
    employee.telegramLinkExpiresAt = null
    await employee.save()

    await sendTelegramMessage(
      chatId,
      'This Telegram account is already linked to another e-PaySlip employee account. Please contact Root Admin.'
    )
    return
  }

  employee.telegramChatId = chatId
  employee.telegramLinkTokenHash = ''
  employee.telegramLinkExpiresAt = null
  updateTelegramProfile(employee, update, { verified: true })
  account.telegramVerified = true

  await Promise.all([employee.save(), account.save()])

  await sendVerificationSuccess({
    chatId,
    employeeName: employee.fullName
  })
}
