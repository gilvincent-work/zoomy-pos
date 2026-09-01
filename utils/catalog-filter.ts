import type { Product, CategoryGroup } from '../db/products';
import { UNCATEGORIZED } from '../db/products';

/** The category label a product belongs to, mapping missing categories to the shared bucket. */
export function categoryOf(product: Product): string {
  return product.category && product.category.trim() ? product.category : UNCATEGORIZED;
}

/**
 * Products visible for the current category / subcategory selection.
 * - A null activeSubcategory means "show the whole category" (used for categories
 *   without subcategories, or before a subcategory is chosen).
 * - When a subcategory is active, only products tagged with it are shown.
 */
export function filterProducts(
  products: Product[],
  activeCategory: string | null,
  activeSubcategory: string | null
): Product[] {
  if (!activeCategory) return products;
  return products.filter((p) => {
    if (categoryOf(p) !== activeCategory) return false;
    if (activeSubcategory == null) return true;
    return p.subcategory === activeSubcategory;
  });
}

/** Look up a category's subcategories from the derived tree. */
export function subcategoriesFor(groups: CategoryGroup[], category: string | null): string[] {
  if (!category) return [];
  return groups.find((g) => g.category === category)?.subcategories ?? [];
}

/**
 * Resolves the selection when the category changes: keep the category, and default the
 * subcategory to the first one alphabetically (or null when the category has none).
 */
export function defaultSelectionFor(
  groups: CategoryGroup[],
  category: string | null
): { category: string | null; subcategory: string | null } {
  if (!category) return { category: null, subcategory: null };
  const subs = subcategoriesFor(groups, category);
  return { category, subcategory: subs.length > 0 ? subs[0] : null };
}

/** The initial selection when the screen loads: first category, its first subcategory (if any). */
export function initialSelection(groups: CategoryGroup[]): {
  category: string | null;
  subcategory: string | null;
} {
  if (groups.length === 0) return { category: null, subcategory: null };
  return defaultSelectionFor(groups, groups[0].category);
}
