import { getDatabase } from './database';

/**
 * Events / opening cash. A pos_events row is one bazaar. Coop schedules its date
 * range; the POS caches events locally (db/schema.ts) and resolves "today's
 * event" by matching the device date against starts_on..ends_on, fully offline.
 * A sale made on an event day is stamped with that event_id; a normal day leaves
 * it null. Opening cash lives on the event and is editable from the POS on-site
 * or Coop ahead of time (last write wins, converged by updated_at).
 */

export type PosEvent = {
  event_id: string;
  name: string;
  venue: string | null;
  city: string | null;
  organizer: string | null;
  starts_on: string | null; // 'YYYY-MM-DD'
  ends_on: string | null;   // 'YYYY-MM-DD'
  opening_cash: number | null;
  cash_note: string | null;
  status: string; // 'active' | 'closed'
  created_at: string;
  updated_at: string;
  /** Null while a local edit hasn't been confirmed on Coop; set once it has. */
  synced_at: string | null;
};

/** The device's local date as 'YYYY-MM-DD' (the granularity event dates use). */
export function localDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Pure: pick the event whose date range covers `dateKey`. A single-day event has
 * starts_on == ends_on; an event with only one bound set is treated as that one
 * day (the present date fills both bounds) rather than open-ended, so a
 * half-filled event can never retroactively claim past normal-day sales. An
 * event with no dates at all never auto-detects. When more than one matches
 * (overlapping ranges shouldn't happen, but we never drop a sale over it), the
 * most recently created wins. Returns null on a normal day.
 */
export function pickEventForDate(events: PosEvent[], dateKey: string): PosEvent | null {
  const covering = events.filter((e) => {
    const from = e.starts_on ?? e.ends_on;
    const to = e.ends_on ?? e.starts_on;
    if (!from && !to) return false; // an event with no dates never auto-detects
    if (from && dateKey < from) return false;
    if (to && dateKey > to) return false;
    return true;
  });
  if (covering.length === 0) return null;
  covering.sort((a, b) => (a.created_at < b.created_at ? 1 : -1)); // newest first
  return covering[0];
}

function rowToEvent(r: Record<string, unknown>): PosEvent {
  return {
    event_id: r.event_id as string,
    name: r.name as string,
    venue: (r.venue as string) ?? null,
    city: (r.city as string) ?? null,
    organizer: (r.organizer as string) ?? null,
    starts_on: (r.starts_on as string) ?? null,
    ends_on: (r.ends_on as string) ?? null,
    opening_cash: r.opening_cash == null ? null : Number(r.opening_cash),
    cash_note: (r.cash_note as string) ?? null,
    status: (r.status as string) ?? 'active',
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    synced_at: (r.synced_at as string) ?? null,
  };
}

/** All locally-cached events, newest first. */
export async function getLocalEvents(): Promise<PosEvent[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM pos_events ORDER BY created_at DESC'
  );
  return rows.map(rowToEvent);
}

/** The event covering today (device date), or null on a normal day. */
export async function getActiveEvent(dateKey: string = localDateKey()): Promise<PosEvent | null> {
  const events = await getLocalEvents();
  return pickEventForDate(events, dateKey);
}

export async function getEventById(eventId: string): Promise<PosEvent | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM pos_events WHERE event_id = ?',
    [eventId]
  );
  return row ? rowToEvent(row) : null;
}

/**
 * Upsert an event into the local cache, keyed on event_id. `synced` marks
 * whether this write is already on Coop: true for rows arriving from a pull
 * (stamps synced_at = updated_at), false/absent for a local create/edit (leaves
 * synced_at null so the outbox re-pushes it).
 */
export async function upsertLocalEvent(
  e: Omit<PosEvent, 'synced_at'>,
  opts: { synced?: boolean } = {}
): Promise<void> {
  const db = await getDatabase();
  const syncedAt = opts.synced ? e.updated_at : null;
  await db.runAsync(
    `INSERT INTO pos_events
       (event_id, name, venue, city, organizer, starts_on, ends_on, opening_cash, cash_note, status, created_at, updated_at, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(event_id) DO UPDATE SET
       name = excluded.name,
       venue = excluded.venue,
       city = excluded.city,
       organizer = excluded.organizer,
       starts_on = excluded.starts_on,
       ends_on = excluded.ends_on,
       opening_cash = excluded.opening_cash,
       cash_note = excluded.cash_note,
       status = excluded.status,
       updated_at = excluded.updated_at,
       synced_at = excluded.synced_at`,
    [
      e.event_id, e.name, e.venue, e.city, e.organizer, e.starts_on, e.ends_on,
      e.opening_cash, e.cash_note, e.status, e.created_at, e.updated_at, syncedAt,
    ]
  );
}

/** Set an event's opening cash + note locally, mark it unsynced for the outbox. */
export async function setLocalEventCash(
  eventId: string,
  openingCash: number | null,
  cashNote: string | null
): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    'UPDATE pos_events SET opening_cash = ?, cash_note = ?, updated_at = ?, synced_at = NULL WHERE event_id = ?',
    [openingCash, cashNote, now, eventId]
  );
}

/** Events with a pending Coop push (local create/edit not yet confirmed). */
export async function getUnsyncedEvents(): Promise<PosEvent[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM pos_events WHERE synced_at IS NULL ORDER BY created_at ASC'
  );
  return rows.map(rowToEvent);
}

export async function markEventSynced(eventId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE pos_events SET synced_at = ? WHERE event_id = ?',
    [new Date().toISOString(), eventId]
  );
}
