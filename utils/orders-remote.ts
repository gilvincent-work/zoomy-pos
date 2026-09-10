import {getSupabase} from '../lib/supabase';
import {stripLinePrefix} from './catalog-sync';
import type {PaymentMethod, Transaction, TransactionItem} from '../db/transactions';

/**
 * Read completed sales back from Coop (pos_orders) so the Transactions screen
 * can show every device's sales, not just this one's. This is the read half that
 * mirrors the sales push: local rows stay the rich source (cash tendered, proof,
 * remarks), and these fill in the sales made on other devices.
 *
 * Result is `{ok: false}` when Supabase is unconfigured/unreachable/the query
 * failed — the screen then falls back to the local list, keeping it usable
 * offline. `{ok: true, orders: []}` is a real, distinct outcome (Coop genuinely
 * has zero orders) — callers use that to safely prune local rows Coop no longer
 * has; collapsing it with the failure case would risk deleting sales just
 * because a fetch failed.
 */

const MAX_ORDERS = 500; // bound the pull; the list paginates visually anyway

export type RemoteOrdersResult = {ok: true; orders: Transaction[]} | {ok: false};

type OrderRow = {
  client_uuid: string | null;
  subtotal: number | null;
  discount: number | null;
  total: number | null;
  payment_method: string | null;
  status: string | null;
  remarks: string | null;
  created_at: string;
};

type ItemRow = {
  order_id: string;
  product_id: string | null;
  qty: number | null;
  unit_price: number | null;
};

export async function fetchRemoteOrders(): Promise<RemoteOrdersResult> {
  const sb = getSupabase();
  if (!sb) return {ok: false};

  try {
    // pos_orders keyed for dedup by client_uuid; join items by the order id.
    const {data: orders, error: ordersErr} = await sb
      .from('pos_orders')
      .select('id, client_uuid, subtotal, discount, total, payment_method, status, remarks, created_at')
      .order('created_at', {ascending: false})
      .limit(MAX_ORDERS);
    if (ordersErr || !orders) return {ok: false};

    const ids = orders.map((o) => o.id as string);
    if (ids.length === 0) return {ok: true, orders: []};

    const [{data: items}, {data: products}] = await Promise.all([
      sb.from('pos_order_items').select('order_id, product_id, qty, unit_price').in('order_id', ids),
      sb.from('pos_products').select('product_id, name'),
    ]);

    const nameBySku = new Map<string, string>();
    for (const p of products ?? []) nameBySku.set(p.product_id as string, p.name as string);

    const itemsByOrder = new Map<string, TransactionItem[]>();
    for (const it of (items ?? []) as ItemRow[]) {
      const sku = it.product_id ?? '';
      const rawName = (sku && nameBySku.get(sku)) || sku || 'Item';
      const line: TransactionItem = {
        id: 0,
        transaction_id: 0,
        product_id: null,
        product_name: stripLinePrefix(rawName),
        price: Number(it.unit_price ?? 0),
        quantity: Number(it.qty ?? 0),
        variant_id: null,
        variant_name: null,
      };
      const arr = itemsByOrder.get(it.order_id) ?? [];
      arr.push(line);
      itemsByOrder.set(it.order_id, arr);
    }

    const remoteOrders = (orders as (OrderRow & {id: string})[]).map((o): Transaction => {
      const total = Number(o.total ?? 0);
      return {
        id: 0, // placeholder; the merge assigns a stable negative id per remote row
        total,
        cash_tendered: total,
        change: 0,
        payment_method: (o.payment_method || 'cash') as PaymentMethod,
        ref_number: null,
        proof_photo_uri: null,
        customer_handle: null,
        is_bundle: false,
        status: o.status === 'voided' ? 'voided' : 'completed',
        created_at: o.created_at,
        remarks: o.remarks ?? null,
        client_uuid: o.client_uuid ?? null,
        // Sync-tracking columns are local-only; a remote-sourced row carries none.
        synced_at: null,
        void_synced_at: null,
        remarks_synced_at: null,
        items: itemsByOrder.get(o.id) ?? [],
      };
    });
    return {ok: true, orders: remoteOrders};
  } catch {
    return {ok: false};
  }
}

/**
 * Void a sale on Coop by its shared client_uuid, so the void shows on every
 * device. Best-effort: returns false when Supabase is unconfigured/unreachable
 * or the order isn't on Coop yet (e.g. an unsynced offline sale) — the caller
 * still voids the local copy.
 */
export async function voidRemoteOrder(clientUuid: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  try {
    const {error} = await sb.rpc('void_pos_order', {p_client_uuid: clientUuid});
    return !error;
  } catch {
    return false;
  }
}

/** Set (or clear, with null) a sale's remarks on Coop by client_uuid. Best-effort. */
export async function setRemoteOrderRemarks(clientUuid: string, remarks: string | null): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  try {
    const {error} = await sb.rpc('set_pos_order_remarks', {p_client_uuid: clientUuid, p_remarks: remarks});
    return !error;
  } catch {
    return false;
  }
}
