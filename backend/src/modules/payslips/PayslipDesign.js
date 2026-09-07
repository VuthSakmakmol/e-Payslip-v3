import mongoose from 'mongoose'

const FONT_FAMILIES = [
  'Times New Roman',
  'Khmer OS Moul',
  'Khmer OS Moul Light',
  'Khmer OS Battambang'
]

const elementSchema = new mongoose.Schema({
  type: { type: String, enum: ['TEXT', 'FIELD', 'LINE', 'RECTANGLE'], required: true },
  fieldKey: { type: String, default: '' },
  text: { type: String, default: '' },

  showLabel: { type: Boolean, default: false },
  showValue: { type: Boolean, default: true },
  labelText: { type: String, default: '' },

  xMm: { type: Number, required: true },
  yMm: { type: Number, required: true },
  widthMm: { type: Number, default: 40 },
  heightMm: { type: Number, default: 8 },

  fontFamily: { type: String, enum: FONT_FAMILIES, default: 'Times New Roman' },
  fontSize: { type: Number, default: 10 },
  fontWeight: { type: String, enum: ['normal', 'bold'], default: 'normal' },
  align: { type: String, enum: ['left', 'center', 'right'], default: 'left' },
  paddingPx: { type: Number, min: 0, max: 30, default: 3 },

  textColor: { type: String, default: '#111827' },
  backgroundColor: { type: String, default: 'transparent' },
  borderColor: { type: String, default: '#111827' },
  borderWidth: { type: Number, min: 0, max: 8, default: 0 },

  groupId: { type: String, default: '' },
  zIndex: { type: Number, default: 0 }
}, { _id: true })

const payslipDesignSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  pageSize: { type: String, enum: ['A4'], default: 'A4' },
  pageOrientation: { type: String, enum: ['portrait', 'landscape'], default: 'landscape' },
  active: { type: Boolean, default: false, index: true },
  elements: { type: [elementSchema], default: [] },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true })

export const PAYSLIP_FONT_FAMILIES = FONT_FAMILIES
export const PayslipDesign = mongoose.model('PayslipDesign', payslipDesignSchema)
