import mongoose from 'mongoose'

const employeePdfCredentialSchema = new mongoose.Schema({
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
  status: {
    type: String,
    enum: ['ACTIVE', 'DISABLED'],
    default: 'ACTIVE',
    required: true,
    index: true
  },
  rotatedAt: { type: Date, default: null }
}, { timestamps: true })

export const EmployeePdfCredential = mongoose.model('EmployeePdfCredential', employeePdfCredentialSchema)
