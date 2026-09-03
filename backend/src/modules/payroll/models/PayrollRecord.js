import mongoose from 'mongoose'

const payrollValueSchema = new mongoose.Schema({
  raw: { type: String, default: '' },
  decimal: { type: mongoose.Schema.Types.Decimal128, default: null },
  date: { type: Date, default: null }
}, { _id: false })

const payrollRecordSchema = new mongoose.Schema({
  batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'PayrollBatch', required: true, index: true },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  employeeCode: { type: String, required: true, trim: true, index: true },
  templateVersion: { type: String, required: true },
  sourceRow: { type: Number, required: true },
  values: { type: Map, of: payrollValueSchema, default: {} }
}, { timestamps: true })

payrollRecordSchema.index({ batchId: 1, employeeId: 1 }, { unique: true })

export const PayrollRecord = mongoose.model('PayrollRecord', payrollRecordSchema)
