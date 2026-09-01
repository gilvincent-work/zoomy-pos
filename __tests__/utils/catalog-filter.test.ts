import {
  categoryOf, filterProducts, subcategoriesFor, defaultSelectionFor, initialSelection,
} from '../../utils/catalog-filter';
import type { Product, CategoryGroup } from '../../db/products';

function product(partial: Partial<Product> & { id: number; name: string }): Product {
  return {
    price: 100,
    emoji: '🍬',
    image_uri: null,
    has_variants: 0,
    category: null,
    subcategory: null,
    is_active: 1,
    created_at: '2026-09-01T00:00:00.000Z',
    ...partial,
  };
}

const salmon = product({ id: 1, name: 'Salmon Cubes', category: 'Freeze Dried', subcategory: 'Fish' });
const lamb = product({ id: 2, name: 'Lamb Liver', category: 'Freeze Dried', subcategory: 'Meats' });
const yogurt = product({ id: 3, name: 'Yogurt Cubes', category: 'Freeze Dried', subcategory: 'Cat Grass / Yogurt' });
const beef = product({ id: 4, name: 'Beef Strips', category: 'Meaty Treats' });
const loose = product({ id: 5, name: 'Mystery Treat' }); // no category

const ALL = [salmon, lamb, yogurt, beef, loose];

const GROUPS: CategoryGroup[] = [
  { category: 'Freeze Dried', subcategories: ['Cat Grass / Yogurt', 'Fish', 'Meats'] },
  { category: 'Meaty Treats', subcategories: [] },
];

describe('categoryOf', () => {
  it('returns the product category when set', () => {
    expect(categoryOf(beef)).toBe('Meaty Treats');
  });
  it('falls back to Uncategorized when the category is missing', () => {
    expect(categoryOf(loose)).toBe('Uncategorized');
  });
});

describe('filterProducts', () => {
  it('returns everything when no category is active', () => {
    expect(filterProducts(ALL, null, null)).toHaveLength(5);
  });

  it('filters to a category when no subcategory is active', () => {
    const result = filterProducts(ALL, 'Freeze Dried', null);
    expect(result.map((p) => p.name)).toEqual(['Salmon Cubes', 'Lamb Liver', 'Yogurt Cubes']);
  });

  it('narrows to the active subcategory', () => {
    const result = filterProducts(ALL, 'Freeze Dried', 'Fish');
    expect(result).toEqual([salmon]);
  });

  it('matches uncategorized products against the Uncategorized bucket', () => {
    expect(filterProducts(ALL, 'Uncategorized', null)).toEqual([loose]);
  });
});

describe('subcategoriesFor', () => {
  it('returns a category subcategories', () => {
    expect(subcategoriesFor(GROUPS, 'Freeze Dried')).toEqual(['Cat Grass / Yogurt', 'Fish', 'Meats']);
  });
  it('returns empty for a category without subcategories', () => {
    expect(subcategoriesFor(GROUPS, 'Meaty Treats')).toEqual([]);
  });
  it('returns empty for a null category', () => {
    expect(subcategoriesFor(GROUPS, null)).toEqual([]);
  });
});

describe('defaultSelectionFor', () => {
  it('defaults to the first subcategory alphabetically', () => {
    expect(defaultSelectionFor(GROUPS, 'Freeze Dried')).toEqual({
      category: 'Freeze Dried',
      subcategory: 'Cat Grass / Yogurt',
    });
  });
  it('leaves subcategory null for a flat category', () => {
    expect(defaultSelectionFor(GROUPS, 'Meaty Treats')).toEqual({
      category: 'Meaty Treats',
      subcategory: null,
    });
  });
});

describe('initialSelection', () => {
  it('picks the first category and its first subcategory', () => {
    expect(initialSelection(GROUPS)).toEqual({
      category: 'Freeze Dried',
      subcategory: 'Cat Grass / Yogurt',
    });
  });
  it('returns nulls when there are no groups', () => {
    expect(initialSelection([])).toEqual({ category: null, subcategory: null });
  });
});
