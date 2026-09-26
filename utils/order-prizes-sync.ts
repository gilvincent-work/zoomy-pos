import { getSupabase } from '../lib/supabase';
import { getDatabase } from '../db/database';
import { markSynced } from './sync-status';
import {
  getPendingOrderPrizes,
  markOrderPrizeSynced,
  type OrderPrize,
} from '../db/order-prizes';

/** Resolve a product's current Coop SKU by local id, so a prize captured before its
 *  first catalog sync self-heals once the SKU lands (mirrors sales-sync skuMapFor). */
async function resolveSku(row: { product_sku: string | null; product_local_id: number | null }): Promise<string | null> {
  if (row.product_sku) return row.product_sku;
  if (row.product_local_id == null) return null;
  const db = await getDatabase();
  const r = await db.getFirstAsync<{ sku: string | null }>('SELECT sku FROM products WHERE id = ?', [row.product_local_id]);
  return r?.sku ?? null;
}

/**
 * Prize push. A prize (spin-a-wheel free item) is durable locally the moment the
 * sale is booked; this pushes it up via add_order_prize (deducts the Event FEFO
 * as reason='free_item', flags oversells). The RPC resolves the order by
 * order_client_uuid, so a prize whose sale hasn't reached Coop yet raises "order
 * not found" — that's expected: the push returns ok:false and the row stays
 * pending until a later drain retries AFTER the sale lands. Idempotent on the
 * prize's own client_uuid. Mirrors the sales push (utils/sales-sync.ts).
 */

/** Push one prize to Coop. Returns ok:false (row stays pending) when
 *  unconfigured/unreachable, the product has no Coop SKU, or the RPC rejects
 *  (including the expected "order not found" while its sale is still unsynced). */
export async function pushOrderPrize(
  row: OrderPrize
): Promise<{ ok: boolean; oversold?: boolean; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase not configured' };
  // add_order_prize needs the Coop SKU as product_id. Re-resolve at push time so a
  // prize written before its first catalog sync self-heals later (mirrors the sale push).
  const sku = await resolveSku(row);
  if (!sku) return { ok: false, error: 'Product has no Coop SKU' };

  const p: Record<string, unknown> = {
    client_uuid: row.client_uuid,
    order_client_uuid: row.order_client_uuid,
    product_id: sku,
    qty: row.qty,
    note: row.note,
    created_by: row.created_by ?? 'pos',
    device_id: row.device_id ?? 'pos',
  };
  if (row.won_at) p.won_at = row.won_at;

  try {
    const { data, error } = await sb.rpc('add_order_prize', { p });
    if (error) return { ok: false, error: error.message };
    await markSynced();
    return { ok: true, oversold: Boolean((data as { oversold?: boolean } | null)?.oversold) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network error' };
  }
}

/**
 * Undo a prize already confirmed on Coop, via void_order_prize (restores the
 * exact Event lots it hit, writes reverse ledger rows, marks it voided). Keyed on
 * the row's client_uuid, which the RPC treats idempotently (a second call on an
 * already-voided row is a safe no-op). Returns ok:false — so the caller keeps the
 * local row and can prompt "reconnect to undo" — when Supabase is unconfigured,
 * unreachable, or the RPC rejects. Mirrors voidFreeTaste in free-tastes-sync.ts.
 */
export async function voidOrderPrize(
  clientUuid: string
): Promise<{ ok: boolean; idempotent?: boolean; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase not configured' };
  try {
    const { data, error } = await sb.rpc('void_order_prize', { p_client_uuid: clientUuid });
    if (error) return { ok: false, error: error.message };
    const res = data as { ok?: boolean; idempotent?: boolean; error?: string } | null;
    if (res?.ok === false) return { ok: false, error: res.error ?? 'void rejected' };
    await markSynced();
    // idempotent = the prize was already voided (e.g. undone on another device), so
    // Coop already restored the lots; the caller must NOT restock again.
    return { ok: true, idempotent: Boolean(res?.idempotent) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network error' };
  }
}

/** Drain pending prizes to Coop, marking each synced on success. MUST run after
 *  the sales drain (a prize needs its order on Coop first). A prize whose sale
 *  isn't on Coop yet fails with "order not found" and stays pending for the next
 *  drain. Returns pushed/failed; logs a best-effort audit row once per drain. */
export async function drainOrderPrizes(): Promise<{ pushed: number; failed: number }> {
  let pushed = 0;
  let failed = 0;
  const pending = await getPendingOrderPrizes();
  for (const row of pending) {
    const res = await pushOrderPrize(row);
    if (res.ok) {
      await markOrderPrizeSynced(row.client_uuid);
      pushed += 1;
    } else {
      failed += 1;
    }
  }

  if (pushed > 0) {
    const sb = getSupabase();
    try {
      await sb?.rpc('record_sync', {
        p_direction: 'push',
        p_entity: 'order_prize',
        p_summary: { count: pushed },
        p_device: 'pos',
      });
    } catch {
      // ignore — audit trail is best-effort, never fails the drain
    }
  }

  return { pushed, failed };
}
