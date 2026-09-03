import { env } from '../../config/env.js'
import {
  deleteTelegramWebhook,
  getTelegramBotInfo,
  getTelegramUpdates
} from './telegram.service.js'
import { processTelegramUpdate } from './telegramUpdate.service.js'

let running = false
let nextOffset

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function startTelegramPolling() {
  if (running) return
  if (!env.TELEGRAM_BOT_TOKEN) {
    console.log('[telegram] bot token not configured; polling disabled')
    return
  }
  if (env.TELEGRAM_UPDATE_MODE !== 'POLLING') return

  running = true

  try {
    const bot = await getTelegramBotInfo()
    console.log(`[telegram] connected as @${bot.username || bot.first_name || 'bot'}`)

    // Telegram does not permit getUpdates while a webhook is active.
    await deleteTelegramWebhook({ dropPendingUpdates: env.TELEGRAM_DROP_PENDING_UPDATES })
    console.log('[telegram] polling mode active (webhook disabled for local development)')
  } catch (error) {
    running = false
    console.error('[telegram] failed to start polling:', error.message)
    return
  }

  void pollLoop()
}

export function stopTelegramPolling() {
  running = false
}

async function pollLoop() {
  while (running) {
    try {
      const updates = await getTelegramUpdates({
        offset: nextOffset,
        timeoutSeconds: env.TELEGRAM_POLL_TIMEOUT_SECONDS
      })

      for (const update of updates || []) {
        nextOffset = Number(update.update_id) + 1
        try {
          console.log(`[telegram] update ${update.update_id}: ${update.message?.text || '(non-text message)'}`)
          await processTelegramUpdate(update)
        } catch (error) {
          console.error(`[telegram] update ${update.update_id} failed:`, error)
        }
      }
    } catch (error) {
      if (!running) break
      console.error('[telegram] polling error:', error.message)
      await wait(2000)
    }
  }
}
