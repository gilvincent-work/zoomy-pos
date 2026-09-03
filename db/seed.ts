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
  { name: 'Chicken', emoji: '🍗', category: 'Tasty Treats', subcategory: null },
  { name: 'Duck', emoji: '🦆', category: 'Tasty Treats', subcategory: null },

  // Super Duo Bites
  { name: 'Carrot Duck', emoji: '🥕', category: 'Super Duo Bites', subcategory: null },
  { name: 'Carrot Chicken', emoji: '🥕', category: 'Super Duo Bites', subcategory: null },
  { name: 'Duck Pear', emoji: '🍐', category: 'Super Duo Bites', subcategory: null },

  // Freeze Dried · Fish
  { name: 'Salmon Cubes', emoji: '🐟', category: 'Freeze Dried', subcategory: 'Fish' },
  { name: 'Capelin', emoji: '🐟', category: 'Freeze Dried', subcategory: 'Fish' },

  // Freeze Dried · Meats
  { name: 'Lamb Liver', emoji: '🍖', category: 'Freeze Dried', subcategory: 'Meats' },
  { name: 'Duck Breast Cubes', emoji: '🦆', category: 'Freeze Dried', subcategory: 'Meats' },
  { name: 'Chicken Breast Cubes', emoji: '🍗', category: 'Freeze Dried', subcategory: 'Meats' },
  { name: 'Chicken Liver', emoji: '🍗', category: 'Freeze Dried', subcategory: 'Meats' },
  { name: 'Beef Liver', emoji: '🥩', category: 'Freeze Dried', subcategory: 'Meats' },

  // Freeze Dried · Cat Grass / Yogurt
  { name: 'Cat Grass Cubes', emoji: '🌱', category: 'Freeze Dried', subcategory: 'Cat Grass / Yogurt' },
  { name: 'Cat Grass Sticks', emoji: '🌱', category: 'Freeze Dried', subcategory: 'Cat Grass / Yogurt' },
  { name: 'Yogurt Cubes', emoji: '🥛', category: 'Freeze Dried', subcategory: 'Cat Grass / Yogurt' },

  // Freeze Dried · Super Food
  { name: 'Duck Apple', emoji: '🍎', category: 'Freeze Dried', subcategory: 'Super Food' },
  { name: 'Duck Pear', emoji: '🍐', category: 'Freeze Dried', subcategory: 'Super Food' },
  { name: 'Chicken Cranberry', emoji: '🍒', category: 'Freeze Dried', subcategory: 'Super Food' },
  { name: 'Chicken Pumpkin', emoji: '🎃', category: 'Freeze Dried', subcategory: 'Super Food' },
  { name: 'Salmon Steak', emoji: '🐟', category: 'Freeze Dried', subcategory: 'Super Food' },
  { name: 'Chicken and Egg', emoji: '🥚', category: 'Freeze Dried', subcategory: 'Super Food' },
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
export const DEV_SEED_VERSION = '2026-09-03-line-prices';

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
