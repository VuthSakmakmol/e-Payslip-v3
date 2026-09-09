import mongoose from 'mongoose'

const deliveryLogSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  employeeCode: { type: String, required: true, index: true },
  staffCategory: { type: String, enum: ['LOCAL', 'FOREIGNER'], required: true },
  year: { type: Number, required: true },
  month: { type: Number, required: true },
  payPeriodId: { type: mongoose.Schema.Types.ObjectId, ref: 'PayPeriod', default: null },
  releaseMode: { type: String, enum: ['FULL', 'UPDATE'], default: 'FULL', index: true },
  correctionNumber: { type: Number, min: 0, default: 0 },
  channel: { type: String, enum: ['EMAIL', 'TELEGRAM'], required: true },
  destinationMasked: { type: String, default: '' },
  status: { type: String, enum: ['SENT', 'FAILED'], required: true, index: true },
  errorMessage: { type: String, default: '' },
  releasedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sentAt: { type: Date, default: null }
}, { timestamps: true })

export const DeliveryLog = mongoose.model('DeliveryLog', deliveryLogSchema)
