import { getDatabase } from '../db/database';

/**
 * Remember that the Tutorial tour has been offered or taken, so the first-run
 * prompt appears once per install. The Tutorial button always replays it. Stored
 * in the settings table, like the theme choice (see theme-preference.ts).
 */

const TOUR_SEEN_KEY = 'tour_seen';

/** True once the cashier has finished, skipped or declined the tour. */
export async function loadTourSeen(): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    [TOUR_SEEN_KEY]
  );
  return row?.value === '1';
}

/** Mark the tour as seen so the first-run prompt stays away. */
export async function saveTourSeen(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    [TOUR_SEEN_KEY, '1']
  );
}
