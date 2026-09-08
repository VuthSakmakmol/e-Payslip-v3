import mongoose from 'mongoose'

const payrollReleaseSchema = new mongoose.Schema({
  staffCategory: { type: String, enum: ['LOCAL', 'FOREIGNER'], required: true, index: true },
  year: { type: Number, required: true, index: true },
  month: { type: Number, min: 1, max: 12, required: true, index: true },
  payPeriodId: { type: mongoose.Schema.Types.ObjectId, ref: 'PayPeriod', default: null, index: true },
  periodKey: { type: String, required: true, index: true },
  releaseMode: { type: String, enum: ['FULL', 'UPDATE'], required: true, default: 'FULL', index: true },
  correctionNumber: { type: Number, min: 0, default: 0 },
  sourceBatchId: { type: mongoose.Schema.Types.ObjectId, ref: 'PayrollBatch', default: null },
  sourceFileName: { type: String, default: '' },
  employeeCount: { type: Number, min: 0, default: 0 },
  sentCount: { type: Number, min: 0, default: 0 },
  failedCount: { type: Number, min: 0, default: 0 },
  releasedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  releasedAt: { type: Date, default: Date.now, index: true }
}, { timestamps: true })

// FULL always uses correctionNumber 0. UPDATE releases use 1, 2, 3, ...
payrollReleaseSchema.index(
  { periodKey: 1, releaseMode: 1, correctionNumber: 1 },
  { unique: true, name: 'uq_payroll_release_period_mode_number' }
)

export const PayrollRelease = mongoose.model('PayrollRelease', payrollReleaseSchema)
