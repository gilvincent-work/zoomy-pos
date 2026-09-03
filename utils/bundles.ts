import type { Product } from '../db/products';
import type { BundleItemInput } from '../db/saved-bundles';

/** Map of productId to the quantity chosen inside a bundle's flavor picker. */
export type BundleSelection = Record<number, number>;

/**
 * Active products whose category is one of the bundle's product lines. These are
 * the flavors a customer may choose from for a "buy any N" deal.
 */
export function eligibleFlavors(products: Product[], lineCategories: string[]): Product[] {
  const lines = new Set(lineCategories);
  return products.filter((p) => p.is_active === 1 && p.category != null && lines.has(p.category));
}

/** Human-readable list of a bundle's product lines, e.g. "Freeze Dried + Meaty Treats". */
export function bundleLineSummary(lineCategories: string[]): string {
  return lineCategories.join(' + ');
}

/** Plain-language description of a deal, shown as a preview and on tiles. */
export function bundlePreviewText(
  pickCount: number,
  lineCategories: string[],
  price: number
): string {
  const lines = lineCategories.length ? bundleLineSummary(lineCategories) : 'no lines yet';
  return `Pick any ${pickCount} from ${lines} for ₱${price.toFixed(2)}.`;
}

/** Total flavors chosen so far. */
export function totalSelected(selection: BundleSelection): number {
  return Object.values(selection).reduce((sum, n) => sum + n, 0);
}

/** True once exactly the required number of flavors has been chosen. */
export function isSelectionComplete(selection: BundleSelection, pickCount: number): boolean {
  return totalSelected(selection) === pickCount;
}

/** True when adding another flavor would exceed the deal's amount. */
export function isSelectionFull(selection: BundleSelection, pickCount: number): boolean {
  return totalSelected(selection) >= pickCount;
}

/** Converts the picker selection into the cart bundle's component items. */
export function selectionToBundleItems(
  selection: BundleSelection,
  products: Product[]
): BundleItemInput[] {
  const items: BundleItemInput[] = [];
  for (const [productId, quantity] of Object.entries(selection)) {
    if (quantity <= 0) continue;
    const product = products.find((p) => p.id === Number(productId));
    if (product) items.push({ id: product.id, name: product.name, quantity });
  }
  return items;
}
