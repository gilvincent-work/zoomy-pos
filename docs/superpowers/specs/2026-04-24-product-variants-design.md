# Product Variants/Flavors Feature Design

## Overview

Add a variant/flavor system to ZoomyPOS products. Products can optionally have variants (e.g., Milk Tea → Wintermelon, Taro, Okinawa), each with its own price. The emoji field is removed from the product form.

## Decisions

| Decision | Choice |
|----------|--------|
| Pricing model | Per-variant — each variant has its own price |
| Grid display | Parent tile only (no price on tile), tap opens variant picker |
| Variant picker layout | Grid of variant tiles matching main POS grid style |
| Product form UX | "Has variants?" toggle — OFF = price field, ON = variant list |
| Cart/receipt display | Variants grouped under parent product name |
| Emoji field | Removed from product form and tile |

## Database Changes

### Modified: `products` table

- **Remove** `emoji` column
- **Add** `has_variants INTEGER NOT NULL DEFAULT 0`
- `price` becomes nullable — set to NULL when `has_variants = 1`

### New: `product_variants` table

```sql
CREATE TABLE product_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  FOREIGN KEY (product_id) REFERENCES products(id)
);
```

### Modified: `transaction_items` table

- **Add** `variant_id INTEGER` (nullable, FK to product_variants)
- **Add** `variant_name TEXT` (nullable, denormalized for history)

## UI Changes

### 1. Product Form (`app/modals/products.tsx`)

- Remove emoji TextInput field
- Add "Has variants?" toggle switch below product name
- **Toggle OFF (simple product):**
  - Show price field (existing behavior minus emoji)
- **Toggle ON (variant product):**
  - Hide price field
  - Show variant list section:
    - Each row: variant name input + price input + delete (✕) button
    - "+ Add Variant" button at bottom
    - Minimum 1 variant required for save
- Editing an existing product with variants pre-populates the variant list
- Validation: variant names must be non-empty, prices must be > 0

### 2. Product Tile (`components/ProductTile.tsx`)

- Remove emoji display (fontSize: 34 emoji)
- Show product name (centered, up to 3 lines) — same as today minus emoji
- **Simple products:** show price on tile
- **Variant products:** no price shown on tile (just the product name)
- Active state (pink border/background when in cart) still applies

### 3. Product Grid (`app/index.tsx`)

- **Tapping a simple product:** works exactly as today — adds to cart directly
- **Tapping a variant product:** opens the VariantPickerModal instead of adding to cart
- Badge on parent tile shows total quantity across all its variants in the cart
- Long press on parent tile removes all its variants from cart
- Minus button on parent tile: not shown (user manages quantities in the variant picker)

### 4. Variant Picker Modal (new component)

- Presentation: React Native `<Modal>` with slide animation, matching existing modal patterns
- Header: parent product name
- Body: grid of variant tiles (reuses ProductTile component style)
  - Each variant tile shows: variant name + price
  - Tap = increment quantity (badge appears)
  - Long press = remove variant from selection
  - Minus button = decrement quantity
- Footer: "Done" button showing item count and subtotal
  - Format: "Done (3 items — ₱145)"
  - Tapping Done adds all selected variants to the cart and dismisses the modal
  - If no variants selected and user taps Done, just dismiss (no cart changes)
- Re-opening the modal for a product already in cart pre-populates quantities

### 5. Product Management List (`app/modals/products.tsx` list view)

- Products with variants show "X variants" text instead of price
- Toggle active/inactive works at the product level (hides product + all variants from POS grid)
- Individual variant active/inactive is managed within the edit form

### 6. Cart Display (payment flow)

- **Simple products:** display as today — `Product Name x2 ... ₱90`
- **Variant products:** grouped under parent name
  ```
  Milk Tea
    Wintermelon x2       ₱90
    Okinawa x1           ₱55
  ```
- CartContext tracks variant items with: `productId`, `variantId`, `variantName`, `productName`, `price`, `quantity`

### 7. Transaction History (`app/modals/transactions.tsx`)

- Transaction detail view shows variant names in the line items
- Uses denormalized `variant_name` from `transaction_items` table (survives variant deletion/rename)

## Cart Context Changes (`context/CartContext.tsx`)

- CartItem type extended: add optional `variantId`, `variantName` fields
- `ADD_ITEM` action: accepts variant info when present
- Cart items with the same `productId` + `variantId` combination are aggregated
- `getItemCount(productId)`: returns total quantity across all variants of that product (for parent tile badge)
- Cart display grouping: items grouped by `productId`, variants listed under parent

## Database Service Changes (`db/products.ts`)

- `createProduct()`: accepts optional variants array, inserts product + variants in one batch
- `updateProduct()`: handles variant create/update/delete alongside product update
- `getActiveProducts()`: returns products with a `has_variants` flag (no join needed for grid)
- `getVariantsByProductId(productId)`: returns active variants for a product
- `getAllProducts()`: includes variant count for the management list

## Migration Strategy

- Use `ALTER TABLE` pattern consistent with existing `schema.ts`
- Add `has_variants` column with default 0 (existing products unaffected)
- Remove `emoji` column: SQLite doesn't support DROP COLUMN before 3.35.0 — leave the column in place but stop reading/writing it
- Create `product_variants` table
- Add `variant_id` and `variant_name` columns to `transaction_items`

## Edge Cases

- **Deleting a variant that's in the cart:** remove it from cart on next render if variant no longer exists
- **Toggling a product inactive that's in the cart:** existing cart items remain until cleared (same as current behavior)
- **Converting a simple product to variant product:** price field is cleared, user must add at least one variant
- **Converting a variant product back to simple:** variants are deleted, user must enter a price
- **All variants inactive:** product still shows on grid but variant picker shows empty state with message
