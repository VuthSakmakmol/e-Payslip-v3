import mongoose from 'mongoose'

const employeeAccountSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
    unique: true,
    index: true
  },
  loginId: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    index: true
  },
  passwordHash: { type: String, required: true, select: false },

  // One-way fingerprint is retained for uniqueness checks. It cannot reveal the password.
  temporaryPasswordFingerprint: { type: String, required: true, unique: true, select: false },

  // Recoverable copy exists ONLY while the employee is on FIRST_LOGIN.
  // It is AES-256-GCM encrypted and cleared after the permanent password is created.
  temporaryPasswordEncrypted: { type: String, default: '', select: false },

  status: {
    type: String,
    enum: ['FIRST_LOGIN', 'ACTIVE', 'LOCKED', 'DISABLED'],
    default: 'FIRST_LOGIN',
    required: true,
    index: true
  },
  mustChangePassword: { type: Boolean, default: true },
  telegramVerified: { type: Boolean, default: false },
  passwordChangedAt: { type: Date, default: null },
  lastLoginAt: { type: Date, default: null }
}, { timestamps: true })

export const EmployeeAccount = mongoose.model('EmployeeAccount', employeeAccountSchema)
