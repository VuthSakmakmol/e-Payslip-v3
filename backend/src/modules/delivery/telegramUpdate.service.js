import { Employee } from "../employees/Employee.js";
import {
  ensurePayslipCredential,
  verifyPayslipPasswordForTelegram,
} from "../auth/payslipCredential.service.js";
import {
  sendTelegramMessage,
  answerTelegramCallback,
} from "./telegram.service.js";

const sessions = new Map();
const SESSION_MS = 10 * 60 * 1000;
function session(chatId) {
  const value = sessions.get(chatId);
  if (value && value.expiresAt > Date.now()) return value;
  sessions.delete(chatId);
  return null;
}
function setSession(chatId, value) {
  sessions.set(chatId, { ...value, expiresAt: Date.now() + SESSION_MS });
}
function clearSession(chatId) {
  sessions.delete(chatId);
}
function identity(update) {
  const message = update.message || update.callback_query?.message || {};
  const from = update.callback_query?.from || update.message?.from || {};
  return {
    message,
    from,
    chat: message.chat || {},
    chatId: String(message.chat?.id || ""),
  };
}

function updateProfile(employee, update) {
  const { message, from, chat } = identity(update);
  const now = new Date();
  employee.telegramProfile = {
    userId: String(from.id || ""),
    chatId: String(chat.id || ""),
    username: String(from.username || chat.username || ""),
    firstName: String(from.first_name || chat.first_name || ""),
    lastName: String(from.last_name || chat.last_name || ""),
    languageCode: String(from.language_code || ""),
    isBot: Boolean(from.is_bot),
    isPremium: Boolean(from.is_premium),
    chatType: String(chat.type || ""),
    linkedAt: now,
    verifiedAt: now,
    unlinkedAt: null,
    lastSeenAt: now,
    lastUpdateId: Number(update.update_id),
    lastMessageId: Number(message.message_id),
    lastMessageDate: now,
    fromSnapshot: from,
    chatSnapshot: chat,
  };
}
async function askId(chatId) {
  setSession(chatId, { step: "ID" });
  await sendTelegramMessage(
    chatId,
    "Welcome to e-PaySlip.\n\nWhat is your Employee ID?",
  );
}

export async function processTelegramUpdate(update) {
  const { chatId } = identity(update);
  if (!chatId) return;
  const linked = await Employee.findOne({ telegramChatId: chatId });
  if (linked) {
    if (update.message?.text?.match(/^\/start/i))
      await sendTelegramMessage(
        chatId,
        `Your Telegram is already verified for ${linked.fullName}.`,
      );
    return;
  }
  const callback = update.callback_query;
  if (callback) {
    await answerTelegramCallback(callback.id);
    const current = session(chatId);
    if (!current?.employeeId) return askId(chatId);
    if (callback.data === "identity_no") {
      clearSession(chatId);
      await sendTelegramMessage(
        chatId,
        "Linking cancelled. Send /start to try again.",
      );
      return;
    }
    if (callback.data === "identity_yes") {
      setSession(chatId, { step: "PASSWORD", employeeId: current.employeeId });
      await sendTelegramMessage(
        chatId,
        "Please enter your 6-digit e-PaySlip password. This is the same password used to open your payslip PDF.",
      );
    }
    return;
  }
  const text = String(update.message?.text || "").trim();
  if (/^\/start(?:@\w+)?$/i.test(text)) return askId(chatId);
  const current = session(chatId);
  if (!current) return askId(chatId);
  if (current.step === "ID") {
    const employee = await Employee.findOne({
      employeeCode: text,
      active: true,
    });
    if (!employee || employee.preferredDelivery !== "TELEGRAM") {
      await sendTelegramMessage(
        chatId,
        "Employee ID was not found or is not configured for Telegram. Please try again.",
      );
      return;
    }
    await ensurePayslipCredential(employee);
    setSession(chatId, { step: "CONFIRM", employeeId: String(employee._id) });
    await sendTelegramMessage(
      chatId,
      `Employee ID: ${employee.employeeCode}\nName: ${employee.fullName}\nPosition: ${employee.position}\nDepartment: ${employee.department}\n\nIs this you?`,
      {
        replyMarkup: {
          inline_keyboard: [
            [
              { text: "Yes, this is me", callback_data: "identity_yes" },
              { text: "No", callback_data: "identity_no" },
            ],
          ],
        },
      },
    );
    return;
  }
  if (current.step === "PASSWORD") {
    const employee = await Employee.findById(current.employeeId);
    if (!employee) {
      clearSession(chatId);
      await sendTelegramMessage(
        chatId,
        "Verification is unavailable. Please contact Root Admin.",
      );
      return;
    }
    if (!(await verifyPayslipPasswordForTelegram(employee, text))) {
      await sendTelegramMessage(
        chatId,
        "Incorrect 6-digit e-PaySlip password. Please try again.",
      );
      return;
    }
    if (
      await Employee.exists({
        _id: { $ne: employee._id },
        telegramChatId: chatId,
      })
    ) {
      clearSession(chatId);
      await sendTelegramMessage(
        chatId,
        "This Telegram account is already linked to another employee.",
      );
      return;
    }
    employee.telegramChatId = chatId;
    updateProfile(employee, update);
    await employee.save();
    clearSession(chatId);
    await sendTelegramMessage(
      chatId,
      `✅ Verification successful.\n\nYour Telegram is now linked to ${employee.fullName}. Future payslips will be sent here as password-protected PDF files.`,
    );
  }
}
