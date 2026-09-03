import { Router } from 'express'
import { PayslipDesign } from './PayslipDesign.js'
import { getPayslipDesignerFields } from './payslipDesignerFields.js'
import { createDefaultPayslipDesign } from './defaultPayslipDesign.js'
import { getPayslipFontCatalog } from './payslipFonts.service.js'
import { AppError } from '../../utils/AppError.js'
import { asyncHandler } from '../../utils/asyncHandler.js'

const router = Router()

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
  const items = await PayslipDesign.find().sort({ active: -1, updatedAt: -1 })
  res.json({ items })
}))

router.get('/designs/active', asyncHandler(async (req, res) => {
  const design = await PayslipDesign.findOne({ active: true }).sort({ updatedAt: -1 })
  res.json({ item: design })
}))

router.post('/designs', asyncHandler(async (req, res) => {
  if (req.body.active) await PayslipDesign.updateMany({}, { $set: { active: false } })
  const item = await PayslipDesign.create({
    name: String(req.body.name || 'Payslip Design').trim(),
    pageSize: 'A4',
    pageOrientation: req.body.pageOrientation === 'portrait' ? 'portrait' : 'landscape',
    active: req.body.active === true,
    elements: Array.isArray(req.body.elements) ? req.body.elements : [],
    createdBy: req.user._id,
    updatedBy: req.user._id
  })
  res.status(201).json(item)
}))

router.put('/designs/:id', asyncHandler(async (req, res) => {
  if (req.body.active) await PayslipDesign.updateMany({ _id: { $ne: req.params.id } }, { $set: { active: false } })
  const item = await PayslipDesign.findByIdAndUpdate(req.params.id, {
    name: String(req.body.name || 'Payslip Design').trim(),
    pageSize: 'A4',
    pageOrientation: req.body.pageOrientation === 'portrait' ? 'portrait' : 'landscape',
    active: req.body.active === true,
    elements: Array.isArray(req.body.elements) ? req.body.elements : [],
    updatedBy: req.user._id
  }, { new: true, runValidators: true })
  if (!item) throw new AppError('Payslip design not found', 404)
  res.json(item)
}))

export default router
