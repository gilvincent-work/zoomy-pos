import {getSupabase} from '../lib/supabase';
import {fetchAllPaged} from './paginate';
import {stripLinePrefix} from './catalog-sync';
import {reconstructEntries, type EditEntry, type RawOrderLine, type BundleMatch} from './order-entries';
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

export type RemoteOrdersResult =
  | {ok: true; orders: Transaction[]; prizeClientUuids: string[]}
  | {ok: false};

type OrderRow = {
  client_uuid: string | null;
  subtotal: number | null;
  discount: number | null;
  total: number | null;
  payment_method: string | null;
  status: string | null;
  remarks: string | null;
  event_id: string | null;
  pet_type: string | null;
  created_at: string;
};

type ItemRow = {
  order_id: string;
  product_id: string | null;
  bundle_id: string | null;
  bundle_group: string | null;
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
      .select('id, client_uuid, subtotal, discount, total, payment_method, status, remarks, event_id, pet_type, created_at')
      .order('created_at', {ascending: false})
      .limit(MAX_ORDERS);
    if (ordersErr || !orders) return {ok: false};

    const ids = orders.map((o) => o.id as string);
    if (ids.length === 0) return {ok: true, orders: [], prizeClientUuids: []};

    // Both reads are paged (they outgrew the 1000-row cap) and their errors are
    // checked: a partial items/products fetch would blank out real sales, so fall
    // back to the local list instead of showing truncated data.
    const [itemsRes, productsRes] = await Promise.all([
      fetchAllPaged<ItemRow>((from, to) =>
        sb.from('pos_order_items').select('order_id, product_id, bundle_id, bundle_group, qty, unit_price').in('order_id', ids).order('id', {ascending: true}).range(from, to)),
      fetchAllPaged<{product_id: string; name: string}>((from, to) =>
        sb.from('pos_products').select('product_id, name').order('product_id', {ascending: true}).range(from, to)),
    ]);
    if (!itemsRes.ok || !productsRes.ok) return {ok: false};
    const items = itemsRes.rows;
    const products = productsRes.rows;

    const nameBySku = new Map<string, string>();
    for (const p of products) nameBySku.set(p.product_id as string, p.name as string);

    // An order is a bundle if any of its lines carry a bundle id or bundle group
    // (the picks of a "Buy Any N" ride as grouped product lines). Used for the
    // Bundle badge; the free-item prize is a separate concern (its own badge).
    const bundleOrderIds = new Set<string>();
    const itemsByOrder = new Map<string, TransactionItem[]>();
    for (const it of items as ItemRow[]) {
      if (it.bundle_id || it.bundle_group) bundleOrderIds.add(it.order_id);
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

    // Which orders carry a non-voided "free item won" prize, mapped back to their
    // client_uuid so the Transactions list can badge them across devices. Defensive:
    // a failed/absent read just yields none and never blocks the orders load.
    const uuidById = new Map<string, string>();
    for (const o of orders as (OrderRow & {id: string})[]) {
      if (o.client_uuid) uuidById.set(o.id, o.client_uuid);
    }
    let prizeClientUuids: string[] = [];
    try {
      const prizesRes = await fetchAllPaged<{order_id: string}>((from, to) =>
        sb.from('pos_order_prizes').select('order_id').in('order_id', ids).is('voided_at', null).order('order_id', {ascending: true}).range(from, to));
      if (prizesRes.ok) {
        const uuids = new Set<string>();
        for (const p of prizesRes.rows) {
          const uuid = uuidById.get(p.order_id);
          if (uuid) uuids.add(uuid);
        }
        prizeClientUuids = [...uuids];
      }
    } catch {
      // Prize badge is non-critical; leave it empty on any read failure.
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
        is_bundle: bundleOrderIds.has(o.id),
        status: o.status === 'voided' ? 'voided' : 'completed',
        created_at: o.created_at,
        remarks: o.remarks ?? null,
        event_id: o.event_id ?? null,
        pet_type: (o.pet_type as Transaction['pet_type']) ?? null,
        client_uuid: o.client_uuid ?? null,
        // Sync-tracking columns are local-only; a remote-sourced row carries none.
        synced_at: null,
        void_synced_at: null,
        remarks_synced_at: null,
        items: itemsByOrder.get(o.id) ?? [],
      };
    });
    return {ok: true, orders: remoteOrders, prizeClientUuids};
  } catch {
    return {ok: false};
  }
}

/**
 * Read the non-voided "free item won" prizes for one sale from Coop (pos_order_prizes),
 * so the Transactions detail view can list which items were won on any device. Carries
 * the prize's own client_uuid for deduping against the local rows, the product name
 * (embedded from pos_products), and qty. Fully defensive: returns [] when Supabase is
 * unconfigured/unreachable or the read fails, so it can never block the detail view.
 */
export async function fetchRemoteOrderPrizes(
  clientUuid: string,
): Promise<{client_uuid: string; product_name: string; qty: number}[]> {
  const sb = getSupabase();
  if (!sb) return [];
  try {
    const {data, error} = await sb
      .from('pos_order_prizes')
      .select('client_uuid, qty, pos_products(name), pos_orders!inner(client_uuid)')
      .eq('pos_orders.client_uuid', clientUuid)
      .is('voided_at', null); // pagination-ok: single-order scope
    if (error || !data) return [];
    return (data as unknown as PrizeRow[]).map((r) => {
      // Supabase types an embedded relation as an array; the FK is single so take [0].
      const prod = Array.isArray(r.pos_products) ? r.pos_products[0] : r.pos_products;
      return {
        client_uuid: r.client_uuid ?? '',
        product_name: prod?.name ?? 'Item',
        qty: Number(r.qty ?? 0),
      };
    });
  } catch {
    return [];
  }
}

type PrizeRow = {
  client_uuid: string | null;
  qty: number | null;
  pos_products: {name: string | null} | {name: string | null}[] | null;
};

/**
 * Read recent non-voided free tastes from Coop (pos_free_tastes), so the Free Taste
 * "Recent" tab reflects every device's samplings, not just this one's. Carries the
 * row's own client_uuid for deduping against local rows, the Coop product_id (SKU)
 * and its embedded name, qty, oversold flag, and timestamps. Fully defensive:
 * returns [] when Supabase is unconfigured/unreachable or the read fails, so it can
 * never block the Recent tab (it just falls back to the local list).
 */
export async function fetchRemoteFreeTastes(
  limit = 50,
): Promise<{
  client_uuid: string;
  product_id: string | null;
  product_name: string;
  qty: number;
  oversold: boolean;
  opened_at: string | null;
  synced_at: string | null;
}[]> {
  const sb = getSupabase();
  if (!sb) return [];
  try {
    const {data, error} = await sb
      .from('pos_free_tastes')
      .select('client_uuid, product_id, qty, oversold, opened_at, synced_at, pos_products(name)')
      .is('voided_at', null)
      .order('opened_at', {ascending: false})
      .limit(limit);
    if (error || !data) return [];
    return (data as unknown as FreeTasteRow[]).map((r) => {
      // Supabase types an embedded relation as an array; the FK is single so take [0].
      const prod = Array.isArray(r.pos_products) ? r.pos_products[0] : r.pos_products;
      return {
        client_uuid: r.client_uuid ?? '',
        product_id: r.product_id ?? null,
        product_name: prod?.name ?? 'Item',
        qty: Number(r.qty ?? 0),
        oversold: Boolean(r.oversold),
        opened_at: r.opened_at ?? null,
        synced_at: r.synced_at ?? null,
      };
    });
  } catch {
    return [];
  }
}

type FreeTasteRow = {
  client_uuid: string | null;
  product_id: string | null;
  qty: number | null;
  oversold: boolean | null;
  opened_at: string | null;
  synced_at: string | null;
  pos_products: {name: string | null} | {name: string | null}[] | null;
};

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

/**
 * Unvoid a previously voided sale on Coop by client_uuid (inverse of
 * voidRemoteOrder): restores it to completed and re-applies its inventory. Unlike
 * void, this is online-only — there's no offline queue for it. Returns
 * {ok:false} when Supabase is unconfigured/unreachable or the RPC rejects (e.g.
 * the order isn't voided).
 */
export async function unvoidRemoteOrder(clientUuid: string): Promise<{ok: boolean; error?: string}> {
  const sb = getSupabase();
  if (!sb) return {ok: false, error: 'No connection to Coop'};
  try {
    const {data, error} = await sb.rpc('unvoid_pos_order', {p_client_uuid: clientUuid});
    if (error) return {ok: false, error: error.message};
    if (data && (data as {ok?: boolean}).ok === false) {
      return {ok: false, error: (data as {error?: string}).error ?? 'Unvoid failed'};
    }
    return {ok: true};
  } catch (e) {
    return {ok: false, error: e instanceof Error ? e.message : 'network error'};
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

export type EditOrderPatch = {payment_method?: string; customer_handle?: string | null; pet_type?: string | null; event_id?: string | null};

/**
 * Fetch a synced order's real Coop lines (which carry bundle_group) and rebuild
 * them into editable entries. The POS edit flow is online-only, so it seeds the
 * editor from Coop's authoritative shape rather than the flat local copy (which
 * has no bundle grouping). {ok:false} when unconfigured/unreachable or unknown.
 */
export async function fetchRemoteOrderEntries(
  clientUuid: string,
  defs: BundleMatch[] = [],
): Promise<{ok: true; entries: EditEntry[]} | {ok: false}> {
  const sb = getSupabase();
  if (!sb) return {ok: false};
  try {
    const {data: order, error: oErr} = await sb
      .from('pos_orders').select('id,total').eq('client_uuid', clientUuid).maybeSingle();
    if (oErr || !order) return {ok: false};
    const {data: items, error} = await sb
      .from('pos_order_items')
      .select('product_id,bundle_id,bundle_group,qty,unit_price,line_total')
      .eq('order_id', (order as {id: string}).id); // pagination-ok: single-order scope
    if (error || !items) return {ok: false};
    const lines: RawOrderLine[] = (items as ItemRow2[]).map((it) => ({
      product_id: it.product_id ?? null,
      bundle_id: it.bundle_id ?? null,
      bundle_group: it.bundle_group ?? null,
      qty: Number(it.qty ?? 0),
      unit_price: Number(it.unit_price ?? 0),
      line_total: Number(it.line_total ?? 0),
    }));
    return {ok: true, entries: reconstructEntries(lines, Number((order as {total: number}).total ?? 0), defs)};
  } catch {
    return {ok: false};
  }
}

type ItemRow2 = {
  product_id: string | null;
  bundle_id: string | null;
  bundle_group: string | null;
  qty: number | null;
  unit_price: number | null;
  line_total: number | null;
};

/**
 * Edit a synced sale on Coop in place via edit_pos_order (reverses + re-applies
 * inventory, recomputes the total, enforces each bundle's rules). Online-only —
 * returns {ok:false} when Supabase is unconfigured/unreachable or the RPC rejects
 * (a voided order, or a bundle that breaks its rule). Entries carry Coop SKUs +
 * bundle ids, not local ids.
 */
export async function editRemoteOrder(
  clientUuid: string,
  patch: EditOrderPatch,
  entries: EditEntry[],
): Promise<{ok: boolean; error?: string}> {
  const sb = getSupabase();
  if (!sb) return {ok: false, error: 'No connection to Coop'};

  const p_patch: Record<string, string> = {};
  if (patch.payment_method) p_patch.payment_method = patch.payment_method;
  if (patch.customer_handle !== undefined) p_patch.customer_handle = patch.customer_handle ?? '';
  // '' clears pet_type back to untagged; a value sets it. Only sent when provided.
  if (patch.pet_type !== undefined) p_patch.pet_type = patch.pet_type ?? '';
  // '' moves the sale to no event (untagged); a value reassigns it. Only when provided.
  if (patch.event_id !== undefined) p_patch.event_id = patch.event_id ?? '';

  try {
    const {data, error} = await sb.rpc('edit_pos_order', {p_client_uuid: clientUuid, p_patch, p_entries: entries});
    if (error) return {ok: false, error: error.message};
    if (data && (data as {ok?: boolean}).ok === false) {
      return {ok: false, error: (data as {error?: string}).error ?? 'Edit failed'};
    }
    return {ok: true};
  } catch (e) {
    return {ok: false, error: e instanceof Error ? e.message : 'network error'};
  }
}
