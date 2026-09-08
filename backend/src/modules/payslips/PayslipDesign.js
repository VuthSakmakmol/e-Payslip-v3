import mongoose from 'mongoose'

const FONT_FAMILIES = [
  'Arial',
  'Times New Roman',
  'Khmer OS Moul',
  'Khmer OS Moul Light',
  'Khmer OS Content',
  'Khmer OS Siemreap',
  'Khmer OS Battambang',
  'Noto Sans Khmer',
  'Khmer UI'
]

const elementSchema = new mongoose.Schema({
  type: { type: String, enum: ['TEXT', 'FIELD', 'LINE', 'RECTANGLE', 'ELLIPSE', 'IMAGE'], required: true },
  fieldKey: { type: String, default: '' },
  text: { type: String, default: '' },

  showLabel: { type: Boolean, default: false },
  showValue: { type: Boolean, default: true },
  labelText: { type: String, default: '' },

  xMm: { type: Number, required: true },
  yMm: { type: Number, required: true },
  widthMm: { type: Number, default: 40 },
  heightMm: { type: Number, default: 8 },
  rotation: { type: Number, default: 0 },
  opacity: { type: Number, min: 0, max: 1, default: 1 },

  fontFamily: { type: String, enum: FONT_FAMILIES, default: 'Arial' },
  fontSize: { type: Number, default: 10 },
  fontWeight: { type: String, enum: ['normal', 'bold'], default: 'normal' },
  align: { type: String, enum: ['left', 'center', 'right'], default: 'left' },
  verticalAlign: { type: String, enum: ['top', 'middle', 'bottom'], default: 'top' },
  paddingPx: { type: Number, min: 0, max: 100, default: 3 },
  characterSpacing: { type: Number, min: 0, default: 0 },
  lineHeight: { type: Number, min: 0.1, default: 1.2 },
  underline: { type: Boolean, default: false },
  strikethrough: { type: Boolean, default: false },

  textColor: { type: String, default: '#111827' },
  backgroundColor: { type: String, default: 'transparent' },
  borderColor: { type: String, default: '#111827' },
  borderWidth: { type: Number, min: 0, max: 40, default: 0 },
  radiusMm: { type: Number, min: 0, default: 0 },
  imageData: { type: String, default: '' },

  groupId: { type: String, default: '' },
  zIndex: { type: Number, default: 0 },
  pdfmeSchema: { type: mongoose.Schema.Types.Mixed, default: null }
}, { _id: true })

const payslipDesignSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  pageSize: { type: String, enum: ['A4'], default: 'A4' },
  pageOrientation: { type: String, enum: ['portrait', 'landscape'], default: 'landscape' },
  active: { type: Boolean, default: false, index: true },
  designerEngine: { type: String, enum: ['LEGACY', 'PDFME'], default: 'PDFME' },
  templateRevision: { type: Number, default: 1 },
  pdfmeTemplate: { type: mongoose.Schema.Types.Mixed, default: null },
  elements: { type: [elementSchema], default: [] },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true })

export const PAYSLIP_FONT_FAMILIES = FONT_FAMILIES
export const PayslipDesign = mongoose.model('PayslipDesign', payslipDesignSchema)
