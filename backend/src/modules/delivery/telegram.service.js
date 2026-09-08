import { env } from "../../config/env.js";
import { AppError } from "../../utils/AppError.js";

function requireToken() {
  if (!env.TELEGRAM_BOT_TOKEN)
    throw new AppError("Telegram bot is not configured", 400);
}

async function telegramCall(method, body = undefined) {
  requireToken();

  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,
    {
      method: "POST",
      body,
    },
  );

  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new AppError(data.description || `Telegram ${method} failed`, 502);
  }

  return data.result;
}

function basePayslipUrl() {
  return String(env.TELEGRAM_RETURN_URL || env.FRONTEND_ORIGIN || "")
    .trim()
    .replace(/\/$/, "");
}

function employeePortalUrl() {
  const base = basePayslipUrl();
  return base ? `${base}/employee` : "";
}

function canUseInlineUrl(url) {
  if (!url) return false;

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    if (["localhost", "127.0.0.1", "::1"].includes(host)) return false;
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export async function getTelegramBotInfo() {
  return telegramCall("getMe");
}

export async function getTelegramWebhookInfo() {
  return telegramCall("getWebhookInfo");
}

export async function deleteTelegramWebhook({
  dropPendingUpdates = false,
} = {}) {
  const form = new URLSearchParams({
    drop_pending_updates: dropPendingUpdates ? "true" : "false",
  });
  return telegramCall("deleteWebhook", form);
}

export async function getTelegramUpdates({ offset, timeoutSeconds = 25 } = {}) {
  const form = new URLSearchParams({
    timeout: String(timeoutSeconds),
    allowed_updates: JSON.stringify(["message", "callback_query"]),
  });

  if (Number.isInteger(offset) && offset > 0) {
    form.append("offset", String(offset));
  }

  return telegramCall("getUpdates", form);
}

export async function answerTelegramCallback(callbackQueryId) {
  return telegramCall(
    "answerCallbackQuery",
    new URLSearchParams({ callback_query_id: String(callbackQueryId) }),
  );
}

export async function sendTelegramMessage(chatId, text, options = {}) {
  if (!chatId) throw new AppError("Telegram chat ID is required", 400);

  const form = new URLSearchParams({
    chat_id: String(chatId),
    text: String(text),
  });

  if (options.replyMarkup) {
    form.append("reply_markup", JSON.stringify(options.replyMarkup));
  }

  if (options.disableWebPagePreview === true) {
    form.append("link_preview_options", JSON.stringify({ is_disabled: true }));
  }

  return telegramCall("sendMessage", form);
}

/**
 * Telegram is notification-only for released payslips.
 * Salary values and PDF files must never be sent to Telegram.
 */
export async function sendPayslipDocument({
  chatId,
  employeeName,
  periodLabel,
  pdfBuffer,
  filename,
}) {
  if (!chatId) throw new AppError("Employee Telegram is not verified", 400);
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append(
    "caption",
    `e-PaySlip\nEmployee: ${employeeName}\nPayroll: ${periodLabel}\nOpen the PDF with your personal 6-digit e-PaySlip PDF password provided separately by HR.`,
  );
  form.append(
    "document",
    new Blob([pdfBuffer], { type: "application/pdf" }),
    filename,
  );
  return telegramCall("sendDocument", form);
}
