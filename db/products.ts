import { getDatabase } from './database';

export type Product = {
  id: number;
  name: string;
  price: number;
  emoji: string;
  is_active: number;
  created_at: string;
};

export async function getActiveProducts(): Promise<Product[]> {
  const db = await getDatabase();
  return db.getAllAsync<Product>(
    'SELECT * FROM products WHERE is_active = 1 ORDER BY name ASC'
  );
}

export async function getAllProducts(): Promise<Product[]> {
  const db = await getDatabase();
  return db.getAllAsync<Product>('SELECT * FROM products ORDER BY name ASC');
}

export async function createProduct(input: {
  name: string;
  price: number;
  emoji: string;
}): Promise<number> {
  const db = await getDatabase();
  const result = await db.runAsync(
    'INSERT INTO products (name, price, emoji, is_active, created_at) VALUES (?, ?, ?, 1, ?)',
    [input.name, input.price, input.emoji, new Date().toISOString()]
  );
  return result.lastInsertRowId;
}

export async function updateProduct(
  id: number,
  fields: { name: string; price: number; emoji: string; is_active: number }
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE products SET name = ?, price = ?, emoji = ?, is_active = ? WHERE id = ?',
    [fields.name, fields.price, fields.emoji, fields.is_active, id]
  );
}

export async function deleteProduct(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM products WHERE id = ?', [id]);
}
