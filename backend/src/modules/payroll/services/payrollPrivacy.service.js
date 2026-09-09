import mongoose from 'mongoose'

/**
 * Privacy migration for the all-transient payroll policy.
 *
 * Older versions persisted LOCAL payroll rows in payrollrecords/payrollbatches.
 * The current policy keeps payroll rows and generated PDFs in memory only for
 * every employee category. On startup we permanently remove those legacy
 * persisted payroll collections and clear obsolete batch references from the
 * privacy-safe audit collections.
 */
export async function purgeLegacyStoredPayrollData() {
  const db = mongoose.connection.db
  if (!db) return { recordsDeleted: 0, batchesDeleted: 0, releaseRefsCleared: 0, deliveryRefsCleared: 0 }

  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((item) => item.name))

  let recordsDeleted = 0
  let batchesDeleted = 0
  let releaseRefsCleared = 0
  let deliveryRefsCleared = 0

  if (existing.has('payrollrecords')) {
    const result = await db.collection('payrollrecords').deleteMany({})
    recordsDeleted = result.deletedCount || 0
  }

  if (existing.has('payrollbatches')) {
    const result = await db.collection('payrollbatches').deleteMany({})
    batchesDeleted = result.deletedCount || 0
  }

  if (existing.has('payrollreleases')) {
    const result = await db.collection('payrollreleases').updateMany(
      { sourceBatchId: { $exists: true } },
      { $unset: { sourceBatchId: '' } }
    )
    releaseRefsCleared = result.modifiedCount || 0
  }

  if (existing.has('deliverylogs')) {
    const result = await db.collection('deliverylogs').updateMany(
      { batchId: { $exists: true } },
      { $unset: { batchId: '' } }
    )
    deliveryRefsCleared = result.modifiedCount || 0
  }

  return { recordsDeleted, batchesDeleted, releaseRefsCleared, deliveryRefsCleared }
}
