import { getDatabase } from './database';

const DEFAULT_PIN_HASH = '9af15b336e6a9619928537df30b2e6a2376569fcf9d7e773eccede65606529a0'; // SHA-256 of '0000'

export async function initSchema(): Promise<void> {
  const db = await getDatabase();

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      emoji TEXT NOT NULL DEFAULT '🍬',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      total REAL NOT NULL,
      cash_tendered REAL NOT NULL,
      change REAL NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'cash',
      status TEXT NOT NULL DEFAULT 'completed',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transaction_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL,
      product_id INTEGER,
      product_name TEXT NOT NULL,
      price REAL NOT NULL,
      quantity INTEGER NOT NULL,
      FOREIGN KEY (transaction_id) REFERENCES transactions(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS product_variants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS saved_bundles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      items_json TEXT NOT NULL,
      price REAL NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  // Add payment_method column to existing databases
  await db.runAsync(
    `ALTER TABLE transactions ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'cash'`
  ).catch(() => {});

  await db.runAsync(
    `ALTER TABLE transactions ADD COLUMN ref_number TEXT`
  ).catch(() => {});

  await db.runAsync(
    `ALTER TABLE transactions ADD COLUMN proof_photo_uri TEXT`
  ).catch(() => {});

  await db.runAsync(
    `ALTER TABLE transactions ADD COLUMN customer_handle TEXT`
  ).catch(() => {});

  await db.runAsync(
    `ALTER TABLE transactions ADD COLUMN is_bundle INTEGER NOT NULL DEFAULT 0`
  ).catch(() => {});

  await db.runAsync(
    `ALTER TABLE products ADD COLUMN has_variants INTEGER NOT NULL DEFAULT 0`
  ).catch(() => {});

  // Migrate products table to allow nullable price (needed for variant products)
  const cols = await db.getAllAsync<{ name: string; notnull: number }>(
    `PRAGMA table_info(products)`
  );
  const priceCol = cols.find((c) => c.name === 'price');
  if (priceCol && priceCol.notnull === 1) {
    await db.execAsync(`
      CREATE TABLE products_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        price REAL,
        emoji TEXT NOT NULL DEFAULT '🍬',
        has_variants INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );
      INSERT INTO products_new SELECT id, name, price, emoji, has_variants, is_active, created_at FROM products;
      DROP TABLE products;
      ALTER TABLE products_new RENAME TO products;
    `);
  }

  await db.runAsync(
    `ALTER TABLE transaction_items ADD COLUMN variant_id INTEGER`
  ).catch(() => {});

  await db.runAsync(
    `ALTER TABLE transaction_items ADD COLUMN variant_name TEXT`
  ).catch(() => {});

  await db.runAsync(
    `ALTER TABLE saved_bundles ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1`
  ).catch(() => {});

  // Pick bundles: "buy any N flavors from selected product lines" for a fixed
  // price. Legacy bundles stay bundle_type 'fixed' (items_json is the item list);
  // 'pick' bundles use pick_count + line_categories and select flavors at sale time.
  await db.runAsync(
    `ALTER TABLE saved_bundles ADD COLUMN bundle_type TEXT NOT NULL DEFAULT 'fixed'`
  ).catch(() => {});

  await db.runAsync(
    `ALTER TABLE saved_bundles ADD COLUMN pick_count INTEGER`
  ).catch(() => {});

  await db.runAsync(
    `ALTER TABLE saved_bundles ADD COLUMN line_categories TEXT`
  ).catch(() => {});

  // Shared id (matches Coop pos_bundles.bundle_id) so a bundle created on one
  // device syncs to the others, plus an editable tile emoji.
  await db.runAsync(
    `ALTER TABLE saved_bundles ADD COLUMN bundle_uuid TEXT`
  ).catch(() => {});

  await db.runAsync(
    `ALTER TABLE saved_bundles ADD COLUMN emoji TEXT`
  ).catch(() => {});

  await db.runAsync(
    `ALTER TABLE products ADD COLUMN image_uri TEXT`
  ).catch(() => {});

  // Option H — category / subcategory for the split-view filter tabs
  await db.runAsync(
    `ALTER TABLE products ADD COLUMN category TEXT`
  ).catch(() => {});

  await db.runAsync(
    `ALTER TABLE products ADD COLUMN subcategory TEXT`
  ).catch(() => {});

  // Coop integration: the SKU Code that identifies this product as
  // pos_products.product_id once catalog sync (Phase 2) is wired up.
  // Nullable — locally-created products have none until synced.
  await db.runAsync(
    `ALTER TABLE products ADD COLUMN sku TEXT`
  ).catch(() => {});

  await db.execAsync(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku ON products(sku) WHERE sku IS NOT NULL`
  );

  // Local cache of Coop's on-hand stock (pos_inventory), refreshed on every
  // catalog pull. Coop-authoritative — unlike emoji, the pull always overwrites
  // this. Powers the low/oversold tile warning; 0 for locally-created products
  // with no SKU yet (never synced, so no stock signal to show).
  await db.runAsync(
    `ALTER TABLE products ADD COLUMN stock INTEGER NOT NULL DEFAULT 0`
  ).catch(() => {});

  await db.runAsync(
    `ALTER TABLE transactions ADD COLUMN remarks TEXT`
  ).catch(() => {});

  // Idempotency key shared with Coop's pos_orders.client_uuid. Lets the
  // Transactions screen merge this device's sales with the ones pulled back
  // from Coop (other devices) without double-counting a sale it also pushed.
  await db.runAsync(
    `ALTER TABLE transactions ADD COLUMN client_uuid TEXT`
  ).catch(() => {});

  await db.runAsync(
    `INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`,
    ['admin_password_hash', DEFAULT_PIN_HASH]
  );

  // Migrate legacy single GCash QR to new per-method key
  await db.runAsync(
    `INSERT OR IGNORE INTO settings (key, value)
     SELECT 'qr_gcash', value FROM settings WHERE key = 'gcash_qr_uri'`
  ).catch(() => {});
}
