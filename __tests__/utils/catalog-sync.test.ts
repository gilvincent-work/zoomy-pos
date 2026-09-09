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

const row = (over: Partial<RemoteCatalogRow> & { product_id: string }): RemoteCatalogRow => ({
  name: 'X',
  active: true,
  price: null,
  product_line: null,
  category: null,
  subcategory: null,
  emoji: null,
  ...over,
});

describe('reconcileCatalog', () => {
  it("prefers Coop's explicit category over the line mapping, carries subcategory", () => {
    const remote: RemoteCatalogRow[] = [
      // JRK line but Coop explicitly says Super Duo Bites — Coop wins.
      row({ product_id: 'ZMYA', name: 'Super Duo Bites Chicken Carrot', active: true, price: 300, product_line: 'JRK', category: 'Super Duo Bites', emoji: '🥕' }),
      // Freeze Dried with a subcategory carried through.
      row({ product_id: 'ZMYB', name: 'Freeze-Dried Salmon Cubes', active: true, price: 170, product_line: 'FDR', category: 'Freeze Dried', subcategory: 'Fish' }),
    ];
    expect(reconcileCatalog(remote)).toEqual([
      { sku: 'ZMYA', name: 'Chicken Carrot', price: 300, active: true, category: 'Super Duo Bites', subcategory: null, emoji: '🥕' },
      { sku: 'ZMYB', name: 'Salmon Cubes', price: 170, active: true, category: 'Freeze Dried', subcategory: 'Fish', emoji: null },
    ]);
  });

  it('falls back to the line mapping when Coop has no explicit category', () => {
    const remote: RemoteCatalogRow[] = [row({ product_id: 'ZMYC', name: 'Meaty Treats Beef', price: 200, product_line: 'MEAT', category: null })];
    expect(reconcileCatalog(remote)).toEqual([
      { sku: 'ZMYC', name: 'Beef', price: 200, active: true, category: 'Meaty Treats', subcategory: null, emoji: null },
    ]);
  });

  it('null price + unknown line + no Coop category => null category', () => {
    const remote: RemoteCatalogRow[] = [row({ product_id: 'ZMYX', name: 'X', price: null })];
    expect(reconcileCatalog(remote)).toEqual([{ sku: 'ZMYX', name: 'X', price: null, active: true, category: null, subcategory: null, emoji: null }]);
  });

  it('drops rows with no SKU', () => {
    const remote: RemoteCatalogRow[] = [
      row({ product_id: '', name: 'nope', price: 10, product_line: 'FDR' }),
      row({ product_id: 'ZMYY', name: 'Yep', price: 20, product_line: 'JRK' }),
    ];
    expect(reconcileCatalog(remote)).toEqual([{ sku: 'ZMYY', name: 'Yep', price: 20, active: true, category: 'Tasty Treats', subcategory: null, emoji: null }]);
  });

  it('returns an empty list for no rows', () => {
    expect(reconcileCatalog([])).toEqual([]);
  });
});
