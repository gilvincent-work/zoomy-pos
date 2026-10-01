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
  closing_cash: number | null; // counted at the till at close (mirrors Coop)
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

/**
 * Multi-event (same-day events). The cashier declares which event a sale belongs
 * to. `candidates` are the events a sale could be logged to right now; `event` is
 * the one it WILL be stamped with (the sticky pick, or the sole candidate), or
 * null when the cashier still has to choose; `mustPick` is the hard gate (two or
 * more candidates and no valid pick yet).
 */
export type ActiveEventState = {
  event: PosEvent | null;
  candidates: PosEvent[];
  mustPick: boolean;
};

/**
 * Pure: the events a sale can be logged to on `dateKey` — those whose range
 * covers the day AND that aren't closed — most recently created first. Closed
 * events drop out so a counted-and-closed till can't take new sales. Same
 * coverage rule as pickEventForDate, but returns every match (not just one) now
 * that overlapping / same-day events are allowed.
 */
export function pickableEventsForDate(events: PosEvent[], dateKey: string): PosEvent[] {
  const covering = events.filter((e) => {
    if ((e.status ?? 'active') === 'closed') return false;
    const from = e.starts_on ?? e.ends_on;
    const to = e.ends_on ?? e.starts_on;
    if (!from && !to) return false; // an event with no dates never auto-detects
    if (from && dateKey < from) return false;
    if (to && dateKey > to) return false;
    return true;
  });
  return covering.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

/**
 * Pure: every event whose date range covers `dateKey`, regardless of status
 * (closed events included), most recently created first. Used to offer event
 * choices for a PAST sale being edited: a sale made during an event is often
 * edited after that event has since been closed, so excluding closed events
 * (as pickableEventsForDate does, correctly, for NEW sales) would wrongly hide
 * the sale's own event from the picker. Same coverage rule as pickEventForDate.
 */
export function eventsCoveringDay(events: PosEvent[], dateKey: string): PosEvent[] {
  const covering = events.filter((e) => {
    const from = e.starts_on ?? e.ends_on;
    const to = e.ends_on ?? e.starts_on;
    if (!from && !to) return false; // an event with no dates never auto-detects
    if (from && dateKey < from) return false;
    if (to && dateKey > to) return false;
    return true;
  });
  return covering.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

/**
 * Pure: resolve the active event from today's candidates and the cashier's
 * sticky pick. A sole candidate auto-selects; two or more with no valid pick is
 * the hard gate. A selectedId that isn't among the candidates (event ended, was
 * closed, or a stale pick) is treated as no pick — the DB caller clears it.
 */
export function resolveFromCandidates(
  candidates: PosEvent[],
  selectedId: string | null
): ActiveEventState {
  if (candidates.length === 0) return { event: null, candidates, mustPick: false };
  const selected = selectedId
    ? candidates.find((e) => e.event_id === selectedId) ?? null
    : null;
  if (selected) return { event: selected, candidates, mustPick: false };
  if (candidates.length === 1) return { event: candidates[0], candidates, mustPick: false };
  return { event: null, candidates, mustPick: true };
}

/**
 * Pure: the first event whose dates clash with a proposed [startsOn, endsOn]
 * range, or null if the range is free. Mirrors Coop's upsert_pos_event overlap
 * guard exactly (single bound = that one day; ranges intersect when each starts on
 * or before the other ends), so the POS can block a create/edit locally before
 * Coop would reject it. Pass selfId when editing so an event never clashes with
 * itself. A proposal with no dates never clashes.
 */
export function overlappingEvent(
  events: PosEvent[],
  startsOn: string | null,
  endsOn: string | null,
  selfId?: string
): PosEvent | null {
  if (!startsOn && !endsOn) return null;
  const from = (startsOn ?? endsOn) as string;
  const to = (endsOn ?? startsOn) as string;
  for (const e of events) {
    if (e.event_id === selfId) continue;
    const eFrom = e.starts_on ?? e.ends_on;
    const eTo = e.ends_on ?? e.starts_on;
    if (!eFrom || !eTo) continue;
    if (eFrom <= to && from <= eTo) return e;
  }
  return null;
}

/** Validate a 'YYYY-MM-DD' string; returns true for a real calendar date. */
export function isValidDateKey(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && v === d.toISOString().slice(0, 10);
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
    closing_cash: r.closing_cash == null ? null : Number(r.closing_cash),
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

/** Today's pickable events (cover the device date, not closed), newest first. */
export async function getActiveEventsForDate(dateKey: string = localDateKey()): Promise<PosEvent[]> {
  const events = await getLocalEvents();
  return pickableEventsForDate(events, dateKey);
}

/**
 * Resolve which event a sale should be stamped with, honoring the cashier's
 * sticky pick, and clear the pick when it's gone stale (event ended / closed, or
 * a normal day). This is the attribution + hard-gate source of truth at checkout.
 */
export async function resolveActiveEvent(dateKey: string = localDateKey()): Promise<ActiveEventState> {
  const candidates = await getActiveEventsForDate(dateKey);
  const selectedId = await getSelectedEventId();
  const state = resolveFromCandidates(candidates, selectedId);
  // Drop a pick that no longer applies so it can't leak into a later event day.
  if (selectedId && !candidates.some((e) => e.event_id === selectedId)) {
    await setSelectedEventId(null);
  }
  return state;
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
       (event_id, name, venue, city, organizer, starts_on, ends_on, opening_cash, closing_cash, cash_note, status, created_at, updated_at, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(event_id) DO UPDATE SET
       name = excluded.name,
       venue = excluded.venue,
       city = excluded.city,
       organizer = excluded.organizer,
       starts_on = excluded.starts_on,
       ends_on = excluded.ends_on,
       opening_cash = excluded.opening_cash,
       closing_cash = excluded.closing_cash,
       cash_note = excluded.cash_note,
       status = excluded.status,
       updated_at = excluded.updated_at,
       synced_at = excluded.synced_at`,
    [
      e.event_id, e.name, e.venue, e.city, e.organizer, e.starts_on, e.ends_on,
      e.opening_cash, e.closing_cash, e.cash_note, e.status, e.created_at, e.updated_at, syncedAt,
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

// ─── Cashier's sticky event pick (multi-event) ──────────────────────────────
// Which of today's events this device is logging sales to. Persisted in the
// shared settings kv so it survives app restarts; cleared when the event ends,
// closes, or the cashier switches. Null = no pick (a normal day, or an
// unresolved gate the cashier still has to choose through).
const SELECTED_EVENT_KEY = 'selected_event_id';

export async function getSelectedEventId(): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    [SELECTED_EVENT_KEY]
  );
  return row?.value ?? null;
}

export async function setSelectedEventId(eventId: string | null): Promise<void> {
  const db = await getDatabase();
  if (eventId == null) {
    await db.runAsync('DELETE FROM settings WHERE key = ?', [SELECTED_EVENT_KEY]);
    return;
  }
  await db.runAsync(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    [SELECTED_EVENT_KEY, eventId]
  );
}
