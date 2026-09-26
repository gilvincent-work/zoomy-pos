import { getDatabase } from './database';

/**
 * Free item (spin-a-wheel prize). A real product given away free, attached to a
 * sale. Recorded separately from the sale's paid lines (never sent through
 * apply_pos_order), so a normal sale is unaffected. order_client_uuid ties the
 * prize to its sale; add_order_prize resolves the order by it, so a prize can
 * only reach Coop after its sale has (the outbox drains sales first, then prizes).
 * See db/schema.ts order_prizes and utils/order-prizes-sync.ts.
 */

export type OrderPrize = {
  client_uuid: string;
  order_client_uuid: string;
  product_local_id: number | null;
  product_sku: string | null;
  product_name: string;
  qty: number;
  note: string | null;
  created_by: string | null;
  device_id: string | null;
  won_at: string | null;
  /** Set only once pushOrderPrize() confirms Coop has this row; null = not synced. */
  synced_at: string | null;
};

/** Insert one durable prize row (synced_at null so the outbox pushes it). */
export async function insertOrderPrize(data: {
  clientUuid: string;
  orderClientUuid: string;
  productLocalId?: number | null;
  productSku?: string | null;
  productName: string;
  qty: number;
  note?: string | null;
  createdBy?: string | null;
  deviceId?: string | null;
  wonAt?: string | null;
}): Promise<void> {
  const db = await getDatabase();
  const wonAt = data.wonAt ?? new Date().toISOString();
  await db.runAsync(
    'INSERT INTO order_prizes (client_uuid, order_client_uuid, product_local_id, product_sku, product_name, qty, note, created_by, device_id, won_at, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)',
    [
      data.clientUuid,
      data.orderClientUuid,
      data.productLocalId ?? null,
      data.productSku ?? null,
      data.productName,
      data.qty,
      data.note ?? null,
      data.createdBy ?? null,
      data.deviceId ?? null,
      wonAt,
    ]
  );
}

/** Prizes still owing Coop a push, oldest first (drained in order, after sales). */
export async function getPendingOrderPrizes(): Promise<OrderPrize[]> {
  const db = await getDatabase();
  return db.getAllAsync<OrderPrize>(
    'SELECT * FROM order_prizes WHERE synced_at IS NULL ORDER BY won_at ASC'
  );
}

/** Marks a prize confirmed on Coop once pushOrderPrize() succeeds. */
export async function markOrderPrizeSynced(clientUuid: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE order_prizes SET synced_at = ? WHERE client_uuid = ?',
    [new Date().toISOString(), clientUuid]
  );
}

/** Count of prizes not yet confirmed on Coop (feeds the "N pending" marker). */
export async function countPendingOrderPrizes(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM order_prizes WHERE synced_at IS NULL'
  );
  return row?.n ?? 0;
}
