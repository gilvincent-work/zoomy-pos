export type DateFilter = 'today' | 'week' | 'month' | 'all' | 'custom';
export type DateRange = { start: Date; end: Date };
export type CalendarDay = { date: Date; inCurrentMonth: boolean };

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

export function getMonthGrid(year: number, month: number): CalendarDay[] {
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay();
  const gridStart = new Date(year, month, 1 - startWeekday);

  const days: CalendarDay[] = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    days.push({ date, inCurrentMonth: date.getMonth() === month });
  }
  return days;
}

export function isDayInRange(day: Date, range: DateRange): boolean {
  const d = startOfDay(day).getTime();
  return d >= startOfDay(range.start).getTime() && d <= startOfDay(range.end).getTime();
}

export function getFilterRange(
  filter: DateFilter,
  customRange: DateRange | null,
  now: Date = new Date()
): { start: Date | null; end: Date | null } {
  switch (filter) {
    case 'today':
      return { start: startOfDay(now), end: null };
    case 'week': {
      const d = new Date(now);
      d.setDate(d.getDate() - d.getDay());
      return { start: startOfDay(d), end: null };
    }
    case 'month':
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: null };
    case 'all':
      return { start: null, end: null };
    case 'custom':
      if (!customRange) return { start: null, end: null };
      return { start: startOfDay(customRange.start), end: endOfDay(customRange.end) };
  }
}

export function formatRangeLabel(range: DateRange): string {
  const monthShort = (d: Date) => d.toLocaleDateString('en-PH', { month: 'short' });
  const sameMonth = range.start.getFullYear() === range.end.getFullYear()
    && range.start.getMonth() === range.end.getMonth();
  if (sameMonth) {
    return `${monthShort(range.start)} ${range.start.getDate()}–${range.end.getDate()}`;
  }
  return `${monthShort(range.start)} ${range.start.getDate()}–${monthShort(range.end)} ${range.end.getDate()}`;
}

function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatRangeForFilename(range: DateRange): string {
  return `${formatLocalDate(range.start)}_to_${formatLocalDate(range.end)}`;
}
