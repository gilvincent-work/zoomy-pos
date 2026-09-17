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

/** Minimal bundle facts needed to re-link / price a bundle group. */
export type BundleMatch = {bundle_id: string; bundle_type: 'pick' | 'fixed'; pick_count: number | null; price: number};

type BundleEntry = Extract<EditEntry, {kind: 'bundle'}>;
type ItemEntry = Extract<EditEntry, {kind: 'item'}>;

/**
 * Reconstruct an order's stored lines into editable entries (individual items +
 * bundle groups) so editing shows the sale's real content on first load. Each
 * bundle_group becomes its own bundle (two bundles show as two, never merged): a
 * header row (product_id null) gives the price and, when present, the bundle_id;
 * the ₱0 product rows in the group are its picks.
 *
 * Groups without a header (older/unresolvable sales) reconstruct as custom
 * bundles; a group is auto-identified by matching its pick quantity to a bundle's
 * pick_count (unique), and any leftover premium is defaulted onto the ₱0-priced
 * bundles (a matched bundle takes its list price first, the remainder lands on the
 * first). A truly ungrouped legacy bundle (loose ₱0 items + premium) folds into
 * one custom bundle. Everything stays editable; saving self-heals grouped shape.
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
        out.push({kind: 'bundle', bundle_id: '', price: 0, picks: []});
      }
      const e = out[idx] as BundleEntry;
      if (l.product_id == null) {
        e.price = l.line_total;
        if (l.bundle_id) e.bundle_id = l.bundle_id;
      } else {
        e.picks.push({product_id: l.product_id, qty: l.qty});
      }
    } else if (l.bundle_id && l.product_id == null) {
      out.push({kind: 'bundle', bundle_id: l.bundle_id, price: l.line_total, picks: []});
    } else if (l.product_id) {
      out.push({kind: 'item', product_id: l.product_id, qty: l.qty, unit_price: l.unit_price});
    }
  }

  const defById = new Map(defs.map((d) => [d.bundle_id, d]));
  for (const e of out) {
    if (e.kind === 'bundle' && !e.bundle_id) {
      const pickQty = e.picks.reduce((s, p) => s + p.qty, 0);
      const matches = defs.filter((d) => d.bundle_type === 'pick' && d.pick_count === pickQty);
      if (matches.length === 1) e.bundle_id = matches[0].bundle_id;
    }
  }

  const sumAmounts = () => out.reduce((s, e) => s + (e.kind === 'item' ? e.qty * e.unit_price : e.price), 0);
  let leftover = total - sumAmounts();
  if (leftover > 0.005) {
    for (const e of out) {
      if (e.kind === 'bundle' && e.price === 0) {
        const def = defById.get(e.bundle_id);
        if (def && def.price > 0 && def.price <= leftover) {
          e.price = def.price;
          leftover -= def.price;
        }
      }
    }
    if (leftover > 0.005) {
      const t = out.find((e): e is BundleEntry => e.kind === 'bundle' && e.price === 0);
      if (t) {
        t.price += leftover;
        leftover = 0;
      }
    }
  }

  if (leftover > 0.005) {
    const zeros = out.filter((e): e is ItemEntry => e.kind === 'item' && e.unit_price === 0);
    if (zeros.length > 0) {
      const rest = out.filter((e) => !(e.kind === 'item' && e.unit_price === 0));
      const pickQty = zeros.reduce((s, e) => s + e.qty, 0);
      const matches = defs.filter((d) => d.bundle_type === 'pick' && d.pick_count === pickQty);
      rest.push({kind: 'bundle', bundle_id: matches.length === 1 ? matches[0].bundle_id : '', price: leftover, picks: zeros.map((e) => ({product_id: e.product_id, qty: e.qty}))});
      return rest;
    }
  }
  return out;
}
