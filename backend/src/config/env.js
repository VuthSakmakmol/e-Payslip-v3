import 'dotenv/config'
import { z } from 'zod'

const normalizeTelegramMode = (value) =>
  String(value ?? 'POLLING').trim().toUpperCase()

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().min(1),

  FRONTEND_ORIGIN: z.string().trim().default('http://localhost:5173'),
  TELEGRAM_RETURN_URL: z.string().trim().optional().default(''),

  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('8h'),

  ROOT_ADMIN_ID: z.string().trim().min(1).default('ROOT001'),
  ROOT_ADMIN_EMAIL: z.string().optional().default(''),
  ROOT_ADMIN_PASSWORD: z.string().min(8),
  ROOT_ADMIN_NAME: z.string().default('Root Admin'),

  CREDENTIAL_ENCRYPTION_SECRET: z.string().optional().default(''),

  TRANSIENT_PAYROLL_TTL_MINUTES: z.coerce.number().int().positive().default(30),

  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.string().default('false').transform((value) => value === 'true'),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  SMTP_FROM: z.string().default('e-PaySlip <no-reply@example.com>'),

  TELEGRAM_BOT_TOKEN: z.string().trim().optional().default(''),
  TELEGRAM_BOT_USERNAME: z.string().trim().optional().default(''),
  TELEGRAM_UPDATE_MODE: z.preprocess(
    normalizeTelegramMode,
    z.enum(['POLLING', 'WEBHOOK']).default('POLLING')
  ),
  TELEGRAM_POLL_TIMEOUT_SECONDS: z.coerce.number().int().min(1).max(50).default(25),
  TELEGRAM_DROP_PENDING_UPDATES: z
    .string()
    .default('false')
    .transform((value) => String(value).trim().toLowerCase() === 'true')
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  console.error('[env] invalid configuration', parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsed.data


export function telegramReturnButtonAvailable() {
  const candidate = String(env.TELEGRAM_RETURN_URL || '').trim()
  if (!candidate) return false

  try {
    const parsedUrl = new URL(candidate)
    const host = parsedUrl.hostname.toLowerCase()

    if (['localhost', '127.0.0.1', '::1'].includes(host)) {
      return false
    }

    return parsedUrl.protocol === 'https:'
  } catch {
    return false
  }
}

export function assertTelegramRuntimeConfig() {
  if (!['POLLING', 'WEBHOOK'].includes(env.TELEGRAM_UPDATE_MODE)) {
    throw new Error(
      `Invalid TELEGRAM_UPDATE_MODE: ${String(env.TELEGRAM_UPDATE_MODE)}`
    )
  }

  if (env.TELEGRAM_UPDATE_MODE === 'POLLING' && !env.TELEGRAM_BOT_TOKEN) {
    console.warn('[telegram] TELEGRAM_BOT_TOKEN is empty; polling cannot start')
  }
}
