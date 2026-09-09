import * as Crypto from 'expo-crypto';
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
  bundle_uuid: string | null;
  emoji: string | null;
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
  bundle_uuid: string | null;
  emoji: string | null;
  created_at: string;
};

const COLUMNS =
  'id, name, items_json, price, bundle_type, pick_count, line_categories, is_active, bundle_uuid, emoji, created_at';

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
    bundle_uuid: r.bundle_uuid,
    emoji: r.emoji,
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
    'INSERT INTO saved_bundles (name, items_json, price, bundle_type, is_active, bundle_uuid, created_at) VALUES (?, ?, ?, ?, 1, ?, ?)',
    [name, JSON.stringify(items), price, 'fixed', Crypto.randomUUID(), new Date().toISOString()]
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
  emoji?: string | null; // tile emoji (1-3); null/empty derives from lines
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
    'INSERT INTO saved_bundles (name, items_json, price, bundle_type, pick_count, line_categories, is_active, bundle_uuid, emoji, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)',
    [
      input.name.trim(),
      '[]',
      input.price,
      'pick',
      input.pickCount,
      JSON.stringify(input.lineCategories),
      Crypto.randomUUID(),
      input.emoji || null,
      new Date().toISOString(),
    ]
  );
  return result.lastInsertRowId;
}

export async function updatePickBundle(id: number, input: PickBundleInput): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE saved_bundles SET name = ?, price = ?, pick_count = ?, line_categories = ?, emoji = ? WHERE id = ?',
    [input.name.trim(), input.price, input.pickCount, JSON.stringify(input.lineCategories), input.emoji || null, id]
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

/** Set a bundle's tile emoji (null clears it, so the tile derives from lines). */
export async function updateBundleEmoji(id: number, emoji: string | null): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE saved_bundles SET emoji = ? WHERE id = ?', [emoji, id]);
}

/** Fetch a single bundle by its shared uuid (for building a sync push payload). */
export async function getBundleByUuid(uuid: string): Promise<SavedBundle | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<BundleRow>(
    `SELECT ${COLUMNS} FROM saved_bundles WHERE bundle_uuid = ? LIMIT 1`,
    [uuid]
  );
  return row ? rowToBundle(row) : null;
}

/** Shape of a bundle pulled back from Coop for the local mirror. */
export type RemoteBundle = {
  bundle_uuid: string;
  name: string;
  price: number;
  bundle_type: BundleType;
  pick_count: number | null;
  line_categories: string[] | null;
  emoji: string | null;
  is_active: number;
  items: BundleItemInput[];
};

/**
 * Mirror Coop's bundle set into local SQLite (Coop is the shared source, like
 * products): upsert each remote bundle by its uuid, then delete local bundles
 * that were synced (have a uuid) but are no longer on Coop. Legacy local bundles
 * with no uuid (created before sync existed) are left untouched. Returns the
 * number of local rows changed, so the caller can notify listeners only on a
 * real change.
 */
export async function reconcileRemoteBundles(remote: RemoteBundle[]): Promise<number> {
  const db = await getDatabase();
  let changed = 0;
  const seen = new Set<string>();

  for (const b of remote) {
    if (!b.bundle_uuid) continue;
    seen.add(b.bundle_uuid);
    const existing = await getBundleByUuid(b.bundle_uuid);
    const itemsJson = JSON.stringify(b.items ?? []);
    const lines = b.line_categories ? JSON.stringify(b.line_categories) : null;
    if (existing) {
      const res = await db.runAsync(
        'UPDATE saved_bundles SET name = ?, items_json = ?, price = ?, bundle_type = ?, pick_count = ?, line_categories = ?, emoji = ?, is_active = ? WHERE bundle_uuid = ?',
        [b.name, itemsJson, b.price, b.bundle_type, b.pick_count, lines, b.emoji, b.is_active, b.bundle_uuid]
      );
      changed += res.changes;
    } else {
      const res = await db.runAsync(
        'INSERT INTO saved_bundles (name, items_json, price, bundle_type, pick_count, line_categories, is_active, bundle_uuid, emoji, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [b.name, itemsJson, b.price, b.bundle_type, b.pick_count, lines, b.is_active, b.bundle_uuid, b.emoji, new Date().toISOString()]
      );
      changed += res.changes;
    }
  }

  // Remove local synced bundles Coop no longer has (deleted on another device).
  const synced = await db.getAllAsync<{ id: number; bundle_uuid: string }>(
    'SELECT id, bundle_uuid FROM saved_bundles WHERE bundle_uuid IS NOT NULL'
  );
  for (const s of synced) {
    if (!seen.has(s.bundle_uuid)) {
      const res = await db.runAsync('DELETE FROM saved_bundles WHERE id = ?', [s.id]);
      changed += res.changes;
    }
  }

  return changed;
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
    'INSERT INTO saved_bundles (name, items_json, price, bundle_type, is_active, bundle_uuid, created_at) VALUES (?, ?, ?, ?, 1, ?, ?)',
    [name, JSON.stringify(items), price, 'fixed', Crypto.randomUUID(), new Date().toISOString()]
  );
  return { id: result.lastInsertRowId, inserted: true };
}
