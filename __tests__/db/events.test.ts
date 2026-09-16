import { pickEventForDate, overlappingEvent, isValidDateKey, type PosEvent } from '../../db/events';

function ev(over: Partial<PosEvent> & { event_id: string }): PosEvent {
  return {
    name: 'Bazaar',
    venue: null,
    city: null,
    organizer: null,
    starts_on: null,
    ends_on: null,
    opening_cash: null,
    closing_cash: null,
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

describe('overlappingEvent', () => {
  const existing = [ev({ event_id: 'a', name: 'Bazaar A', starts_on: '2026-09-17', ends_on: '2026-09-18' })];

  it('flags a range that intersects an existing event', () => {
    expect(overlappingEvent(existing, '2026-09-18', '2026-09-19')?.event_id).toBe('a');
    expect(overlappingEvent(existing, '2026-09-16', '2026-09-17')?.event_id).toBe('a');
  });
  it('allows a range that abuts but does not intersect', () => {
    expect(overlappingEvent(existing, '2026-09-19', '2026-09-20')).toBeNull();
    expect(overlappingEvent(existing, '2026-09-15', '2026-09-16')).toBeNull();
  });
  it('excludes self when editing', () => {
    expect(overlappingEvent(existing, '2026-09-17', '2026-09-18', 'a')).toBeNull();
  });
  it('a proposal with no dates never clashes', () => {
    expect(overlappingEvent(existing, null, null)).toBeNull();
  });
  it('treats a single-bound existing event as that one day', () => {
    const oneDay = [ev({ event_id: 'b', starts_on: '2026-09-20', ends_on: null })];
    expect(overlappingEvent(oneDay, '2026-09-20', '2026-09-20')?.event_id).toBe('b');
    expect(overlappingEvent(oneDay, '2026-09-21', '2026-09-22')).toBeNull();
  });
});

describe('isValidDateKey', () => {
  it('accepts a real YYYY-MM-DD date', () => {
    expect(isValidDateKey('2026-09-17')).toBe(true);
    expect(isValidDateKey('2026-02-28')).toBe(true);
  });
  it('rejects malformed or impossible dates', () => {
    expect(isValidDateKey('2026-9-1')).toBe(false);
    expect(isValidDateKey('2026-13-01')).toBe(false);
    expect(isValidDateKey('2026-02-30')).toBe(false);
    expect(isValidDateKey('not-a-date')).toBe(false);
    expect(isValidDateKey('')).toBe(false);
  });
});
