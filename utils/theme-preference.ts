import { getDatabase } from '../db/database';
import type { ThemeMode } from '../constants/theme';

/**
 * Persist the cashier's dark/light choice in the settings table (the same
 * key/value store the sync marker uses), so it survives an app restart. Dark is
 * the product default; a stored value only ever overrides that once read at
 * startup — see _layout's bootstrap, which loads it before the first paint to
 * avoid a theme flash.
 */

const THEME_MODE_KEY = 'theme_mode';

/** Read the saved theme, or null when the cashier has never chosen one. */
export async function loadThemeMode(): Promise<ThemeMode | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    [THEME_MODE_KEY]
  );
  return row?.value === 'dark' || row?.value === 'light' ? row.value : null;
}

/** Save the chosen theme so the next launch restores it. */
export async function saveThemeMode(mode: ThemeMode): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    [THEME_MODE_KEY, mode]
  );
}
