import mongoose from 'mongoose'

const payslipCredentialSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
      unique: true,
      index: true
    },
    passwordHash: {
      type: String,
      default: '',
      select: false
    },
    passwordFingerprint: {
      type: String,
      required: true,
      unique: true,
      select: false
    },
    passwordEncrypted: {
      type: String,
      required: true,
      select: false
    },
    telegramFailedAttempts: { type: Number, default: 0 },
    telegramLockedUntil: { type: Date, default: null },
    telegramVerifiedAt: { type: Date, default: null },
    rotatedAt: { type: Date, default: null }
  },
  { timestamps: true }
)

// This is now the single employee e-PaySlip credential.
// The same six-digit password opens PDFs and verifies Telegram on first link.
// The model name is kept for backward compatibility with existing MongoDB data.
export const PayslipCredential = mongoose.model('PayslipCredential', payslipCredentialSchema)
