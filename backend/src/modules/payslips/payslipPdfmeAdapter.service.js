import { AppError } from '../../utils/AppError.js'
import { getPayslipDesignerFields } from './payslipDesignerFields.js'

const MM_TO_PT = 72 / 25.4
const PX_TO_MM = 25.4 / 96
const SUPPORTED_TYPES = new Set(['text', 'image', 'line', 'rectangle', 'ellipse'])
const MAX_SCHEMAS = 500
const MAX_IMAGE_DATA_LENGTH = 1_800_000

const fieldCatalog = new Map(getPayslipDesignerFields().map((field) => [field.key, field]))

function clone(value) {
  if (value == null) return value
  return JSON.parse(JSON.stringify(value))
}

function finite(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function positive(value, fallback = 1) {
  return Math.max(finite(value, fallback), 0.1)
}

function orientationSize(orientation) {
  return orientation === 'portrait'
    ? { width: 210, height: 297 }
    : { width: 297, height: 210 }
}

function sanitizeName(value, fallback) {
  const text = String(value || '').trim().replace(/[^a-zA-Z0-9_.-]+/g, '_')
  return text || fallback
}

function uniqueName(value, fallback, used) {
  const base = sanitizeName(value, fallback)
  let name = base
  let suffix = 2
  while (used.has(name)) {
    name = `${base}_${suffix}`
    suffix += 1
  }
  used.add(name)
  return name
}

function asBox(value, fallback = 0) {
  if (typeof value === 'number') {
    const n = Math.max(finite(value, fallback), 0)
    return { top: n, right: n, bottom: n, left: n }
  }
  return {
    top: Math.max(finite(value?.top, fallback), 0),
    right: Math.max(finite(value?.right, fallback), 0),
    bottom: Math.max(finite(value?.bottom, fallback), 0),
    left: Math.max(finite(value?.left, fallback), 0)
  }
}

function maxBox(value, fallback = 0) {
  const box = asBox(value, fallback)
  return Math.max(box.top, box.right, box.bottom, box.left)
}

function color(value, fallback = '') {
  const text = String(value || '').trim()
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text : fallback
}

function fieldPreview(fieldKey, labelText = '', showLabel = true, showValue = true) {
  const field = fieldCatalog.get(fieldKey)
  const label = String(labelText || field?.label || fieldKey || '').trim()
  const value = String(field?.sampleValue ?? '')
  if (showLabel && showValue) return `${label}: ${value}`
  if (showLabel) return label
  if (showValue) return value
  return ''
}

function safeImageContent(value) {
  const content = String(value || '')
  if (!content) return ''
  if (content.length > MAX_IMAGE_DATA_LENGTH) {
    throw new AppError('Payslip design image is too large. Use a smaller PNG or JPG.', 413)
  }
  if (!/^data:image\/(?:png|jpeg);base64,/i.test(content)) {
    throw new AppError('Payslip design images must be embedded PNG or JPG files.', 400)
  }
  return content
}

export function normalizePdfmeTemplate(template, orientation = 'landscape') {
  const size = orientationSize(orientation)
  const source = template && typeof template === 'object' ? clone(template) : {}
  const page = Array.isArray(source.schemas?.[0]) ? source.schemas[0] : []
  if (page.length > MAX_SCHEMAS) throw new AppError(`Payslip design cannot contain more than ${MAX_SCHEMAS} elements`, 400)

  const usedNames = new Set()
  const schemas = page.map((raw, index) => {
    const schema = raw && typeof raw === 'object' ? clone(raw) : {}
    const type = String(schema.type || '').trim()
    if (!SUPPORTED_TYPES.has(type)) {
      throw new AppError(`Unsupported payslip designer element type: ${type || 'unknown'}`, 400)
    }

    schema.name = uniqueName(schema.name, `${type}_${index + 1}`, usedNames)
    schema.type = type
    schema.position = {
      x: finite(schema.position?.x, 10),
      y: finite(schema.position?.y, 10)
    }
    schema.width = positive(schema.width, type === 'line' ? 50 : 40)
    schema.height = positive(schema.height, type === 'line' ? 0.5 : 8)
    schema.rotate = finite(schema.rotate, 0)
    schema.opacity = Math.min(Math.max(finite(schema.opacity, 1), 0), 1)

    // Never persist URL-backed base PDFs or remote image inputs. The designer is intentionally
    // one A4 page with embedded local assets only.
    if (type === 'image') schema.content = safeImageContent(schema.content)
    else if (schema.content !== undefined) schema.content = String(schema.content ?? '').slice(0, 10000)

    delete schema.id
    delete schema.__splitRange
    delete schema.__isSplit
    return schema
  })

  return {
    basePdf: { width: size.width, height: size.height, padding: [0, 0, 0, 0] },
    schemas: [schemas],
    pdfmeVersion: String(source.pdfmeVersion || '6.1.12')
  }
}

function baseTextSchema(element, index) {
  const isField = element.type === 'FIELD'
  const fieldKey = String(element.fieldKey || '')
  const showLabel = isField ? element.showLabel === true : false
  const showValue = isField ? element.showValue !== false : false
  const labelText = isField ? String(element.labelText || '') : ''
  const field = fieldCatalog.get(fieldKey)
  const paddingMm = Math.max(finite(element.paddingPx, 3), 0) * PX_TO_MM
  const borderMm = Math.max(finite(element.borderWidth, 0), 0) / MM_TO_PT

  return {
    name: sanitizeName(isField ? `field_${fieldKey}_${index + 1}` : `text_${index + 1}`, `text_${index + 1}`),
    type: 'text',
    content: isField
      ? fieldPreview(fieldKey, labelText, showLabel, showValue)
      : String(element.text || ''),
    position: { x: finite(element.xMm, 0), y: finite(element.yMm, 0) },
    width: positive(element.widthMm, 40),
    height: positive(element.heightMm, 8),
    rotate: finite(element.rotation, 0),
    opacity: Math.min(Math.max(finite(element.opacity, 1), 0), 1),
    alignment: ['left', 'center', 'right', 'justify'].includes(element.align) ? element.align : 'left',
    verticalAlignment: ['top', 'middle', 'bottom'].includes(element.verticalAlign) ? element.verticalAlign : 'top',
    fontName: String(element.fontFamily || 'Times New Roman'),
    fontSize: positive(element.fontSize, 10),
    lineHeight: positive(element.lineHeight, 1.2),
    characterSpacing: Math.max(finite(element.characterSpacing, 0), 0),
    fontColor: color(element.textColor, '#111827'),
    backgroundColor: color(element.backgroundColor, ''),
    borderColor: color(element.borderColor, '#111827'),
    borderWidth: asBox(borderMm),
    padding: asBox(paddingMm),
    underline: element.underline === true,
    strikethrough: element.strikethrough === true,
    overflow: 'visible',
    readOnly: isField,
    epayslipKind: isField ? 'FIELD' : 'TEXT',
    epayslipFieldKey: isField ? fieldKey : '',
    epayslipFieldLabel: isField ? String(field?.label || fieldKey) : '',
    epayslipSampleValue: isField ? String(field?.sampleValue ?? '') : '',
    epayslipShowLabel: isField ? showLabel : false,
    epayslipShowValue: isField ? showValue : false,
    epayslipLabelText: isField ? (labelText || field?.label || fieldKey) : '',
    epayslipFontFamily: String(element.fontFamily || 'Times New Roman'),
    epayslipFontWeight: element.fontWeight === 'bold' ? 'bold' : 'normal'
  }
}

export function buildPdfmeTemplateFromLegacyDesign(design) {
  const orientation = design?.pageOrientation === 'portrait' ? 'portrait' : 'landscape'
  const size = orientationSize(orientation)
  const usedNames = new Set()
  const schemas = (design?.elements || []).map((rawElement, index) => {
    const element = typeof rawElement?.toObject === 'function' ? rawElement.toObject() : rawElement
    let schema

    if (element.type === 'TEXT' || element.type === 'FIELD') {
      schema = baseTextSchema(element, index)
    } else if (element.type === 'LINE') {
      schema = {
        name: `line_${index + 1}`,
        type: 'line',
        position: { x: finite(element.xMm, 0), y: finite(element.yMm, 0) },
        width: positive(element.widthMm, 40),
        height: Math.max(finite(element.borderWidth, 1) / MM_TO_PT, 0.1),
        rotate: finite(element.rotation, 0),
        opacity: Math.min(Math.max(finite(element.opacity, 1), 0), 1),
        color: color(element.borderColor, '#111827'),
        readOnly: true,
        epayslipKind: 'LINE'
      }
    } else if (element.type === 'RECTANGLE' || element.type === 'ELLIPSE') {
      const shapeType = element.type === 'ELLIPSE' ? 'ellipse' : 'rectangle'
      schema = {
        name: `${shapeType}_${index + 1}`,
        type: shapeType,
        position: { x: finite(element.xMm, 0), y: finite(element.yMm, 0) },
        width: positive(element.widthMm, 40),
        height: positive(element.heightMm, 8),
        rotate: finite(element.rotation, 0),
        opacity: Math.min(Math.max(finite(element.opacity, 1), 0), 1),
        borderWidth: Math.max(finite(element.borderWidth, 0) / MM_TO_PT, 0),
        borderColor: color(element.borderColor, '#111827'),
        color: color(element.backgroundColor, ''),
        radius: Math.max(finite(element.radiusMm, 0), 0),
        readOnly: true,
        epayslipKind: element.type === 'ELLIPSE' ? 'ELLIPSE' : 'RECTANGLE'
      }
    } else if (element.type === 'IMAGE') {
      schema = {
        name: `image_${index + 1}`,
        type: 'image',
        content: String(element.imageData || ''),
        position: { x: finite(element.xMm, 0), y: finite(element.yMm, 0) },
        width: positive(element.widthMm, 40),
        height: positive(element.heightMm, 30),
        rotate: finite(element.rotation, 0),
        opacity: Math.min(Math.max(finite(element.opacity, 1), 0), 1),
        epayslipKind: 'IMAGE'
      }
    } else {
      return null
    }

    schema.name = uniqueName(schema.name, `${schema.type}_${index + 1}`, usedNames)
    return schema
  }).filter(Boolean)

  return {
    basePdf: { width: size.width, height: size.height, padding: [0, 0, 0, 0] },
    schemas: [schemas],
    pdfmeVersion: '6.1.12'
  }
}

export function legacyElementsFromPdfmeTemplate(template, orientation = 'landscape') {
  const normalized = normalizePdfmeTemplate(template, orientation)
  return normalized.schemas[0].map((schema, index) => {
    const common = {
      xMm: schema.position.x,
      yMm: schema.position.y,
      widthMm: schema.width,
      heightMm: schema.height,
      rotation: finite(schema.rotate, 0),
      opacity: Math.min(Math.max(finite(schema.opacity, 1), 0), 1),
      groupId: '',
      zIndex: index,
      pdfmeSchema: clone(schema)
    }

    if (schema.type === 'image') {
      return {
        ...common,
        type: 'IMAGE',
        imageData: safeImageContent(schema.content),
        fieldKey: '',
        text: '',
        showLabel: false,
        showValue: false,
        labelText: '',
        fontFamily: 'Times New Roman',
        fontSize: 10,
        fontWeight: 'normal',
        align: 'left',
        paddingPx: 0,
        textColor: '#111827',
        backgroundColor: 'transparent',
        borderColor: '#111827',
        borderWidth: 0
      }
    }

    if (schema.type === 'line') {
      return {
        ...common,
        type: 'LINE',
        heightMm: schema.height,
        borderWidth: Math.max(finite(schema.height, 0.5) * MM_TO_PT, 0.25),
        borderColor: color(schema.color, '#111827'),
        backgroundColor: 'transparent',
        fieldKey: '',
        text: '',
        showLabel: false,
        showValue: false,
        labelText: '',
        fontFamily: 'Times New Roman',
        fontSize: 10,
        fontWeight: 'normal',
        align: 'left',
        paddingPx: 0,
        textColor: '#111827'
      }
    }

    if (schema.type === 'rectangle' || schema.type === 'ellipse') {
      return {
        ...common,
        type: schema.type === 'ellipse' ? 'ELLIPSE' : 'RECTANGLE',
        borderWidth: Math.max(finite(schema.borderWidth, 0) * MM_TO_PT, 0),
        borderColor: color(schema.borderColor, '#111827'),
        backgroundColor: color(schema.color, 'transparent') || 'transparent',
        radiusMm: Math.max(finite(schema.radius, 0), 0),
        fieldKey: '',
        text: '',
        showLabel: false,
        showValue: false,
        labelText: '',
        fontFamily: 'Times New Roman',
        fontSize: 10,
        fontWeight: 'normal',
        align: 'left',
        paddingPx: 0,
        textColor: '#111827'
      }
    }

    const isField = schema.epayslipKind === 'FIELD' && Boolean(schema.epayslipFieldKey)
    const fieldKey = isField ? String(schema.epayslipFieldKey) : ''
    const field = fieldCatalog.get(fieldKey)
    return {
      ...common,
      type: isField ? 'FIELD' : 'TEXT',
      fieldKey,
      text: isField ? '' : String(schema.content || ''),
      showLabel: isField ? schema.epayslipShowLabel !== false : false,
      showValue: isField ? schema.epayslipShowValue !== false : false,
      labelText: isField ? String(schema.epayslipLabelText || field?.label || fieldKey) : '',
      fontFamily: String(schema.fontName || schema.epayslipFontFamily || 'Times New Roman'),
      fontSize: positive(schema.fontSize, 10),
      fontWeight: schema.epayslipFontWeight === 'bold' ? 'bold' : 'normal',
      align: ['left', 'center', 'right'].includes(schema.alignment) ? schema.alignment : 'left',
      verticalAlign: ['top', 'middle', 'bottom'].includes(schema.verticalAlignment) ? schema.verticalAlignment : 'top',
      paddingPx: Math.max(maxBox(schema.padding, 0) / PX_TO_MM, 0),
      textColor: color(schema.fontColor, '#111827'),
      backgroundColor: color(schema.backgroundColor, 'transparent') || 'transparent',
      borderColor: color(schema.borderColor, '#111827'),
      borderWidth: Math.max(maxBox(schema.borderWidth, 0) * MM_TO_PT, 0),
      characterSpacing: Math.max(finite(schema.characterSpacing, 0), 0),
      lineHeight: positive(schema.lineHeight, 1.2),
      underline: schema.underline === true,
      strikethrough: schema.strikethrough === true
    }
  })
}

export function ensureDesignPdfmeTemplate(design) {
  const raw = typeof design?.toObject === 'function' ? design.toObject() : clone(design || {})
  const orientation = raw.pageOrientation === 'portrait' ? 'portrait' : 'landscape'
  const pdfmeTemplate = raw.pdfmeTemplate
    ? normalizePdfmeTemplate(raw.pdfmeTemplate, orientation)
    : buildPdfmeTemplateFromLegacyDesign(raw)
  return { ...raw, designerEngine: 'PDFME', pdfmeTemplate }
}
