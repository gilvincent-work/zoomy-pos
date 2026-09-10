import {getSupabase} from '../lib/supabase';
import {applyCatalogUpdate} from '../db/products';
import {markSynced} from './sync-status';

/**
 * Catalog pull: the POS reads Coop's authoritative price + listing from Supabase
 * (pos_products + pos_prices) and updates its local SQLite cache, matched by SKU.
 * This is the read half of sync (Coop edit -> POS tile); the sales push is Phase 2.
 *
 * v1 syncs PRICE and LISTED (active) only. Name, emoji and category/subcategory
 * stay local — the POS tiles are tuned for bazaar-speed recognition (short names +
 * emoji, a locked product decision), and emoji/category are local-only by design.
 * Coop's long canonical names drive the catalog/reporting side, not the tiles.
 * (Whether Coop names should replace tile names is an open PO decision.)
 */

export type RemoteCatalogRow = {
  product_id: string;
  name: string;
  active: boolean;
  price: number | null;
  product_line: string | null;
  category: string | null; // Coop's explicit POS category (authoritative when set)
  subcategory: string | null;
  emoji: string | null; // Coop's tile emoji; used only when the POS inserts a new product
  stock: number; // Coop's on-hand count (pos_inventory); always overwrites locally
};

export type CatalogUpdate = {
  sku: string;
  name: string; // Coop is authoritative for the name; empty is ignored on apply
  price: number | null; // null = leave the local price unchanged
  active: boolean;
  category: string | null; // POS category — Coop's explicit value, else mapped from line
  subcategory: string | null; // POS subcategory (Coop's, Freeze-Dried only)
  emoji: string | null; // seeds a newly-inserted tile; existing tiles keep their local emoji
  stock: number; // Coop-authoritative; always overwrites the local cache
};

/**
 * Map Coop's product-line code to the POS category tab, used only when the pull
 * inserts a product the POS doesn't have yet. JRK is ambiguous (Tasty Treats vs
 * Super Duo Bites); default it to Tasty Treats — it's local-only and the cashier
 * can recategorize. Returns null for an unknown/blank line (lands "Uncategorized").
 */
export function categoryForLine(line: string | null): string | null {
  switch ((line ?? '').toUpperCase()) {
    case 'FDR':
      return 'Freeze Dried';
    case 'MEAT':
      return 'Meaty Treats';
    case 'JRK':
      return 'Tasty Treats';
    default:
      return null;
  }
}

// Coop's canonical names carry the product line as a prefix ("Freeze-Dried
// Beef Liver Cubes", "Meaty Treats Beef"). The POS groups tiles by category
// already, so the prefix is redundant on the tile — strip it for a clean name
// ("Beef Liver Cubes", "Beef"). Case-insensitive; longest first so
// "Super Duo Bites " wins over any shorter overlap.
const LINE_PREFIXES = [
  'Super Duo Bites ',
  'Freeze-Dried ',
  'Freeze-Dired ', // tolerate the old masterfile typo
  'Meaty Treats ',
  'Tasty Treats ',
];

/** Pure: drop a leading product-line prefix from a Coop name for tile display. */
export function stripLinePrefix(name: string): string {
  const lower = name.toLowerCase();
  for (const p of LINE_PREFIXES) {
    if (lower.startsWith(p.toLowerCase())) return name.slice(p.length).trimStart();
  }
  return name.trim();
}

/** Pure: turn remote rows into the updates to apply locally. Skips rows with no SKU.
 *  Category = Coop's explicit value when set, else the best-effort line mapping. */
export function reconcileCatalog(remote: RemoteCatalogRow[]): CatalogUpdate[] {
  return remote
    .filter((r) => r.product_id)
    .map((r) => ({
      sku: r.product_id,
      name: stripLinePrefix(r.name),
      price: r.price,
      active: r.active,
      category: r.category ?? categoryForLine(r.product_line),
      subcategory: r.subcategory,
      emoji: r.emoji,
      stock: r.stock,
    }));
}

/** Normalize a PostgREST row (pos_prices embeds as an array or object). */
function normalizeRemoteRow(r: {
  product_id: string;
  name: string;
  active: boolean;
  product_line: string | null;
  category: string | null;
  subcategory: string | null;
  emoji: string | null;
  pos_prices: {price: number | null} | {price: number | null}[] | null;
}, stock: number): RemoteCatalogRow {
  const priceRel = Array.isArray(r.pos_prices) ? r.pos_prices[0] : r.pos_prices;
  const price = priceRel && priceRel.price != null ? Number(priceRel.price) : null;
  return {
    product_id: r.product_id,
    name: r.name ?? '',
    active: Boolean(r.active),
    price,
    product_line: r.product_line ?? null,
    category: r.category ?? null,
    subcategory: r.subcategory ?? null,
    emoji: r.emoji ?? null,
    stock,
  };
}

async function fetchRemoteCatalog(): Promise<RemoteCatalogRow[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const [productsRes, inventoryRes] = await Promise.all([
    sb.from('pos_products').select('product_id, name, active, product_line, category, subcategory, emoji, pos_prices(price)'),
    sb.from('pos_inventory').select('product_id, stock'),
  ]);
  if (productsRes.error) throw new Error(productsRes.error.message);
  if (inventoryRes.error) throw new Error(inventoryRes.error.message);

  const stockBySku = new Map<string, number>();
  for (const row of inventoryRes.data ?? []) {
    stockBySku.set(row.product_id as string, Number(row.stock ?? 0));
  }

  return (productsRes.data ?? []).map((r) =>
    normalizeRemoteRow(r as never, stockBySku.get((r as {product_id: string}).product_id) ?? 0)
  );
}

// Listeners notified after a pull actually changes local rows, so open screens
// can re-read the catalog and show the new prices without a manual refresh.
const listeners = new Set<() => void>();

export function subscribeCatalogChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Pull Coop's catalog into local SQLite. No-op (returns null) when Supabase is
 * unconfigured or unreachable — the POS stays on its cached catalog, offline-first.
 * On success, records the sync and refreshes the "last synced" marker.
 */
export async function pullCatalog(): Promise<{updated: number} | null> {
  const sb = getSupabase();
  if (!sb) return null; // unconfigured build: local-only, nothing to pull

  let remote: RemoteCatalogRow[];
  try {
    remote = await fetchRemoteCatalog();
  } catch {
    return null; // offline / network error: keep the cached catalog silently
  }

  const updates = reconcileCatalog(remote);
  let updated = 0;
  for (const u of updates) {
    updated += await applyCatalogUpdate(u);
  }

  // Mirror Coop's shared bundles into the local store too (best-effort; a null
  // result just leaves the local bundles as they are).
  const {pullBundles} = await import('./bundles-sync');
  const bundleChanges = await pullBundles();
  if (bundleChanges && bundleChanges > 0) updated += bundleChanges;

  await markSynced();

  // Best-effort audit trail (pos_sync_log); never let it fail the pull.
  try {
    await sb.rpc('record_sync', {
      p_direction: 'pull',
      p_entity: 'catalog',
      p_summary: {count: updated},
      p_device: 'pos',
    });
  } catch {
    // ignore
  }

  if (updated > 0) for (const fn of listeners) fn();
  return {updated};
}
