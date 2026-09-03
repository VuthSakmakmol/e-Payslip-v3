import { Router } from 'express'
import { PayPeriod } from './PayPeriod.js'
import { AppError } from '../../utils/AppError.js'
import { asyncHandler } from '../../utils/asyncHandler.js'

const router = Router()

router.get('/', asyncHandler(async (req, res) => {
  const items = await PayPeriod.find().sort({ sequence: 1, name: 1 })
  res.json({ items })
}))

router.post('/', asyncHandler(async (req, res) => {
  const item = await PayPeriod.create({
    code: String(req.body.code || '').trim().toUpperCase(),
    name: String(req.body.name || '').trim(),
    sequence: Number(req.body.sequence),
    active: req.body.active !== false
  })
  res.status(201).json(item)
}))

router.put('/:id', asyncHandler(async (req, res) => {
  const item = await PayPeriod.findByIdAndUpdate(req.params.id, {
    code: String(req.body.code || '').trim().toUpperCase(),
    name: String(req.body.name || '').trim(),
    sequence: Number(req.body.sequence),
    active: req.body.active !== false
  }, { new: true, runValidators: true })
  if (!item) throw new AppError('Pay period not found', 404)
  res.json(item)
}))

export default router
