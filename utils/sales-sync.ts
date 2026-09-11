import * as Crypto from 'expo-crypto';
import {getSupabase} from '../lib/supabase';
import {getDatabase} from '../db/database';
import {markSynced} from './sync-status';
import type {InsertItem} from './cart-transaction';
import type {PaymentMethod} from '../db/transactions';

/**
 * Sales push: when online, a completed sale is written up to Coop via the
 * apply_pos_order RPC (records the order + items, decrements stock FEFO server-
 * side, accepts + flags oversells). v1 is online-only (pure write, no offline
 * outbox yet — see COOP_INTEGRATION_PLAN.md Phase 2). Each push still carries a
 * unique client_uuid so a retry can never double-count, which is what lets the
 * durable outbox drop in later without a rewrite.
 */

// A Coop order line is EITHER a product line OR a bundle line (mirrors the
// pos_order_items product/bundle XOR). A bundle line carries the bundle's price
// so bundle revenue is attributed to the bundle, not lost on the order header;
// the picked components still ride along as product lines (at ₱0) so the RPC
// decrements their stock FEFO.
export type OrderItem = {product_id?: string | null; bundle_id?: string | null; qty: number; unit_price: number; line_total: number};

/** A cart bundle reduced to what the push needs: its local preset id (to look
 *  up the Coop bundle_id) and the price to bill. */
export type BundleForPush = {presetId: number | null; price: number};

/**
 * Pure: turn local sale lines into Coop order items, mapping each local product
 * id to its Coop SKU. Lines whose product has no SKU (unknown to Coop) are
 * skipped — they can't be written to a catalog that doesn't know them.
 */
export function buildOrderItems(items: InsertItem[], skuByProductId: Map<number, string>): OrderItem[] {
  const out: OrderItem[] = [];
  for (const it of items) {
    const sku = skuByProductId.get(it.productId);
    if (!sku) continue;
    out.push({product_id: sku, qty: it.quantity, unit_price: it.price, line_total: it.price * it.quantity});
  }
  return out;
}

/**
 * Pure: build the bundle_id lines for a sale. Each cart bundle becomes one line
 * carrying its price, keyed by the Coop bundle_id resolved from its preset.
 * Bundles with no resolvable Coop id (unsynced, or ad-hoc with no preset) are
 * skipped — the sale still records their component product lines, so this
 * degrades to the old behavior (bundle revenue stays on the order header) rather
 * than failing the push.
 */
export function buildBundleOrderItems(bundles: BundleForPush[], bundleIdByPreset: Map<number, string>): OrderItem[] {
  const out: OrderItem[] = [];
  for (const b of bundles) {
    if (b.presetId == null) continue;
    const bundleId = bundleIdByPreset.get(b.presetId);
    if (!bundleId) continue;
    out.push({bundle_id: bundleId, qty: 1, unit_price: b.price, line_total: b.price});
  }
  return out;
}

/** Map local saved-bundle preset ids to their Coop bundle_id (bundle_uuid). */
async function bundleIdMapFor(presetIds: (number | null)[]): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  const unique = Array.from(new Set(presetIds.filter((id): id is number => id != null)));
  if (unique.length === 0) return map;
  const db = await getDatabase();
  const placeholders = unique.map(() => '?').join(',');
  const rows = await db.getAllAsync<{id: number; bundle_uuid: string | null}>(
    `SELECT id, bundle_uuid FROM saved_bundles WHERE id IN (${placeholders})`,
    unique
  );
  for (const r of rows) if (r.bundle_uuid) map.set(r.id, r.bundle_uuid);
  return map;
}

async function skuMapFor(productIds: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  const unique = Array.from(new Set(productIds));
  if (unique.length === 0) return map;
  const db = await getDatabase();
  const placeholders = unique.map(() => '?').join(',');
  const rows = await db.getAllAsync<{id: number; sku: string | null}>(
    `SELECT id, sku FROM products WHERE id IN (${placeholders})`,
    unique
  );
  for (const r of rows) if (r.sku) map.set(r.id, r.sku);
  return map;
}

export type SaleForPush = {
  items: InsertItem[];
  /** Cart bundles in this sale, emitted as bundle_id lines carrying their price.
   *  Omitted by the offline outbox (which can't reconstruct them from local
   *  rows), so offline-retried bundle sales keep the old header-only behavior. */
  bundles?: BundleForPush[];
  subtotal: number;
  discount: number | null;
  total: number;
  paymentMethod?: PaymentMethod;
  /** Optional furbaby / IG handle captured at checkout; stored on Coop's order. */
  customerHandle?: string | null;
  /** Shared idempotency key; reused as the local sale's client_uuid so the
   *  Transactions merge can dedupe this sale against the row pulled from Coop. */
  clientUuid?: string;
  createdAt?: string;
};

/**
 * Write a completed sale to Coop. Returns {ok:false} when Supabase is
 * unconfigured/unreachable or the RPC rejects — the local sale is already saved
 * either way, so the caller just surfaces a sync warning.
 */
export async function pushSale(sale: SaleForPush): Promise<{ok: boolean; error?: string}> {
  const sb = getSupabase();
  if (!sb) return {ok: false, error: 'Supabase not configured'};

  const skuMap = await skuMapFor(sale.items.map((i) => i.productId));
  const productItems = buildOrderItems(sale.items, skuMap);
  const bundleIdMap = await bundleIdMapFor((sale.bundles ?? []).map((b) => b.presetId));
  const bundleItems = buildBundleOrderItems(sale.bundles ?? [], bundleIdMap);
  // Bundle lines first (revenue), then product lines (the ₱0 picks decrement stock).
  const p_items = [...bundleItems, ...productItems];
  if (p_items.length === 0) return {ok: false, error: 'No items map to a Coop SKU'};

  const p_order = {
    client_uuid: sale.clientUuid ?? Crypto.randomUUID(),
    device_id: 'pos',
    cashier: null,
    customer_handle: sale.customerHandle ?? null,
    subtotal: sale.subtotal,
    discount: sale.discount,
    total: sale.total,
    payment_method: sale.paymentMethod ?? 'cash',
    created_at: sale.createdAt ?? new Date().toISOString(),
  };

  try {
    const {error} = await sb.rpc('apply_pos_order', {p_order, p_items});
    if (error) return {ok: false, error: error.message};
  } catch (e) {
    return {ok: false, error: e instanceof Error ? e.message : 'network error'};
  }

  await markSynced();
  return {ok: true};
}
