import { Router } from 'express'
import { PayslipDesign } from './PayslipDesign.js'
import { getPayslipDesignerFields } from './payslipDesignerFields.js'
import { createDefaultPayslipDesign } from './defaultPayslipDesign.js'
import { getPayslipFontCatalog } from './payslipFonts.service.js'
import { AppError } from '../../utils/AppError.js'
import { asyncHandler } from '../../utils/asyncHandler.js'

const router = Router()

function cleanName(value, fallback = 'Payslip Design') {
  return String(value || fallback).trim() || fallback
}

function cleanOrientation(value) {
  return value === 'portrait' ? 'portrait' : 'landscape'
}

router.get('/fields', (req, res) => {
  res.json({ items: getPayslipDesignerFields() })
})

router.get('/fonts', (req, res) => {
  res.json({ items: getPayslipFontCatalog() })
})

router.get('/default-design', (req, res) => {
  res.json({ item: createDefaultPayslipDesign() })
})

router.get('/designs', asyncHandler(async (req, res) => {
  const items = await PayslipDesign.find()
    .sort({ active: -1, updatedAt: -1 })
    .lean()
  res.json({ items })
}))

router.get('/designs/active', asyncHandler(async (req, res) => {
  const design = await PayslipDesign.findOne({ active: true }).sort({ updatedAt: -1 })
  res.json({ item: design })
}))

router.get('/designs/:id', asyncHandler(async (req, res) => {
  const item = await PayslipDesign.findById(req.params.id)
  if (!item) throw new AppError('Payslip design not found', 404)
  res.json({ item })
}))

router.post('/designs', asyncHandler(async (req, res) => {
  const count = await PayslipDesign.countDocuments()
  const shouldActivate = count === 0 || req.body.active === true

  if (shouldActivate) {
    await PayslipDesign.updateMany({}, { $set: { active: false } })
  }

  const item = await PayslipDesign.create({
    name: cleanName(req.body.name),
    pageSize: 'A4',
    pageOrientation: cleanOrientation(req.body.pageOrientation),
    active: shouldActivate,
    elements: Array.isArray(req.body.elements) ? req.body.elements : [],
    createdBy: req.user._id,
    updatedBy: req.user._id
  })

  res.status(201).json(item)
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

  existing.name = cleanName(req.body.name, existing.name)
  existing.pageSize = 'A4'
  existing.pageOrientation = cleanOrientation(req.body.pageOrientation)
  existing.active = nextActive
  existing.elements = Array.isArray(req.body.elements) ? req.body.elements : []
  existing.updatedBy = req.user._id
  await existing.save()

  res.json(existing)
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

  res.json(design)
}))

router.post('/designs/:id/duplicate', asyncHandler(async (req, res) => {
  const source = await PayslipDesign.findById(req.params.id).lean()
  if (!source) throw new AppError('Payslip design not found', 404)

  const item = await PayslipDesign.create({
    name: cleanName(req.body.name, `${source.name} Copy`),
    pageSize: 'A4',
    pageOrientation: source.pageOrientation,
    active: false,
    elements: (source.elements || []).map((element) => {
      const copy = { ...element }
      delete copy._id
      return copy
    }),
    createdBy: req.user._id,
    updatedBy: req.user._id
  })

  res.status(201).json(item)
}))

router.delete('/designs/:id', asyncHandler(async (req, res) => {
  const design = await PayslipDesign.findById(req.params.id)
  if (!design) throw new AppError('Payslip design not found', 404)
  if (design.active) throw new AppError('The design currently in use cannot be deleted', 409)

  await design.deleteOne()
  res.json({ ok: true })
}))

export default router
