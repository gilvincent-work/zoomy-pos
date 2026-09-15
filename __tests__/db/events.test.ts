import { pickEventForDate, type PosEvent } from '../../db/events';

function ev(over: Partial<PosEvent> & { event_id: string }): PosEvent {
  return {
    name: 'Bazaar',
    venue: null,
    city: null,
    organizer: null,
    starts_on: null,
    ends_on: null,
    opening_cash: null,
    cash_note: null,
    status: 'active',
    created_at: '2026-09-10T00:00:00.000Z',
    updated_at: '2026-09-10T00:00:00.000Z',
    synced_at: null,
    ...over,
  };
}

describe('pickEventForDate', () => {
  it('returns null on a normal day (no event covers the date)', () => {
    const events = [ev({ event_id: 'a', starts_on: '2026-09-16', ends_on: '2026-09-18' })];
    expect(pickEventForDate(events, '2026-09-15')).toBeNull();
    expect(pickEventForDate(events, '2026-09-19')).toBeNull();
  });

  it('matches a date inside the range, inclusive of both bounds', () => {
    const events = [ev({ event_id: 'a', starts_on: '2026-09-16', ends_on: '2026-09-18' })];
    expect(pickEventForDate(events, '2026-09-16')?.event_id).toBe('a');
    expect(pickEventForDate(events, '2026-09-17')?.event_id).toBe('a');
    expect(pickEventForDate(events, '2026-09-18')?.event_id).toBe('a');
  });

  it('matches a single-day event (starts_on === ends_on)', () => {
    const events = [ev({ event_id: 'a', starts_on: '2026-09-16', ends_on: '2026-09-16' })];
    expect(pickEventForDate(events, '2026-09-16')?.event_id).toBe('a');
    expect(pickEventForDate(events, '2026-09-17')).toBeNull();
  });

  it('treats an event with only one bound as that single day (not open-ended)', () => {
    // Only starts_on set -> covers just that day, so it can never claim future
    // normal days, and vice-versa for only ends_on.
    const onlyStart = [ev({ event_id: 'a', starts_on: '2026-09-16', ends_on: null })];
    expect(pickEventForDate(onlyStart, '2026-09-16')?.event_id).toBe('a');
    expect(pickEventForDate(onlyStart, '2027-01-01')).toBeNull();
    const onlyEnd = [ev({ event_id: 'b', starts_on: null, ends_on: '2026-09-18' })];
    expect(pickEventForDate(onlyEnd, '2026-09-18')?.event_id).toBe('b');
    expect(pickEventForDate(onlyEnd, '2020-01-01')).toBeNull();
  });

  it('never auto-detects an event with no dates at all', () => {
    const events = [ev({ event_id: 'a', starts_on: null, ends_on: null })];
    expect(pickEventForDate(events, '2026-09-16')).toBeNull();
  });

  it('on overlapping ranges, the most recently created wins (never drops a sale)', () => {
    const events = [
      ev({ event_id: 'old', starts_on: '2026-09-16', ends_on: '2026-09-18', created_at: '2026-09-01T00:00:00.000Z' }),
      ev({ event_id: 'new', starts_on: '2026-09-17', ends_on: '2026-09-19', created_at: '2026-09-10T00:00:00.000Z' }),
    ];
    expect(pickEventForDate(events, '2026-09-17')?.event_id).toBe('new');
  });
});
