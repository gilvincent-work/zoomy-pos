import { reconcileCatalog, stripLinePrefix, categoryForLine, RemoteCatalogRow } from '../../utils/catalog-sync';

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

describe('categoryForLine', () => {
  it('maps known line codes to POS categories', () => {
    expect(categoryForLine('FDR')).toBe('Freeze Dried');
    expect(categoryForLine('MEAT')).toBe('Meaty Treats');
    expect(categoryForLine('JRK')).toBe('Tasty Treats');
    expect(categoryForLine('fdr')).toBe('Freeze Dried'); // case-insensitive
  });
  it('returns null for unknown or blank lines', () => {
    expect(categoryForLine('XYZ')).toBeNull();
    expect(categoryForLine('')).toBeNull();
    expect(categoryForLine(null)).toBeNull();
  });
});

describe('reconcileCatalog', () => {
  it('maps remote rows to per-SKU updates, stripping the line prefix and mapping category', () => {
    const remote: RemoteCatalogRow[] = [
      { product_id: 'ZMYFDFDRBEFLVR01', name: 'Freeze-Dried Beef Liver Cubes', active: true, price: 171, product_line: 'FDR' },
      { product_id: 'ZMYFDMEATBEFWHL01', name: 'Meaty Treats Beef', active: false, price: 200, product_line: 'MEAT' },
    ];
    expect(reconcileCatalog(remote)).toEqual([
      { sku: 'ZMYFDFDRBEFLVR01', name: 'Beef Liver Cubes', price: 171, active: true, category: 'Freeze Dried' },
      { sku: 'ZMYFDMEATBEFWHL01', name: 'Beef', price: 200, active: false, category: 'Meaty Treats' },
    ]);
  });

  it('preserves a null price and maps an unknown line to a null category', () => {
    const remote: RemoteCatalogRow[] = [{ product_id: 'ZMYX', name: 'X', active: true, price: null, product_line: null }];
    expect(reconcileCatalog(remote)).toEqual([{ sku: 'ZMYX', name: 'X', price: null, active: true, category: null }]);
  });

  it('drops rows with no SKU', () => {
    const remote: RemoteCatalogRow[] = [
      { product_id: '', name: 'nope', active: true, price: 10, product_line: 'FDR' },
      { product_id: 'ZMYY', name: 'Yep', active: true, price: 20, product_line: 'JRK' },
    ];
    expect(reconcileCatalog(remote)).toEqual([{ sku: 'ZMYY', name: 'Yep', price: 20, active: true, category: 'Tasty Treats' }]);
  });

  it('returns an empty list for no rows', () => {
    expect(reconcileCatalog([])).toEqual([]);
  });
});
