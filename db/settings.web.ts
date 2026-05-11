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

export type QrMethod = 'gcash' | 'maya' | 'bpi';
export type QrUris = Record<QrMethod, string | null>;

export function qrMethodLabel(method: QrMethod): string {
  if (method === 'gcash') return 'GCash';
  if (method === 'maya') return 'Maya';
  return 'BPI';
}

export async function getQrUri(method: QrMethod): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    [`qr_${method}`]
  );
  return row?.value ?? null;
}

export async function setQrUri(method: QrMethod, uri: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    [`qr_${method}`, uri]
  );
}

export async function removeQrUri(method: QrMethod): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'DELETE FROM settings WHERE key = ?',
    [`qr_${method}`]
  );
}

export async function getAllQrUris(): Promise<QrUris> {
  const [gcash, maya, bpi] = await Promise.all([
    getQrUri('gcash'),
    getQrUri('maya'),
    getQrUri('bpi'),
  ]);
  return { gcash, maya, bpi };
}
