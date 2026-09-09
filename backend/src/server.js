import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { connectDb } from './config/db.js'
import {
  env,
  telegramReturnButtonAvailable,
  assertTelegramRuntimeConfig
} from './config/env.js'
import authRoutes from './modules/auth/auth.routes.js'
import employeeRoutes from './modules/employees/employee.routes.js'
import {
  cleanupLegacyEmployeeDateOfBirth,
  normalizeExistingEmployeeEmails
} from './modules/employees/Employee.js'
import payPeriodRoutes from './modules/payPeriods/payPeriod.routes.js'
import payrollRoutes from './modules/payroll/payroll.routes.js'
import payslipRoutes from './modules/payslips/payslip.routes.js'
import dashboardRoutes from './modules/dashboard/dashboard.routes.js'
import telegramWebhookRoutes from './modules/delivery/telegramWebhook.routes.js'
import deliveryRoutes from './modules/delivery/delivery.routes.js'
import {
  startTelegramPolling,
  stopTelegramPolling
} from './modules/delivery/telegramPolling.service.js'
import { cleanupLegacyTelegramCredentialCollection } from './modules/auth/payslipCredential.service.js'
import { purgeLegacyStoredPayrollData } from './modules/payroll/services/payrollPrivacy.service.js'
import { requireAuth, requireRootAdmin } from './modules/auth/auth.middleware.js'
import { errorHandler, notFound } from './middleware/errorHandler.js'

assertTelegramRuntimeConfig()
await connectDb()

const removedLegacyDobCount = await cleanupLegacyEmployeeDateOfBirth()
if (removedLegacyDobCount > 0) {
  console.log(`[employee] removed legacy Date of Birth from ${removedLegacyDobCount} employee record(s)`)
}

const normalizedEmailCount = await normalizeExistingEmployeeEmails()
if (normalizedEmailCount > 0) {
  console.log(`[employee] normalized ${normalizedEmailCount} employee email address(es) to lowercase`)
}

const removedLegacyTelegramCredentialCount = await cleanupLegacyTelegramCredentialCollection()
if (removedLegacyTelegramCredentialCount > 0) {
  console.log(`[auth] removed ${removedLegacyTelegramCredentialCount} legacy separate Telegram credential(s); the shared e-PaySlip password is now used`)
}

const payrollPrivacyCleanup = await purgeLegacyStoredPayrollData()
if (payrollPrivacyCleanup.recordsDeleted || payrollPrivacyCleanup.batchesDeleted) {
  console.log(`[payroll] privacy cleanup removed ${payrollPrivacyCleanup.recordsDeleted} stored payroll row(s) and ${payrollPrivacyCleanup.batchesDeleted} legacy payroll batch(es)`)
}

const app = express()
app.disable('x-powered-by')
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
app.use(cors({ origin: env.FRONTEND_ORIGIN, credentials: false }))
app.use(express.json({ limit: '6mb' }))

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'e-PaySlip-V3 API',
    telegramMode: env.TELEGRAM_UPDATE_MODE,
    telegramReturnButton: telegramReturnButtonAvailable()
  })
})

app.use('/api/auth', authRoutes)
app.use('/api/telegram', telegramWebhookRoutes)
app.use('/api/dashboard', requireAuth, requireRootAdmin, dashboardRoutes)
app.use('/api/employees', requireAuth, requireRootAdmin, employeeRoutes)
app.use('/api/pay-periods', requireAuth, requireRootAdmin, payPeriodRoutes)
app.use('/api/payroll', requireAuth, requireRootAdmin, payrollRoutes)
app.use('/api/payslips', requireAuth, requireRootAdmin, payslipRoutes)
app.use('/api/deliveries', requireAuth, requireRootAdmin, deliveryRoutes)

app.use(notFound)
app.use(errorHandler)

const server = app.listen(env.PORT, () => {
  console.log(`[api] running at http://localhost:${env.PORT}`)
  console.log(`[telegram] update mode: ${env.TELEGRAM_UPDATE_MODE}`)

  if (env.TELEGRAM_RETURN_URL) {
    console.log(`[telegram] return URL: ${env.TELEGRAM_RETURN_URL}`)
    console.log(
      `[telegram] return button: ${
        telegramReturnButtonAvailable()
          ? 'ENABLED'
          : 'DISABLED (requires a public HTTPS URL)'
      }`
    )
  } else {
    console.log('[telegram] return button: DISABLED (TELEGRAM_RETURN_URL is empty)')
  }

  void startTelegramPolling()
})

function shutdown(signal) {
  console.log(`[api] ${signal} received, shutting down`)
  stopTelegramPolling()
  server.close(() => process.exit(0))
}

process.once('SIGINT', () => shutdown('SIGINT'))
process.once('SIGTERM', () => shutdown('SIGTERM'))
