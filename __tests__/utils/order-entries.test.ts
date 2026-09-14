import { reconstructEntries, type RawOrderLine } from '../../utils/order-entries';

const L = (over: Partial<RawOrderLine>): RawOrderLine => ({
  product_id: null, bundle_id: null, bundle_group: null, qty: 1, unit_price: 0, line_total: 0, ...over,
});

describe('reconstructEntries', () => {
  it('rebuilds a bundle group (header + ₱0 picks) beside an individual item', () => {
    const lines = [
      L({ product_id: 'BEEF', qty: 1, unit_price: 200, line_total: 200 }),
      L({ bundle_id: 'B3', bundle_group: '1', unit_price: 600, line_total: 600 }),
      L({ product_id: 'CGC', bundle_group: '1', qty: 1 }),
      L({ product_id: 'SLM', bundle_group: '1', qty: 1 }),
    ];
    expect(reconstructEntries(lines)).toEqual([
      { kind: 'item', product_id: 'BEEF', qty: 1, unit_price: 200 },
      { kind: 'bundle', bundle_id: 'B3', price: 600, picks: [{ product_id: 'CGC', qty: 1 }, { product_id: 'SLM', qty: 1 }] },
    ]);
  });

  it('keeps two instances of the same bundle separate by group', () => {
    const lines = [
      L({ bundle_id: 'B', bundle_group: '1', line_total: 100 }),
      L({ product_id: 'A', bundle_group: '1' }),
      L({ bundle_id: 'B', bundle_group: '2', line_total: 100 }),
      L({ product_id: 'C', bundle_group: '2' }),
    ];
    const out = reconstructEntries(lines);
    expect(out).toHaveLength(2);
    expect(out.every((e) => e.kind === 'bundle')).toBe(true);
  });

  it('keeps an orphan group (picks, no header) as its own custom bundle', () => {
    expect(reconstructEntries([L({ product_id: 'CGC', bundle_group: '9', qty: 2 })])).toEqual([
      { kind: 'bundle', bundle_id: '', price: 0, picks: [{ product_id: 'CGC', qty: 2 }] },
    ]);
  });

  it('folds a legacy bundle (₱0 picks + premium on total) into a bundle auto-linked by pick_count', () => {
    const lines = [
      L({ product_id: 'A', qty: 1 }), L({ product_id: 'B', qty: 1 }),
      L({ product_id: 'C', qty: 1 }), L({ product_id: 'D', qty: 1 }),
    ];
    const defs = [
      { bundle_id: 'B4', bundle_type: 'pick' as const, pick_count: 4, price: 650 },
      { bundle_id: 'B3', bundle_type: 'pick' as const, pick_count: 3, price: 500 },
    ];
    expect(reconstructEntries(lines, 570, defs)).toEqual([
      { kind: 'bundle', bundle_id: 'B4', price: 570, picks: [
        { product_id: 'A', qty: 1 }, { product_id: 'B', qty: 1 }, { product_id: 'C', qty: 1 }, { product_id: 'D', qty: 1 },
      ] },
    ]);
  });

  it('leaves a legacy bundle unlinked when no pick_count matches', () => {
    const out = reconstructEntries([L({ product_id: 'A', qty: 1 }), L({ product_id: 'B', qty: 1 })], 500,
      [{ bundle_id: 'B4', bundle_type: 'pick', pick_count: 4, price: 650 }]);
    expect(out).toEqual([{ kind: 'bundle', bundle_id: '', price: 500, picks: [{ product_id: 'A', qty: 1 }, { product_id: 'B', qty: 1 }] }]);
  });

  it('shows two orphan groups as two separate bundles (group 1 auto-links + takes list price, remainder on group 2)', () => {
    const lines = [
      L({ product_id: 'A', bundle_group: '1', qty: 1 }), L({ product_id: 'B', bundle_group: '1', qty: 1 }),
      L({ product_id: 'C', bundle_group: '1', qty: 1 }), L({ product_id: 'D', bundle_group: '1', qty: 1 }),
      L({ product_id: 'E', bundle_group: '2', qty: 1 }), L({ product_id: 'F', bundle_group: '2', qty: 1 }),
    ];
    const out = reconstructEntries(lines, 1120, [{ bundle_id: 'B4', bundle_type: 'pick', pick_count: 4, price: 650 }]);
    expect(out).toEqual([
      { kind: 'bundle', bundle_id: 'B4', price: 650, picks: [{ product_id: 'A', qty: 1 }, { product_id: 'B', qty: 1 }, { product_id: 'C', qty: 1 }, { product_id: 'D', qty: 1 }] },
      { kind: 'bundle', bundle_id: '', price: 470, picks: [{ product_id: 'E', qty: 1 }, { product_id: 'F', qty: 1 }] },
    ]);
  });
});
