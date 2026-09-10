import {
  getPendingSyncTransactions,
  getPendingSyncCount,
  markTransactionSynced,
  markVoidSynced,
  markRemarksSynced,
  type Transaction,
} from '../db/transactions';
import { pushSale, type SaleForPush } from './sales-sync';
import { voidRemoteOrder, setRemoteOrderRemarks } from './orders-remote';
import { beginSync, endSync, setPendingCount } from './sync-status';

/**
 * Offline outbox drain. Local SQLite is already the durable record of every
 * sale (written instantly, regardless of connectivity); this closes the loop by
 * retrying the Coop writes that a flaky/absent connection left undone, so no
 * transaction is ever stuck unrecorded on Coop.
 *
 * The "outbox" is not a separate store: it's the local `transactions` rows that
 * still owe Coop a write (see getPendingSyncTransactions). Every push is keyed
 * on the sale's client_uuid, which Coop enforces UNIQUE, so a retry — including
 * one racing the sale's own inline push — is always a safe no-op, never a
 * double-count. This is purely additive: it changes nothing about how a sale is
 * recorded locally or shown to the cashier; it only makes the background sync
 * self-healing instead of one-shot.
 */

/** Rebuild the Coop push payload from a stored local sale, preserving its
 *  original client_uuid (idempotency) and created_at (so a delayed retry lands
 *  in Coop's history at sale time, not retry time). Mirrors the inline call in
 *  app/index.tsx: subtotal = total, no discount. */
export function saleForPushFromTransaction(t: Transaction): SaleForPush {
  return {
    items: t.items.map((ti) => ({
      productId: ti.product_id ?? 0,
      productName: ti.product_name,
      price: ti.price,
      quantity: ti.quantity,
      variantId: ti.variant_id ?? undefined,
      variantName: ti.variant_name ?? undefined,
    })),
    subtotal: t.total,
    discount: null,
    total: t.total,
    paymentMethod: t.payment_method,
    clientUuid: t.client_uuid ?? undefined,
    createdAt: t.created_at,
  };
}

/** Push the current pending count into the sync-status store so the marker
 *  ("N pending") stays honest after any sale/void/remarks change. */
export async function refreshPendingCount(): Promise<void> {
  setPendingCount(await getPendingSyncCount());
}

// Single-flight: launch, the `online` event, the background interval and the
// manual "Sync now" tap can all fire at once. Coop's idempotency makes overlap
// harmless, but a guard avoids redundant work and racing marks.
let draining = false;

export type DrainResult = { pushed: number; failed: number };

/**
 * Drain the outbox once. Reads pending sales oldest-first and, per row: pushes
 * the sale if Coop doesn't have it yet, then (only once the sale is on Coop)
 * pushes a pending void and/or remarks edit. A failure at any step leaves that
 * row pending for the next drain and does not block the other rows.
 */
export async function drainOutbox(): Promise<DrainResult> {
  if (draining) return { pushed: 0, failed: 0 };
  draining = true;
  let pushed = 0;
  let failed = 0;
  try {
    const pending = await getPendingSyncTransactions();
    if (pending.length === 0) return { pushed: 0, failed: 0 };

    beginSync();
    for (const t of pending) {
      const uuid = t.client_uuid;
      if (!uuid) continue; // guarded by the query, but keep TS + logic honest

      // 1. The sale itself. Can't void or annotate an order Coop doesn't have,
      //    so on failure skip the rest of this row and try again next drain.
      let saleOnCoop = t.synced_at != null;
      if (!saleOnCoop) {
        const res = await pushSale(saleForPushFromTransaction(t));
        if (res.ok) {
          await markTransactionSynced(uuid);
          saleOnCoop = true;
          pushed += 1;
        } else {
          failed += 1;
          continue;
        }
      }

      // 2. A void made locally that Coop hasn't confirmed yet.
      if (t.status === 'voided' && t.void_synced_at == null) {
        if (await voidRemoteOrder(uuid)) await markVoidSynced(uuid);
        else failed += 1;
      }

      // 3. A remarks edit (including a clear to null) Coop hasn't confirmed yet.
      if (t.remarks_synced_at == null) {
        if (await setRemoteOrderRemarks(uuid, t.remarks)) await markRemarksSynced(uuid);
        else failed += 1;
      }
    }
    return { pushed, failed };
  } finally {
    draining = false;
    endSync();
    await refreshPendingCount();
  }
}
