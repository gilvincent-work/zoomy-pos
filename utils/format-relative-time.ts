/**
 * Compact "time ago" for the sync marker: "just now", "3m ago", "2h ago",
 * "5d ago", else a short date. Kept pure (now injectable) so it's testable.
 */
export function formatRelativeTime(iso: string | null, now: Date = new Date()): string {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'never';

  const diffMs = now.getTime() - then;
  if (diffMs < 0) return 'just now';

  const sec = Math.floor(diffMs / 1000);
  if (sec < 45) return 'just now';

  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;

  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;

  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;

  return new Date(iso).toLocaleDateString();
}
