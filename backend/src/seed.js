import bcrypt from 'bcryptjs'
import { connectDb } from './config/db.js'
import { env } from './config/env.js'
import { User } from './modules/auth/User.js'
import { normalizeLoginId } from './modules/auth/auth.service.js'
import { PayPeriod } from './modules/payPeriods/PayPeriod.js'
import { PayslipDesign } from './modules/payslips/PayslipDesign.js'
import { createDefaultPayslipDesign } from './modules/payslips/defaultPayslipDesign.js'

await connectDb()

const rootLoginId = normalizeLoginId(env.ROOT_ADMIN_ID)
const passwordHash = await bcrypt.hash(env.ROOT_ADMIN_PASSWORD, 12)
let admin = await User.findOne({ role: 'ROOT_ADMIN' }).select('+passwordHash')

if (!admin) {
  admin = await User.create({
    name: env.ROOT_ADMIN_NAME,
    loginId: rootLoginId,
    email: env.ROOT_ADMIN_EMAIL || '',
    passwordHash,
    role: 'ROOT_ADMIN',
    active: true
  })
} else {
  admin.name = env.ROOT_ADMIN_NAME
  admin.loginId = rootLoginId
  if (env.ROOT_ADMIN_EMAIL) admin.email = env.ROOT_ADMIN_EMAIL.toLowerCase()
  admin.passwordHash = passwordHash
  admin.role = 'ROOT_ADMIN'
  admin.active = true
  await admin.save()
}

await PayPeriod.findOneAndUpdate(
  { code: 'P1' },
  { code: 'P1', name: 'Week 1', sequence: 1, active: true },
  { upsert: true, new: true }
)
await PayPeriod.findOneAndUpdate(
  { code: 'P2' },
  { code: 'P2', name: 'Week 2', sequence: 2, active: true },
  { upsert: true, new: true }
)

if (!(await PayslipDesign.exists({}))) {
  const defaultDesign = createDefaultPayslipDesign()
  await PayslipDesign.create({
    ...defaultDesign,
    createdBy: admin._id,
    updatedBy: admin._id
  })
}

console.log(`[seed] root admin ID: ${admin.loginId}`)
console.log('[seed] pay periods: Week 1, Week 2')
console.log('[seed] default payslip design ready')
process.exit(0)
