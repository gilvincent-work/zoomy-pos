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
  `);

  // Add payment_method column to existing databases
  await db.runAsync(
    `ALTER TABLE transactions ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'cash'`
  ).catch(() => {});

  await db.runAsync(
    `INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`,
    ['admin_password_hash', DEFAULT_PIN_HASH]
  );
}
