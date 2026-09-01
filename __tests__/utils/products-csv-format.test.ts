import * as fs from 'fs';
import * as path from 'path';
import {
  parseCatalog, ParseError, CATALOG_CSV_HEADER, LEGACY_CATALOG_CSV_HEADER,
} from '../../utils/products-csv-format';

const EXT = CATALOG_CSV_HEADER.join(',');
const LEGACY = LEGACY_CATALOG_CSV_HEADER.join(',');

describe('parseCatalog — extended header (category/subcategory)', () => {
  it('parses category and subcategory on product rows', () => {
    const csv = [
      EXT,
      'product,Salmon Cubes,75,🐟,0,,,,Freeze Dried,Fish',
      'product,Beef Strips,95,🥩,0,,,,Meaty Treats,',
    ].join('\n');

    const { products } = parseCatalog(csv);
    expect(products).toEqual([
      { name: 'Salmon Cubes', price: 75, emoji: '🐟', has_variants: 0, image_filename: null, category: 'Freeze Dried', subcategory: 'Fish' },
      { name: 'Beef Strips', price: 95, emoji: '🥩', has_variants: 0, image_filename: null, category: 'Meaty Treats', subcategory: null },
    ]);
  });

  it('treats blank category/subcategory cells as null', () => {
    const csv = [EXT, 'product,Plain,10,🍬,0,,,,,'].join('\n');
    const { products } = parseCatalog(csv);
    expect(products[0].category).toBeNull();
    expect(products[0].subcategory).toBeNull();
  });
});

describe('parseCatalog — legacy header still works', () => {
  it('accepts the 8-column legacy header and defaults category to null', () => {
    const csv = [LEGACY, 'product,Old Item,50,🍬,0,,,'].join('\n');
    const { products } = parseCatalog(csv);
    expect(products[0]).toMatchObject({ name: 'Old Item', price: 50, category: null, subcategory: null });
  });

  it('rejects an unrecognized header', () => {
    const csv = ['name,price', 'Foo,10'].join('\n');
    expect(() => parseCatalog(csv)).toThrow(ParseError);
  });
});

describe('shipped catalog template', () => {
  it('parses cleanly and matches the documented Freeze Dried taxonomy', () => {
    const csv = fs.readFileSync(
      path.join(__dirname, '../../docs/catalog-template.csv'),
      'utf8'
    );
    const { products } = parseCatalog(csv);

    const freezeDried = products.filter((p) => p.category === 'Freeze Dried');
    const subs = [...new Set(freezeDried.map((p) => p.subcategory))].sort();
    expect(subs).toEqual(['Cat Grass / Yogurt', 'Fish', 'Meats', 'Super Food']);
    expect(products.every((p) => p.price !== null && p.price > 0)).toBe(true);
  });
});

describe('parseCatalog — variants and bundles under the extended header', () => {
  it('links a variant to its parent product', () => {
    const csv = [
      EXT,
      'product,Jerky,,🍗,1,,,,Meaty Treats,',
      'variant,Chicken,80,,,Jerky,,,,',
    ].join('\n');
    const { products, variants } = parseCatalog(csv);
    expect(products[0].has_variants).toBe(1);
    expect(variants).toEqual([{ parent_product_name: 'Jerky', name: 'Chicken', price: 80 }]);
  });

  it('parses a bundle row', () => {
    const csv = [
      EXT,
      'product,Beef Strips,95,🥩,0,,,,Meaty Treats,',
      'bundle,Starter Pack,150,,,,"[{""product"":""Beef Strips"",""qty"":2}]",,,',
    ].join('\n');
    const { bundles } = parseCatalog(csv);
    expect(bundles).toEqual([
      { name: 'Starter Pack', price: 150, items: [{ product: 'Beef Strips', qty: 2 }] },
    ]);
  });
});
