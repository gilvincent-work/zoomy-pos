import { getDatabase } from './database';

export type Product = {
  id: number;
  name: string;
  price: number | null;
  emoji: string;
  image_uri: string | null;
  has_variants: number;
  category: string | null;
  subcategory: string | null;
  is_active: number;
  created_at: string;
  /** The Coop-side pos_products.product_id (SKU Code), once catalog sync assigns one. */
  sku: string | null;
  /** Cached Coop stock (pos_inventory), refreshed on every catalog pull. 0 until synced. */
  stock: number;
};

/** A category and its (possibly empty) list of subcategories, both sorted alphabetically. */
export type CategoryGroup = {
  category: string;
  subcategories: string[];
};

export type ProductVariant = {
  id: number;
  product_id: number;
  name: string;
  price: number;
  is_active: number;
  created_at: string;
};

export async function getActiveProducts(): Promise<Product[]> {
  const db = await getDatabase();
  return db.getAllAsync<Product>(
    'SELECT * FROM products WHERE is_active = 1 ORDER BY name ASC'
  );
}

export const UNCATEGORIZED = 'Uncategorized';

/**
 * Derives the tab structure for the Option H split-view from the active products:
 * distinct categories (alphabetical), each with its distinct subcategories (alphabetical).
 * Products with no category fall under an "Uncategorized" group so nothing is hidden.
 */
export async function getCategoriesWithSubcategories(): Promise<CategoryGroup[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ category: string | null; subcategory: string | null }>(
    `SELECT DISTINCT category, subcategory FROM products WHERE is_active = 1`
  );

  const map = new Map<string, Set<string>>();
  for (const row of rows) {
    const cat = row.category && row.category.trim() ? row.category : UNCATEGORIZED;
    if (!map.has(cat)) map.set(cat, new Set());
    if (row.subcategory && row.subcategory.trim()) {
      map.get(cat)!.add(row.subcategory);
    }
  }

  return Array.from(map.entries())
    .map(([category, subs]) => ({
      category,
      subcategories: Array.from(subs).sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

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

export async function getVariantsByProductId(productId: number): Promise<ProductVariant[]> {
  const db = await getDatabase();
  return db.getAllAsync<ProductVariant>(
    'SELECT * FROM product_variants WHERE product_id = ? AND is_active = 1 ORDER BY name ASC',
    [productId]
  );
}

export async function getAllVariantsByProductId(productId: number): Promise<ProductVariant[]> {
  const db = await getDatabase();
  return db.getAllAsync<ProductVariant>(
    'SELECT * FROM product_variants WHERE product_id = ? ORDER BY name ASC',
    [productId]
  );
}

export async function createProduct(input: {
  name: string;
  price: number | null;
  has_variants: boolean;
  image_uri?: string | null;
  emoji?: string;
  category?: string | null;
  subcategory?: string | null;
  sku?: string | null;
  variants?: { name: string; price: number }[];
}): Promise<number> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const result = await db.runAsync(
    'INSERT INTO products (name, price, emoji, image_uri, has_variants, category, subcategory, sku, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
    [input.name, input.price, input.emoji ?? '🍬', input.image_uri ?? null, input.has_variants ? 1 : 0, input.category ?? null, input.subcategory ?? null, input.sku ?? null, now]
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

export async function updateProduct(
  id: number,
  fields: {
    name: string;
    price: number | null;
    has_variants: boolean;
    is_active: number;
    emoji?: string;
    image_uri?: string | null;
    category?: string | null;
    subcategory?: string | null;
    sku?: string | null;
    variants?: { id?: number; name: string; price: number }[];
  }
): Promise<void> {
  const db = await getDatabase();
  // COALESCE preserves the current value when the caller omits a field, so an
  // edit that only touches name/price/listing (or just the emoji) can't wipe the
  // product's tab (category/subcategory), image, or emoji. Callers that mean to
  // change these still pass a value. (There is no "clear to null" path here; the
  // catalog is Coop-authoritative for category via applyCatalogUpdate.)
  await db.runAsync(
    'UPDATE products SET name = ?, price = ?, has_variants = ?, is_active = ?, ' +
      'emoji = COALESCE(?, emoji), image_uri = COALESCE(?, image_uri), ' +
      'category = COALESCE(?, category), subcategory = COALESCE(?, subcategory), sku = ? WHERE id = ?',
    [fields.name, fields.price, fields.has_variants ? 1 : 0, fields.is_active, fields.emoji ?? null, fields.image_uri ?? null, fields.category ?? null, fields.subcategory ?? null, fields.sku ?? null, id]
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

export async function deleteProduct(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM products WHERE id = ?', [id]);
}

export async function getProductByName(name: string): Promise<Product | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<Product>(
    'SELECT * FROM products WHERE name = ? LIMIT 1',
    [name]
  );
  return row ?? null;
}

export async function getProductBySku(sku: string): Promise<Product | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<Product>(
    'SELECT * FROM products WHERE sku = ? LIMIT 1',
    [sku]
  );
  return row ?? null;
}

/**
 * Apply a catalog pull from Coop to the local row matched by SKU: Coop is
 * authoritative for name, price, listed and now category/subcategory (the POS
 * tab). Name and price fall back to the existing local value when the pull
 * carries a blank/absent one (so a bad row never wipes a tile's name or price).
 * Category is overwritten only when Coop provides one (null = unknown -> keep
 * local); subcategory is set exactly alongside it (so moving a product off
 * Freeze Dried clears its stale subcategory). When no local row carries the SKU,
 * the Coop-created product is INSERTed with a default emoji. Returns rows changed
 * (1 on update or insert). See utils/catalog-sync.ts.
 */
export async function applyCatalogUpdate(u: {
  sku: string;
  name: string;
  price: number | null;
  active: boolean;
  category: string | null;
  subcategory: string | null;
  emoji: string | null;
  stock: number;
}): Promise<number> {
  const db = await getDatabase();
  // Coop is the merge point for every field, including emoji: a POS edit
  // pushes to Coop (utils/products-sync.ts), and this pull applies whatever
  // Coop currently has, so the most recently edited value (from any device or
  // the Coop dashboard) converges everywhere. COALESCE only preserves the
  // local value when Coop's is unset (e.g. legacy rows with no emoji yet) —
  // it never resets emoji to a default.
  const res = await db.runAsync(
    "UPDATE products SET name = COALESCE(NULLIF(?, ''), name), price = COALESCE(?, price), is_active = ?, " +
      'category = COALESCE(?, category), subcategory = CASE WHEN ? IS NOT NULL THEN ? ELSE subcategory END, ' +
      'emoji = COALESCE(?, emoji), stock = ? WHERE sku = ?',
    [u.name, u.price, u.active ? 1 : 0, u.category, u.category, u.subcategory, u.emoji, u.stock, u.sku]
  );
  if (res.changes > 0) return res.changes;

  // No local row for this SKU — insert the Coop-created product so it appears on
  // the tiles, seeded with Coop's emoji (falling back to the default) and stock.
  // Skip nameless rows.
  if (!u.name) return 0;
  const ins = await db.runAsync(
    'INSERT INTO products (name, price, emoji, has_variants, category, subcategory, sku, is_active, stock, created_at) VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?)',
    [u.name, u.price, u.emoji || '🍬', u.category, u.subcategory, u.sku, u.active ? 1 : 0, u.stock, new Date().toISOString()]
  );
  return ins.changes;
}

export async function getVariantByProductIdAndName(
  productId: number,
  name: string
): Promise<ProductVariant | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<ProductVariant>(
    'SELECT * FROM product_variants WHERE product_id = ? AND name = ? LIMIT 1',
    [productId, name]
  );
  return row ?? null;
}

export type UpsertProductInput = {
  name: string;
  price: number | null;
  emoji: string;
  has_variants: number;
  image_uri?: string | null;
  category?: string | null;
  subcategory?: string | null;
  sku?: string | null;
};

export type UpsertResult = { id: number; inserted: boolean };

export async function upsertProduct(input: UpsertProductInput): Promise<UpsertResult> {
  const db = await getDatabase();
  const existing = await getProductByName(input.name);
  const hasImageUri = Object.prototype.hasOwnProperty.call(input, 'image_uri');
  if (existing) {
    if (hasImageUri) {
      await db.runAsync(
        'UPDATE products SET price = ?, emoji = ?, has_variants = ?, image_uri = ?, category = ?, subcategory = ?, sku = ?, is_active = 1 WHERE id = ?',
        [input.price, input.emoji, input.has_variants, input.image_uri ?? null, input.category ?? null, input.subcategory ?? null, input.sku ?? existing.sku, existing.id]
      );
    } else {
      await db.runAsync(
        'UPDATE products SET price = ?, emoji = ?, has_variants = ?, category = ?, subcategory = ?, sku = ?, is_active = 1 WHERE id = ?',
        [input.price, input.emoji, input.has_variants, input.category ?? null, input.subcategory ?? null, input.sku ?? existing.sku, existing.id]
      );
    }
    return { id: existing.id, inserted: false };
  }
  const result = await db.runAsync(
    'INSERT INTO products (name, price, emoji, image_uri, has_variants, category, subcategory, sku, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
    [input.name, input.price, input.emoji, input.image_uri ?? null, input.has_variants, input.category ?? null, input.subcategory ?? null, input.sku ?? null, new Date().toISOString()]
  );
  return { id: result.lastInsertRowId, inserted: true };
}

export async function setProductImageUri(id: number, uri: string | null): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE products SET image_uri = ? WHERE id = ?', [uri, id]);
}

export async function upsertVariant(
  productId: number,
  input: { name: string; price: number }
): Promise<UpsertResult> {
  const db = await getDatabase();
  const existing = await getVariantByProductIdAndName(productId, input.name);
  if (existing) {
    await db.runAsync(
      'UPDATE product_variants SET price = ?, is_active = 1 WHERE id = ?',
      [input.price, existing.id]
    );
    return { id: existing.id, inserted: false };
  }
  const result = await db.runAsync(
    'INSERT INTO product_variants (product_id, name, price, is_active, created_at) VALUES (?, ?, ?, 1, ?)',
    [productId, input.name, input.price, new Date().toISOString()]
  );
  return { id: result.lastInsertRowId, inserted: true };
}
