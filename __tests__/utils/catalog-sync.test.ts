import { reconcileCatalog, stripLinePrefix, RemoteCatalogRow } from '../../utils/catalog-sync';

describe('stripLinePrefix', () => {
  it('drops the product-line prefix from a Coop name', () => {
    expect(stripLinePrefix('Freeze-Dried Beef Liver Cubes')).toBe('Beef Liver Cubes');
    expect(stripLinePrefix('Meaty Treats Beef')).toBe('Beef');
    expect(stripLinePrefix('Tasty Treats Chicken Jerky')).toBe('Chicken Jerky');
    expect(stripLinePrefix('Super Duo Bites Chicken Carrot')).toBe('Chicken Carrot');
    expect(stripLinePrefix('Freeze-Dried Beef RIVER SQUARE')).toBe('Beef RIVER SQUARE');
  });

  it('tolerates the old "Freeze-Dired" typo and mixed case', () => {
    expect(stripLinePrefix('Freeze-Dired Duck Apple')).toBe('Duck Apple');
    expect(stripLinePrefix('freeze-dried Capelin')).toBe('Capelin');
  });

  it('leaves a name with no known prefix untouched', () => {
    expect(stripLinePrefix('Beef')).toBe('Beef');
    expect(stripLinePrefix('Cat Grass Cubes')).toBe('Cat Grass Cubes');
  });
});

describe('reconcileCatalog', () => {
  it('maps remote rows to per-SKU updates, stripping the line prefix from names', () => {
    const remote: RemoteCatalogRow[] = [
      { product_id: 'ZMYFDFDRBEFLVR01', name: 'Freeze-Dried Beef Liver Cubes', active: true, price: 171 },
      { product_id: 'ZMYFDMEATBEFWHL01', name: 'Meaty Treats Beef', active: false, price: 200 },
    ];
    expect(reconcileCatalog(remote)).toEqual([
      { sku: 'ZMYFDFDRBEFLVR01', name: 'Beef Liver Cubes', price: 171, active: true },
      { sku: 'ZMYFDMEATBEFWHL01', name: 'Beef', price: 200, active: false },
    ]);
  });

  it('preserves a null price (signals "leave local price unchanged")', () => {
    const remote: RemoteCatalogRow[] = [{ product_id: 'ZMYX', name: 'X', active: true, price: null }];
    expect(reconcileCatalog(remote)).toEqual([{ sku: 'ZMYX', name: 'X', price: null, active: true }]);
  });

  it('drops rows with no SKU', () => {
    const remote: RemoteCatalogRow[] = [
      { product_id: '', name: 'nope', active: true, price: 10 },
      { product_id: 'ZMYY', name: 'Yep', active: true, price: 20 },
    ];
    expect(reconcileCatalog(remote)).toEqual([{ sku: 'ZMYY', name: 'Yep', price: 20, active: true }]);
  });

  it('returns an empty list for no rows', () => {
    expect(reconcileCatalog([])).toEqual([]);
  });
});
