import { getDatabase } from './database';

export type BundleItemInput = { id: number; name: string; quantity: number };

export type SavedBundle = {
  id: number;
  name: string;
  items: BundleItemInput[];
  price: number;
  created_at: string;
};

export async function getSavedBundles(): Promise<SavedBundle[]> {
  const db = await getDatabase();
  type Row = { id: number; name: string; items_json: string; price: number; created_at: string };
  const rows = await db.getAllAsync<Row>(
    'SELECT id, name, items_json, price, created_at FROM saved_bundles ORDER BY created_at ASC'
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    items: JSON.parse(r.items_json) as BundleItemInput[],
    price: r.price,
    created_at: r.created_at,
  }));
}

export async function saveBundlePreset(
  name: string,
  items: BundleItemInput[],
  price: number
): Promise<number> {
  const db = await getDatabase();
  const result = await db.runAsync(
    'INSERT INTO saved_bundles (name, items_json, price, created_at) VALUES (?, ?, ?, ?)',
    [name, JSON.stringify(items), price, new Date().toISOString()]
  );
  return result.lastInsertRowId;
}

export async function deleteSavedBundle(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM saved_bundles WHERE id = ?', [id]);
}
