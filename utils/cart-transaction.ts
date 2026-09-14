import type { CartItem, CartBundle } from '../context/CartContext';

export type InsertItem = {
  productId: number;
  productName: string;
  price: number;
  quantity: number;
  variantId?: number;
  variantName?: string;
  /** Which bundle instance in this cart a ₱0 pick belongs to (a 1-based index
   *  over the cart's bundles, matched by the sync push so Coop can group the
   *  bundle's header + picks). Undefined on plain individual items. */
  bundleGroup?: string | null;
};

/**
 * Flattens the cart (individual items + bundles) into transaction line items,
 * mirroring the payment modal so history and reports stay consistent. Bundle
 * component items are recorded at price 0 because the bundle price is the total,
 * and tagged with their bundle's group index so the sale records which picks
 * form which bundle (keeping the order editable under the bundle's rules).
 */
export function buildInsertItems(items: CartItem[], bundles: CartBundle[]): InsertItem[] {
  const bundleInsertItems: InsertItem[] = bundles.flatMap((b, bi) =>
    b.items.map((i) => ({
      productId: i.id,
      productName: i.name,
      price: 0,
      quantity: i.quantity,
      variantId: i.variantId,
      variantName: i.variantName,
      bundleGroup: String(bi + 1),
    }))
  );
  const individualInsertItems: InsertItem[] = items.map((i) => ({
    productId: i.productId,
    productName: i.productName,
    price: i.price,
    quantity: i.quantity,
    variantId: i.variantId,
    variantName: i.variantName,
  }));
  return [...bundleInsertItems, ...individualInsertItems];
}
