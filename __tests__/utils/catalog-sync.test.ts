import { reconcileCatalog, RemoteCatalogRow } from '../../utils/catalog-sync';

describe('reconcileCatalog', () => {
  it('maps remote rows to per-SKU updates', () => {
    const remote: RemoteCatalogRow[] = [
      { product_id: 'ZMYFDFDRBEFLVR01', active: true, price: 171 },
      { product_id: 'ZMYFDMEATBEFWHL01', active: false, price: 200 },
    ];
    expect(reconcileCatalog(remote)).toEqual([
      { sku: 'ZMYFDFDRBEFLVR01', price: 171, active: true },
      { sku: 'ZMYFDMEATBEFWHL01', price: 200, active: false },
    ]);
  });

  it('preserves a null price (signals "leave local price unchanged")', () => {
    const remote: RemoteCatalogRow[] = [{ product_id: 'ZMYX', active: true, price: null }];
    expect(reconcileCatalog(remote)).toEqual([{ sku: 'ZMYX', price: null, active: true }]);
  });

  it('drops rows with no SKU', () => {
    const remote: RemoteCatalogRow[] = [
      { product_id: '', active: true, price: 10 },
      { product_id: 'ZMYY', active: true, price: 20 },
    ];
    expect(reconcileCatalog(remote)).toEqual([{ sku: 'ZMYY', price: 20, active: true }]);
  });

  it('returns an empty list for no rows', () => {
    expect(reconcileCatalog([])).toEqual([]);
  });
});
