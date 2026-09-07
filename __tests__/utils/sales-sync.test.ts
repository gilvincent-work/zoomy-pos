import { buildOrderItems } from '../../utils/sales-sync';
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
