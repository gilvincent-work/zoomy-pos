import { getDatabase } from './database';
import { createProduct } from './products';

/**
 * Real Zoomy pet-treat catalog for local development. Prices are PLACEHOLDERS
 * pending the confirmed price sheet. Only "Freeze Dried" has subcategories
 * (Fish / Meats / Cat Grass · Yogurt / Super Food).
 *
 * Note: display names repeat across categories (e.g. "Chicken" in both Meaty
 * Treats and Tasty Treats), so these are seeded as distinct products rather than
 * deduped by name.
 */
const SEED_PRODUCTS: {
  name: string;
  price: number;
  emoji: string;
  category: string;
  subcategory: string | null;
}[] = [
  // Meaty Treats
  { name: 'Salmon', price: 142.5, emoji: '🐟', category: 'Meaty Treats', subcategory: null },
  { name: 'Beef', price: 142.5, emoji: '🥩', category: 'Meaty Treats', subcategory: null },
  { name: 'Duck', price: 142.5, emoji: '🦆', category: 'Meaty Treats', subcategory: null },
  { name: 'Chicken', price: 142.5, emoji: '🍗', category: 'Meaty Treats', subcategory: null },

  // Tasty Treats
  { name: 'Chicken', price: 275, emoji: '🍗', category: 'Tasty Treats', subcategory: null },
  { name: 'Duck', price: 275, emoji: '🦆', category: 'Tasty Treats', subcategory: null },

  // Super Duo Bites
  { name: 'Carrot Duck', price: 275, emoji: '🥕', category: 'Super Duo Bites', subcategory: null },
  { name: 'Carrot Chicken', price: 275, emoji: '🥕', category: 'Super Duo Bites', subcategory: null },
  { name: 'Duck Pear', price: 275, emoji: '🍐', category: 'Super Duo Bites', subcategory: null },

  // Freeze Dried · Fish
  { name: 'Salmon Cubes', price: 142.5, emoji: '🐟', category: 'Freeze Dried', subcategory: 'Fish' },
  { name: 'Capelin', price: 142.5, emoji: '🐟', category: 'Freeze Dried', subcategory: 'Fish' },

  // Freeze Dried · Meats
  { name: 'Lamb Liver', price: 142.5, emoji: '🍖', category: 'Freeze Dried', subcategory: 'Meats' },
  { name: 'Duck Breast Cubes', price: 142.5, emoji: '🦆', category: 'Freeze Dried', subcategory: 'Meats' },
  { name: 'Chicken Breast Cubes', price: 142.5, emoji: '🍗', category: 'Freeze Dried', subcategory: 'Meats' },
  { name: 'Chicken Liver', price: 142.5, emoji: '🍗', category: 'Freeze Dried', subcategory: 'Meats' },
  { name: 'Beef Liver', price: 142.5, emoji: '🥩', category: 'Freeze Dried', subcategory: 'Meats' },

  // Freeze Dried · Cat Grass / Yogurt
  { name: 'Cat Grass Cubes', price: 142.5, emoji: '🌱', category: 'Freeze Dried', subcategory: 'Cat Grass / Yogurt' },
  { name: 'Cat Grass Sticks', price: 142.5, emoji: '🌱', category: 'Freeze Dried', subcategory: 'Cat Grass / Yogurt' },
  { name: 'Yogurt Cubes', price: 142.5, emoji: '🥛', category: 'Freeze Dried', subcategory: 'Cat Grass / Yogurt' },

  // Freeze Dried · Super Food
  { name: 'Duck Apple', price: 142.5, emoji: '🍎', category: 'Freeze Dried', subcategory: 'Super Food' },
  { name: 'Duck Pear', price: 142.5, emoji: '🍐', category: 'Freeze Dried', subcategory: 'Super Food' },
  { name: 'Chicken Cranberry', price: 142.5, emoji: '🍒', category: 'Freeze Dried', subcategory: 'Super Food' },
  { name: 'Chicken Pumpkin', price: 142.5, emoji: '🎃', category: 'Freeze Dried', subcategory: 'Super Food' },
  { name: 'Salmon Steak', price: 142.5, emoji: '🐟', category: 'Freeze Dried', subcategory: 'Super Food' },
  // NOTE: "Chicken and Egg" had a blank Offline Event Price; defaulted to 142.5 to match its category. Confirm.
  { name: 'Chicken and Egg', price: 142.5, emoji: '🥚', category: 'Freeze Dried', subcategory: 'Super Food' },
];

/**
 * Bump this whenever SEED_PRODUCTS changes so an already-seeded dev database
 * refreshes to the latest sample catalog on next launch.
 */
export const DEV_SEED_VERSION = '2026-09-01-offline-event-prices';

async function insertSeedCatalog(): Promise<void> {
  for (const p of SEED_PRODUCTS) {
    await createProduct({
      name: p.name,
      price: p.price,
      has_variants: false,
      emoji: p.emoji,
      category: p.category,
      subcategory: p.subcategory,
    });
  }
}

/**
 * Loads the sample catalog for local development. Runs only in __DEV__ (see
 * app/_layout.tsx). When the stored seed version differs from DEV_SEED_VERSION
 * (including a database seeded before versioning existed, which has no marker),
 * it replaces the product catalog with the latest sample data; otherwise it is a
 * no-op. Destructive: only used in dev so it cannot touch a real store's data.
 */
export async function seedDevProducts(): Promise<void> {
  const db = await getDatabase();
  const versionRow = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'dev_seed_version'"
  );
  if (versionRow?.value === DEV_SEED_VERSION) return;

  await db.execAsync('DELETE FROM products');
  await insertSeedCatalog();
  await db.runAsync(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ('dev_seed_version', ?)",
    [DEV_SEED_VERSION]
  );
}

/**
 * Loads the sample catalog on non-dev builds (staging/production) the first time
 * the app runs against an empty database. Non-destructive: if any products
 * already exist (seeded, manually added, or imported), it is a no-op, so it never
 * overwrites a real store's catalog. This is what makes products appear on
 * staging, where __DEV__ is false and seedDevProducts never runs.
 */
export async function seedProductsIfEmpty(): Promise<void> {
  const db = await getDatabase();
  const countRow = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM products'
  );
  if ((countRow?.n ?? 0) > 0) return;

  await insertSeedCatalog();
}
