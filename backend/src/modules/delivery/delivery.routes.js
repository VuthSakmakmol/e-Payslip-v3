import { Router } from 'express'
import { DeliveryLog } from './DeliveryLog.js'
import { asyncHandler } from '../../utils/asyncHandler.js'

const router = Router()

router.get('/', asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1)
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100)
  const status = String(req.query.status || '').trim().toUpperCase()
  const filter = status && ['SENT', 'FAILED'].includes(status) ? { status } : {}
  const [items, total] = await Promise.all([
    DeliveryLog.find(filter)
      .populate('payPeriodId', 'name')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    DeliveryLog.countDocuments(filter)
  ])
  res.json({ items, total, page, limit })
}))

export default router
