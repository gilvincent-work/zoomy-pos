import {
  eligibleFlavors,
  bundleLineSummary,
  bundlePreviewText,
  totalSelected,
  isSelectionComplete,
  isSelectionFull,
  selectionToBundleItems,
} from '../../utils/bundles';
import type { Product } from '../../db/products';

function product(over: Partial<Product> & Pick<Product, 'id' | 'name'>): Product {
  return {
    id: over.id,
    name: over.name,
    price: over.price ?? 100,
    emoji: over.emoji ?? '🍖',
    image_uri: null,
    has_variants: 0,
    category: over.category ?? 'Meaty Treats',
    subcategory: over.subcategory ?? null,
    is_active: over.is_active ?? 1,
    created_at: '2026-09-03T10:00:00.000Z',
  };
}

const salmon = product({ id: 1, name: 'Salmon Cubes', category: 'Freeze Dried' });
const beef = product({ id: 2, name: 'Beef', category: 'Meaty Treats' });
const duo = product({ id: 3, name: 'Carrot Duck', category: 'Super Duo Bites' });
const inactive = product({ id: 4, name: 'Old Chicken', category: 'Meaty Treats', is_active: 0 });

describe('eligibleFlavors', () => {
  it('returns active products in the given lines only', () => {
    const result = eligibleFlavors([salmon, beef, duo, inactive], ['Freeze Dried', 'Meaty Treats']);
    expect(result.map((p) => p.id)).toEqual([1, 2]);
  });

  it('excludes inactive products', () => {
    const result = eligibleFlavors([inactive], ['Meaty Treats']);
    expect(result).toEqual([]);
  });

  it('returns nothing when no lines are selected', () => {
    expect(eligibleFlavors([salmon, beef], [])).toEqual([]);
  });
});

describe('bundleLineSummary', () => {
  it('joins lines with a plus', () => {
    expect(bundleLineSummary(['Freeze Dried', 'Meaty Treats'])).toBe('Freeze Dried + Meaty Treats');
  });
});

describe('bundlePreviewText', () => {
  it('describes the deal in plain language', () => {
    expect(bundlePreviewText(4, ['Freeze Dried', 'Meaty Treats'], 570)).toBe(
      'Pick any 4 from Freeze Dried + Meaty Treats for ₱570.00.'
    );
  });

  it('handles no lines gracefully', () => {
    expect(bundlePreviewText(2, [], 550)).toBe('Pick any 2 from no lines yet for ₱550.00.');
  });
});

describe('selection helpers', () => {
  it('totalSelected sums quantities', () => {
    expect(totalSelected({ 1: 2, 2: 1 })).toBe(3);
  });

  it('isSelectionComplete is true only at the exact count', () => {
    expect(isSelectionComplete({ 1: 2, 2: 1 }, 4)).toBe(false);
    expect(isSelectionComplete({ 1: 2, 2: 2 }, 4)).toBe(true);
  });

  it('isSelectionFull is true at or above the count', () => {
    expect(isSelectionFull({ 1: 4 }, 4)).toBe(true);
    expect(isSelectionFull({ 1: 3 }, 4)).toBe(false);
  });
});

describe('selectionToBundleItems', () => {
  it('maps chosen products to bundle items, skipping zero quantities', () => {
    const items = selectionToBundleItems({ 1: 2, 2: 0, 3: 1 }, [salmon, beef, duo]);
    expect(items).toEqual([
      { id: 1, name: 'Salmon Cubes', quantity: 2 },
      { id: 3, name: 'Carrot Duck', quantity: 1 },
    ]);
  });
});
