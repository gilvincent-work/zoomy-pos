import { getDatabase } from './database';

/**
 * Free taste (opened-stock sampling). A cashier opens sellable stock to let pets
 * sample it. Standalone: no customer, no sale. Each row is durable the moment
 * it's written (synced_at null); the outbox pushes it to Coop via record_free_taste,
 * which deducts the Event location and is keyed on client_uuid for idempotency.
 * See db/schema.ts free_tastes and utils/free-tastes-sync.ts.
 */

export type FreeTaste = {
  client_uuid: string;
  batch_id: string | null;
  product_local_id: number | null;
  product_sku: string | null;
  product_name: string;
  qty: number;
  note: string | null;
  created_by: string | null;
  device_id: string | null;
  opened_at: string | null;
  /** Set only once pushFreeTaste() confirms Coop has this row; null = not synced. */
  synced_at: string | null;
};

/** Insert one durable free-taste row (synced_at null so the outbox pushes it). */
export async function insertFreeTaste(data: {
  clientUuid: string;
  batchId?: string | null;
  productLocalId?: number | null;
  productSku?: string | null;
  productName: string;
  qty: number;
  note?: string | null;
  createdBy?: string | null;
  deviceId?: string | null;
  openedAt?: string | null;
}): Promise<void> {
  const db = await getDatabase();
  const openedAt = data.openedAt ?? new Date().toISOString();
  await db.runAsync(
    'INSERT INTO free_tastes (client_uuid, batch_id, product_local_id, product_sku, product_name, qty, note, created_by, device_id, opened_at, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)',
    [
      data.clientUuid,
      data.batchId ?? null,
      data.productLocalId ?? null,
      data.productSku ?? null,
      data.productName,
      data.qty,
      data.note ?? null,
      data.createdBy ?? null,
      data.deviceId ?? null,
      openedAt,
    ]
  );
}

/** Free tastes still owing Coop a push, oldest first (drained in order). */
export async function getPendingFreeTastes(): Promise<FreeTaste[]> {
  const db = await getDatabase();
  return db.getAllAsync<FreeTaste>(
    'SELECT * FROM free_tastes WHERE synced_at IS NULL ORDER BY opened_at ASC'
  );
}

/** Marks a free taste confirmed on Coop once pushFreeTaste() succeeds. */
export async function markFreeTasteSynced(clientUuid: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE free_tastes SET synced_at = ? WHERE client_uuid = ?',
    [new Date().toISOString(), clientUuid]
  );
}

/** Count of free tastes not yet confirmed on Coop (feeds the "N pending" marker). */
export async function countPendingFreeTastes(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM free_tastes WHERE synced_at IS NULL'
  );
  return row?.n ?? 0;
}

/** Read one free-taste row by client_uuid, or null. Undo re-reads this right
 *  before acting so it never trusts a stale synced_at snapshot (the outbox drain
 *  can flip a row to synced between the list load and the tap). */
export async function getFreeTasteByClientUuid(clientUuid: string): Promise<FreeTaste | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<FreeTaste>(
    'SELECT * FROM free_tastes WHERE client_uuid = ?',
    [clientUuid]
  );
  return row ?? null;
}

/**
 * Delete one local free-taste row. Used to undo a misclicked sampling: a pending
 * row is deleted so the outbox never pushes it, and a synced row is deleted after
 * void_free_taste restores it on Coop. Naturally idempotent (deleting an
 * already-gone row is a no-op), so undoing twice can't double-anything.
 */
export async function deleteFreeTaste(clientUuid: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM free_tastes WHERE client_uuid = ?', [clientUuid]);
}

/** Most recent free tastes for display, newest first. */
export async function getRecentFreeTastes(limit = 20): Promise<FreeTaste[]> {
  const db = await getDatabase();
  return db.getAllAsync<FreeTaste>(
    'SELECT * FROM free_tastes ORDER BY opened_at DESC LIMIT ?',
    [limit]
  );
}
