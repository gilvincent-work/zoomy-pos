import {getSupabase} from '../lib/supabase';
import {getDatabase} from '../db/database';
import {reconcileRemoteBundles, type RemoteBundle, type SavedBundle, type BundleItemInput} from '../db/saved-bundles';

/**
 * Bundle sync. Bundles are created on the POS but shared through Coop (like
 * products): a create/edit/toggle pushes the bundle to pos_bundles, and the
 * catalog pull mirrors Coop's bundle set back into every device's local store,
 * keyed by the shared bundle_uuid. All best-effort — offline just keeps the
 * local copy, and the write lands on the next online action.
 */

/** Local product ids -> Coop SKU, for a fixed bundle's item list. */
async function skuByProductId(ids: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  const unique = Array.from(new Set(ids));
  if (unique.length === 0) return map;
  const db = await getDatabase();
  const rows = await db.getAllAsync<{id: number; sku: string | null}>(
    `SELECT id, sku FROM products WHERE id IN (${unique.map(() => '?').join(',')})`,
    unique
  );
  for (const r of rows) if (r.sku) map.set(r.id, r.sku);
  return map;
}

/** Push one bundle up to Coop. No-op (false) when unconfigured/offline or unsynced. */
export async function pushBundle(bundle: SavedBundle): Promise<boolean> {
  const sb = getSupabase();
  if (!sb || !bundle.bundle_uuid) return false;

  const skuMap = await skuByProductId(bundle.items.map((i) => i.id));
  const p_items = bundle.items
    .map((i) => ({product_id: skuMap.get(i.id), qty: i.quantity}))
    .filter((i): i is {product_id: string; qty: number} => !!i.product_id);

  const p_bundle = {
    bundle_id: bundle.bundle_uuid,
    name: bundle.name,
    price: bundle.price,
    active: bundle.is_active === 1,
    bundle_type: bundle.bundle_type,
    pick_count: bundle.pick_count,
    line_categories: bundle.line_categories,
    emoji: bundle.emoji,
  };

  try {
    const {error} = await sb.rpc('apply_pos_bundle', {p_bundle, p_items});
    return !error;
  } catch {
    return false;
  }
}

/** Delete a bundle on Coop by uuid. Best-effort. */
export async function deleteBundleRemote(uuid: string | null): Promise<boolean> {
  const sb = getSupabase();
  if (!sb || !uuid) return false;
  try {
    const {error} = await sb.rpc('delete_pos_bundle', {p_bundle_id: uuid});
    return !error;
  } catch {
    return false;
  }
}

type RemoteBundleRow = {
  bundle_id: string;
  name: string;
  price: number | null;
  active: boolean;
  bundle_type: string | null;
  pick_count: number | null;
  line_categories: string[] | null;
  emoji: string | null;
};

/**
 * Pull Coop's bundles into the local mirror. Returns the number of local rows
 * changed (0 when nothing moved), or null when Supabase is unconfigured/offline
 * so the caller leaves the local set alone.
 */
export async function pullBundles(): Promise<number | null> {
  const sb = getSupabase();
  if (!sb) return null;

  try {
    const [{data: bundles, error: bErr}, {data: items, error: iErr}, {data: products, error: pErr}] = await Promise.all([
      sb.from('pos_bundles').select('bundle_id, name, price, active, bundle_type, pick_count, line_categories, emoji'),
      sb.from('pos_bundle_items').select('bundle_id, product_id, qty'),
      sb.from('pos_products').select('product_id, name'),
    ]);
    if (bErr || iErr || pErr || !bundles) return null;

    // Resolve SKU -> local product id + name so fixed-bundle items render.
    const nameBySku = new Map<string, string>();
    for (const p of products ?? []) nameBySku.set(p.product_id as string, p.name as string);
    const db = await getDatabase();
    const localProducts = await db.getAllAsync<{id: number; sku: string | null}>('SELECT id, sku FROM products WHERE sku IS NOT NULL');
    const idBySku = new Map<string, number>();
    for (const p of localProducts) if (p.sku) idBySku.set(p.sku, p.id);

    const itemsByBundle = new Map<string, BundleItemInput[]>();
    for (const it of (items ?? []) as {bundle_id: string; product_id: string; qty: number}[]) {
      const arr = itemsByBundle.get(it.bundle_id) ?? [];
      arr.push({
        id: idBySku.get(it.product_id) ?? 0,
        name: nameBySku.get(it.product_id) ?? it.product_id,
        quantity: Number(it.qty ?? 1),
      });
      itemsByBundle.set(it.bundle_id, arr);
    }

    const remote: RemoteBundle[] = (bundles as RemoteBundleRow[]).map((b) => ({
      bundle_uuid: b.bundle_id,
      name: b.name ?? '',
      price: Number(b.price ?? 0),
      bundle_type: b.bundle_type === 'pick' ? 'pick' : 'fixed',
      pick_count: b.pick_count,
      line_categories: b.line_categories ?? null,
      emoji: b.emoji ?? null,
      is_active: b.active ? 1 : 0,
      items: itemsByBundle.get(b.bundle_id) ?? [],
    }));

    return await reconcileRemoteBundles(remote);
  } catch {
    return null;
  }
}
