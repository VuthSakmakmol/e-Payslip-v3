import { Router } from 'express'
import { Employee } from '../employees/Employee.js'
import { PayrollRelease } from '../payroll/models/PayrollRelease.js'
import { DeliveryLog } from '../delivery/DeliveryLog.js'
import { asyncHandler } from '../../utils/asyncHandler.js'

const router = Router()

router.get('/', asyncHandler(async (req, res) => {
  const [employees, localEmployees, foreignEmployees, fullReleases, correctionReleases, sent, failed] = await Promise.all([
    Employee.countDocuments({ active: true }),
    Employee.countDocuments({ active: true, staffCategory: 'LOCAL' }),
    Employee.countDocuments({ active: true, staffCategory: 'FOREIGNER' }),
    PayrollRelease.countDocuments({ releaseMode: 'FULL' }),
    PayrollRelease.countDocuments({ releaseMode: 'UPDATE' }),
    DeliveryLog.countDocuments({ status: 'SENT' }),
    DeliveryLog.countDocuments({ status: 'FAILED' })
  ])

  res.json({ employees, localEmployees, foreignEmployees, fullReleases, correctionReleases, sent, failed })
}))

export default router
