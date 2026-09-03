import { getDatabase } from './database';

export type BundleItemInput = {
  id: number;
  name: string;
  quantity: number;
  variantId?: number;
  variantName?: string;
};

/**
 * 'fixed'  legacy bundle: a set list of items (items) sold for a flat price.
 * 'pick'   deal: "buy any N flavors from these product lines" for a flat price;
 *          the flavors are chosen at sale time, so items stays empty.
 */
export type BundleType = 'fixed' | 'pick';

export type SavedBundle = {
  id: number;
  name: string;
  items: BundleItemInput[];
  price: number;
  bundle_type: BundleType;
  pick_count: number | null;
  line_categories: string[] | null;
  is_active: number;
  created_at: string;
};

type BundleRow = {
  id: number;
  name: string;
  items_json: string;
  price: number;
  bundle_type: string;
  pick_count: number | null;
  line_categories: string | null;
  is_active: number;
  created_at: string;
};

const COLUMNS =
  'id, name, items_json, price, bundle_type, pick_count, line_categories, is_active, created_at';

function rowToBundle(r: BundleRow): SavedBundle {
  return {
    id: r.id,
    name: r.name,
    items: JSON.parse(r.items_json) as BundleItemInput[],
    price: r.price,
    bundle_type: r.bundle_type === 'pick' ? 'pick' : 'fixed',
    pick_count: r.pick_count,
    line_categories: r.line_categories
      ? (JSON.parse(r.line_categories) as string[])
      : null,
    is_active: r.is_active,
    created_at: r.created_at,
  };
}

export async function getSavedBundles(): Promise<SavedBundle[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<BundleRow>(
    `SELECT ${COLUMNS} FROM saved_bundles WHERE is_active = 1 ORDER BY created_at ASC`
  );
  return rows.map(rowToBundle);
}

export async function getAllSavedBundles(): Promise<SavedBundle[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<BundleRow>(
    `SELECT ${COLUMNS} FROM saved_bundles ORDER BY created_at ASC`
  );
  return rows.map(rowToBundle);
}

/** Active "buy any N" deals, used to render the Bundles category on the POS. */
export async function getActivePickBundles(): Promise<SavedBundle[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<BundleRow>(
    `SELECT ${COLUMNS} FROM saved_bundles WHERE is_active = 1 AND bundle_type = 'pick' ORDER BY created_at ASC`
  );
  return rows.map(rowToBundle);
}

export async function getSavedBundleById(id: number): Promise<SavedBundle | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<BundleRow>(
    `SELECT ${COLUMNS} FROM saved_bundles WHERE id = ? LIMIT 1`,
    [id]
  );
  return row ? rowToBundle(row) : null;
}

export async function saveBundlePreset(
  name: string,
  items: BundleItemInput[],
  price: number
): Promise<number> {
  const db = await getDatabase();
  const result = await db.runAsync(
    'INSERT INTO saved_bundles (name, items_json, price, bundle_type, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)',
    [name, JSON.stringify(items), price, 'fixed', new Date().toISOString()]
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

// ─── Pick bundles ("buy any N from product lines") ──────────────────────────

export type PickBundleInput = {
  name: string;
  price: number;
  pickCount: number;
  lineCategories: string[];
};

/**
 * Validates a pick-bundle before persisting. Returns an error message to show
 * the user, or null when the input is valid. Fail fast, one issue at a time.
 */
export function validatePickBundleInput(input: PickBundleInput): string | null {
  if (!input.name.trim()) return 'Enter a bundle name.';
  if (!Number.isFinite(input.price) || input.price < 0) return 'Enter a valid price.';
  if (!Number.isInteger(input.pickCount) || input.pickCount < 1) {
    return 'Amount of items must be at least 1.';
  }
  if (input.lineCategories.length === 0) return 'Select at least one product line.';
  return null;
}

export async function savePickBundle(input: PickBundleInput): Promise<number> {
  const db = await getDatabase();
  const result = await db.runAsync(
    'INSERT INTO saved_bundles (name, items_json, price, bundle_type, pick_count, line_categories, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)',
    [
      input.name.trim(),
      '[]',
      input.price,
      'pick',
      input.pickCount,
      JSON.stringify(input.lineCategories),
      new Date().toISOString(),
    ]
  );
  return result.lastInsertRowId;
}

export async function updatePickBundle(id: number, input: PickBundleInput): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE saved_bundles SET name = ?, price = ?, pick_count = ?, line_categories = ? WHERE id = ?',
    [input.name.trim(), input.price, input.pickCount, JSON.stringify(input.lineCategories), id]
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

export async function getBundleByName(name: string): Promise<SavedBundle | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<BundleRow>(
    `SELECT ${COLUMNS} FROM saved_bundles WHERE name = ? LIMIT 1`,
    [name]
  );
  return row ? rowToBundle(row) : null;
}

export async function upsertBundleByName(
  name: string,
  items: BundleItemInput[],
  price: number
): Promise<{ id: number; inserted: boolean }> {
  const db = await getDatabase();
  const existing = await getBundleByName(name);
  if (existing) {
    await db.runAsync(
      'UPDATE saved_bundles SET price = ?, items_json = ?, is_active = 1 WHERE id = ?',
      [price, JSON.stringify(items), existing.id]
    );
    return { id: existing.id, inserted: false };
  }
  const result = await db.runAsync(
    'INSERT INTO saved_bundles (name, items_json, price, bundle_type, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)',
    [name, JSON.stringify(items), price, 'fixed', new Date().toISOString()]
  );
  return { id: result.lastInsertRowId, inserted: true };
}
