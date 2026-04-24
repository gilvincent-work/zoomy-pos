# Product Variants/Flavors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional variant/flavor system to products so each product can have multiple priced variants, with a variant picker modal on the POS grid and grouped cart display.

**Architecture:** A new `product_variants` table with FK to `products`. Products with `has_variants=1` have nullable price — pricing lives on variants instead. The CartContext is extended with optional `variantId`/`variantName` fields, using a composite key (`productId + variantId`) for aggregation. A new `VariantPickerModal` component reuses the ProductTile style for consistency.

**Tech Stack:** React Native, Expo SDK 54, expo-sqlite, expo-router, TypeScript

**Spec:** `docs/superpowers/specs/2026-04-24-product-variants-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `db/schema.ts` | Modify | Add migrations: `has_variants` column, `product_variants` table, `transaction_items` variant columns |
| `db/products.ts` | Modify | Update `Product` type, add `ProductVariant` type, add variant CRUD functions |
| `context/CartContext.tsx` | Modify | Extend `CartItem` with variant fields, update reducer for composite key matching |
| `components/ProductTile.tsx` | Modify | Remove emoji prop, add optional price display, handle variant products |
| `components/VariantPickerModal.tsx` | Create | Variant picker modal with grid of variant tiles and Done button |
| `app/index.tsx` | Modify | Handle variant product taps, update badge calculation, integrate variant picker |
| `app/modals/products.tsx` | Modify | Remove emoji field, add "Has variants?" toggle, variant list management |
| `db/transactions.ts` | Modify | Add variant fields to `InsertItem`, `TransactionItem`, update queries |
| `app/modals/payment.tsx` | Modify | Update order summary to group variant items under parent product |
| `app/modals/transactions.tsx` | Modify | Show variant names in transaction detail view |

---

### Task 1: Database Schema Migration

**Files:**
- Modify: `db/schema.ts`

- [ ] **Step 1: Add product_variants table and new columns to initSchema**

In `db/schema.ts`, add the `product_variants` table creation to the main `execAsync` block, and add ALTER TABLE migrations for the new columns. Add after the existing `CREATE TABLE` statements inside the template literal:

```sql
CREATE TABLE IF NOT EXISTS product_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  FOREIGN KEY (product_id) REFERENCES products(id)
);
```

Then add these ALTER TABLE migrations after the existing ones (same `.catch(() => {})` pattern):

```typescript
await db.runAsync(
  `ALTER TABLE products ADD COLUMN has_variants INTEGER NOT NULL DEFAULT 0`
).catch(() => {});

await db.runAsync(
  `ALTER TABLE transaction_items ADD COLUMN variant_id INTEGER`
).catch(() => {});

await db.runAsync(
  `ALTER TABLE transaction_items ADD COLUMN variant_name TEXT`
).catch(() => {});
```

- [ ] **Step 2: Verify the app starts without errors**

Run: `npx expo start` and confirm the app loads on a device/simulator. The migration should run silently — existing data is unaffected.

- [ ] **Step 3: Commit**

```bash
git add db/schema.ts
git commit -m "feat(db): add product_variants table and variant columns"
```

---

### Task 2: Product Types and Variant CRUD

**Files:**
- Modify: `db/products.ts`

- [ ] **Step 1: Update Product type and add ProductVariant type**

Replace the existing `Product` type and add a new `ProductVariant` type at the top of `db/products.ts`:

```typescript
export type Product = {
  id: number;
  name: string;
  price: number | null;
  emoji: string;
  has_variants: number;
  is_active: number;
  created_at: string;
};

export type ProductVariant = {
  id: number;
  product_id: number;
  name: string;
  price: number;
  is_active: number;
  created_at: string;
};
```

- [ ] **Step 2: Add getVariantsByProductId function**

Add this function to `db/products.ts`:

```typescript
export async function getVariantsByProductId(productId: number): Promise<ProductVariant[]> {
  const db = await getDatabase();
  return db.getAllAsync<ProductVariant>(
    'SELECT * FROM product_variants WHERE product_id = ? AND is_active = 1 ORDER BY name ASC',
    [productId]
  );
}
```

- [ ] **Step 3: Add getAllVariantsByProductId function (includes inactive)**

This is needed for the edit form to show all variants including inactive ones:

```typescript
export async function getAllVariantsByProductId(productId: number): Promise<ProductVariant[]> {
  const db = await getDatabase();
  return db.getAllAsync<ProductVariant>(
    'SELECT * FROM product_variants WHERE product_id = ? ORDER BY name ASC',
    [productId]
  );
}
```

- [ ] **Step 4: Update createProduct to handle variants**

Replace the existing `createProduct` function:

```typescript
export async function createProduct(input: {
  name: string;
  price: number | null;
  has_variants: boolean;
  variants?: { name: string; price: number }[];
}): Promise<number> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const result = await db.runAsync(
    'INSERT INTO products (name, price, emoji, has_variants, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)',
    [input.name, input.price, '🍬', input.has_variants ? 1 : 0, now]
  );
  const productId = result.lastInsertRowId;

  if (input.variants) {
    for (const v of input.variants) {
      await db.runAsync(
        'INSERT INTO product_variants (product_id, name, price, is_active, created_at) VALUES (?, ?, ?, 1, ?)',
        [productId, v.name, v.price, now]
      );
    }
  }

  return productId;
}
```

- [ ] **Step 5: Update updateProduct to handle variants**

Replace the existing `updateProduct` function:

```typescript
export async function updateProduct(
  id: number,
  fields: {
    name: string;
    price: number | null;
    has_variants: boolean;
    is_active: number;
    variants?: { id?: number; name: string; price: number }[];
  }
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE products SET name = ?, price = ?, has_variants = ?, is_active = ? WHERE id = ?',
    [fields.name, fields.price, fields.has_variants ? 1 : 0, fields.is_active, id]
  );

  if (fields.has_variants && fields.variants) {
    const existingVariants = await db.getAllAsync<ProductVariant>(
      'SELECT id FROM product_variants WHERE product_id = ?',
      [id]
    );
    const existingIds = existingVariants.map((v) => v.id);
    const keptIds = fields.variants.filter((v) => v.id).map((v) => v.id!);
    const removedIds = existingIds.filter((eid) => !keptIds.includes(eid));

    for (const rid of removedIds) {
      await db.runAsync('DELETE FROM product_variants WHERE id = ?', [rid]);
    }

    const now = new Date().toISOString();
    for (const v of fields.variants) {
      if (v.id) {
        await db.runAsync(
          'UPDATE product_variants SET name = ?, price = ? WHERE id = ?',
          [v.name, v.price, v.id]
        );
      } else {
        await db.runAsync(
          'INSERT INTO product_variants (product_id, name, price, is_active, created_at) VALUES (?, ?, ?, 1, ?)',
          [id, v.name, v.price, now]
        );
      }
    }
  }

  if (!fields.has_variants) {
    await db.runAsync('DELETE FROM product_variants WHERE product_id = ?', [id]);
  }
}
```

- [ ] **Step 6: Update getAllProducts to include variant count**

Replace the existing `getAllProducts` function. We use a LEFT JOIN to get variant counts:

```typescript
type ProductWithCount = Product & { variant_count: number };

export async function getAllProducts(): Promise<ProductWithCount[]> {
  const db = await getDatabase();
  return db.getAllAsync<ProductWithCount>(
    `SELECT p.*, COUNT(pv.id) as variant_count
     FROM products p
     LEFT JOIN product_variants pv ON pv.product_id = p.id AND pv.is_active = 1
     GROUP BY p.id
     ORDER BY p.name ASC`
  );
}
```

- [ ] **Step 7: Verify app still compiles**

Run: `npx expo start` — the app should compile. The product list will still work because `Product` type is a superset of the old type (just `price` is now `number | null` and `has_variants` is new). Existing products have `has_variants = 0` and `price` populated, so nothing breaks.

- [ ] **Step 8: Commit**

```bash
git add db/products.ts
git commit -m "feat(db): add variant CRUD and update product types"
```

---

### Task 3: CartContext Variant Support

**Files:**
- Modify: `context/CartContext.tsx`

- [ ] **Step 1: Extend CartItem type with variant fields**

Update the `CartItem` type at the top of the file:

```typescript
export type CartItem = {
  productId: number;
  productName: string;
  price: number;
  quantity: number;
  variantId?: number;
  variantName?: string;
};
```

- [ ] **Step 2: Update ADD_ITEM action type**

Update the `CartAction` union — the `ADD_ITEM` product type needs optional variant fields:

```typescript
type CartAction =
  | { type: 'ADD_ITEM'; product: { id: number; name: string; price: number; variantId?: number; variantName?: string } }
  | { type: 'REMOVE_ITEM'; productId: number }
  | { type: 'DECREMENT_ITEM'; productId: number; variantId?: number }
  | { type: 'CLEAR_CART' }
  | { type: 'SET_BUNDLE'; bundleItems: BundleItemInput[]; price: number };
```

- [ ] **Step 3: Update cartReducer ADD_ITEM case**

The key change: match on both `productId` AND `variantId` for variant items. Replace the `ADD_ITEM` case:

```typescript
case 'ADD_ITEM': {
  const matchIndex = state.items.findIndex((i) =>
    i.productId === action.product.id &&
    i.variantId === action.product.variantId
  );
  if (matchIndex >= 0) {
    return {
      bundlePrice: null,
      items: state.items.map((i, idx) =>
        idx === matchIndex ? { ...i, quantity: i.quantity + 1 } : i
      ),
    };
  }
  return {
    bundlePrice: null,
    items: [
      ...state.items,
      {
        productId: action.product.id,
        productName: action.product.name,
        price: action.product.price,
        quantity: 1,
        variantId: action.product.variantId,
        variantName: action.product.variantName,
      },
    ],
  };
}
```

- [ ] **Step 4: Update REMOVE_ITEM case**

REMOVE_ITEM removes ALL items for a given productId (used for long-press on parent tile). This already works correctly — it filters by `productId` and will remove all variants of that product. No change needed.

- [ ] **Step 5: Update DECREMENT_ITEM case**

Decrement needs to match on the composite key when a variantId is provided:

```typescript
case 'DECREMENT_ITEM': {
  const item = state.items.find((i) =>
    i.productId === action.productId &&
    (action.variantId === undefined || i.variantId === action.variantId)
  );
  if (!item) return state;
  if (item.quantity <= 1) {
    return {
      ...state,
      items: state.items.filter((i) =>
        !(i.productId === action.productId &&
          (action.variantId === undefined || i.variantId === action.variantId))
      ),
    };
  }
  return {
    ...state,
    items: state.items.map((i) =>
      (i.productId === action.productId &&
        (action.variantId === undefined || i.variantId === action.variantId))
        ? { ...i, quantity: i.quantity - 1 }
        : i
    ),
  };
}
```

- [ ] **Step 6: Update CartContextValue type and provider**

Update the `addItem` and `decrementItem` signatures in the type and provider:

```typescript
type CartContextValue = {
  items: CartItem[];
  total: number;
  bundlePrice: number | null;
  addItem: (product: { id: number; name: string; price: number; variantId?: number; variantName?: string }) => void;
  removeItem: (productId: number) => void;
  decrementItem: (productId: number, variantId?: number) => void;
  clearCart: () => void;
  setBundle: (bundleItems: BundleItemInput[], price: number) => void;
};
```

Update the provider value:

```typescript
decrementItem: (productId, variantId) =>
  dispatch({ type: 'DECREMENT_ITEM', productId, variantId }),
```

- [ ] **Step 7: Verify app compiles and cart still works for simple products**

Run: `npx expo start`, add simple products to cart, confirm add/remove/decrement still works.

- [ ] **Step 8: Commit**

```bash
git add context/CartContext.tsx
git commit -m "feat(cart): extend CartContext with variant support"
```

---

### Task 4: Update ProductTile Component

**Files:**
- Modify: `components/ProductTile.tsx`

- [ ] **Step 1: Update Props type — remove emoji, add optional price and hasVariants**

Replace the `Props` type:

```typescript
type Props = {
  id: number;
  name: string;
  price?: number | null;
  hasVariants?: boolean;
  badgeCount: number;
  onPress: (id: number) => void;
  onLongPress: (id: number) => void;
  onMinus?: (id: number) => void;
};
```

- [ ] **Step 2: Update the component render — remove emoji, add price display**

Replace the component function:

```typescript
export function ProductTile({ id, name, price, hasVariants, badgeCount, onPress, onLongPress, onMinus }: Props) {
  const active = badgeCount > 0;
  return (
    <TouchableOpacity
      testID="tile"
      style={[styles.tile, active && styles.tileActive]}
      onPress={() => onPress(id)}
      onLongPress={() => onLongPress(id)}
      activeOpacity={0.7}
    >
      {active && (
        <View style={styles.badge}>
          <Text style={styles.badgeText} testID="badge">{badgeCount}</Text>
        </View>
      )}
      <Text style={styles.name} numberOfLines={3}>{name}</Text>
      {!hasVariants && price != null && (
        <Text style={styles.price}>₱{price.toFixed(2)}</Text>
      )}
      {active && onMinus && (
        <TouchableOpacity
          testID="minus-btn"
          style={styles.minusBtn}
          onPress={(e) => {
            e.stopPropagation();
            onMinus(id);
          }}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.minusText}>−</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}
```

- [ ] **Step 3: Update styles — remove emoji style, add price style**

Remove the `emoji` style and add a `price` style:

```typescript
// Remove this line:
// emoji: { fontSize: 34 },

// Add this:
price: {
  color: C.pink,
  fontSize: F.sm,
  fontWeight: '700',
  marginTop: 4,
},
```

- [ ] **Step 4: Commit**

```bash
git add components/ProductTile.tsx
git commit -m "feat(tile): remove emoji, add price display and variant support"
```

---

### Task 5: Create VariantPickerModal Component

**Files:**
- Create: `components/VariantPickerModal.tsx`

- [ ] **Step 1: Create the VariantPickerModal component**

Create `components/VariantPickerModal.tsx`:

```typescript
import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Modal,
  StyleSheet, SafeAreaView,
} from 'react-native';
import { ProductTile } from './ProductTile';
import { ProductVariant } from '../db/products';
import { C, F, R } from '../constants/theme';

type Props = {
  visible: boolean;
  productName: string;
  variants: ProductVariant[];
  initialQuantities: Record<number, number>;
  onDone: (selections: { variantId: number; variantName: string; price: number; quantity: number }[]) => void;
  onClose: () => void;
};

export function VariantPickerModal({ visible, productName, variants, initialQuantities, onDone, onClose }: Props) {
  const [quantities, setQuantities] = useState<Record<number, number>>({});

  useEffect(() => {
    if (visible) {
      setQuantities(initialQuantities);
    }
  }, [visible, initialQuantities]);

  function increment(variantId: number) {
    setQuantities((q) => ({ ...q, [variantId]: (q[variantId] ?? 0) + 1 }));
  }

  function remove(variantId: number) {
    setQuantities((q) => {
      const next = { ...q };
      delete next[variantId];
      return next;
    });
  }

  function decrement(variantId: number) {
    setQuantities((q) => {
      const current = q[variantId] ?? 0;
      if (current <= 1) {
        const next = { ...q };
        delete next[variantId];
        return next;
      }
      return { ...q, [variantId]: current - 1 };
    });
  }

  function handleDone() {
    const selections = variants
      .filter((v) => (quantities[v.id] ?? 0) > 0)
      .map((v) => ({
        variantId: v.id,
        variantName: v.name,
        price: v.price,
        quantity: quantities[v.id],
      }));
    onDone(selections);
  }

  const totalItems = Object.values(quantities).reduce((s, q) => s + q, 0);
  const totalPrice = variants.reduce((s, v) => s + v.price * (quantities[v.id] ?? 0), 0);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <SafeAreaView style={styles.sheet}>
          <Text style={styles.title}>{productName}</Text>
          <Text style={styles.subtitle}>Select variants</Text>

          <FlatList
            data={variants}
            keyExtractor={(v) => String(v.id)}
            numColumns={3}
            contentContainerStyle={styles.grid}
            columnWrapperStyle={styles.row}
            renderItem={({ item }) => (
              <View style={styles.tileWrapper}>
                <ProductTile
                  id={item.id}
                  name={item.name}
                  price={item.price}
                  badgeCount={quantities[item.id] ?? 0}
                  onPress={() => increment(item.id)}
                  onLongPress={() => remove(item.id)}
                  onMinus={() => decrement(item.id)}
                />
              </View>
            )}
            ListEmptyComponent={
              <Text style={styles.empty}>No active variants for this product.</Text>
            }
          />

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.doneBtn} onPress={handleDone}>
              <Text style={styles.doneText}>
                {totalItems > 0
                  ? `Done (${totalItems} item${totalItems !== 1 ? 's' : ''} — ₱${totalPrice.toFixed(2)})`
                  : 'Done'}
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: C.bg,
    borderTopLeftRadius: R.xl,
    borderTopRightRadius: R.xl,
    borderTopWidth: 1,
    borderColor: C.borderDark,
    maxHeight: '85%',
  },
  title: {
    color: C.textPrimary,
    fontSize: F.xl,
    fontWeight: '800',
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  subtitle: {
    color: C.textSecondary,
    fontSize: F.sm,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  grid: { padding: 12, paddingBottom: 4 },
  row: { gap: 8, marginBottom: 8 },
  tileWrapper: { flex: 1, maxWidth: '33.33%' },
  empty: {
    color: C.textMuted,
    textAlign: 'center',
    marginTop: 40,
    fontSize: F.md,
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: C.borderDark,
    backgroundColor: C.surface,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.sm,
    padding: 14,
    alignItems: 'center',
  },
  cancelText: { color: C.textSecondary, fontWeight: '700', fontSize: F.md },
  doneBtn: {
    flex: 2,
    backgroundColor: C.pink,
    borderRadius: R.sm,
    padding: 14,
    alignItems: 'center',
  },
  doneText: { color: '#fff', fontWeight: '800', fontSize: F.md },
});
```

- [ ] **Step 2: Commit**

```bash
git add components/VariantPickerModal.tsx
git commit -m "feat: add VariantPickerModal component"
```

---

### Task 6: Update POS Grid Screen

**Files:**
- Modify: `app/index.tsx`

- [ ] **Step 1: Add imports for variant support**

Add these imports at the top of `app/index.tsx`:

```typescript
import { getActiveProducts, getVariantsByProductId, Product, ProductVariant } from '../db/products';
import { VariantPickerModal } from '../components/VariantPickerModal';
```

Remove the existing `getActiveProducts, Product` import line (it's being replaced by the one above).

- [ ] **Step 2: Add state for the variant picker modal**

Add these state variables inside `POSScreen`, after the existing state declarations:

```typescript
const [variantPickerProduct, setVariantPickerProduct] = useState<Product | null>(null);
const [variantPickerVariants, setVariantPickerVariants] = useState<ProductVariant[]>([]);
```

- [ ] **Step 3: Update getBadge to sum across all variants of a product**

Replace the existing `getBadge` function:

```typescript
const getBadge = (productId: number) =>
  items
    .filter((i) => i.productId === productId)
    .reduce((sum, i) => sum + i.quantity, 0);
```

- [ ] **Step 4: Add handler for tapping a variant product**

Add this function inside `POSScreen`:

```typescript
async function handleProductPress(product: Product) {
  if (product.has_variants) {
    const variants = await getVariantsByProductId(product.id);
    setVariantPickerVariants(variants);
    setVariantPickerProduct(product);
  } else {
    addItem({ id: product.id, name: product.name, price: product.price! });
  }
}
```

- [ ] **Step 5: Add handler for variant picker Done**

Add this function inside `POSScreen`:

```typescript
function handleVariantsDone(selections: { variantId: number; variantName: string; price: number; quantity: number }[]) {
  if (variantPickerProduct) {
    removeItem(variantPickerProduct.id);
    for (const s of selections) {
      for (let i = 0; i < s.quantity; i++) {
        addItem({
          id: variantPickerProduct.id,
          name: variantPickerProduct.name,
          price: s.price,
          variantId: s.variantId,
          variantName: s.variantName,
        });
      }
    }
  }
  setVariantPickerProduct(null);
  setVariantPickerVariants([]);
}
```

- [ ] **Step 6: Compute initialQuantities for the variant picker**

Add this computed value inside `POSScreen`, after the state declarations:

```typescript
const variantInitialQuantities: Record<number, number> = {};
if (variantPickerProduct) {
  for (const item of items) {
    if (item.productId === variantPickerProduct.id && item.variantId) {
      variantInitialQuantities[item.variantId] = item.quantity;
    }
  }
}
```

- [ ] **Step 7: Update FlatList renderItem to use new handlers and remove emoji**

Replace the `renderItem` in the FlatList:

```typescript
renderItem={({ item }) => (
  <View style={styles.tileWrapper}>
    <ProductTile
      id={item.id}
      name={item.name}
      price={item.price}
      hasVariants={item.has_variants === 1}
      badgeCount={getBadge(item.id)}
      onPress={() => handleProductPress(item)}
      onLongPress={() => removeItem(item.id)}
      onMinus={item.has_variants ? undefined : () => decrementItem(item.id)}
    />
  </View>
)}
```

- [ ] **Step 8: Add VariantPickerModal to the JSX**

Add the modal right before the closing `</SafeAreaView>` tag:

```typescript
<VariantPickerModal
  visible={!!variantPickerProduct}
  productName={variantPickerProduct?.name ?? ''}
  variants={variantPickerVariants}
  initialQuantities={variantInitialQuantities}
  onDone={handleVariantsDone}
  onClose={() => {
    setVariantPickerProduct(null);
    setVariantPickerVariants([]);
  }}
/>
```

- [ ] **Step 9: Test the POS grid**

Run the app. Verify:
1. Simple products still tap-to-add normally (no emoji shown, price shown)
2. Products with variants show the variant picker modal when tapped
3. Badge counts work for both types
4. Long press still removes items

- [ ] **Step 10: Commit**

```bash
git add app/index.tsx
git commit -m "feat(pos): integrate variant picker and update product grid"
```

---

### Task 7: Update Product Management Form

**Files:**
- Modify: `app/modals/products.tsx`

- [ ] **Step 1: Update imports**

Add `getAllVariantsByProductId` and `ProductVariant` to the import from `../../db/products`:

```typescript
import { getAllProducts, createProduct, updateProduct, Product, ProductVariant, getAllVariantsByProductId } from '../../db/products';
```

- [ ] **Step 2: Update FormState type and EMPTY_FORM**

Replace the `FormState` type and `EMPTY_FORM`:

```typescript
type VariantFormRow = { id?: number; name: string; price: string };

type FormState = {
  name: string;
  price: string;
  hasVariants: boolean;
  variants: VariantFormRow[];
};

const EMPTY_FORM: FormState = { name: '', price: '', hasVariants: false, variants: [] };
```

- [ ] **Step 3: Update handleSave for variants**

Replace the `handleSave` function:

```typescript
async function handleSave() {
  const name = form.name.trim();
  if (!name) { Alert.alert('Required', 'Product name is required.'); return; }

  if (form.hasVariants) {
    const validVariants = form.variants.filter((v) => v.name.trim());
    if (validVariants.length === 0) {
      Alert.alert('Required', 'Add at least one variant.');
      return;
    }
    for (const v of validVariants) {
      const p = parseFloat(v.price);
      if (isNaN(p) || p <= 0) {
        Alert.alert('Invalid price', `Enter a valid price for "${v.name}".`);
        return;
      }
    }
    const parsedVariants = validVariants.map((v) => ({
      id: v.id,
      name: v.name.trim(),
      price: parseFloat(v.price),
    }));

    if (editingId !== null) {
      const existing = products.find((p) => p.id === editingId)!;
      await updateProduct(editingId, {
        name,
        price: null,
        has_variants: true,
        is_active: existing.is_active,
        variants: parsedVariants,
      });
    } else {
      await createProduct({
        name,
        price: null,
        has_variants: true,
        variants: parsedVariants,
      });
    }
  } else {
    const price = parseFloat(form.price);
    if (isNaN(price) || price <= 0) {
      Alert.alert('Invalid price', 'Enter a valid price.');
      return;
    }

    if (editingId !== null) {
      const existing = products.find((p) => p.id === editingId)!;
      await updateProduct(editingId, {
        name,
        price,
        has_variants: false,
        is_active: existing.is_active,
      });
    } else {
      await createProduct({ name, price, has_variants: false });
    }
  }

  const updated = await getAllProducts();
  setProducts(updated);
  setForm(EMPTY_FORM);
  setEditingId(null);
  setShowForm(false);
}
```

- [ ] **Step 4: Update handleToggle**

Replace the `handleToggle` function:

```typescript
async function handleToggle(product: Product) {
  await updateProduct(product.id, {
    name: product.name,
    price: product.price,
    has_variants: product.has_variants === 1,
    is_active: product.is_active === 1 ? 0 : 1,
  });
  const updated = await getAllProducts();
  setProducts(updated);
}
```

- [ ] **Step 5: Update startEdit to load variants**

Replace the `startEdit` function:

```typescript
async function startEdit(product: Product) {
  let variants: VariantFormRow[] = [];
  if (product.has_variants) {
    const dbVariants = await getAllVariantsByProductId(product.id);
    variants = dbVariants.map((v) => ({
      id: v.id,
      name: v.name,
      price: String(v.price),
    }));
  }
  setForm({
    name: product.name,
    price: product.price != null ? String(product.price) : '',
    hasVariants: product.has_variants === 1,
    variants,
  });
  setEditingId(product.id);
  setShowForm(true);
}
```

- [ ] **Step 6: Update the form JSX — remove emoji, add toggle and variant list**

Replace the entire `{showForm ? (...)` block with:

```typescript
{showForm ? (
  <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.form}>
    <Text style={styles.formTitle}>{editingId ? 'Edit Product' : 'New Product'}</Text>
    <TextInput
      style={styles.input}
      placeholder="Product name"
      placeholderTextColor={C.textMuted}
      value={form.name}
      onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
    />

    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>Has variants?</Text>
      <Switch
        value={form.hasVariants}
        onValueChange={(v) => setForm((f) => ({
          ...f,
          hasVariants: v,
          price: v ? '' : f.price,
          variants: v && f.variants.length === 0 ? [{ name: '', price: '' }] : f.variants,
        }))}
        trackColor={{ false: C.borderDark, true: C.pink }}
        thumbColor="#fff"
      />
    </View>

    {!form.hasVariants ? (
      <TextInput
        style={styles.input}
        placeholder="Price (e.g. 120)"
        placeholderTextColor={C.textMuted}
        value={form.price}
        onChangeText={(v) => setForm((f) => ({ ...f, price: v }))}
        keyboardType="decimal-pad"
      />
    ) : (
      <View style={styles.variantSection}>
        <Text style={styles.variantLabel}>VARIANTS</Text>
        {form.variants.map((v, i) => (
          <View key={i} style={styles.variantRow}>
            <TextInput
              style={[styles.input, { flex: 2 }]}
              placeholder="Variant name"
              placeholderTextColor={C.textMuted}
              value={v.name}
              onChangeText={(text) =>
                setForm((f) => ({
                  ...f,
                  variants: f.variants.map((vr, vi) =>
                    vi === i ? { ...vr, name: text } : vr
                  ),
                }))
              }
            />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Price"
              placeholderTextColor={C.textMuted}
              value={v.price}
              onChangeText={(text) =>
                setForm((f) => ({
                  ...f,
                  variants: f.variants.map((vr, vi) =>
                    vi === i ? { ...vr, price: text } : vr
                  ),
                }))
              }
              keyboardType="decimal-pad"
            />
            <TouchableOpacity
              style={styles.variantDeleteBtn}
              onPress={() =>
                setForm((f) => ({
                  ...f,
                  variants: f.variants.filter((_, vi) => vi !== i),
                }))
              }
            >
              <Text style={styles.variantDeleteText}>✕</Text>
            </TouchableOpacity>
          </View>
        ))}
        <TouchableOpacity
          style={styles.addVariantBtn}
          onPress={() =>
            setForm((f) => ({
              ...f,
              variants: [...f.variants, { name: '', price: '' }],
            }))
          }
        >
          <Text style={styles.addVariantText}>+ Add Variant</Text>
        </TouchableOpacity>
      </View>
    )}

    <View style={styles.formBtns}>
      <TouchableOpacity
        style={styles.cancelBtn}
        onPress={() => { setShowForm(false); setForm(EMPTY_FORM); setEditingId(null); }}
      >
        <Text style={styles.cancelText}>Cancel</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
        <Text style={styles.saveBtnText}>Save</Text>
      </TouchableOpacity>
    </View>
  </ScrollView>
)
```

Add `ScrollView` to the imports from `react-native` at the top of the file.

- [ ] **Step 7: Update product list row to show variant count instead of price/emoji**

Replace the `renderItem` in the FlatList:

```typescript
renderItem={({ item }) => (
  <View style={styles.productRow}>
    <TouchableOpacity style={styles.productInfo} onPress={() => startEdit(item)}>
      <View>
        <Text style={styles.productName}>{item.name}</Text>
        <Text style={styles.productPrice}>
          {item.has_variants
            ? `${item.variant_count} variant${item.variant_count !== 1 ? 's' : ''}`
            : `₱${item.price?.toFixed(2) ?? '0.00'}`}
        </Text>
      </View>
    </TouchableOpacity>
    <Switch
      value={item.is_active === 1}
      onValueChange={() => handleToggle(item)}
      trackColor={{ false: C.borderDark, true: C.pink }}
      thumbColor="#fff"
    />
  </View>
)}
```

- [ ] **Step 8: Add new styles for the variant form**

Add these styles to the StyleSheet:

```typescript
toggleRow: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  backgroundColor: C.surface,
  borderRadius: R.sm,
  padding: 14,
  borderWidth: 1,
  borderColor: C.border,
},
toggleLabel: {
  color: C.textPrimary,
  fontSize: F.md,
  fontWeight: '600',
},
variantSection: { gap: 8 },
variantLabel: {
  color: C.textMuted,
  fontSize: F.xs,
  fontWeight: '700',
  letterSpacing: 1.2,
  textTransform: 'uppercase',
},
variantRow: {
  flexDirection: 'row',
  gap: 8,
  alignItems: 'center',
},
variantDeleteBtn: {
  padding: 10,
},
variantDeleteText: {
  color: C.pink,
  fontSize: F.lg,
  fontWeight: '700',
},
addVariantBtn: {
  borderWidth: 1,
  borderStyle: 'dashed',
  borderColor: C.pink,
  borderRadius: R.sm,
  padding: 12,
  alignItems: 'center',
},
addVariantText: {
  color: C.pink,
  fontWeight: '700',
  fontSize: F.md,
},
```

- [ ] **Step 9: Remove the productEmoji style** (no longer used)

Delete the `productEmoji` style from the StyleSheet.

- [ ] **Step 10: Test the product form**

Run the app. Verify:
1. Creating a simple product (no variants) — name + price, saves correctly
2. Creating a variant product — toggle on, add variants with name + price, saves correctly
3. Editing a variant product — pre-populates variant list
4. Product list shows variant count for variant products, price for simple products
5. No emoji field anywhere

- [ ] **Step 11: Commit**

```bash
git add app/modals/products.tsx
git commit -m "feat(products): replace emoji with variant toggle and variant list form"
```

---

### Task 8: Update Transaction Recording

**Files:**
- Modify: `db/transactions.ts`

- [ ] **Step 1: Update InsertItem type**

Update the `InsertItem` type to accept optional variant fields:

```typescript
type InsertItem = {
  productId: number;
  productName: string;
  price: number;
  quantity: number;
  variantId?: number;
  variantName?: string;
};
```

- [ ] **Step 2: Update insertTransaction to store variant data**

Replace the item insertion loop inside `insertTransaction`:

```typescript
for (const item of data.items) {
  await db.runAsync(
    'INSERT INTO transaction_items (transaction_id, product_id, product_name, price, quantity, variant_id, variant_name) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [transactionId, item.productId, item.productName, item.price, item.quantity, item.variantId ?? null, item.variantName ?? null]
  );
}
```

- [ ] **Step 3: Update TransactionItem type**

Add variant fields to the `TransactionItem` type:

```typescript
export type TransactionItem = {
  id: number;
  transaction_id: number;
  product_id: number | null;
  product_name: string;
  price: number;
  quantity: number;
  variant_id: number | null;
  variant_name: string | null;
};
```

- [ ] **Step 4: Update getAllTransactions query to include variant columns**

In the `Row` type inside `getAllTransactions`, add:

```typescript
variant_id: number | null;
variant_name: string | null;
```

Update the SQL query to select the new columns — add `ti.variant_id, ti.variant_name` to the SELECT list.

Update the item push to include variant fields:

```typescript
if (row.ti_id) {
  map.get(row.t_id)!.items.push({
    id: row.ti_id,
    transaction_id: row.transaction_id!,
    product_id: row.product_id,
    product_name: row.product_name!,
    price: row.price!,
    quantity: row.quantity!,
    variant_id: row.variant_id ?? null,
    variant_name: row.variant_name ?? null,
  });
}
```

- [ ] **Step 5: Commit**

```bash
git add db/transactions.ts
git commit -m "feat(transactions): add variant fields to transaction items"
```

---

### Task 9: Update Payment Flow — Order Summary with Grouped Variants

**Files:**
- Modify: `app/modals/payment.tsx`

- [ ] **Step 1: Update handleConfirm to pass variant data**

In the `handleConfirm` function, update the items mapping to include variant info:

```typescript
items: items.map((i) => ({
  productId: i.productId,
  productName: i.productName,
  price: i.price,
  quantity: i.quantity,
  variantId: i.variantId,
  variantName: i.variantName,
})),
```

- [ ] **Step 2: Update ConfirmedSummary items type**

Update the `items` field in the `ConfirmedSummary` type:

```typescript
items: { name: string; quantity: number; price: number; variantName?: string; productName: string }[];
```

Update the snapshot creation in `handleConfirm`:

```typescript
items: items.map((i) => ({
  name: i.variantName ? i.productName : i.productName,
  productName: i.productName,
  quantity: i.quantity,
  price: i.price,
  variantName: i.variantName,
})),
```

- [ ] **Step 3: Update renderOrderSummary to group variant items**

Replace the `renderOrderSummary` function to group items by productId:

```typescript
function renderOrderSummary() {
  const isBundle = bundlePrice !== null;

  const groups: { productId: number; productName: string; items: typeof items }[] = [];
  for (const item of items) {
    const existing = groups.find((g) => g.productId === item.productId);
    if (existing) {
      existing.items.push(item);
    } else {
      groups.push({ productId: item.productId, productName: item.productName, items: [item] });
    }
  }

  return (
    <>
      <View style={styles.summaryHeader}>
        <Text style={[styles.sectionLabel, { marginTop: 0, marginBottom: 0 }]}>ORDER SUMMARY</Text>
        {isBundle && <Text style={styles.bundleTag}>Bundle</Text>}
      </View>
      {groups.map((group) => {
        const hasVariants = group.items.some((i) => i.variantId);
        if (hasVariants) {
          return (
            <View key={group.productId}>
              <Text style={styles.groupName}>{group.productName}</Text>
              {group.items.map((item) => (
                <View key={`${item.productId}-${item.variantId}`} style={styles.variantItemRow}>
                  <Text style={styles.variantItemName}>{item.variantName} </Text>
                  <View style={styles.qtyControls}>
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => decrementItem(item.productId, item.variantId)}>
                      <Text style={styles.qtyBtnText}>−</Text>
                    </TouchableOpacity>
                    <Text style={styles.qtyText}>{item.quantity}</Text>
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => addItem({ id: item.productId, name: item.productName, price: item.price, variantId: item.variantId, variantName: item.variantName })}>
                      <Text style={styles.qtyBtnText}>+</Text>
                    </TouchableOpacity>
                    {!isBundle && (
                      <Text style={styles.itemTotal}>₱{(item.price * item.quantity).toFixed(2)}</Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          );
        }
        const item = group.items[0];
        return (
          <View key={item.productId} style={styles.itemRow}>
            <Text style={styles.itemName}>{item.productName}</Text>
            <View style={styles.qtyControls}>
              <TouchableOpacity style={styles.qtyBtn} onPress={() => decrementItem(item.productId)}>
                <Text style={styles.qtyBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.qtyText}>{item.quantity}</Text>
              <TouchableOpacity style={styles.qtyBtn} onPress={() => addItem({ id: item.productId, name: item.productName, price: item.price })}>
                <Text style={styles.qtyBtnText}>+</Text>
              </TouchableOpacity>
              {!isBundle && (
                <Text style={styles.itemTotal}>₱{(item.price * item.quantity).toFixed(2)}</Text>
              )}
            </View>
          </View>
        );
      })}
      <View style={styles.divider} />
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>TOTAL</Text>
        <Text style={styles.totalAmount}>₱{total.toFixed(2)}</Text>
      </View>
    </>
  );
}
```

- [ ] **Step 4: Update renderConfirmationModal to show variant names**

In the confirmation modal, update the item rendering to show variant name when present:

```typescript
{confirmed.items.map((item, i) => (
  <View key={i} style={styles.confirmRow}>
    <Text style={styles.confirmItemName}>
      {item.variantName
        ? `${item.productName} — ${item.variantName} ×${item.quantity}`
        : `${item.name} ×${item.quantity}`}
    </Text>
    {!confirmed.isBundle && (
      <Text style={styles.confirmItemPrice}>₱{(item.price * item.quantity).toFixed(2)}</Text>
    )}
  </View>
))}
```

- [ ] **Step 5: Add new styles for grouped variants**

Add these styles to the StyleSheet:

```typescript
groupName: {
  color: C.pink,
  fontSize: F.md,
  fontWeight: '700',
  paddingTop: 8,
  paddingBottom: 2,
},
variantItemRow: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  paddingVertical: 5,
  paddingLeft: 16,
  borderBottomWidth: 1,
  borderBottomColor: C.borderDark,
},
variantItemName: {
  color: C.textPrimary,
  fontSize: F.md,
  flex: 1,
  fontWeight: '500',
},
```

- [ ] **Step 6: Test the payment flow**

Run the app. Add variant products to cart, go to payment:
1. Order summary shows variants grouped under parent name
2. +/- buttons work for individual variants
3. Confirm sale records correctly
4. Confirmation modal shows variant names

- [ ] **Step 7: Commit**

```bash
git add app/modals/payment.tsx
git commit -m "feat(payment): group variant items in order summary and confirmation"
```

---

### Task 10: Update Transaction History

**Files:**
- Modify: `app/modals/transactions.tsx`

- [ ] **Step 1: Update transaction detail item rendering**

In the detail modal (inside the `{selected && (...)}` block), replace the item mapping:

```typescript
{selected.items.map((item) => (
  <View key={item.id} style={styles.itemRow}>
    <Text style={styles.itemName}>
      {item.variant_name
        ? `${item.product_name} — ${item.variant_name} × ${item.quantity}`
        : `${item.product_name} × ${item.quantity}`}
    </Text>
    {!selected.is_bundle && (
      <Text style={styles.itemPrice}>
        ₱{(item.price * item.quantity).toFixed(2)}
      </Text>
    )}
  </View>
))}
```

- [ ] **Step 2: Test transaction history**

Run the app. Make a sale with variant products, then check the transaction history:
1. Transaction detail shows "Milk Tea — Wintermelon × 2" format
2. Non-variant items still show normally
3. Prices are correct

- [ ] **Step 3: Commit**

```bash
git add app/modals/transactions.tsx
git commit -m "feat(transactions): show variant names in transaction detail"
```

---

### Task 11: End-to-End Verification

- [ ] **Step 1: Full test cycle**

Run through the complete flow:
1. Open product management — create a simple product (no variants), confirm it appears on grid with price
2. Create a variant product (e.g., "Milk Tea" with Wintermelon ₱45, Taro ₱50, Okinawa ₱55)
3. Verify variant product tile shows name but no price on the POS grid
4. Tap variant product — variant picker modal opens with grid of variant tiles
5. Add quantities of different variants, tap Done
6. Verify badge count on parent tile = sum of all variant quantities
7. Go to payment — verify variants grouped under parent name with +/- controls
8. Complete the sale
9. Check transaction history — verify variant names appear in detail view
10. Edit the variant product — verify variants pre-populate
11. Long press the variant product tile — verify all variants removed from cart

- [ ] **Step 2: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address issues from end-to-end variant testing"
```
