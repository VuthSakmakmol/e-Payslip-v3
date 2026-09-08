import crypto from 'node:crypto'
import PDFDocument from 'pdfkit'
import { PAYROLL_FIELD_BY_KEY } from '../payroll/constants/companyPayrollLayout.js'
import { PAYSLIP_SYSTEM_FIELD_BY_KEY } from './payslipDesignerFields.js'
import { resolvePayslipFont } from './payslipFonts.service.js'
import { AppError } from '../../utils/AppError.js'

const MM_TO_PT = 72 / 25.4
const PX_TO_PT = 72 / 96
const A4_PORTRAIT = { width: 210 * MM_TO_PT, height: 297 * MM_TO_PT }
const A4_LANDSCAPE = { width: 297 * MM_TO_PT, height: 210 * MM_TO_PT }

function pageSize(design) {
  return design?.pageOrientation === 'portrait' ? A4_PORTRAIT : A4_LANDSCAPE
}

function valueObject(values, key) {
  if (!values) return null
  if (typeof values.get === 'function') return values.get(key) || null
  return values[key] || null
}

function systemValue(context, key) {
  const now = context?.generatedOn instanceof Date ? context.generatedOn : new Date()
  if (key === 'system.periodLabel') return context?.periodLabel || context?.monthYear || ''
  if (key === 'system.monthYear') return context?.monthYear || context?.periodLabel || ''
  if (key === 'system.payPeriod') return context?.payPeriod || ''
  if (key === 'system.generatedOn') {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).format(now).replace(',', '')
  }
  return ''
}

function rawFieldValue(values, element, context) {
  if (PAYSLIP_SYSTEM_FIELD_BY_KEY.has(element.fieldKey)) {
    return {
      text: systemValue(context, element.fieldKey),
      field: PAYSLIP_SYSTEM_FIELD_BY_KEY.get(element.fieldKey)
    }
  }

  const value = valueObject(values, element.fieldKey)
  const field = PAYROLL_FIELD_BY_KEY.get(element.fieldKey)
  if (!value) return { text: '', field }

  return {
    text: String(value.raw ?? value.decimal?.toString?.() ?? value.decimal ?? ''),
    field
  }
}

function formatField(values, element, context) {
  const { text, field } = rawFieldValue(values, element, context)
  const showLabel = element.showLabel === true
  const showValue = element.showValue !== false
  const label = String(element.labelText || field?.label || element.fieldKey || '').trim()

  if (showLabel && showValue) return `${label}: ${text}`
  if (showLabel) return label
  if (showValue) return text
  return ''
}

function pdfOptions(design, password) {
  const size = pageSize(design)
  const options = {
    size: [size.width, size.height],
    margin: 0,
    autoFirstPage: true,
    compress: true
  }

  if (password) {
    options.pdfVersion = '1.7ext3'
    options.userPassword = String(password)
    options.ownerPassword = crypto.randomBytes(24).toString('hex')
    options.permissions = {
      printing: 'lowResolution',
      modifying: false,
      copying: false,
      annotating: false,
      fillingForms: false,
      contentAccessibility: true,
      documentAssembly: false
    }
  }

  return options
}

function validHex(value, fallback) {
  const text = String(value || '').trim()
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text : fallback
}

function finite(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function box(value, fallback = 0) {
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

function dataUriBuffer(value) {
  const match = /^data:image\/(?:png|jpeg);base64,([a-zA-Z0-9+/=\r\n]+)$/i.exec(String(value || ''))
  if (!match) return null
  try {
    return Buffer.from(match[1].replace(/\s+/g, ''), 'base64')
  } catch {
    return null
  }
}

function schemaOf(element) {
  const value = element?.pdfmeSchema
  if (!value) return null
  if (typeof value.toObject === 'function') return value.toObject()
  return value
}

function withElementTransform(doc, element, x, y, width, height, draw) {
  const schema = schemaOf(element)
  const rotation = finite(schema?.rotate ?? element.rotation, 0)
  const opacity = Math.min(Math.max(finite(schema?.opacity ?? element.opacity, 1), 0), 1)

  doc.save()
  if (opacity < 1) doc.opacity(opacity)
  if (rotation) doc.rotate(rotation, { origin: [x + width / 2, y + height / 2] })
  try {
    draw()
  } finally {
    doc.restore()
  }
}

function applyTextFont(doc, element, schema) {
  const fontFamily = String(schema?.fontName || schema?.epayslipFontFamily || element.fontFamily || 'Times New Roman')
  const fontWeight = String(schema?.epayslipFontWeight || element.fontWeight || 'normal') === 'bold' ? 'bold' : 'normal'
  doc.font(resolvePayslipFont(fontFamily, fontWeight))
}

function fittedFontSize(doc, text, width, height, schema, fallback) {
  const dynamic = schema?.dynamicFontSize
  if (!dynamic || typeof dynamic !== 'object') return fallback

  const min = Math.max(finite(dynamic.min, 5), 1)
  const max = Math.max(finite(dynamic.max, fallback), min)
  const fit = dynamic.fit === 'vertical' ? 'vertical' : 'horizontal'
  let size = max

  while (size > min) {
    doc.fontSize(size)
    const tooLarge = fit === 'vertical'
      ? doc.heightOfString(text, { width: Math.max(width, 1), lineGap: 0 }) > Math.max(height, 1)
      : doc.widthOfString(text, { characterSpacing: Math.max(finite(schema?.characterSpacing, 0), 0) }) > Math.max(width, 1)
    if (!tooLarge) break
    size -= 0.5
  }
  return Math.max(size, min)
}

function drawBorder(doc, x, y, width, height, borderWidthMm, borderColor, radiusMm = 0) {
  const widths = box(borderWidthMm, 0)
  const uniformMm = Math.max(widths.top, widths.right, widths.bottom, widths.left)
  if (uniformMm <= 0) return

  doc.lineWidth(uniformMm * MM_TO_PT).strokeColor(borderColor)
  if (radiusMm > 0) doc.roundedRect(x, y, width, height, radiusMm * MM_TO_PT).stroke()
  else doc.rect(x, y, width, height).stroke()
}

function drawPdfmeText(doc, element, text, x, y, width, height, schema) {
  const fontColor = validHex(schema?.fontColor, validHex(element.textColor, '#111827'))
  const background = validHex(schema?.backgroundColor, validHex(element.backgroundColor, ''))
  const borderColor = validHex(schema?.borderColor, validHex(element.borderColor, '#111827'))
  const paddingMm = box(schema?.padding, Math.max(finite(element.paddingPx, 0), 0) * 25.4 / 96)
  const padding = {
    top: paddingMm.top * MM_TO_PT,
    right: paddingMm.right * MM_TO_PT,
    bottom: paddingMm.bottom * MM_TO_PT,
    left: paddingMm.left * MM_TO_PT
  }

  if (background) doc.rect(x, y, width, height).fill(background)
  drawBorder(doc, x, y, width, height, schema?.borderWidth ?? (Math.max(finite(element.borderWidth, 0), 0) / MM_TO_PT), borderColor)

  const textX = x + padding.left
  const textWidth = Math.max(width - padding.left - padding.right, 0)
  const textHeight = Math.max(height - padding.top - padding.bottom, 0)
  applyTextFont(doc, element, schema)

  const requestedSize = Math.max(finite(schema?.fontSize ?? element.fontSize, 10), 1)
  const fontSize = fittedFontSize(doc, text, textWidth, textHeight, schema, requestedSize)
  doc.fontSize(fontSize)

  const lineHeight = Math.max(finite(schema?.lineHeight ?? element.lineHeight, 1.2), 0.1)
  const lineGap = Math.max(fontSize * (lineHeight - 1), 0)
  const characterSpacing = Math.max(finite(schema?.characterSpacing ?? element.characterSpacing, 0), 0)
  const align = ['left', 'center', 'right', 'justify'].includes(schema?.alignment)
    ? schema.alignment
    : (['left', 'center', 'right'].includes(element.align) ? element.align : 'left')
  const vertical = ['top', 'middle', 'bottom'].includes(schema?.verticalAlignment)
    ? schema.verticalAlignment
    : (['top', 'middle', 'bottom'].includes(element.verticalAlign) ? element.verticalAlign : 'top')

  let textY = y + padding.top
  if (vertical !== 'top' && textHeight > 0) {
    const measured = doc.heightOfString(text, {
      width: textWidth || undefined,
      lineGap,
      characterSpacing,
      align
    })
    if (vertical === 'middle') textY += Math.max((textHeight - measured) / 2, 0)
    if (vertical === 'bottom') textY += Math.max(textHeight - measured, 0)
  }

  doc.fillColor(fontColor).text(text, textX, textY, {
    width: textWidth || undefined,
    height: textHeight || undefined,
    align,
    lineBreak: true,
    ellipsis: false,
    lineGap,
    characterSpacing,
    underline: schema?.underline === true || element.underline === true,
    strike: schema?.strikethrough === true || element.strikethrough === true
  })
}

function drawLegacyText(doc, element, text, x, y, width, height) {
  const fontSize = Number(element.fontSize || 10)
  const borderColor = validHex(element.borderColor, '#111827')
  const textColor = validHex(element.textColor, '#111827')
  const backgroundColor = validHex(element.backgroundColor, '')

  if (backgroundColor) doc.save().rect(x, y, width, height).fill(backgroundColor).restore()
  if (Number(element.borderWidth || 0) > 0) {
    doc
      .save()
      .lineWidth(Number(element.borderWidth))
      .strokeColor(borderColor)
      .rect(x, y, width, height)
      .stroke()
      .restore()
  }

  const padding = Math.max(Number(element.paddingPx ?? 3), 0) * PX_TO_PT
  const textX = x + padding
  const textY = y + padding
  const textWidth = Math.max(width - (padding * 2), 0)
  const textHeight = Math.max(height - (padding * 2), 0)

  doc
    .font(resolvePayslipFont(element.fontFamily || 'Times New Roman', element.fontWeight || 'normal'))
    .fontSize(fontSize)
    .fillColor(textColor)
    .text(text, textX, textY, {
      width: textWidth || undefined,
      height: textHeight || undefined,
      align: ['left', 'center', 'right'].includes(element.align) ? element.align : 'left',
      lineBreak: false,
      ellipsis: false
    })
}

export async function renderPayslipPdf({ design, payrollValues, password = '', context = {} }) {
  if (!design) throw new AppError('No payslip design is available', 400)

  return new Promise((resolve, reject) => {
    const chunks = []
    const doc = new PDFDocument(pdfOptions(design, password))

    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('error', reject)
    doc.on('end', () => resolve(Buffer.concat(chunks)))

    try {
      const elements = [...(design.elements || [])]
        .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0))

      for (const element of elements) {
        const schema = schemaOf(element)
        const x = Number(element.xMm || 0) * MM_TO_PT
        const y = Number(element.yMm || 0) * MM_TO_PT
        const width = Math.max(Number(element.widthMm || 0) * MM_TO_PT, 0)
        const height = Math.max(Number(element.heightMm || 0) * MM_TO_PT, 0)

        if (element.type === 'IMAGE') {
          const image = dataUriBuffer(schema?.content || element.imageData)
          if (!image) continue
          withElementTransform(doc, element, x, y, width, height, () => {
            doc.image(image, x, y, {
              fit: [Math.max(width, 1), Math.max(height, 1)],
              align: 'center',
              valign: 'center'
            })
          })
          continue
        }

        if (element.type === 'LINE') {
          withElementTransform(doc, element, x, y, width, height, () => {
            const isPdfme = schema?.type === 'line'
            const thickness = isPdfme
              ? Math.max(finite(schema.height, 0.5) * MM_TO_PT, 0.25)
              : Math.max(Number(element.borderWidth || 1), 0.5)
            const lineColor = validHex(isPdfme ? schema.color : element.borderColor, '#111827')
            const lineY = isPdfme ? y + (height / 2) : y
            doc
              .lineWidth(thickness)
              .strokeColor(lineColor)
              .moveTo(x, lineY)
              .lineTo(x + width, lineY)
              .stroke()
          })
          continue
        }

        if (element.type === 'RECTANGLE' || element.type === 'ELLIPSE') {
          withElementTransform(doc, element, x, y, width, height, () => {
            const isPdfme = schema?.type === 'rectangle' || schema?.type === 'ellipse'
            const isEllipse = element.type === 'ELLIPSE' || schema?.type === 'ellipse'
            const backgroundColor = validHex(isPdfme ? schema.color : element.backgroundColor, '')
            const borderColor = validHex(isPdfme ? schema.borderColor : element.borderColor, '#111827')
            const radiusMm = Math.max(finite(isPdfme ? schema.radius : element.radiusMm, 0), 0)
            const borderMm = isPdfme
              ? Math.max(finite(schema.borderWidth, 0), 0)
              : Math.max(finite(element.borderWidth, 0) / MM_TO_PT, 0)

            if (backgroundColor) {
              if (isEllipse) doc.ellipse(x + width / 2, y + height / 2, width / 2, height / 2).fill(backgroundColor)
              else if (radiusMm > 0) doc.roundedRect(x, y, width, height, radiusMm * MM_TO_PT).fill(backgroundColor)
              else doc.rect(x, y, width, height).fill(backgroundColor)
            }
            if (borderMm > 0) {
              doc.lineWidth(borderMm * MM_TO_PT).strokeColor(borderColor)
              if (isEllipse) doc.ellipse(x + width / 2, y + height / 2, width / 2, height / 2).stroke()
              else if (radiusMm > 0) doc.roundedRect(x, y, width, height, radiusMm * MM_TO_PT).stroke()
              else doc.rect(x, y, width, height).stroke()
            }
          })
          continue
        }

        const text = String(
          element.type === 'FIELD'
            ? formatField(payrollValues, element, context)
            : (element.text || schema?.content || '')
        )

        withElementTransform(doc, element, x, y, width, height, () => {
          if (schema?.type === 'text') drawPdfmeText(doc, element, text, x, y, width, height, schema)
          else drawLegacyText(doc, element, text, x, y, width, height)
        })
      }

      doc.end()
    } catch (error) {
      reject(error)
      try { doc.end() } catch {}
    }
  })
}
