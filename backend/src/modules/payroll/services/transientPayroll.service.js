import crypto from 'node:crypto'
import { env } from '../../../config/env.js'
import { AppError } from '../../../utils/AppError.js'

const sessions = new Map()
const ttlMs = env.TRANSIENT_PAYROLL_TTL_MINUTES * 60 * 1000

function cleanupExpired() {
  const now = Date.now()
  for (const [id, session] of sessions.entries()) {
    if (session.expiresAt <= now) sessions.delete(id)
  }
}

const timer = setInterval(cleanupExpired, Math.min(ttlMs, 60_000))
timer.unref?.()

export function createTransientPayroll(payload) {
  cleanupExpired()
  const id = crypto.randomUUID()
  const now = Date.now()
  const session = {
    id,
    ...payload,
    approved: false,
    createdAt: new Date(now),
    expiresAt: now + ttlMs
  }
  sessions.set(id, session)
  return session
}

export function getTransientPayroll(id) {
  cleanupExpired()
  const session = sessions.get(id)
  if (!session) throw new AppError('Temporary payroll session expired or not found. Import the payroll file again.', 404)
  return session
}

export function approveTransientPayroll(id, userId) {
  const session = getTransientPayroll(id)
  session.approved = true
  session.approvedBy = userId
  session.approvedAt = new Date()
  return session
}

export function destroyTransientPayroll(id) {
  sessions.delete(id)
}
