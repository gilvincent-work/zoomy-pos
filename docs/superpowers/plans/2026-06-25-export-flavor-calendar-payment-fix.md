# Export Flavor Column, Custom Date Range, Payment Method Refresh Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a filterable Flavor column to transaction CSV exports (one row per item), add a custom date-range calendar picker to the transactions screen, and fix the payment screen not picking up newly uploaded QR codes without an app restart.

**Architecture:** No new dependencies. Pure date/calendar math lives in a new `utils/date-range.ts` module (independently testable); a new `components/CalendarRangeModal.tsx` renders it. CSV row/column logic is extracted into a shared `utils/export-csv-shared.ts` used by both the native and web export files, which previously duplicated this logic verbatim. The CSV importer is rewritten to group same-`#` rows back into one transaction.

**Tech Stack:** React Native (Expo Router), TypeScript, Jest + `@testing-library/react-native`, JSZip, `expo-file-system`/`expo-sharing` (native), `fetch`/Blob (web).

## Global Constraints

- Spec source of truth: `docs/superpowers/specs/2026-06-25-export-flavor-calendar-payment-fix-design.md`.
- New CSV column order (exact, both platforms): `#, Time, Item, Flavor, Qty, Item Total, Transaction Total, Payment Method, Furbaby/IG Handle, Proof Photo, Status`.
- One CSV row per **item line**; transaction-level fields repeat per row of the same transaction.
- Re-importing the *old* per-transaction CSV format is explicitly out of scope — the importer only needs to handle the new format.
- Run tests with: `npx jest <path>` (project uses `jest-expo` preset, configured in `jest.config.js`; no `npm test` script exists yet).
- Follow existing code style: no comments unless explaining non-obvious "why"; match existing `C`/`F`/`R` theme tokens from `constants/theme.ts` for any new UI.

---

### Task 1: `utils/date-range.ts` — pure date/calendar helpers

**Files:**
- Create: `utils/date-range.ts`
- Test: `__tests__/utils/date-range.test.ts`

**Interfaces:**
- Produces (used by Task 2 and Task 3):
  - `export type DateFilter = 'today' | 'week' | 'month' | 'all' | 'custom'`
  - `export type DateRange = { start: Date; end: Date }`
  - `export type CalendarDay = { date: Date; inCurrentMonth: boolean }`
  - `export function startOfDay(date: Date): Date`
  - `export function endOfDay(date: Date): Date`
  - `export function isSameDay(a: Date, b: Date): boolean`
  - `export function getMonthGrid(year: number, month: number): CalendarDay[]` — always 42 entries (6 weeks), Sunday-first
  - `export function isDayInRange(day: Date, range: DateRange): boolean`
  - `export function getFilterRange(filter: DateFilter, customRange: DateRange | null, now?: Date): { start: Date | null; end: Date | null }`
  - `export function formatRangeLabel(range: DateRange): string`
  - `export function formatRangeForFilename(range: DateRange): string`

- [ ] **Step 1: Write the failing test file**

Create `__tests__/utils/date-range.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest __tests__/utils/date-range.test.ts`
Expected: FAIL with "Cannot find module '../../utils/date-range'"

- [ ] **Step 3: Implement `utils/date-range.ts`**

```typescript
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest __tests__/utils/date-range.test.ts`
Expected: PASS, all tests green

- [ ] **Step 5: Commit**

```bash
git add utils/date-range.ts __tests__/utils/date-range.test.ts
git commit -m "feat(transactions): add pure date-range and calendar grid helpers"
```

---

### Task 2: `components/CalendarRangeModal.tsx` — calendar range picker UI

**Files:**
- Create: `components/CalendarRangeModal.tsx`
- Test: `__tests__/components/CalendarRangeModal.test.tsx`

**Interfaces:**
- Consumes from Task 1: `DateRange`, `CalendarDay`, `getMonthGrid`, `isSameDay`, `isDayInRange`, `startOfDay` (all from `../utils/date-range`)
- Produces (used by Task 3):
  ```typescript
  export type CalendarRangeModalProps = {
    visible: boolean;
    initialRange: DateRange | null;
    onApply: (range: DateRange) => void;
    onClose: () => void;
  };
  export function CalendarRangeModal(props: CalendarRangeModalProps): JSX.Element
  ```

- [ ] **Step 1: Write the failing test file**

Create `__tests__/components/CalendarRangeModal.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { CalendarRangeModal } from '../../components/CalendarRangeModal';

const initial = { start: new Date(2026, 5, 1), end: new Date(2026, 5, 1) };

describe('CalendarRangeModal', () => {
  it('applies a range after tapping a start and end day', () => {
    const onApply = jest.fn();
    const { getByTestId, getByText } = render(
      <CalendarRangeModal visible initialRange={initial} onApply={onApply} onClose={jest.fn()} />
    );
    fireEvent.press(getByTestId('cal-day-2026-5-5'));
    fireEvent.press(getByTestId('cal-day-2026-5-10'));
    fireEvent.press(getByText('Apply'));

    expect(onApply).toHaveBeenCalledTimes(1);
    const range = onApply.mock.calls[0][0];
    expect(range.start.getDate()).toBe(5);
    expect(range.end.getDate()).toBe(10);
  });

  it('swaps start/end if the second tap is before the first', () => {
    const onApply = jest.fn();
    const { getByTestId, getByText } = render(
      <CalendarRangeModal visible initialRange={initial} onApply={onApply} onClose={jest.fn()} />
    );
    fireEvent.press(getByTestId('cal-day-2026-5-10'));
    fireEvent.press(getByTestId('cal-day-2026-5-5'));
    fireEvent.press(getByText('Apply'));

    const range = onApply.mock.calls[0][0];
    expect(range.start.getDate()).toBe(5);
    expect(range.end.getDate()).toBe(10);
  });

  it('disables Apply until both start and end are picked', () => {
    const onApply = jest.fn();
    const { getByText } = render(
      <CalendarRangeModal visible initialRange={null} onApply={onApply} onClose={jest.fn()} />
    );
    fireEvent.press(getByText('Apply'));
    expect(onApply).not.toHaveBeenCalled();
  });

  it('clears a pending selection', () => {
    const onApply = jest.fn();
    const { getByTestId, getByText } = render(
      <CalendarRangeModal visible initialRange={initial} onApply={onApply} onClose={jest.fn()} />
    );
    fireEvent.press(getByTestId('cal-day-2026-5-5'));
    fireEvent.press(getByText('Clear'));
    fireEvent.press(getByTestId('cal-day-2026-5-10'));
    fireEvent.press(getByText('Apply'));
    expect(onApply).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest __tests__/components/CalendarRangeModal.test.tsx`
Expected: FAIL with "Cannot find module '../../components/CalendarRangeModal'"

- [ ] **Step 3: Implement `components/CalendarRangeModal.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, F, R } from '../constants/theme';
import { DateRange, getMonthGrid, isSameDay, isDayInRange, startOfDay } from '../utils/date-range';

export type CalendarRangeModalProps = {
  visible: boolean;
  initialRange: DateRange | null;
  onApply: (range: DateRange) => void;
  onClose: () => void;
};

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function CalendarRangeModal({ visible, initialRange, onApply, onClose }: CalendarRangeModalProps) {
  const today = startOfDay(new Date());
  const [visibleYear, setVisibleYear] = useState(initialRange?.start.getFullYear() ?? today.getFullYear());
  const [visibleMonth, setVisibleMonth] = useState(initialRange?.start.getMonth() ?? today.getMonth());
  const [pendingStart, setPendingStart] = useState<Date | null>(initialRange?.start ?? null);
  const [pendingEnd, setPendingEnd] = useState<Date | null>(initialRange?.end ?? null);

  useEffect(() => {
    if (!visible) return;
    setVisibleYear(initialRange?.start.getFullYear() ?? today.getFullYear());
    setVisibleMonth(initialRange?.start.getMonth() ?? today.getMonth());
    setPendingStart(initialRange?.start ?? null);
    setPendingEnd(initialRange?.end ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function handleDayPress(day: Date) {
    if (!pendingStart || (pendingStart && pendingEnd)) {
      setPendingStart(day);
      setPendingEnd(null);
      return;
    }
    if (day.getTime() < pendingStart.getTime()) {
      setPendingEnd(pendingStart);
      setPendingStart(day);
    } else {
      setPendingEnd(day);
    }
  }

  function handlePrevMonth() {
    const d = new Date(visibleYear, visibleMonth - 1, 1);
    setVisibleYear(d.getFullYear());
    setVisibleMonth(d.getMonth());
  }

  function handleNextMonth() {
    const d = new Date(visibleYear, visibleMonth + 1, 1);
    setVisibleYear(d.getFullYear());
    setVisibleMonth(d.getMonth());
  }

  function handleClear() {
    setPendingStart(null);
    setPendingEnd(null);
  }

  function handleApply() {
    if (!pendingStart || !pendingEnd) return;
    onApply({ start: pendingStart, end: pendingEnd });
  }

  const grid = getMonthGrid(visibleYear, visibleMonth);
  const monthLabel = new Date(visibleYear, visibleMonth, 1)
    .toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
  const canApply = !!(pendingStart && pendingEnd);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <TouchableOpacity onPress={handlePrevMonth} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="chevron-back" size={20} color={C.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.monthLabel}>{monthLabel}</Text>
            <TouchableOpacity onPress={handleNextMonth} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="chevron-forward" size={20} color={C.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.weekdayRow}>
            {WEEKDAY_LABELS.map((label, i) => (
              <Text key={i} style={styles.weekdayLabel}>{label}</Text>
            ))}
          </View>

          <View style={styles.grid}>
            {grid.map(({ date, inCurrentMonth }, i) => {
              const isStart = !!pendingStart && isSameDay(date, pendingStart);
              const isEnd = !!pendingEnd && isSameDay(date, pendingEnd);
              const inRange = !!pendingStart && !!pendingEnd
                && isDayInRange(date, { start: pendingStart, end: pendingEnd });
              return (
                <TouchableOpacity
                  key={i}
                  testID={`cal-day-${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`}
                  style={[
                    styles.dayCell,
                    inRange && styles.dayCellInRange,
                    (isStart || isEnd) && styles.dayCellSelected,
                  ]}
                  onPress={() => handleDayPress(date)}
                >
                  <Text style={[
                    styles.dayText,
                    !inCurrentMonth && styles.dayTextMuted,
                    (isStart || isEnd) && styles.dayTextSelected,
                  ]}>
                    {date.getDate()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.clearBtn} onPress={handleClear}>
              <Text style={styles.clearBtnText}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.applyBtn, !canApply && styles.applyBtnDisabled]}
              disabled={!canApply}
              onPress={handleApply}
            >
              <Text style={styles.applyBtnText}>Apply</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  sheet: { backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.borderDark, padding: 16, width: '100%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  monthLabel: { color: C.textPrimary, fontSize: F.md, fontWeight: '700' },
  weekdayRow: { flexDirection: 'row' },
  weekdayLabel: { flex: 1, textAlign: 'center', color: C.textMuted, fontSize: F.xs, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: R.sm },
  dayCellInRange: { backgroundColor: C.pinkSubtle },
  dayCellSelected: { backgroundColor: C.pink },
  dayText: { color: C.textPrimary, fontSize: F.sm },
  dayTextMuted: { color: C.textMuted },
  dayTextSelected: { color: '#fff', fontWeight: '700' },
  footer: { flexDirection: 'row', gap: 10, marginTop: 16 },
  clearBtn: { flex: 1, backgroundColor: C.elevated, borderWidth: 1, borderColor: C.border, borderRadius: R.sm, padding: 13, alignItems: 'center' },
  clearBtnText: { color: C.textSecondary, fontWeight: '700', fontSize: F.md },
  applyBtn: { flex: 2, backgroundColor: C.pink, borderRadius: R.sm, padding: 13, alignItems: 'center' },
  applyBtnDisabled: { backgroundColor: C.elevated, borderWidth: 1, borderColor: C.border },
  applyBtnText: { color: '#fff', fontWeight: '800', fontSize: F.md },
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest __tests__/components/CalendarRangeModal.test.tsx`
Expected: PASS, all 4 tests green

- [ ] **Step 5: Commit**

```bash
git add components/CalendarRangeModal.tsx __tests__/components/CalendarRangeModal.test.tsx
git commit -m "feat(transactions): add calendar range picker modal"
```

---

### Task 3: Wire the custom date filter into `app/modals/transactions.tsx`

**Files:**
- Modify: `app/modals/transactions.tsx:1-45` (imports, types, `DATE_FILTERS`, deletion of local `getFilterStart`), `:110-160` (state + `filtered` memo + `handleExport`), `:222-251` (date filter row render), add modal render near other modals (after line ~430, alongside `PhotoViewer`)

**Interfaces:**
- Consumes from Task 1: `DateFilter`, `DateRange`, `getFilterRange`, `formatRangeLabel`, `formatRangeForFilename` (from `../../utils/date-range`)
- Consumes from Task 2: `CalendarRangeModal` (from `../../components/CalendarRangeModal`)

- [ ] **Step 1: Update imports and remove the local date-filter type/function**

In `app/modals/transactions.tsx`, replace lines 1-45 (everything from the top imports through the `DATE_FILTERS` constant) with:

```typescript
import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  SafeAreaView, Modal, Image, ScrollView, Dimensions, Alert, TextInput,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { TransactionRow } from '../../components/TransactionRow';
import { CalendarRangeModal } from '../../components/CalendarRangeModal';
import { getAllTransactions, updateTransactionRemarks, Transaction, PaymentMethod } from '../../db/transactions';
import { exportTransactionsZip } from '../../utils/export-csv';
import { importTransactionsZip } from '../../utils/import-csv';
import {
  DateFilter, DateRange, getFilterRange, formatRangeLabel, formatRangeForFilename,
} from '../../utils/date-range';
import { Ionicons } from '@expo/vector-icons';
import { C, F, R } from '../../constants/theme';

type MethodFilter = 'all' | PaymentMethod;

const DATE_FILTERS: { key: DateFilter; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'all', label: 'All' },
  { key: 'custom', label: 'Custom' },
];
```

This removes the old `type DateFilter = 'today' | 'week' | 'month' | 'all';` and the local `getFilterStart` function entirely — both are replaced by the `utils/date-range.ts` module from Task 1.

- [ ] **Step 2: Add custom-range state and update the `filtered` memo and `handleExport`**

Find this block (originally around line 113-160):

```typescript
  const [dateFilter, setDateFilter] = useState<DateFilter>('today');
  const [methodFilter, setMethodFilter] = useState<MethodFilter>('all');
```

Replace with:

```typescript
  const [dateFilter, setDateFilter] = useState<DateFilter>('today');
  const [customRange, setCustomRange] = useState<DateRange | null>(null);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [methodFilter, setMethodFilter] = useState<MethodFilter>('all');
```

Find the `filtered` memo:

```typescript
  const filtered = useMemo(() => {
    let result = transactions;
    const start = getFilterStart(dateFilter);
    if (start) {
      result = result.filter((t) => new Date(t.created_at) >= start);
    }
    if (methodFilter !== 'all') {
      result = result.filter((t) => t.payment_method === methodFilter);
    }
    return result;
  }, [transactions, dateFilter, methodFilter]);
```

Replace with:

```typescript
  const filtered = useMemo(() => {
    let result = transactions;
    const { start, end } = getFilterRange(dateFilter, customRange);
    if (start) {
      result = result.filter((t) => new Date(t.created_at) >= start);
    }
    if (end) {
      result = result.filter((t) => new Date(t.created_at) <= end);
    }
    if (methodFilter !== 'all') {
      result = result.filter((t) => t.payment_method === methodFilter);
    }
    return result;
  }, [transactions, dateFilter, customRange, methodFilter]);
```

Find `handleExport`:

```typescript
  async function handleExport() {
    if (filtered.length === 0) {
      Alert.alert('Nothing to export', 'No transactions match the current filter.');
      return;
    }
    try {
      const label = dateFilter === 'all' ? 'all' : dateFilter;
      await exportTransactionsZip(filtered, label);
    } catch {
      Alert.alert('Export failed', 'Could not export transactions. Please try again.');
    }
  }
```

Replace with:

```typescript
  async function handleExport() {
    if (filtered.length === 0) {
      Alert.alert('Nothing to export', 'No transactions match the current filter.');
      return;
    }
    try {
      const label = dateFilter === 'custom' && customRange
        ? formatRangeForFilename(customRange)
        : dateFilter === 'all' ? 'all' : dateFilter;
      await exportTransactionsZip(filtered, label);
    } catch {
      Alert.alert('Export failed', 'Could not export transactions. Please try again.');
    }
  }

  function handleDateFilterPress(key: DateFilter) {
    if (key === 'custom') {
      setCalendarVisible(true);
      return;
    }
    setDateFilter(key);
  }
```

- [ ] **Step 3: Update the date filter row render and add the calendar modal**

Find the date filter row render:

```tsx
      <View style={styles.filterRow}>
        {DATE_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterBtn, dateFilter === f.key && styles.filterBtnActive]}
            onPress={() => setDateFilter(f.key)}
          >
            <Text style={[styles.filterText, dateFilter === f.key && styles.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
```

Replace with:

```tsx
      <View style={styles.filterRow}>
        {DATE_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterBtn, dateFilter === f.key && styles.filterBtnActive]}
            onPress={() => handleDateFilterPress(f.key)}
          >
            <Text style={[styles.filterText, dateFilter === f.key && styles.filterTextActive]} numberOfLines={1}>
              {f.key === 'custom' && dateFilter === 'custom' && customRange
                ? formatRangeLabel(customRange)
                : f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
```

Find the closing `<PhotoViewer uri={photoView} onClose={() => setPhotoView(null)} />` line (inside the transaction detail `<Modal>`, near the end of the JSX) and add the calendar modal as a sibling **after** the detail `<Modal>` closes (i.e. at the same level as the outer `<Modal visible={!!selected} ...>`, just before the final `</SafeAreaView>`):

```tsx
      </Modal>

      <CalendarRangeModal
        visible={calendarVisible}
        initialRange={customRange}
        onApply={(range) => {
          setCustomRange(range);
          setDateFilter('custom');
          setCalendarVisible(false);
        }}
        onClose={() => setCalendarVisible(false)}
      />
    </SafeAreaView>
  );
}
```

(This replaces the existing closing `</Modal>\n    </SafeAreaView>\n  );\n}` at the end of the component — add the `<CalendarRangeModal>` block between them.)

- [ ] **Step 4: Type-check and manually verify**

Run: `npx tsc --noEmit`
Expected: no new type errors referencing `transactions.tsx` or `date-range.ts`

Run: `npx expo start --web` (or your usual dev command), open Transactions, tap "Custom", pick a start and end day, tap Apply.
Expected: the "Custom" button now shows the picked range (e.g. "Jun 1–15") and the list filters to that range.

- [ ] **Step 5: Commit**

```bash
git add app/modals/transactions.tsx
git commit -m "feat(transactions): add custom date-range filter via calendar picker"
```

---

### Task 4: Fix payment screen not refreshing QR codes (`app/modals/payment.tsx`)

**Files:**
- Modify: `app/modals/payment.tsx:1`, `:67-69`

**Interfaces:**
- No new exports; internal behavior fix only.

- [ ] **Step 1: Update the import line**

In `app/modals/payment.tsx`, find:

```typescript
import React, { useState, useEffect } from 'react';
```

Replace with:

```typescript
import React, { useState, useCallback } from 'react';
```

Find:

```typescript
import { router } from 'expo-router';
```

Replace with:

```typescript
import { router, useFocusEffect } from 'expo-router';
```

- [ ] **Step 2: Replace the QR-loading effect**

Find:

```typescript
  useEffect(() => {
    getAllQrUris().then(setQrUris);
  }, []);
```

Replace with:

```typescript
  useFocusEffect(
    useCallback(() => { getAllQrUris().then(setQrUris); }, [])
  );
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new type errors referencing `payment.tsx` (confirms `useEffect` import removal didn't leave a dangling reference — `payment.tsx` has no other `useEffect` calls)

- [ ] **Step 4: Manually verify the fix**

1. Start the app, open the Payment screen once from the cart (so it mounts), then go back without confirming.
2. Open Admin Settings and upload a QR code for a method that currently has none (e.g. Maya).
3. Return to the cart and open Payment again.
4. Expected: the newly uploaded method now appears in the payment method selector without restarting the app.

- [ ] **Step 5: Commit**

```bash
git add app/modals/payment.tsx
git commit -m "fix(payment): refresh QR codes on screen focus instead of mount only"
```

---

### Task 5: `utils/export-csv-shared.ts` — shared formatting + per-item row builder

**Files:**
- Create: `utils/export-csv-shared.ts`
- Test: `__tests__/utils/export-csv-shared.test.ts`

**Interfaces:**
- Consumes: `Transaction`, `TransactionItem` from `../db/transactions`
- Produces (used by Task 6 and Task 7):
  ```typescript
  export const EXPORT_HEADER: string[];
  export function csvCell(value: string | number | null | undefined): string;
  export function formatTime(isoString: string): string;
  export function formatPaymentMethod(method: string, refNumber: string | null, isBundle: boolean): string;
  export function proofFileName(transactionId: number): string;
  export function buildItemRows(transactions: Transaction[], photoFilenames: Map<number, string>): string[][];
  ```

- [ ] **Step 1: Write the failing test file**

Create `__tests__/utils/export-csv-shared.test.ts`:

```typescript
import { csvCell, formatPaymentMethod, proofFileName, buildItemRows, EXPORT_HEADER } from '../../utils/export-csv-shared';
import type { Transaction } from '../../db/transactions';

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 1,
    total: 140,
    cash_tendered: 140,
    change: 0,
    payment_method: 'gcash',
    ref_number: null,
    proof_photo_uri: null,
    customer_handle: null,
    is_bundle: false,
    status: 'completed',
    created_at: '2026-04-24T07:36:00.000Z',
    remarks: null,
    items: [],
    ...overrides,
  };
}

describe('EXPORT_HEADER', () => {
  it('has the expected 11 columns in order', () => {
    expect(EXPORT_HEADER).toEqual([
      '#', 'Time', 'Item', 'Flavor', 'Qty', 'Item Total', 'Transaction Total',
      'Payment Method', 'Furbaby/IG Handle', 'Proof Photo', 'Status',
    ]);
  });
});

describe('csvCell', () => {
  it('quotes values containing commas', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
  });

  it('passes through plain values', () => {
    expect(csvCell('plain')).toBe('plain');
  });

  it('renders null/undefined as empty string', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });
});

describe('formatPaymentMethod', () => {
  it('maps gcash with a ref number', () => {
    expect(formatPaymentMethod('gcash', 'ref123', false)).toBe('GCash (ref123)');
  });

  it('appends Bundle suffix', () => {
    expect(formatPaymentMethod('cash', null, true)).toBe('Cash · Bundle');
  });
});

describe('proofFileName', () => {
  it('formats using the transaction id', () => {
    expect(proofFileName(7)).toBe('proof_txn_7.jpg');
  });
});

describe('buildItemRows', () => {
  it('emits one row per item with shared transaction fields repeated', () => {
    const t = makeTransaction({
      id: 1,
      items: [
        { id: 1, transaction_id: 1, product_id: 1, product_name: 'Jerky Treats', price: 100, quantity: 1, variant_id: 2, variant_name: 'Chicken' },
        { id: 2, transaction_id: 1, product_id: 3, product_name: 'Mango Juice', price: 40, quantity: 1, variant_id: null, variant_name: null },
      ],
    });
    const rows = buildItemRows([t], new Map());

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual([
      '1', expect.stringContaining('2026'), 'Jerky Treats', 'Chicken', '1', '₱100.00', '₱140.00',
      'GCash', '', '', '',
    ]);
    expect(rows[1][2]).toBe('Mango Juice');
    expect(rows[1][3]).toBe(''); // no flavor
    expect(rows[1][0]).toBe('1'); // same transaction number repeated
    expect(rows[1][6]).toBe('₱140.00'); // transaction total repeated
  });

  it('numbers transactions sequentially starting at 1', () => {
    const t1 = makeTransaction({ id: 1, items: [{ id: 1, transaction_id: 1, product_id: 1, product_name: 'A', price: 10, quantity: 1, variant_id: null, variant_name: null }] });
    const t2 = makeTransaction({ id: 2, items: [{ id: 2, transaction_id: 2, product_id: 1, product_name: 'B', price: 10, quantity: 1, variant_id: null, variant_name: null }] });
    const rows = buildItemRows([t1, t2], new Map());
    expect(rows[0][0]).toBe('1');
    expect(rows[1][0]).toBe('2');
  });

  it('looks up the proof photo filename by transaction id', () => {
    const t = makeTransaction({ id: 5, proof_photo_uri: 'file://x.jpg', items: [{ id: 1, transaction_id: 5, product_id: 1, product_name: 'A', price: 10, quantity: 1, variant_id: null, variant_name: null }] });
    const rows = buildItemRows([t], new Map([[5, 'proof_txn_5.jpg']]));
    expect(rows[0][9]).toBe('proof_txn_5.jpg');
  });

  it('produces no rows for a transaction with no items', () => {
    const t = makeTransaction({ items: [] });
    expect(buildItemRows([t], new Map())).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest __tests__/utils/export-csv-shared.test.ts`
Expected: FAIL with "Cannot find module '../../utils/export-csv-shared'"

- [ ] **Step 3: Implement `utils/export-csv-shared.ts`**

```typescript
import type { Transaction } from '../db/transactions';

export const EXPORT_HEADER = [
  '#', 'Time', 'Item', 'Flavor', 'Qty', 'Item Total', 'Transaction Total',
  'Payment Method', 'Furbaby/IG Handle', 'Proof Photo', 'Status',
];

export function csvCell(value: string | number | null | undefined): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function formatTime(isoString: string): string {
  const d = new Date(isoString);
  const date = d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
  return `${date} ${time}`;
}

export function formatPaymentMethod(method: string, refNumber: string | null, isBundle: boolean): string {
  const label = method === 'gcash' ? 'GCash' : method === 'maya' ? 'Maya' : method === 'bpi' ? 'BPI' : method === 'bank_transfer' ? 'Bank Transfer' : 'Cash';
  const withRef = refNumber ? `${label} (${refNumber})` : label;
  return isBundle ? `${withRef} · Bundle` : withRef;
}

export function proofFileName(transactionId: number): string {
  return `proof_txn_${transactionId}.jpg`;
}

export function buildItemRows(transactions: Transaction[], photoFilenames: Map<number, string>): string[][] {
  const rows: string[][] = [];

  transactions.forEach((t, index) => {
    const txnNumber = String(index + 1);
    const photoFilename = photoFilenames.get(t.id) ?? '';
    const paymentLabel = formatPaymentMethod(t.payment_method, t.ref_number, t.is_bundle);
    const timeLabel = formatTime(t.created_at);
    const statusLabel = t.status === 'voided' ? 'VOIDED' : '';

    for (const item of t.items) {
      rows.push([
        csvCell(txnNumber),
        csvCell(timeLabel),
        csvCell(item.product_name),
        csvCell(item.variant_name ?? ''),
        csvCell(item.quantity),
        csvCell(`₱${(item.price * item.quantity).toFixed(2)}`),
        csvCell(`₱${t.total.toFixed(2)}`),
        csvCell(paymentLabel),
        csvCell(t.customer_handle),
        csvCell(photoFilename),
        csvCell(statusLabel),
      ]);
    }
  });

  return rows;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest __tests__/utils/export-csv-shared.test.ts`
Expected: PASS, all tests green

- [ ] **Step 5: Commit**

```bash
git add utils/export-csv-shared.ts __tests__/utils/export-csv-shared.test.ts
git commit -m "feat(export): add shared CSV formatting and per-item row builder"
```

---

### Task 6: Update `utils/export-csv.ts` (native) to emit per-item rows

**Files:**
- Modify: `utils/export-csv.ts` (full rewrite of the file body, same exported function signature)

**Interfaces:**
- Consumes from Task 5: `EXPORT_HEADER`, `csvCell`, `buildItemRows`, `proofFileName` (from `./export-csv-shared`)
- Produces (unchanged signature, existing consumer is `app/modals/transactions.tsx`):
  ```typescript
  export async function exportTransactionsZip(transactions: Transaction[], label: string): Promise<void>
  ```

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `utils/export-csv.ts` with:

```typescript
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import JSZip from 'jszip';
import type { Transaction } from '../db/transactions';
import { EXPORT_HEADER, buildItemRows, proofFileName, csvCell } from './export-csv-shared';

export async function exportTransactionsZip(transactions: Transaction[], label: string): Promise<void> {
  const zip = new JSZip();
  const dateStr = new Date().toISOString().slice(0, 10);
  const folderName = `zoomy-sales-${label}-${dateStr}`;

  const photoFilenames = new Map<number, string>();
  for (const t of transactions) {
    if (!t.proof_photo_uri) continue;
    try {
      const fileInfo = await FileSystem.getInfoAsync(t.proof_photo_uri);
      if (fileInfo.exists) {
        const filename = proofFileName(t.id);
        const base64 = await FileSystem.readAsStringAsync(t.proof_photo_uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        zip.file(filename, base64, { base64: true });
        photoFilenames.set(t.id, filename);
      }
    } catch {
      // photo missing or unreadable — skip silently
    }
  }

  const rows = buildItemRows(transactions, photoFilenames);
  const csv = [EXPORT_HEADER.map(csvCell), ...rows]
    .map((row) => row.join(','))
    .join('\n');

  zip.file('transactions.csv', csv);

  const zipBase64 = await zip.generateAsync({ type: 'base64' });
  const zipPath = `${FileSystem.cacheDirectory}${folderName}.zip`;
  await FileSystem.writeAsStringAsync(zipPath, zipBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  await Sharing.shareAsync(zipPath, {
    mimeType: 'application/zip',
    dialogTitle: 'Export Transactions',
    UTI: 'public.zip-archive',
  });
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `export-csv.ts`

- [ ] **Step 3: Commit**

```bash
git add utils/export-csv.ts
git commit -m "feat(export): emit per-item CSV rows with Flavor column (native)"
```

---

### Task 7: Update `utils/export-csv.web.ts` (web) to emit per-item rows

**Files:**
- Modify: `utils/export-csv.web.ts` (full rewrite of the file body, same exported function signature)

**Interfaces:**
- Consumes from Task 5: `EXPORT_HEADER`, `csvCell`, `buildItemRows`, `proofFileName` (from `./export-csv-shared`)
- Produces (unchanged signature):
  ```typescript
  export async function exportTransactionsZip(transactions: Transaction[], label: string): Promise<void>
  ```

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `utils/export-csv.web.ts` with:

```typescript
import JSZip from 'jszip';
import type { Transaction } from '../db/transactions';
import { EXPORT_HEADER, buildItemRows, proofFileName, csvCell } from './export-csv-shared';

export async function exportTransactionsZip(transactions: Transaction[], label: string): Promise<void> {
  const zip = new JSZip();
  const dateStr = new Date().toISOString().slice(0, 10);
  const folderName = `zoomy-sales-${label}-${dateStr}`;

  const photoFilenames = new Map<number, string>();
  for (const t of transactions) {
    if (!t.proof_photo_uri) continue;
    try {
      const response = await fetch(t.proof_photo_uri);
      if (response.ok) {
        const blob = await response.blob();
        const filename = proofFileName(t.id);
        zip.file(filename, blob);
        photoFilenames.set(t.id, filename);
      }
    } catch {
      // photo missing or unreadable — skip silently
    }
  }

  const rows = buildItemRows(transactions, photoFilenames);
  const csv = [EXPORT_HEADER.map(csvCell), ...rows]
    .map((row) => row.join(','))
    .join('\n');

  zip.file('transactions.csv', csv);

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${folderName}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `export-csv.web.ts`

- [ ] **Step 3: Commit**

```bash
git add utils/export-csv.web.ts
git commit -m "feat(export): emit per-item CSV rows with Flavor column (web)"
```

---

### Task 8: Widen `importTransaction` to carry variant name and price (`db/transactions.ts`)

**Files:**
- Modify: `db/transactions.ts:71-99` (the `importTransaction` function)
- Modify: `__tests__/db/transactions.test.ts` (existing `importTransaction` describe block, ~lines 129-189)

**Interfaces:**
- Produces (used by Task 9):
  ```typescript
  export async function importTransaction(data: {
    total: number;
    cashTendered: number;
    change: number;
    paymentMethod: PaymentMethod;
    refNumber?: string;
    proofPhotoUri?: string;
    customerHandle?: string;
    isBundle?: boolean;
    status: 'completed' | 'voided';
    createdAt: string;
    items: { productName: string; quantity: number; variantName?: string | null; price?: number }[];
  }): Promise<number>
  ```

- [ ] **Step 1: Write the failing test**

In `__tests__/db/transactions.test.ts`, inside the `describe('importTransaction', ...)` block (after the existing `'inserts items with product_id=0 and price=0'` test), add:

```typescript
  it('inserts the provided price and variant_name when given', async () => {
    mockDb.runAsync
      .mockResolvedValueOnce({ lastInsertRowId: 42, changes: 1 })
      .mockResolvedValue({ lastInsertRowId: 99, changes: 1 });

    await importTransaction({
      total: 140,
      cashTendered: 140,
      change: 0,
      paymentMethod: 'gcash',
      status: 'completed',
      createdAt: '2026-04-24T07:36:00.000Z',
      items: [{ productName: 'jerky treats', quantity: 1, variantName: 'Chicken', price: 140 }],
    });

    expect(mockDb.runAsync).toHaveBeenNthCalledWith(
      2,
      'INSERT INTO transaction_items (transaction_id, product_id, product_name, price, quantity, variant_id, variant_name) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [42, 0, 'jerky treats', 140, 1, null, 'Chicken']
    );
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest __tests__/db/transactions.test.ts -t "inserts the provided price and variant_name"`
Expected: FAIL — TypeScript error (`variantName`/`price` not in the `items` type) or the assertion fails because the current implementation always inserts `0` and `null`

- [ ] **Step 3: Update `importTransaction` in `db/transactions.ts`**

Find:

```typescript
export async function importTransaction(data: {
  total: number;
  cashTendered: number;
  change: number;
  paymentMethod: PaymentMethod;
  refNumber?: string;
  proofPhotoUri?: string;
  customerHandle?: string;
  isBundle?: boolean;
  status: 'completed' | 'voided';
  createdAt: string;
  items: { productName: string; quantity: number }[];
}): Promise<number> {
  const db = await getDatabase();

  const result = await db.runAsync(
    'INSERT INTO transactions (total, cash_tendered, change, payment_method, ref_number, proof_photo_uri, customer_handle, is_bundle, status, created_at, remarks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [data.total, data.cashTendered, data.change, data.paymentMethod, data.refNumber ?? null, data.proofPhotoUri ?? null, data.customerHandle ?? null, data.isBundle ? 1 : 0, data.status, data.createdAt, null]
  );

  const transactionId = result.lastInsertRowId;

  for (const item of data.items) {
    await db.runAsync(
      'INSERT INTO transaction_items (transaction_id, product_id, product_name, price, quantity, variant_id, variant_name) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [transactionId, 0, item.productName, 0, item.quantity, null, null]
    );
  }

  return transactionId;
}
```

Replace with:

```typescript
export async function importTransaction(data: {
  total: number;
  cashTendered: number;
  change: number;
  paymentMethod: PaymentMethod;
  refNumber?: string;
  proofPhotoUri?: string;
  customerHandle?: string;
  isBundle?: boolean;
  status: 'completed' | 'voided';
  createdAt: string;
  items: { productName: string; quantity: number; variantName?: string | null; price?: number }[];
}): Promise<number> {
  const db = await getDatabase();

  const result = await db.runAsync(
    'INSERT INTO transactions (total, cash_tendered, change, payment_method, ref_number, proof_photo_uri, customer_handle, is_bundle, status, created_at, remarks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [data.total, data.cashTendered, data.change, data.paymentMethod, data.refNumber ?? null, data.proofPhotoUri ?? null, data.customerHandle ?? null, data.isBundle ? 1 : 0, data.status, data.createdAt, null]
  );

  const transactionId = result.lastInsertRowId;

  for (const item of data.items) {
    await db.runAsync(
      'INSERT INTO transaction_items (transaction_id, product_id, product_name, price, quantity, variant_id, variant_name) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [transactionId, 0, item.productName, item.price ?? 0, item.quantity, null, item.variantName ?? null]
    );
  }

  return transactionId;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest __tests__/db/transactions.test.ts`
Expected: PASS — both the new test and the pre-existing `'inserts items with product_id=0 and price=0'` test (which passes no `price`/`variantName`, so defaults still apply)

- [ ] **Step 5: Commit**

```bash
git add db/transactions.ts __tests__/db/transactions.test.ts
git commit -m "feat(import): carry variant name and price through importTransaction"
```

---

### Task 9: Rewrite `utils/import-csv-parser.ts` to group per-item rows back into transactions

**Files:**
- Modify: `utils/import-csv-parser.ts` (full rewrite)
- Modify: `__tests__/utils/import-csv-parser.test.ts` (update fixtures to new column format, add grouping/flavor tests)

**Interfaces:**
- Consumes from Task 8: `importTransaction` with the widened `items` type (`../db/transactions`)
- Produces (unchanged from existing consumer `utils/import-csv.ts`):
  ```typescript
  export type ImportResult = { imported: number; skipped: number; failed: number; photosMissing: number };
  export async function processCSV(csvText: string, zip: JSZip): Promise<ImportResult>
  ```
- Also still exports `parseCSVRow` and `parsePaymentMethod` (used directly by tests; signatures unchanged). Drops `parseItems` (no longer meaningful — items are no longer packed into one cell) and adds `parseItemRow`, `groupRowsByTransaction`.

- [ ] **Step 1: Write the failing test file**

Replace the entire contents of `__tests__/utils/import-csv-parser.test.ts` with:

```typescript
import { parseCSVRow, parsePaymentMethod, parseItemRow, groupRowsByTransaction, processCSV } from '../../utils/import-csv-parser';

jest.mock('../../db/transactions', () => ({
  importTransaction: jest.fn().mockResolvedValue(1),
  transactionExists: jest.fn().mockResolvedValue(false),
}));

import { importTransaction, transactionExists } from '../../db/transactions';
const mockImport = importTransaction as jest.Mock;
const mockExists = transactionExists as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('parseCSVRow', () => {
  it('splits a simple row by commas', () => {
    expect(parseCSVRow('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('handles quoted fields containing commas', () => {
    expect(parseCSVRow('"Apr 24, 2026 03:36 PM",140')).toEqual([
      'Apr 24, 2026 03:36 PM',
      '140',
    ]);
  });

  it('handles escaped double quotes inside quoted fields', () => {
    expect(parseCSVRow('"say ""hi""",b')).toEqual(['say "hi"', 'b']);
  });

  it('handles trailing empty cell', () => {
    expect(parseCSVRow('a,b,')).toEqual(['a', 'b', '']);
  });
});

describe('parsePaymentMethod', () => {
  it('maps GCash label to gcash', () => {
    expect(parsePaymentMethod('GCash')).toMatchObject({ paymentMethod: 'gcash', refNumber: null, isBundle: false });
  });

  it('extracts ref number from parentheses', () => {
    expect(parsePaymentMethod('GCash (ref123)')).toMatchObject({ paymentMethod: 'gcash', refNumber: 'ref123' });
  });

  it('detects Bundle suffix', () => {
    expect(parsePaymentMethod('GCash · Bundle')).toMatchObject({ isBundle: true });
  });

  it('handles ref number and bundle together', () => {
    expect(parsePaymentMethod('Maya (abc) · Bundle')).toMatchObject({
      paymentMethod: 'maya',
      refNumber: 'abc',
      isBundle: true,
    });
  });

  it('maps Bank Transfer label', () => {
    expect(parsePaymentMethod('Bank Transfer')).toMatchObject({ paymentMethod: 'bank_transfer' });
  });

  it('maps Cash label', () => {
    expect(parsePaymentMethod('Cash')).toMatchObject({ paymentMethod: 'cash' });
  });
});

describe('parseItemRow', () => {
  it('parses a row with a flavor', () => {
    const cells = ['1', 'Apr 24, 2026 03:36 PM', 'Jerky Treats', 'Chicken', '2', '₱200.00', '₱200.00', 'GCash', '@zoomypets', 'proof_txn_1.jpg', ''];
    expect(parseItemRow(cells)).toEqual({
      transactionNumber: '1',
      time: 'Apr 24, 2026 03:36 PM',
      productName: 'Jerky Treats',
      variantName: 'Chicken',
      quantity: 2,
      itemTotal: 200,
      transactionTotal: 200,
      paymentMethod: 'GCash',
      customerHandle: '@zoomypets',
      proofPhoto: 'proof_txn_1.jpg',
      status: '',
    });
  });

  it('treats a blank Flavor cell as null', () => {
    const cells = ['1', 'Apr 24, 2026 03:36 PM', 'Mango Juice', '', '1', '₱40.00', '₱40.00', 'Cash', '', '', ''];
    expect(parseItemRow(cells).variantName).toBeNull();
  });
});

describe('groupRowsByTransaction', () => {
  it('groups consecutive rows sharing the same transaction number', () => {
    const rows = [
      parseItemRow(['1', 't', 'A', '', '1', '₱10.00', '₱50.00', 'Cash', '', '', '']),
      parseItemRow(['1', 't', 'B', '', '1', '₱40.00', '₱50.00', 'Cash', '', '', '']),
      parseItemRow(['2', 't', 'C', '', '1', '₱10.00', '₱10.00', 'Cash', '', '', '']),
    ];
    const groups = groupRowsByTransaction(rows);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveLength(2);
    expect(groups[1]).toHaveLength(1);
  });
});

describe('processCSV', () => {
  const mockZip = {
    file: jest.fn().mockReturnValue({
      async: jest.fn().mockResolvedValue('base64photodata'),
    }),
  };
  const header = '#,Time,Item,Flavor,Qty,Item Total,Transaction Total,Payment Method,Furbaby/IG Handle,Proof Photo,Status';

  const sampleCSV = [
    header,
    '1,"Apr 24, 2026 03:36 PM",jerky treats,,1,₱140.00,₱140.00,GCash,,proof_txn_1.jpg,',
  ].join('\n');

  it('imports one transaction and returns correct counts', async () => {
    const result = await processCSV(sampleCSV, mockZip as any);
    expect(result).toEqual({ imported: 1, skipped: 0, failed: 0, photosMissing: 0 });
    expect(mockImport).toHaveBeenCalledTimes(1);
    expect(mockImport).toHaveBeenCalledWith(
      expect.objectContaining({
        total: 140,
        items: [{ productName: 'jerky treats', variantName: null, quantity: 1, price: 140 }],
      })
    );
  });

  it('groups a multi-item transaction into a single import call with both items', async () => {
    const multiItemCSV = [
      header,
      '1,"Apr 24, 2026 03:36 PM",Jerky Treats,Chicken,1,₱100.00,₱140.00,GCash,,,',
      '1,"Apr 24, 2026 03:36 PM",Mango Juice,,1,₱40.00,₱140.00,GCash,,,',
    ].join('\n');

    const result = await processCSV(multiItemCSV, mockZip as any);
    expect(result.imported).toBe(1);
    expect(mockImport).toHaveBeenCalledTimes(1);
    expect(mockImport).toHaveBeenCalledWith(
      expect.objectContaining({
        total: 140,
        items: [
          { productName: 'Jerky Treats', variantName: 'Chicken', quantity: 1, price: 100 },
          { productName: 'Mango Juice', variantName: null, quantity: 1, price: 40 },
        ],
      })
    );
  });

  it('skips duplicate transactions using the Transaction Total column', async () => {
    mockExists.mockResolvedValueOnce(true);
    const result = await processCSV(sampleCSV, mockZip as any);
    expect(result).toEqual({ imported: 0, skipped: 1, failed: 0, photosMissing: 0 });
    expect(mockImport).not.toHaveBeenCalled();
  });

  it('counts photosMissing when photo file not in ZIP', async () => {
    const zipWithoutPhoto = { file: jest.fn().mockReturnValue(null) };
    const result = await processCSV(sampleCSV, zipWithoutPhoto as any);
    expect(result.imported).toBe(1);
    expect(result.photosMissing).toBe(1);
    expect(mockImport).toHaveBeenCalledWith(
      expect.objectContaining({ proofPhotoUri: undefined })
    );
  });

  it('imports voided transactions correctly', async () => {
    const voidedCSV = [
      header,
      '1,"Apr 24, 2026 03:36 PM",jerky treats,,1,₱140.00,₱140.00,Cash,,,VOIDED',
    ].join('\n');
    await processCSV(voidedCSV, mockZip as any);
    expect(mockImport).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'voided' })
    );
  });

  it('counts failed for rows with too few cells', async () => {
    const badCSV = [header, 'not,enough,cells'].join('\n');
    const result = await processCSV(badCSV, mockZip as any);
    expect(result).toMatchObject({ imported: 0, failed: 1 });
  });

  it('throws when transactions.csv header is missing', async () => {
    await expect(processCSV('', mockZip as any)).rejects.toThrow('Invalid CSV');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest __tests__/utils/import-csv-parser.test.ts`
Expected: FAIL — `parseItemRow` and `groupRowsByTransaction` are not exported yet; `processCSV` still parses the old format

- [ ] **Step 3: Replace the contents of `utils/import-csv-parser.ts`**

```typescript
import JSZip from 'jszip';
import type { PaymentMethod } from '../db/transactions';
import { importTransaction, transactionExists } from '../db/transactions';

export type ImportResult = {
  imported: number;
  skipped: number;
  failed: number;
  photosMissing: number;
};

export function parseCSVRow(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}

export function parsePaymentMethod(methodStr: string): {
  paymentMethod: PaymentMethod;
  refNumber: string | null;
  isBundle: boolean;
} {
  const isBundle = methodStr.includes(' · Bundle');
  const withoutBundle = methodStr.replace(' · Bundle', '').trim();
  const refMatch = withoutBundle.match(/\((.+?)\)/);
  const refNumber = refMatch ? refMatch[1] : null;
  const label = withoutBundle.replace(/\s*\(.+?\)/, '').trim();

  const methodMap: Record<string, PaymentMethod> = {
    GCash: 'gcash',
    Maya: 'maya',
    BPI: 'bpi',
    'Bank Transfer': 'bank_transfer',
    Cash: 'cash',
  };

  return { paymentMethod: methodMap[label] ?? 'cash', refNumber, isBundle };
}

export type ParsedItemRow = {
  transactionNumber: string;
  time: string;
  productName: string;
  variantName: string | null;
  quantity: number;
  itemTotal: number;
  transactionTotal: number;
  paymentMethod: string;
  customerHandle: string;
  proofPhoto: string;
  status: string;
};

export function parseItemRow(cells: string[]): ParsedItemRow {
  const [num, time, item, flavor, qty, itemTotal, txnTotal, method, handle, photo, status] = cells;
  return {
    transactionNumber: num,
    time,
    productName: item,
    variantName: flavor.trim() ? flavor : null,
    quantity: parseInt(qty, 10),
    itemTotal: parseFloat(itemTotal.replace('₱', '')),
    transactionTotal: parseFloat(txnTotal.replace('₱', '')),
    paymentMethod: method,
    customerHandle: handle,
    proofPhoto: photo,
    status,
  };
}

export function groupRowsByTransaction(rows: ParsedItemRow[]): ParsedItemRow[][] {
  const groups: ParsedItemRow[][] = [];
  let current: ParsedItemRow[] = [];
  let currentNumber: string | null = null;

  for (const row of rows) {
    if (row.transactionNumber !== currentNumber) {
      if (current.length) groups.push(current);
      current = [];
      currentNumber = row.transactionNumber;
    }
    current.push(row);
  }
  if (current.length) groups.push(current);

  return groups;
}

export async function processCSV(csvText: string, zip: JSZip): Promise<ImportResult> {
  const lines = csvText.split('\n').filter((l) => l.trim());
  const [header, ...dataLines] = lines;

  if (!header || !header.includes('Time')) throw new Error('Invalid CSV format.');

  let imported = 0, skipped = 0, failed = 0, photosMissing = 0;

  const parsedRows: ParsedItemRow[] = [];
  for (const line of dataLines) {
    const cells = parseCSVRow(line);
    if (cells.length < 11) { failed++; continue; }
    parsedRows.push(parseItemRow(cells));
  }

  const groups = groupRowsByTransaction(parsedRows);

  for (const group of groups) {
    try {
      const first = group[0];
      const total = first.transactionTotal;
      if (isNaN(total)) { failed++; continue; }

      const createdAt = new Date(first.time).toISOString();
      const createdAtMinute = createdAt.slice(0, 16);

      if (await transactionExists(createdAtMinute, total)) { skipped++; continue; }

      const items = group.map((row) => ({
        productName: row.productName,
        variantName: row.variantName,
        quantity: row.quantity,
        price: row.quantity > 0 ? row.itemTotal / row.quantity : 0,
      }));

      const { paymentMethod, refNumber, isBundle } = parsePaymentMethod(first.paymentMethod);
      const customerHandle = first.customerHandle.trim() || null;
      const status: 'completed' | 'voided' = first.status.trim() === 'VOIDED' ? 'voided' : 'completed';

      let proofPhotoUri: string | undefined;
      const photoFilename = first.proofPhoto.trim();
      if (photoFilename) {
        const photoFile = zip.file(photoFilename);
        if (photoFile) {
          const base64 = await photoFile.async('base64');
          proofPhotoUri = `data:image/jpeg;base64,${base64}`;
        } else {
          photosMissing++;
        }
      }

      await importTransaction({
        total,
        cashTendered: total,
        change: 0,
        paymentMethod,
        refNumber: refNumber ?? undefined,
        proofPhotoUri,
        customerHandle: customerHandle ?? undefined,
        isBundle,
        status,
        createdAt,
        items,
      });

      imported++;
    } catch {
      failed++;
    }
  }

  return { imported, skipped, failed, photosMissing };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest __tests__/utils/import-csv-parser.test.ts`
Expected: PASS, all tests green

- [ ] **Step 5: Run the full test suite to confirm nothing else broke**

Run: `npx jest`
Expected: all suites pass (including `__tests__/db/transactions.test.ts` from Task 8 and the new `date-range`/`export-csv-shared`/`CalendarRangeModal` suites from earlier tasks)

- [ ] **Step 6: Commit**

```bash
git add utils/import-csv-parser.ts __tests__/utils/import-csv-parser.test.ts
git commit -m "feat(import): group per-item CSV rows back into transactions on import"
```

---

### Task 10: Manual end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Verify export/import round trip**

1. Run the app (`npx expo start`), ring up at least: one single-item sale, one multi-item sale with a flavor on one item, and one bundle sale.
2. Open Transactions → Export. Unzip the result and open `transactions.csv` in a spreadsheet.
   Expected: one row per item; `Flavor` column populated only where a variant was chosen; `Transaction Total` repeats correctly across rows sharing the same `#`; can filter/sort by `Flavor`.
3. Re-import the same ZIP via the Import button.
   Expected: result banner reports all transactions skipped as duplicates (0 imported), since they already exist.
4. Void one transaction, export again, re-import into a fresh state if possible (or just confirm the `Status` column shows `VOIDED` and re-import marks it voided).

- [ ] **Step 2: Verify the custom calendar range filter**

1. Open Transactions, tap **Custom**, pick a start and end day spanning at least one month boundary, tap Apply.
   Expected: button label updates to the picked range; list and total reflect only transactions in that window.
2. Tap Export while the custom range is active.
   Expected: the downloaded ZIP/file name includes the `YYYY-MM-DD_to_YYYY-MM-DD` range.

- [ ] **Step 3: Verify the Maya QR refresh fix**

1. Open the cart, add an item, open Payment (so the screen mounts), then cancel back out without confirming the sale.
2. Open Admin Settings and upload a QR code for Maya (or any method without one yet).
3. Return to the cart and open Payment again.
   Expected: Maya now appears as a selectable payment method without restarting the app.

- [ ] **Step 4: Run the full automated test suite one more time**

Run: `npx jest`
Expected: all suites pass.
