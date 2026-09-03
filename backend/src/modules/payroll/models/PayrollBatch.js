import mongoose from 'mongoose'

const payrollBatchSchema = new mongoose.Schema({
  staffCategory: { type: String, enum: ['LOCAL'], required: true, index: true },
  year: { type: Number, required: true, index: true },
  month: { type: Number, min: 1, max: 12, required: true, index: true },
  payPeriodId: { type: mongoose.Schema.Types.ObjectId, ref: 'PayPeriod', required: true, index: true },
  templateVersion: { type: String, required: true },
  sourceFileName: { type: String, default: '' },
  status: { type: String, enum: ['READY', 'RELEASED', 'VOID'], default: 'READY', index: true },
  employeeCount: { type: Number, default: 0 },
  importedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  releasedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  releasedAt: { type: Date, default: null }
}, { timestamps: true })

payrollBatchSchema.index({ year: 1, month: 1, payPeriodId: 1, status: 1 })

export const PayrollBatch = mongoose.model('PayrollBatch', payrollBatchSchema)
