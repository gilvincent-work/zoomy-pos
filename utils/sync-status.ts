import { getDatabase } from '../db/database';

/**
 * Observable sync-status store — the data behind the "last synced · N pending"
 * marker (see COOP_INTEGRATION_PLAN.md, "Sync transparency"). This is Phase 1
 * scaffolding: the counts are set by whoever owns the work. In Phase 2 the
 * outbox will drive setPendingCount() as sales queue/drain, and the sync engine
 * will call beginSync()/markSynced() around each drain. lastSyncedAt is
 * persisted to the settings table so the marker survives an app restart.
 */

const LAST_SYNCED_KEY = 'last_synced_at';

export type SyncState = {
  lastSyncedAt: string | null; // ISO string, or null if never synced
  pendingCount: number;
  syncing: boolean;
};

let state: SyncState = {
  lastSyncedAt: null,
  pendingCount: 0,
  syncing: false,
};

const listeners = new Set<() => void>();

function emit(): void {
  for (const fn of listeners) fn();
}

function setState(patch: Partial<SyncState>): void {
  state = { ...state, ...patch };
  emit();
}

export function getSyncState(): SyncState {
  return state;
}

export function subscribeSyncStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Read the persisted last-synced time into the store. Call once at startup. */
export async function loadPersistedSyncStatus(): Promise<void> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    [LAST_SYNCED_KEY]
  );
  if (row?.value) setState({ lastSyncedAt: row.value });
}

/** Number of sales captured locally but not yet confirmed by Supabase. */
export function setPendingCount(count: number): void {
  setState({ pendingCount: Math.max(0, count) });
}

/** Mark a sync attempt in progress (drives the marker's spinner/label). */
export function beginSync(): void {
  setState({ syncing: true });
}

/** Record a successful sync and persist the time. Does NOT clear `syncing` —
 *  that flag is owned by beginSync/endSync, so a multi-row drain (which calls
 *  this per successful push) keeps the spinner on for its whole run instead of
 *  flickering off between rows. */
export async function markSynced(at: Date = new Date()): Promise<void> {
  const iso = at.toISOString();
  setState({ lastSyncedAt: iso });
  const db = await getDatabase();
  await db.runAsync(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    [LAST_SYNCED_KEY, iso]
  );
}

/** A sync attempt ended without success (e.g. offline); clear the spinner. */
export function endSync(): void {
  setState({ syncing: false });
}
