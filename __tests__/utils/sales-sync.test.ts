import { buildOrderItems, buildBundleOrderItems, type BundleForPush } from '../../utils/sales-sync';
import type { InsertItem } from '../../utils/cart-transaction';

const line = (over: Partial<InsertItem> & { productId: number }): InsertItem => ({
  productName: 'x',
  price: 100,
  quantity: 1,
  ...over,
});

describe('buildOrderItems', () => {
  it('maps local lines to Coop order items by SKU with computed line totals', () => {
    const items = [
      line({ productId: 1, price: 170, quantity: 2 }),
      line({ productId: 2, price: 200, quantity: 1 }),
    ];
    const skuMap = new Map([
      [1, 'ZMYFDFDRBEFLVR01'],
      [2, 'ZMYFDMEATBEFWHL01'],
    ]);
    expect(buildOrderItems(items, skuMap)).toEqual([
      { product_id: 'ZMYFDFDRBEFLVR01', qty: 2, unit_price: 170, line_total: 340 },
      { product_id: 'ZMYFDMEATBEFWHL01', qty: 1, unit_price: 200, line_total: 200 },
    ]);
  });

  it('skips lines whose product has no SKU (unknown to Coop)', () => {
    const items = [line({ productId: 1, price: 170 }), line({ productId: 99, price: 50 })];
    const skuMap = new Map([[1, 'ZMYFDFDRBEFLVR01']]);
    expect(buildOrderItems(items, skuMap)).toEqual([
      { product_id: 'ZMYFDFDRBEFLVR01', qty: 1, unit_price: 170, line_total: 170 },
    ]);
  });

  it('returns an empty list when nothing maps', () => {
    expect(buildOrderItems([line({ productId: 5 })], new Map())).toEqual([]);
  });
});

describe('buildBundleOrderItems', () => {
  const bundle = (over: Partial<BundleForPush> & { presetId: number | null }): BundleForPush => ({
    price: 650,
    ...over,
  });

  it('emits one bundle_id line per cart bundle, carrying its price as the line total', () => {
    const bundles = [bundle({ presetId: 1, price: 650 }), bundle({ presetId: 2, price: 550 })];
    const uuidByPreset = new Map([
      [1, '4abf67b0-4004-4d76-b687-e43cb7c0a6e6'],
      [2, 'bundle-buy-any-2'],
    ]);
    expect(buildBundleOrderItems(bundles, uuidByPreset)).toEqual([
      { bundle_id: '4abf67b0-4004-4d76-b687-e43cb7c0a6e6', qty: 1, unit_price: 650, line_total: 650 },
      { bundle_id: 'bundle-buy-any-2', qty: 1, unit_price: 550, line_total: 550 },
    ]);
  });

  it('skips bundles with no resolvable Coop id (unsynced or ad-hoc), degrading to header-only', () => {
    const bundles = [bundle({ presetId: 1 }), bundle({ presetId: 2 }), bundle({ presetId: null })];
    const uuidByPreset = new Map([[1, '4abf67b0-4004-4d76-b687-e43cb7c0a6e6']]); // preset 2 unsynced
    expect(buildBundleOrderItems(bundles, uuidByPreset)).toEqual([
      { bundle_id: '4abf67b0-4004-4d76-b687-e43cb7c0a6e6', qty: 1, unit_price: 650, line_total: 650 },
    ]);
  });

  it('returns an empty list when there are no bundles', () => {
    expect(buildBundleOrderItems([], new Map())).toEqual([]);
  });
});
