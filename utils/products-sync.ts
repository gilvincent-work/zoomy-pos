import {getSupabase} from '../lib/supabase';

/**
 * Push a POS-side product edit up to Coop, so it shows on the Coop dashboard
 * and reaches every other device on their next catalog pull. Uses the same
 * SECURITY DEFINER RPCs Coop's own dashboard calls for name/price/listing;
 * emoji has its own RPC (set_product_emoji) since it's POS-only otherwise.
 *
 * All best-effort: a product with no `sku` yet (never synced to Coop) has
 * nothing to push to, and a failed push just leaves the local edit as the
 * device's own state until the next successful sync — it never blocks or
 * rolls back the local save.
 */

const ACTOR = 'pos';

export async function pushProductRename(sku: string, name: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  try {
    const {error} = await sb.rpc('rename_product', {p_product_id: sku, p_name: name, p_by: ACTOR});
    return !error;
  } catch {
    return false;
  }
}

export async function pushProductReprice(sku: string, price: number): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  try {
    const {error} = await sb.rpc('reprice_product', {
      p_product_id: sku,
      p_new_price: price,
      p_reason: 'POS edit',
      p_by: ACTOR,
    });
    return !error;
  } catch {
    return false;
  }
}

export async function pushProductEmoji(sku: string, emoji: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  try {
    const {error} = await sb.rpc('set_product_emoji', {p_product_id: sku, p_emoji: emoji});
    return !error;
  } catch {
    return false;
  }
}

export async function pushProductListing(sku: string, active: boolean): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  try {
    const {error} = await sb.rpc('set_product_listing', {p_product_id: sku, p_active: active, p_by: ACTOR});
    return !error;
  } catch {
    return false;
  }
}
