import { getDatabase } from './database';

export async function getAdminHash(): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    ['admin_password_hash']
  );
  return row?.value ?? null;
}

export async function setAdminHash(hash: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    ['admin_password_hash', hash]
  );
}

export async function getGcashQrUri(): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    ['gcash_qr_uri']
  );
  return row?.value ?? null;
}

export async function setGcashQrUri(uri: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    ['gcash_qr_uri', uri]
  );
}

export async function removeGcashQrUri(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'DELETE FROM settings WHERE key = ?',
    ['gcash_qr_uri']
  );
}
