import { getDatabase } from './database';
import { createProduct } from './products';
import { savePickBundle } from './saved-bundles';

/**
 * Offline event prices are flat per product line, so the price lives here and
 * every product in a line inherits it. Update a line here and both the seed and
 * syncLinePricesOnce stay in step.
 */
const LINE_PRICES: Record<string, number> = {
  'Meaty Treats': 200,
  'Tasty Treats': 300,
  'Super Duo Bites': 300,
  'Freeze Dried': 170,
};

/**
 * Real Zoomy pet-treat catalog for local development. Only "Freeze Dried" has
 * subcategories (Fish / Meats / Cat Grass · Yogurt / Super Food).
 *
 * Note: display names repeat across categories (e.g. "Chicken" in both Meaty
 * Treats and Tasty Treats), so these are seeded as distinct products rather than
 * deduped by name.
 */
const SEED_PRODUCTS: {
  name: string;
  emoji: string;
  category: string;
  subcategory: string | null;
}[] = [
  // Meaty Treats
  { name: 'Salmon', emoji: '🐟', category: 'Meaty Treats', subcategory: null },
  { name: 'Beef', emoji: '🥩', category: 'Meaty Treats', subcategory: null },
  { name: 'Duck', emoji: '🦆', category: 'Meaty Treats', subcategory: null },
  { name: 'Chicken', emoji: '🍗', category: 'Meaty Treats', subcategory: null },

  // Tasty Treats
  { name: 'Chicken Jerky', emoji: '🍗', category: 'Tasty Treats', subcategory: null },
  { name: 'Duck Jerky', emoji: '🦆', category: 'Tasty Treats', subcategory: null },

  // Super Duo Bites
  { name: 'Chicken Carrot', emoji: '🥕', category: 'Super Duo Bites', subcategory: null },
  { name: 'Duck Carrot', emoji: '🥕', category: 'Super Duo Bites', subcategory: null },
  { name: 'Duck Pear', emoji: '🍐', category: 'Super Duo Bites', subcategory: null },

  // Freeze Dried · Fish
  { name: 'Salmon Cubes', emoji: '🐟', category: 'Freeze Dried', subcategory: 'Fish' },
  { name: 'Capelin', emoji: '🐟', category: 'Freeze Dried', subcategory: 'Fish' },

  // Freeze Dried · Meats
  { name: 'Lamb Liver Cubes', emoji: '🍖', category: 'Freeze Dried', subcategory: 'Meats' },
  { name: 'Duck Breast Cubes', emoji: '🦆', category: 'Freeze Dried', subcategory: 'Meats' },
  { name: 'Chicken Breast Cubes', emoji: '🍗', category: 'Freeze Dried', subcategory: 'Meats' },
  { name: 'Chicken Liver Cubes', emoji: '🍗', category: 'Freeze Dried', subcategory: 'Meats' },
  { name: 'Beef Liver Cubes', emoji: '🥩', category: 'Freeze Dried', subcategory: 'Meats' },

  // Freeze Dried · Cat Grass / Yogurt
  { name: 'Cat Grass Cubes', emoji: '🌱', category: 'Freeze Dried', subcategory: 'Cat Grass / Yogurt' },
  { name: 'Cat Grass Stick', emoji: '🌱', category: 'Freeze Dried', subcategory: 'Cat Grass / Yogurt' },
  { name: 'Yoghurt Cubes', emoji: '🥛', category: 'Freeze Dried', subcategory: 'Cat Grass / Yogurt' },

  // Freeze Dried · Super Food
  { name: 'Duck Apple', emoji: '🍎', category: 'Freeze Dried', subcategory: 'Super Food' },
  { name: 'Duck Pear', emoji: '🍐', category: 'Freeze Dried', subcategory: 'Super Food' },
  { name: 'Chicken Cranberry', emoji: '🍒', category: 'Freeze Dried', subcategory: 'Super Food' },
  { name: 'Chicken Pumpkin', emoji: '🎃', category: 'Freeze Dried', subcategory: 'Super Food' },
  { name: 'Salmon Steak', emoji: '🐟', category: 'Freeze Dried', subcategory: 'Super Food' },
  { name: 'Chicken & Egg', emoji: '🥚', category: 'Freeze Dried', subcategory: 'Super Food' },
  { name: 'Beef Blueberry', emoji: '🫐', category: 'Freeze Dried', subcategory: 'Super Food' },
];

/** Starter "buy any N" deals, per the sales playbook. */
const SEED_BUNDLES: {
  name: string;
  price: number;
  pickCount: number;
  lineCategories: string[];
}[] = [
  { name: 'Buy Any 4', price: 570, pickCount: 4, lineCategories: ['Freeze Dried', 'Meaty Treats'] },
  { name: 'Buy Any 2', price: 550, pickCount: 2, lineCategories: ['Super Duo Bites', 'Tasty Treats'] },
];

/**
 * Bump this whenever SEED_PRODUCTS or SEED_BUNDLES changes so an already-seeded
 * dev database refreshes to the latest sample catalog on next launch.
 */
export const DEV_SEED_VERSION = '2026-09-03-accurate-names';

async function insertSeedCatalog(): Promise<void> {
  for (const p of SEED_PRODUCTS) {
    await createProduct({
      name: p.name,
      price: LINE_PRICES[p.category] ?? 0,
      has_variants: false,
      emoji: p.emoji,
      category: p.category,
      subcategory: p.subcategory,
    });
  }
}

async function insertSeedBundles(): Promise<void> {
  for (const b of SEED_BUNDLES) {
    await savePickBundle({
      name: b.name,
      price: b.price,
      pickCount: b.pickCount,
      lineCategories: b.lineCategories,
    });
  }
}

/**
 * Loads the sample catalog for local development. Runs only in __DEV__ (see
 * app/_layout.tsx). When the stored seed version differs from DEV_SEED_VERSION
 * (including a database seeded before versioning existed, which has no marker),
 * it replaces the products and bundles with the latest sample data; otherwise it
 * is a no-op. Destructive: only used in dev so it cannot touch a real store's data.
 */
export async function seedDevProducts(): Promise<void> {
  const db = await getDatabase();
  const versionRow = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'dev_seed_version'"
  );
  if (versionRow?.value === DEV_SEED_VERSION) return;

  await db.execAsync('DELETE FROM products');
  await db.execAsync('DELETE FROM saved_bundles');
  await insertSeedCatalog();
  await insertSeedBundles();
  await db.runAsync(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ('dev_seed_version', ?)",
    [DEV_SEED_VERSION]
  );
}

/**
 * Loads the sample catalog on non-dev builds (staging/production) the first time
 * the app runs against an empty database. Non-destructive: if any products
 * already exist (seeded, manually added, or imported), it is a no-op, so it never
 * overwrites a real store's catalog.
 */
export async function seedProductsIfEmpty(): Promise<void> {
  const db = await getDatabase();
  const countRow = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM products'
  );
  if ((countRow?.n ?? 0) > 0) return;

  await insertSeedCatalog();
}

/**
 * Loads the starter deals on non-dev builds the first time the app runs with no
 * bundles yet. Non-destructive: a no-op once any bundle exists, so it never
 * overwrites deals a store created.
 */
export async function seedBundlesIfEmpty(): Promise<void> {
  const db = await getDatabase();
  const countRow = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM saved_bundles'
  );
  if ((countRow?.n ?? 0) > 0) return;

  await insertSeedBundles();
}

/**
 * One-time price correction so installs seeded before the offline event prices
 * were set (which still hold the old placeholder price) move to the flat per-line
 * pricing. Idempotent: guarded by a settings marker so it runs at most once.
 */
export async function syncLinePricesOnce(): Promise<void> {
  const db = await getDatabase();
  const VERSION = '2026-09-03-line-prices';
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'line_price_sync_version'"
  );
  if (row?.value === VERSION) return;

  for (const [category, price] of Object.entries(LINE_PRICES)) {
    await db.runAsync('UPDATE products SET price = ? WHERE category = ?', [price, category]);
  }
  await db.runAsync(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ('line_price_sync_version', ?)",
    [VERSION]
  );
}

/**
 * Renames from the earlier placeholder catalog to the accurate SKU-sheet product
 * names, scoped by (category, subcategory) so same-named products in different
 * lines are not touched by mistake. Transaction history keeps its own name
 * snapshots, so past sales are unaffected. Idempotent via a settings marker.
 */
const CATALOG_NAME_FIXES: {
  category: string;
  subcategory: string | null;
  from: string;
  to: string;
}[] = [
  { category: 'Tasty Treats', subcategory: null, from: 'Chicken', to: 'Chicken Jerky' },
  { category: 'Tasty Treats', subcategory: null, from: 'Duck', to: 'Duck Jerky' },
  { category: 'Super Duo Bites', subcategory: null, from: 'Carrot Chicken', to: 'Chicken Carrot' },
  { category: 'Super Duo Bites', subcategory: null, from: 'Carrot Duck', to: 'Duck Carrot' },
  { category: 'Freeze Dried', subcategory: 'Meats', from: 'Lamb Liver', to: 'Lamb Liver Cubes' },
  { category: 'Freeze Dried', subcategory: 'Meats', from: 'Chicken Liver', to: 'Chicken Liver Cubes' },
  { category: 'Freeze Dried', subcategory: 'Meats', from: 'Beef Liver', to: 'Beef Liver Cubes' },
  { category: 'Freeze Dried', subcategory: 'Cat Grass / Yogurt', from: 'Cat Grass Sticks', to: 'Cat Grass Stick' },
  { category: 'Freeze Dried', subcategory: 'Cat Grass / Yogurt', from: 'Yogurt Cubes', to: 'Yoghurt Cubes' },
  { category: 'Freeze Dried', subcategory: 'Super Food', from: 'Chicken and Egg', to: 'Chicken & Egg' },
];

export async function syncCatalogNamesOnce(): Promise<void> {
  const db = await getDatabase();
  const VERSION = '2026-09-03-accurate-names';
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'catalog_name_sync_version'"
  );
  if (row?.value === VERSION) return;

  for (const fix of CATALOG_NAME_FIXES) {
    if (fix.subcategory === null) {
      await db.runAsync(
        'UPDATE products SET name = ? WHERE category = ? AND subcategory IS NULL AND name = ?',
        [fix.to, fix.category, fix.from]
      );
    } else {
      await db.runAsync(
        'UPDATE products SET name = ? WHERE category = ? AND subcategory = ? AND name = ?',
        [fix.to, fix.category, fix.subcategory, fix.from]
      );
    }
  }

  // Beef Blueberry is new in the accurate catalog; add it if it isn't there yet.
  const existing = await db.getFirstAsync<{ id: number }>(
    "SELECT id FROM products WHERE category = 'Freeze Dried' AND subcategory = 'Super Food' AND name = 'Beef Blueberry' LIMIT 1"
  );
  if (!existing) {
    await createProduct({
      name: 'Beef Blueberry',
      price: LINE_PRICES['Freeze Dried'] ?? 0,
      has_variants: false,
      emoji: '🫐',
      category: 'Freeze Dried',
      subcategory: 'Super Food',
    });
  }

  await db.runAsync(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ('catalog_name_sync_version', ?)",
    [VERSION]
  );
}
