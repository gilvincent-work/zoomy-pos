import { getSupabase } from '../lib/supabase';
import { getDatabase } from '../db/database';
import { markSynced } from './sync-status';
import {
  getPendingFreeTastes,
  markFreeTasteSynced,
  type FreeTaste,
} from '../db/free-tastes';

/** Resolve a product's current Coop SKU by local id, so a row captured before its
 *  first catalog sync self-heals once the SKU lands (mirrors sales-sync skuMapFor). */
async function resolveSku(row: { product_sku: string | null; product_local_id: number | null }): Promise<string | null> {
  if (row.product_sku) return row.product_sku;
  if (row.product_local_id == null) return null;
  const db = await getDatabase();
  const r = await db.getFirstAsync<{ sku: string | null }>('SELECT sku FROM products WHERE id = ?', [row.product_local_id]);
  return r?.sku ?? null;
}

/**
 * Free-taste push. A free taste is durable in local SQLite the moment it's
 * written; this pushes it up to Coop via record_free_taste (deducts the Event
 * FEFO, logs reason='free_taste', flags oversells). Every push carries the row's
 * own client_uuid, which the RPC enforces for idempotency, so a retry — including
 * one racing the inline push from the form — is always a safe no-op. Mirrors the
 * sales push pattern (utils/sales-sync.ts): best-effort, no-op when Supabase is
 * unconfigured/offline, and marks the "last synced" time on success.
 */

/** Push one free taste to Coop. `oversold` reflects the RPC's flag so the caller
 *  can warn. Returns ok:false (row stays pending) when unconfigured/unreachable,
 *  the product has no Coop SKU, or the RPC rejects. */
export async function pushFreeTaste(
  row: FreeTaste
): Promise<{ ok: boolean; oversold?: boolean; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase not configured' };
  // record_free_taste needs the Coop SKU as product_id; a locally-created product
  // with no SKU can't be written to a catalog that doesn't know it. Re-resolve at
  // push time so a row written before its first catalog sync self-heals later
  // (mirrors the sale push, which looks up the SKU fresh).
  const sku = await resolveSku(row);
  if (!sku) return { ok: false, error: 'Product has no Coop SKU' };

  const p: Record<string, unknown> = {
    client_uuid: row.client_uuid,
    batch_id: row.batch_id,
    product_id: sku,
    qty: row.qty,
    note: row.note,
    created_by: row.created_by ?? 'pos',
    device_id: row.device_id ?? 'pos',
  };
  if (row.opened_at) p.opened_at = row.opened_at;

  try {
    const { data, error } = await sb.rpc('record_free_taste', { p });
    if (error) return { ok: false, error: error.message };
    await markSynced();
    return { ok: true, oversold: Boolean((data as { oversold?: boolean } | null)?.oversold) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network error' };
  }
}

/** Drain pending free tastes to Coop, marking each synced on success. Returns
 *  pushed/failed. A best-effort audit row (pos_sync_log) is logged once per drain
 *  that pushed anything, mirroring the catalog pull. */
export async function drainFreeTastes(): Promise<{ pushed: number; failed: number }> {
  let pushed = 0;
  let failed = 0;
  const pending = await getPendingFreeTastes();
  for (const row of pending) {
    const res = await pushFreeTaste(row);
    if (res.ok) {
      await markFreeTasteSynced(row.client_uuid);
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
        p_entity: 'free_taste',
        p_summary: { count: pushed },
        p_device: 'pos',
      });
    } catch {
      // ignore — audit trail is best-effort, never fails the drain
    }
  }

  return { pushed, failed };
}
