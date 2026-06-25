import {
  startOfDay, endOfDay, isSameDay, getMonthGrid, isDayInRange,
  getFilterRange, formatRangeLabel, formatRangeForFilename,
} from '../../utils/date-range';

describe('startOfDay / endOfDay', () => {
  it('zeroes the time to midnight', () => {
    const d = startOfDay(new Date(2026, 5, 25, 15, 30, 0));
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getDate()).toBe(25);
  });

  it('sets the time to the last millisecond of the day', () => {
    const d = endOfDay(new Date(2026, 5, 25, 15, 30, 0));
    expect(d.getHours()).toBe(23);
    expect(d.getMinutes()).toBe(59);
    expect(d.getSeconds()).toBe(59);
  });
});

describe('isSameDay', () => {
  it('returns true for the same calendar day at different times', () => {
    expect(isSameDay(new Date(2026, 5, 25, 1, 0), new Date(2026, 5, 25, 23, 0))).toBe(true);
  });

  it('returns false for different days', () => {
    expect(isSameDay(new Date(2026, 5, 25), new Date(2026, 5, 26))).toBe(false);
  });
});

describe('getMonthGrid', () => {
  it('returns 42 days', () => {
    expect(getMonthGrid(2026, 5)).toHaveLength(42);
  });

  it('starts on the Sunday before the 1st when the month does not start on Sunday', () => {
    // June 1 2026 is a Monday
    const grid = getMonthGrid(2026, 5);
    expect(grid[0].date.toDateString()).toBe(new Date(2026, 4, 31).toDateString());
    expect(grid[0].inCurrentMonth).toBe(false);
  });

  it('marks the 1st of the requested month as inCurrentMonth', () => {
    const grid = getMonthGrid(2026, 5);
    const firstOfMonth = grid.find((d) => d.inCurrentMonth && d.date.getDate() === 1);
    expect(firstOfMonth?.date.getMonth()).toBe(5);
  });

  it('includes trailing days from the next month to fill the grid', () => {
    const grid = getMonthGrid(2026, 5);
    expect(grid[41].date.toDateString()).toBe(new Date(2026, 6, 11).toDateString());
    expect(grid[41].inCurrentMonth).toBe(false);
  });
});

describe('isDayInRange', () => {
  const range = { start: new Date(2026, 5, 5), end: new Date(2026, 5, 10) };

  it('returns true for a day inside the range', () => {
    expect(isDayInRange(new Date(2026, 5, 7), range)).toBe(true);
  });

  it('returns true for the boundary days', () => {
    expect(isDayInRange(new Date(2026, 5, 5), range)).toBe(true);
    expect(isDayInRange(new Date(2026, 5, 10), range)).toBe(true);
  });

  it('returns false for a day outside the range', () => {
    expect(isDayInRange(new Date(2026, 5, 11), range)).toBe(false);
  });
});

describe('getFilterRange', () => {
  const now = new Date(2026, 5, 25, 15, 0, 0); // Thursday June 25 2026

  it('returns start of today with no end for "today"', () => {
    const { start, end } = getFilterRange('today', null, now);
    expect(start?.toDateString()).toBe(new Date(2026, 5, 25).toDateString());
    expect(end).toBeNull();
  });

  it('returns the Sunday of the current week for "week"', () => {
    const { start } = getFilterRange('week', null, now);
    expect(start?.toDateString()).toBe(new Date(2026, 5, 21).toDateString());
  });

  it('returns the 1st of the current month for "month"', () => {
    const { start } = getFilterRange('month', null, now);
    expect(start?.toDateString()).toBe(new Date(2026, 5, 1).toDateString());
  });

  it('returns no bounds for "all"', () => {
    expect(getFilterRange('all', null, now)).toEqual({ start: null, end: null });
  });

  it('returns no bounds for "custom" with no range selected yet', () => {
    expect(getFilterRange('custom', null, now)).toEqual({ start: null, end: null });
  });

  it('returns start-of-day/end-of-day bounds for a custom range', () => {
    const customRange = { start: new Date(2026, 5, 1, 10, 0), end: new Date(2026, 5, 15, 18, 0) };
    const { start, end } = getFilterRange('custom', customRange, now);
    expect(start?.toDateString()).toBe(new Date(2026, 5, 1).toDateString());
    expect(start?.getHours()).toBe(0);
    expect(end?.toDateString()).toBe(new Date(2026, 5, 15).toDateString());
    expect(end?.getHours()).toBe(23);
  });
});

describe('formatRangeLabel', () => {
  it('formats a same-month range compactly', () => {
    const label = formatRangeLabel({ start: new Date(2026, 5, 1), end: new Date(2026, 5, 15) });
    expect(label).toBe('Jun 1–15');
  });

  it('formats a cross-month range with both month names', () => {
    const label = formatRangeLabel({ start: new Date(2026, 5, 28), end: new Date(2026, 6, 2) });
    expect(label).toBe('Jun 28–Jul 2');
  });
});

describe('formatRangeForFilename', () => {
  it('formats as YYYY-MM-DD_to_YYYY-MM-DD', () => {
    const label = formatRangeForFilename({ start: new Date(2026, 5, 1), end: new Date(2026, 5, 15) });
    expect(label).toBe('2026-06-01_to_2026-06-15');
  });
});
