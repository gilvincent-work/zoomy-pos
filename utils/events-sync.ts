import * as Crypto from 'expo-crypto';
import { getSupabase } from '../lib/supabase';
import {
  getUnsyncedEvents,
  markEventSynced,
  upsertLocalEvent,
  type PosEvent,
} from '../db/events';

/**
 * Events sync. The read half pulls Coop's pos_events into the local cache (so
 * "today's event?" resolves offline); the write half pushes local creates/edits
 * (opening cash, an unplanned on-site event) up through the upsert_pos_event RPC.
 * Both are best-effort and no-op when Supabase is unconfigured/offline, matching
 * the catalog + sales sync pattern. event_id is shared with Coop, so every push
 * is an idempotent upsert keyed on it.
 */

type RemoteEventRow = {
  event_id: string;
  name: string;
  venue: string | null;
  city: string | null;
  organizer: string | null;
  starts_on: string | null;
  ends_on: string | null;
  opening_cash: number | null;
  closing_cash: number | null;
  cash_note: string | null;
  status: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Pull Coop's events into the local cache. Returns the count applied, or null
 * when unconfigured/offline (POS keeps its cached events). Rows are marked
 * synced (they came from Coop). A locally-edited-but-not-yet-pushed event is
 * left alone: its synced_at is null, and we skip overwriting an unsynced local
 * row so an in-flight local edit isn't clobbered by a stale server copy.
 */
export async function pullEvents(): Promise<{ updated: number } | null> {
  const sb = getSupabase();
  if (!sb) return null;

  let rows: RemoteEventRow[];
  try {
    const { data, error } = await sb
      .from('pos_events')
      .select('event_id, name, venue, city, organizer, starts_on, ends_on, opening_cash, closing_cash, cash_note, status, created_at, updated_at');
    if (error) throw new Error(error.message);
    rows = (data ?? []) as RemoteEventRow[];
  } catch {
    return null;
  }

  // Don't overwrite a local row that still owes Coop a push (unsynced local edit
  // wins until it lands, then a later pull reflects the converged value).
  const unsynced = new Set((await getUnsyncedEvents()).map((e) => e.event_id));

  let updated = 0;
  for (const r of rows) {
    if (unsynced.has(r.event_id)) continue;
    await upsertLocalEvent(
      {
        event_id: r.event_id,
        name: r.name ?? '',
        venue: r.venue ?? null,
        city: r.city ?? null,
        organizer: r.organizer ?? null,
        starts_on: r.starts_on ?? null,
        ends_on: r.ends_on ?? null,
        opening_cash: r.opening_cash == null ? null : Number(r.opening_cash),
        closing_cash: r.closing_cash == null ? null : Number(r.closing_cash),
        cash_note: r.cash_note ?? null,
        status: r.status ?? 'active',
        created_at: r.created_at,
        updated_at: r.updated_at,
      },
      { synced: true }
    );
    updated += 1;
  }
  return { updated };
}

/** Push one local event up through upsert_pos_event. Best-effort boolean. */
export async function pushEvent(e: PosEvent): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const p_event: Record<string, unknown> = {
    event_id: e.event_id,
    name: e.name,
    venue: e.venue,
    city: e.city,
    organizer: e.organizer,
    starts_on: e.starts_on,
    ends_on: e.ends_on,
    opening_cash: e.opening_cash,
    closing_cash: e.closing_cash,
    cash_note: e.cash_note,
    status: e.status,
    created_by: 'pos',
  };
  try {
    const { error } = await sb.rpc('upsert_pos_event', { p_event });
    if (error) return false;
  } catch {
    return false;
  }
  return true;
}

/** Drain any locally-created/edited events to Coop. Returns pushed/failed. */
export async function drainEvents(): Promise<{ pushed: number; failed: number }> {
  let pushed = 0;
  let failed = 0;
  const pending = await getUnsyncedEvents();
  for (const e of pending) {
    if (await pushEvent(e)) {
      await markEventSynced(e.event_id);
      pushed += 1;
    } else {
      failed += 1;
    }
  }
  return { pushed, failed };
}

/** A fresh Coop-shared event id for an on-site create (mirrors sale client_uuid). */
export function newEventId(): string {
  return Crypto.randomUUID();
}
