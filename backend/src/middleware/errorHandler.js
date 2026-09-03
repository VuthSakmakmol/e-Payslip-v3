import { AppError } from '../utils/AppError.js'

export function notFound(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` })
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err)

  let status = err instanceof AppError ? err.statusCode : (err.statusCode || 500)
  if (err?.code === 11000) status = 409
  if (err?.name === 'ValidationError' && status === 500) status = 400
  const payload = {
    message: err?.code === 11000 ? 'Duplicate value already exists' : (err.message || 'Internal server error')
  }

  if (err.details !== undefined) payload.details = err.details
  if (process.env.NODE_ENV !== 'production' && status >= 500) payload.stack = err.stack

  if (status >= 500) console.error(err)
  res.status(status).json(payload)
}
