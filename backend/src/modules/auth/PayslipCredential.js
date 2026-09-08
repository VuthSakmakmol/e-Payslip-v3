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
    rotatedAt: { type: Date, default: null }
  },
  { timestamps: true }
)

export const PayslipCredential = mongoose.model('PayslipCredential', payslipCredentialSchema)
