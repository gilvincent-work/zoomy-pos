/**
 * Reconstruct a Coop order's stored lines into editable entries (individual items
 * + bundle groups), mirroring the dashboard's orderToEntries. The POS edit flow is
 * online-only, so it fetches the order's real lines (which carry bundle_group)
 * from Coop and rebuilds the groups here rather than from the flat local copy.
 */

export type EditEntry =
  | {kind: 'item'; product_id: string; qty: number; unit_price: number}
  | {kind: 'bundle'; bundle_id: string; price: number; picks: {product_id: string; qty: number}[]};

export type RawOrderLine = {
  product_id: string | null;
  bundle_id: string | null;
  bundle_group: string | null;
  qty: number;
  unit_price: number;
  line_total: number;
};

/** Minimal bundle facts needed to re-link a legacy bundle order. */
export type BundleMatch = {bundle_id: string; bundle_type: 'pick' | 'fixed'; pick_count: number | null};

/**
 * A bundle group is rebuilt from bundle_group: the header row (bundle_id set,
 * product_id null) gives the bundle id + price; the ₱0 product rows sharing that
 * group are its picks. A legacy fixed-bundle header with no group becomes a bundle
 * with no picks (components come from its definition). Orphan groups (picks with
 * no header) degrade to loose ₱0 items.
 *
 * Legacy pick-bundle sales predate bundle_group: ₱0 picks with the premium only
 * on the order total. When a leftover premium remains (`total` exceeds the entry
 * sum), those ₱0 items are folded into a bundle carrying the premium as its price,
 * auto-linked to the bundle whose pick_count matches the pick quantity (unique);
 * unmatched ones keep an empty bundle_id for the editor to link. Order preserved.
 */
export function reconstructEntries(lines: RawOrderLine[], total = 0, defs: BundleMatch[] = []): EditEntry[] {
  const out: EditEntry[] = [];
  const groupIndex = new Map<string, number>();
  for (const l of lines) {
    const grp = l.bundle_group ?? null;
    if (grp != null) {
      let idx = groupIndex.get(grp);
      if (idx === undefined) {
        idx = out.length;
        groupIndex.set(grp, idx);
        out.push({kind: 'bundle', bundle_id: l.bundle_id ?? '', price: 0, picks: []});
      }
      const e = out[idx] as Extract<EditEntry, {kind: 'bundle'}>;
      if (l.bundle_id && l.product_id == null) {
        e.bundle_id = l.bundle_id;
        e.price = l.line_total;
      } else if (l.product_id) {
        e.picks.push({product_id: l.product_id, qty: l.qty});
      }
    } else if (l.bundle_id && l.product_id == null) {
      out.push({kind: 'bundle', bundle_id: l.bundle_id, price: l.line_total, picks: []});
    } else if (l.product_id) {
      out.push({kind: 'item', product_id: l.product_id, qty: l.qty, unit_price: l.unit_price});
    }
  }
  const cleaned: EditEntry[] = [];
  for (const e of out) {
    if (e.kind === 'bundle' && !e.bundle_id) {
      for (const p of e.picks) cleaned.push({kind: 'item', product_id: p.product_id, qty: p.qty, unit_price: 0});
    } else {
      cleaned.push(e);
    }
  }

  const entriesSum = cleaned.reduce((s, e) => s + (e.kind === 'item' ? e.qty * e.unit_price : e.price), 0);
  const premium = total - entriesSum;
  const zeros = cleaned.filter((e): e is Extract<EditEntry, {kind: 'item'}> => e.kind === 'item' && e.unit_price === 0);
  if (premium > 0.005 && zeros.length > 0) {
    const rest = cleaned.filter((e) => !(e.kind === 'item' && e.unit_price === 0));
    const pickQty = zeros.reduce((s, e) => s + e.qty, 0);
    const matches = defs.filter((d) => d.bundle_type === 'pick' && d.pick_count === pickQty);
    const bundle_id = matches.length === 1 ? matches[0].bundle_id : '';
    rest.push({kind: 'bundle', bundle_id, price: premium, picks: zeros.map((e) => ({product_id: e.product_id, qty: e.qty}))});
    return rest;
  }
  return cleaned;
}
