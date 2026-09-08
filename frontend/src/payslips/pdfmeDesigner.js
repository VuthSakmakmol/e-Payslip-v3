import { text, image, line, rectangle, ellipse } from '@pdfme/schemas'

export const PDFME_VERSION = '6.1.12'

const KHMER_FONT_PRIORITY = [
  'Khmer OS Content',
  'Khmer OS Siemreap',
  'Khmer OS Battambang',
  'Noto Sans Khmer',
  'Khmer UI',
  'Khmer OS Moul Light',
  'Khmer OS Moul'
]

const KHMER_RE = /[\u1780-\u17FF\u19E0-\u19FF]/

const A4 = {
  portrait: { width: 210, height: 297 },
  landscape: { width: 297, height: 210 }
}

function clone(value) {
  // pdfme templates are plain JSON data. Avoid structuredClone because Vue wraps
  // nested reactive data in Proxy objects and browser structuredClone cannot clone them.
  if (value == null) return value
  return JSON.parse(JSON.stringify(value))
}

function slug(value) {
  return String(value || 'field').replace(/[^a-zA-Z0-9_.-]+/g, '_')
}

function uid(prefix = 'item') {
  if (globalThis.crypto?.randomUUID) return `${prefix}_${globalThis.crypto.randomUUID().replaceAll('-', '')}`
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function displayContent(schema, patch = {}) {
  const next = { ...schema, ...patch }
  const label = String(next.epayslipLabelText || next.epayslipFieldLabel || next.epayslipFieldKey || '').trim()
  const value = String(next.epayslipSampleValue ?? '')
  const showLabel = next.epayslipShowLabel !== false
  const showValue = next.epayslipShowValue !== false
  if (showLabel && showValue) return `${label}: ${value}`
  if (showLabel) return label
  if (showValue) return value
  return ''
}

function fieldBindingWidget(props) {
  const { rootElement, activeSchema, changeSchemas } = props
  const schema = activeSchema || {}
  if (!schema.epayslipFieldKey) return

  const wrap = document.createElement('div')
  wrap.className = 'epayslip-pdfme-binding'

  const title = document.createElement('div')
  title.className = 'epayslip-pdfme-binding-title'
  title.textContent = schema.epayslipFieldLabel || schema.epayslipFieldKey
  wrap.appendChild(title)

  const meta = document.createElement('div')
  meta.className = 'epayslip-pdfme-binding-key'
  meta.textContent = schema.epayslipFieldKey
  wrap.appendChild(meta)

  const labelInput = document.createElement('input')
  labelInput.type = 'text'
  labelInput.value = schema.epayslipLabelText || schema.epayslipFieldLabel || ''
  labelInput.placeholder = 'Label text'
  labelInput.className = 'epayslip-pdfme-native-input'
  labelInput.addEventListener('input', () => {
    const patch = { epayslipLabelText: labelInput.value }
    changeSchemas([
      { key: 'epayslipLabelText', value: patch.epayslipLabelText, schemaId: schema.id },
      { key: 'content', value: displayContent(schema, patch), schemaId: schema.id }
    ])
  })
  wrap.appendChild(labelInput)

  const toggles = document.createElement('div')
  toggles.className = 'epayslip-pdfme-toggles'

  const makeToggle = (label, key, current) => {
    const row = document.createElement('label')
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.checked = current
    checkbox.addEventListener('change', () => {
      const patch = { [key]: checkbox.checked }
      changeSchemas([
        { key, value: checkbox.checked, schemaId: schema.id },
        { key: 'content', value: displayContent(schema, patch), schemaId: schema.id }
      ])
    })
    const textNode = document.createElement('span')
    textNode.textContent = label
    row.append(checkbox, textNode)
    return row
  }

  toggles.append(
    makeToggle('Show label', 'epayslipShowLabel', schema.epayslipShowLabel !== false),
    makeToggle('Show value', 'epayslipShowValue', schema.epayslipShowValue !== false)
  )
  wrap.appendChild(toggles)
  rootElement.appendChild(wrap)
}

function createTextPlugin(defaultFontName = '') {
  const baseSchema = text.propPanel.schema
  const baseWidgets = text.propPanel.widgets || {}
  const defaultSchema = {
    ...text.propPanel.defaultSchema,
    type: 'text',
    content: 'Type Something...',
    epayslipKind: 'TEXT',
    epayslipFontFamily: defaultFontName || 'Arial',
    epayslipFontWeight: 'normal'
  }

  if (defaultFontName) defaultSchema.fontName = defaultFontName

  return {
    ...text,
    // Let pdfme own font-family rendering from options.font. We only keep the payslip
    // bold/regular visual hint here because e-Payslip stores weight separately.
    ui: (arg) => {
      text.ui(arg)
      const weight = arg.schema?.epayslipFontWeight === 'bold' ? '700' : '400'
      arg.rootElement.style.fontWeight = weight
      arg.rootElement.querySelectorAll('*').forEach((node) => {
        if (node instanceof HTMLElement) node.style.fontWeight = weight
      })
    },
    propPanel: {
      ...text.propPanel,
      widgets: { ...baseWidgets, EpayslipFieldBinding: fieldBindingWidget },
      schema: (props) => {
        const base = typeof baseSchema === 'function' ? baseSchema(props) : { ...baseSchema }
        delete base.useInlineMarkdown
        delete base.fontVariantFallback
        delete base.fontVariants

        return {
          epayslipBinding: {
            type: 'boolean',
            widget: 'EpayslipFieldBinding',
            bind: false,
            hidden: !props.activeSchema?.epayslipFieldKey,
            span: 24
          },
          epayslipFontWeight: {
            title: 'Weight',
            type: 'string',
            widget: 'select',
            default: 'normal',
            props: {
              options: [
                { label: 'Regular', value: 'normal' },
                { label: 'Bold', value: 'bold' }
              ]
            },
            span: 10
          },
          ...base
        }
      },
      defaultSchema
    }
  }
}

export function createPayslipPdfmePlugins(defaultFontName = '') {
  return {
    Text: createTextPlugin(defaultFontName),
    Image: image,
    Line: line,
    Rectangle: rectangle,
    Ellipse: ellipse
  }
}

export function blankPdfmeTemplate(orientation = 'landscape') {
  const size = A4[orientation] || A4.landscape
  return {
    basePdf: { width: size.width, height: size.height, padding: [0, 0, 0, 0] },
    schemas: [[]],
    pdfmeVersion: PDFME_VERSION
  }
}

export function normalizeTemplateForOrientation(template, orientation = 'landscape') {
  const next = clone(template || blankPdfmeTemplate(orientation))
  const size = A4[orientation] || A4.landscape
  next.basePdf = { width: size.width, height: size.height, padding: [0, 0, 0, 0] }
  next.schemas = Array.isArray(next.schemas) && Array.isArray(next.schemas[0]) ? [next.schemas[0]] : [[]]
  next.pdfmeVersion = PDFME_VERSION
  return next
}

export function chooseKhmerDesignerFont(availableFontNames = []) {
  const available = new Set(availableFontNames)
  return KHMER_FONT_PRIORITY.find((name) => available.has(name)) || ''
}

export function prepareTemplateForDesignerFonts(
  template,
  orientation = 'landscape',
  availableFontNames = [],
  defaultFontName = ''
) {
  const next = normalizeTemplateForOrientation(template, orientation)
  const available = new Set(availableFontNames)
  const khmerFont = chooseKhmerDesignerFont(availableFontNames)
  const fallback = available.has(defaultFontName)
    ? defaultFontName
    : (khmerFont || availableFontNames[0] || '')

  next.schemas[0].forEach((schema) => {
    if (schema?.type !== 'text') return

    const content = String(schema.content || '')
    const preferred = String(schema.fontName || schema.epayslipFontFamily || '').trim()
    let fontName = preferred && available.has(preferred) ? preferred : fallback

    // If an older design contains Khmer text but was stored as Times New Roman,
    // automatically display it with an installed Khmer-capable font in the designer.
    if (KHMER_RE.test(content) && khmerFont && (!fontName || fontName === 'Times New Roman' || fontName === 'Arial')) {
      fontName = khmerFont
    }

    if (fontName) {
      schema.fontName = fontName
      schema.epayslipFontFamily = fontName
    } else {
      delete schema.fontName
      if (!schema.epayslipFontFamily) schema.epayslipFontFamily = 'Arial'
    }
  })

  return next
}

export function syncTemplateFontMetadata(template, orientation = 'landscape') {
  const next = normalizeTemplateForOrientation(template, orientation)
  next.schemas[0].forEach((schema) => {
    if (schema?.type !== 'text') return
    const fontName = String(schema.fontName || schema.epayslipFontFamily || 'Arial').trim()
    schema.epayslipFontFamily = fontName || 'Arial'
  })
  return next
}

export function addPayrollFieldToTemplate(template, field, orientation = 'landscape') {
  const next = normalizeTemplateForOrientation(template, orientation)
  const page = next.schemas[0]
  const size = A4[orientation] || A4.landscape
  const index = page.length
  const columns = orientation === 'portrait' ? 2 : 3
  const column = index % columns
  const row = Math.floor(index / columns) % 14
  const width = orientation === 'portrait' ? 86 : 84
  const x = 12 + (column * (width + 8))
  const y = Math.min(14 + (row * 11), size.height - 20)
  const label = String(field.label || field.key || 'Field')
  const sampleValue = String(field.sampleValue ?? '')

  page.push({
    name: uid(`field_${slug(field.key)}`),
    type: 'text',
    content: `${label}: ${sampleValue}`,
    position: { x, y },
    width,
    height: 8,
    rotate: 0,
    opacity: 1,
    readOnly: true,
    alignment: 'left',
    verticalAlignment: 'middle',
    fontName: 'Arial',
    fontSize: 9,
    lineHeight: 1.1,
    characterSpacing: 0,
    fontColor: '#111827',
    backgroundColor: '',
    borderColor: '#d1d5db',
    borderWidth: { top: 0, right: 0, bottom: 0, left: 0 },
    padding: { top: 1, right: 1, bottom: 1, left: 1 },
    overflow: 'visible',
    epayslipKind: 'FIELD',
    epayslipFieldKey: String(field.key || ''),
    epayslipFieldLabel: label,
    epayslipSampleValue: sampleValue,
    epayslipShowLabel: true,
    epayslipShowValue: true,
    epayslipLabelText: label,
    epayslipFontFamily: 'Arial',
    epayslipFontWeight: 'normal'
  })

  return next
}

export function countTemplateElements(template) {
  return Array.isArray(template?.schemas?.[0]) ? template.schemas[0].length : 0
}
