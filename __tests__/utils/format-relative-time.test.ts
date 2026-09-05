import { formatRelativeTime } from '../../utils/format-relative-time';

describe('formatRelativeTime', () => {
  const now = new Date('2026-09-06T12:00:00.000Z');

  it('returns "never" for null or invalid input', () => {
    expect(formatRelativeTime(null, now)).toBe('never');
    expect(formatRelativeTime('not-a-date', now)).toBe('never');
  });

  it('returns "just now" for very recent times', () => {
    expect(formatRelativeTime('2026-09-06T11:59:40.000Z', now)).toBe('just now'); // 20s
    expect(formatRelativeTime('2026-09-06T12:00:05.000Z', now)).toBe('just now'); // clock skew (future)
  });

  it('formats minutes, hours and days ago', () => {
    expect(formatRelativeTime('2026-09-06T11:57:00.000Z', now)).toBe('3m ago');
    expect(formatRelativeTime('2026-09-06T10:00:00.000Z', now)).toBe('2h ago');
    expect(formatRelativeTime('2026-09-03T12:00:00.000Z', now)).toBe('3d ago');
  });

  it('falls back to a date string beyond a week', () => {
    const out = formatRelativeTime('2026-08-01T12:00:00.000Z', now);
    expect(out).not.toMatch(/ago|just now|never/);
    expect(out.length).toBeGreaterThan(0);
  });
});
