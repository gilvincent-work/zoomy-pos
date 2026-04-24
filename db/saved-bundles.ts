import { getDatabase } from './database';

export type BundleItemInput = { id: number; name: string; quantity: number };

export type SavedBundle = {
  id: number;
  name: string;
  items: BundleItemInput[];
  price: number;
  is_active: number;
  created_at: string;
};

type BundleRow = {
  id: number;
  name: string;
  items_json: string;
  price: number;
  is_active: number;
  created_at: string;
};

function rowToBundle(r: BundleRow): SavedBundle {
  return {
    id: r.id,
    name: r.name,
    items: JSON.parse(r.items_json) as BundleItemInput[],
    price: r.price,
    is_active: r.is_active,
    created_at: r.created_at,
  };
}

export async function getSavedBundles(): Promise<SavedBundle[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<BundleRow>(
    'SELECT id, name, items_json, price, is_active, created_at FROM saved_bundles WHERE is_active = 1 ORDER BY created_at ASC'
  );
  return rows.map(rowToBundle);
}

export async function getAllSavedBundles(): Promise<SavedBundle[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<BundleRow>(
    'SELECT id, name, items_json, price, is_active, created_at FROM saved_bundles ORDER BY created_at ASC'
  );
  return rows.map(rowToBundle);
}

export async function saveBundlePreset(
  name: string,
  items: BundleItemInput[],
  price: number
): Promise<number> {
  const db = await getDatabase();
  const result = await db.runAsync(
    'INSERT INTO saved_bundles (name, items_json, price, is_active, created_at) VALUES (?, ?, ?, 1, ?)',
    [name, JSON.stringify(items), price, new Date().toISOString()]
  );
  return result.lastInsertRowId;
}

export async function updateSavedBundle(
  id: number,
  fields: { name: string; price: number; items: BundleItemInput[] }
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE saved_bundles SET name = ?, price = ?, items_json = ? WHERE id = ?',
    [fields.name, fields.price, JSON.stringify(fields.items), id]
  );
}

export async function toggleSavedBundle(id: number, is_active: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE saved_bundles SET is_active = ? WHERE id = ?', [is_active, id]);
}

export async function deleteSavedBundle(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM saved_bundles WHERE id = ?', [id]);
}
