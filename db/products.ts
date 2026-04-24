import { getDatabase } from './database';

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

export async function getActiveProducts(): Promise<Product[]> {
  const db = await getDatabase();
  return db.getAllAsync<Product>(
    'SELECT * FROM products WHERE is_active = 1 ORDER BY name ASC'
  );
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

export async function deleteProduct(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM products WHERE id = ?', [id]);
}
