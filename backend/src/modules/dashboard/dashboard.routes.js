import { Router } from 'express'
import { Employee } from '../employees/Employee.js'
import { PayrollBatch } from '../payroll/models/PayrollBatch.js'
import { DeliveryLog } from '../delivery/DeliveryLog.js'
import { asyncHandler } from '../../utils/asyncHandler.js'

const router = Router()

router.get('/', asyncHandler(async (req, res) => {
  const [employees, localEmployees, foreignEmployees, readyBatches, releasedBatches, sent, failed] = await Promise.all([
    Employee.countDocuments({ active: true }),
    Employee.countDocuments({ active: true, staffCategory: 'LOCAL' }),
    Employee.countDocuments({ active: true, staffCategory: 'FOREIGNER' }),
    PayrollBatch.countDocuments({ status: 'READY' }),
    PayrollBatch.countDocuments({ status: 'RELEASED' }),
    DeliveryLog.countDocuments({ status: 'SENT' }),
    DeliveryLog.countDocuments({ status: 'FAILED' })
  ])

  res.json({ employees, localEmployees, foreignEmployees, readyBatches, releasedBatches, sent, failed })
}))

export default router
