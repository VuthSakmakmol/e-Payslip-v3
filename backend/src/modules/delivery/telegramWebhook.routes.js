import { Router } from 'express'
import { processTelegramUpdate } from './telegramUpdate.service.js'

const router = Router()

router.post('/webhook', (req, res) => {
  res.sendStatus(200)

  void processTelegramUpdate(req.body).catch((error) => {
    console.error('[telegram:webhook]', error)
  })
})

export default router
