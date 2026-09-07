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
        const x = Number(element.xMm || 0) * MM_TO_PT
        const y = Number(element.yMm || 0) * MM_TO_PT
        const width = Math.max(Number(element.widthMm || 0) * MM_TO_PT, 0)
        const height = Math.max(Number(element.heightMm || 0) * MM_TO_PT, 0)
        const fontSize = Number(element.fontSize || 10)
        const borderColor = validHex(element.borderColor, '#111827')
        const textColor = validHex(element.textColor, '#111827')
        const backgroundColor = validHex(element.backgroundColor, '')

        if (element.type === 'LINE') {
          doc
            .save()
            .lineWidth(Math.max(Number(element.borderWidth || 1), 0.5))
            .strokeColor(borderColor)
            .moveTo(x, y)
            .lineTo(x + width, y)
            .stroke()
            .restore()
          continue
        }

        if (element.type === 'RECTANGLE') {
          doc.save()
          if (backgroundColor) doc.rect(x, y, width, height).fill(backgroundColor)
          if (Number(element.borderWidth || 0) > 0) {
            doc
              .lineWidth(Number(element.borderWidth))
              .strokeColor(borderColor)
              .rect(x, y, width, height)
              .stroke()
          }
          doc.restore()
          continue
        }

        if (backgroundColor) {
          doc.save().rect(x, y, width, height).fill(backgroundColor).restore()
        }
        if (Number(element.borderWidth || 0) > 0) {
          doc
            .save()
            .lineWidth(Number(element.borderWidth))
            .strokeColor(borderColor)
            .rect(x, y, width, height)
            .stroke()
            .restore()
        }

        const text = String(
          element.type === 'FIELD'
            ? formatField(payrollValues, element, context)
            : (element.text || '')
        )

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

      doc.end()
    } catch (error) {
      reject(error)
      try { doc.end() } catch {}
    }
  })
}
