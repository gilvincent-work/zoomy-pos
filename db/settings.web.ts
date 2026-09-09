import { getDatabase } from './database';
import type { PaymentMethod } from './transactions';
import { QUICK_PAYMENT_METHODS, DEFAULT_ENABLED_PAYMENT_METHODS } from '../constants/payment';

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

// ─── Payment options (Settings) ────────────────────────────────────────────
// Kept identical to settings.ts (no FileSystem involved here, so there's no
// real web-specific behavior) — this file exists only because Metro prefers
// .web.ts over .ts for web builds, so anything added to settings.ts must be
// mirrored here too or the web build silently keeps the old version.

const VALID_METHODS = new Set(QUICK_PAYMENT_METHODS.map((m) => m.key));

/** Enabled quick-pay methods, in the fixed master order. Falls back to the
 *  default set if unset, empty, or corrupted (never returns []). */
export async function getEnabledPaymentMethods(): Promise<PaymentMethod[]> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    ['payment_methods_enabled']
  );
  if (!row?.value) return DEFAULT_ENABLED_PAYMENT_METHODS;
  try {
    const parsed: unknown = JSON.parse(row.value);
    if (!Array.isArray(parsed)) return DEFAULT_ENABLED_PAYMENT_METHODS;
    const enabled = QUICK_PAYMENT_METHODS.map((m) => m.key).filter((k) => parsed.includes(k));
    return enabled.length > 0 ? enabled : DEFAULT_ENABLED_PAYMENT_METHODS;
  } catch {
    return DEFAULT_ENABLED_PAYMENT_METHODS;
  }
}

/** Persist the enabled set. Always keeps at least one method (falls back to Cash). */
export async function setEnabledPaymentMethods(methods: PaymentMethod[]): Promise<void> {
  const cleaned = methods.filter((m) => VALID_METHODS.has(m));
  const value = cleaned.length > 0 ? cleaned : ['cash'];
  const db = await getDatabase();
  await db.runAsync(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    ['payment_methods_enabled', JSON.stringify(value)]
  );
}

/** Whether tapping Pay opens the confirm-before-recording modal. Default on. */
export async function getConfirmOnPay(): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    ['confirm_on_pay']
  );
  return row?.value !== '0'; // unset (null) => on, matches the existing default behavior
}

export async function setConfirmOnPay(enabled: boolean): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    ['confirm_on_pay', enabled ? '1' : '0']
  );
}
