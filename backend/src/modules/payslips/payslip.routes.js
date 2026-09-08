import { Router } from 'express'
import { PayslipDesign } from './PayslipDesign.js'
import { getPayslipDesignerFields } from './payslipDesignerFields.js'
import { createDefaultPayslipDesign } from './defaultPayslipDesign.js'
import { getPayslipFontAsset, getPayslipFontCatalog } from './payslipFonts.service.js'
import {
  buildPdfmeTemplateFromLegacyDesign,
  ensureDesignPdfmeTemplate,
  legacyElementsFromPdfmeTemplate,
  normalizePdfmeTemplate
} from './payslipPdfmeAdapter.service.js'
import { AppError } from '../../utils/AppError.js'
import { asyncHandler } from '../../utils/asyncHandler.js'

const router = Router()

function cleanName(value, fallback = 'Payslip Design') {
  return String(value || fallback).trim() || fallback
}

function cleanOrientation(value) {
  return value === 'portrait' ? 'portrait' : 'landscape'
}

function cleanTemplateRevision(value, fallback = 1) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 1 ? Math.floor(number) : fallback
}

function normalizedDesignerPayload(body, fallback = null) {
  const orientation = cleanOrientation(body.pageOrientation ?? fallback?.pageOrientation)
  const hasPdfme = body.pdfmeTemplate && typeof body.pdfmeTemplate === 'object'

  if (hasPdfme) {
    const pdfmeTemplate = normalizePdfmeTemplate(body.pdfmeTemplate, orientation)
    return {
      pageOrientation: orientation,
      designerEngine: 'PDFME',
      pdfmeTemplate,
      elements: legacyElementsFromPdfmeTemplate(pdfmeTemplate, orientation)
    }
  }

  const elements = Array.isArray(body.elements)
    ? body.elements
    : (Array.isArray(fallback?.elements) ? fallback.elements : [])
  const legacy = { pageOrientation: orientation, elements }
  const pdfmeTemplate = buildPdfmeTemplateFromLegacyDesign(legacy)
  return {
    pageOrientation: orientation,
    designerEngine: 'PDFME',
    pdfmeTemplate,
    elements: legacyElementsFromPdfmeTemplate(pdfmeTemplate, orientation)
  }
}

router.get('/fields', (req, res) => {
  res.json({ items: getPayslipDesignerFields() })
})

router.get('/fonts', (req, res) => {
  res.json({ items: getPayslipFontCatalog() })
})

router.get('/fonts/file', (req, res) => {
  const name = String(req.query.name || '').trim()
  const weight = String(req.query.weight || 'normal') === 'bold' ? 'bold' : 'normal'
  const asset = getPayslipFontAsset(name, weight)

  res.setHeader('Content-Type', asset.contentType)
  res.setHeader('Content-Length', String(asset.buffer.length))
  res.setHeader('Cache-Control', 'private, max-age=3600')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.send(asset.buffer)
})

router.get('/default-design', (req, res) => {
  const legacy = createDefaultPayslipDesign()
  res.json({
    item: ensureDesignPdfmeTemplate({
      ...legacy,
      designerEngine: 'PDFME',
      pdfmeTemplate: buildPdfmeTemplateFromLegacyDesign(legacy)
    })
  })
})

router.get('/designs', asyncHandler(async (req, res) => {
  const items = await PayslipDesign.find()
    .sort({ active: -1, updatedAt: -1 })
    .lean()
  res.json({ items: items.map(ensureDesignPdfmeTemplate) })
}))

router.get('/designs/active', asyncHandler(async (req, res) => {
  const design = await PayslipDesign.findOne({ active: true }).sort({ updatedAt: -1 }).lean()
  res.json({ item: design ? ensureDesignPdfmeTemplate(design) : null })
}))

router.get('/designs/:id', asyncHandler(async (req, res) => {
  const item = await PayslipDesign.findById(req.params.id).lean()
  if (!item) throw new AppError('Payslip design not found', 404)
  res.json({ item: ensureDesignPdfmeTemplate(item) })
}))

router.post('/designs', asyncHandler(async (req, res) => {
  const count = await PayslipDesign.countDocuments()
  const shouldActivate = count === 0 || req.body.active === true
  const designer = normalizedDesignerPayload(req.body)

  if (shouldActivate) {
    await PayslipDesign.updateMany({}, { $set: { active: false } })
  }

  const item = await PayslipDesign.create({
    name: cleanName(req.body.name),
    pageSize: 'A4',
    pageOrientation: designer.pageOrientation,
    active: shouldActivate,
    designerEngine: designer.designerEngine,
    templateRevision: cleanTemplateRevision(req.body.templateRevision, 1),
    pdfmeTemplate: designer.pdfmeTemplate,
    elements: designer.elements,
    createdBy: req.user._id,
    updatedBy: req.user._id
  })

  res.status(201).json(ensureDesignPdfmeTemplate(item))
}))

router.put('/designs/:id', asyncHandler(async (req, res) => {
  const existing = await PayslipDesign.findById(req.params.id)
  if (!existing) throw new AppError('Payslip design not found', 404)

  const nextActive = req.body.active === undefined
    ? existing.active
    : req.body.active === true

  if (nextActive) {
    await PayslipDesign.updateMany(
      { _id: { $ne: req.params.id } },
      { $set: { active: false } }
    )
  }

  const designer = normalizedDesignerPayload(req.body, existing.toObject())
  existing.name = cleanName(req.body.name, existing.name)
  existing.pageSize = 'A4'
  existing.pageOrientation = designer.pageOrientation
  existing.active = nextActive
  existing.designerEngine = 'PDFME'
  existing.templateRevision = cleanTemplateRevision(req.body.templateRevision, existing.templateRevision || 1)
  existing.pdfmeTemplate = designer.pdfmeTemplate
  existing.elements = designer.elements
  existing.updatedBy = req.user._id
  await existing.save()

  res.json(ensureDesignPdfmeTemplate(existing))
}))

router.post('/designs/:id/activate', asyncHandler(async (req, res) => {
  const design = await PayslipDesign.findById(req.params.id)
  if (!design) throw new AppError('Payslip design not found', 404)

  await PayslipDesign.updateMany(
    { _id: { $ne: design._id } },
    { $set: { active: false } }
  )

  design.active = true
  design.updatedBy = req.user._id
  await design.save()

  res.json(ensureDesignPdfmeTemplate(design))
}))

router.post('/designs/:id/duplicate', asyncHandler(async (req, res) => {
  const source = await PayslipDesign.findById(req.params.id).lean()
  if (!source) throw new AppError('Payslip design not found', 404)

  const prepared = ensureDesignPdfmeTemplate(source)
  const designer = normalizedDesignerPayload({
    pageOrientation: prepared.pageOrientation,
    pdfmeTemplate: prepared.pdfmeTemplate
  })

  const item = await PayslipDesign.create({
    name: cleanName(req.body.name, `${source.name} Copy`),
    pageSize: 'A4',
    pageOrientation: designer.pageOrientation,
    active: false,
    designerEngine: 'PDFME',
    templateRevision: cleanTemplateRevision(source.templateRevision, 1),
    pdfmeTemplate: designer.pdfmeTemplate,
    elements: designer.elements,
    createdBy: req.user._id,
    updatedBy: req.user._id
  })

  res.status(201).json(ensureDesignPdfmeTemplate(item))
}))

router.delete('/designs/:id', asyncHandler(async (req, res) => {
  const design = await PayslipDesign.findById(req.params.id)
  if (!design) throw new AppError('Payslip design not found', 404)
  if (design.active) throw new AppError('The design currently in use cannot be deleted', 409)

  await design.deleteOne()
  res.json({ ok: true })
}))

export default router
