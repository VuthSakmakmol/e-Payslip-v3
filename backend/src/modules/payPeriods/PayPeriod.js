import mongoose from 'mongoose'

const payPeriodSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  sequence: { type: Number, required: true },
  active: { type: Boolean, default: true }
}, { timestamps: true })

export const PayPeriod = mongoose.model('PayPeriod', payPeriodSchema)
