import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { F, R, type Palette } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { DateRange, getMonthGrid, isSameDay, isDayInRange, startOfDay } from '../utils/date-range';

export type CalendarRangeModalProps = {
  visible: boolean;
  initialRange: DateRange | null;
  onApply: (range: DateRange) => void;
  onClose: () => void;
};

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

type ActiveField = 'from' | 'to';

function formatChipDate(d: Date): string {
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

export function CalendarRangeModal({ visible, initialRange, onApply, onClose }: CalendarRangeModalProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const today = startOfDay(new Date());
  const [visibleYear, setVisibleYear] = useState(initialRange?.start.getFullYear() ?? today.getFullYear());
  const [visibleMonth, setVisibleMonth] = useState(initialRange?.start.getMonth() ?? today.getMonth());
  const [pendingStart, setPendingStart] = useState<Date | null>(initialRange?.start ?? null);
  const [pendingEnd, setPendingEnd] = useState<Date | null>(initialRange?.end ?? null);
  const [activeField, setActiveField] = useState<ActiveField>('from');

  useEffect(() => {
    if (!visible) return;
    setVisibleYear(initialRange?.start.getFullYear() ?? today.getFullYear());
    setVisibleMonth(initialRange?.start.getMonth() ?? today.getMonth());
    setPendingStart(initialRange?.start ?? null);
    setPendingEnd(initialRange?.end ?? null);
    setActiveField('from');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function handleDayPress(day: Date) {
    if (activeField === 'from' || !pendingStart) {
      setPendingStart(day);
      setPendingEnd(null);
      setActiveField('to');
      return;
    }
    if (day.getTime() < pendingStart.getTime()) {
      setPendingEnd(pendingStart);
      setPendingStart(day);
    } else {
      setPendingEnd(day);
    }
    setActiveField('from');
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
    setActiveField('from');
  }

  function handleApply() {
    if (!pendingStart) return;
    onApply({ start: pendingStart, end: pendingEnd ?? pendingStart });
  }

  const grid = getMonthGrid(visibleYear, visibleMonth);
  const monthLabel = new Date(visibleYear, visibleMonth, 1)
    .toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
  const canApply = !!pendingStart;
  const fromLabel = pendingStart ? formatChipDate(pendingStart) : 'Tap a date';
  const toLabel = pendingEnd ? formatChipDate(pendingEnd) : 'Same as From';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <TouchableOpacity onPress={handlePrevMonth} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.monthLabel}>{monthLabel}</Text>
            <TouchableOpacity onPress={handleNextMonth} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="chevron-forward" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.chipsRow}>
            <TouchableOpacity
              testID="cal-chip-from"
              style={[styles.chip, activeField === 'from' && styles.chipActive]}
              onPress={() => setActiveField('from')}
            >
              <Text style={styles.chipLabel}>From</Text>
              <Text style={[styles.chipValue, activeField === 'from' && styles.chipValueActive]}>
                {fromLabel}
              </Text>
            </TouchableOpacity>
            <Ionicons name="arrow-forward" size={14} color={colors.textMuted} />
            <TouchableOpacity
              testID="cal-chip-to"
              style={[styles.chip, activeField === 'to' && styles.chipActive]}
              onPress={() => setActiveField('to')}
            >
              <Text style={styles.chipLabel}>To</Text>
              <Text style={[styles.chipValue, activeField === 'to' && styles.chipValueActive]}>
                {toLabel}
              </Text>
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
              <Text style={[styles.applyBtnText, !canApply && styles.applyBtnTextDisabled]}>Apply</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  sheet: { backgroundColor: c.surface, borderRadius: R.lg, borderWidth: 1, borderColor: c.borderDark, padding: 16, width: '100%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  monthLabel: { color: c.textPrimary, fontSize: F.md, fontWeight: '700' },
  chipsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  chip: {
    flex: 1,
    backgroundColor: c.elevated,
    borderWidth: 1.5,
    borderColor: c.border,
    borderRadius: R.sm,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  chipActive: { borderColor: c.pink, backgroundColor: c.pinkSubtle },
  chipLabel: { color: c.textMuted, fontSize: F.xs, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  chipValue: { color: c.textSecondary, fontSize: F.sm, fontWeight: '700', marginTop: 2 },
  chipValueActive: { color: c.textPrimary },
  weekdayRow: { flexDirection: 'row' },
  weekdayLabel: { flex: 1, textAlign: 'center', color: c.textMuted, fontSize: F.xs, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: R.sm },
  dayCellInRange: { backgroundColor: c.pinkSubtle },
  dayCellSelected: { backgroundColor: c.pink },
  dayText: { color: c.textPrimary, fontSize: F.sm },
  dayTextMuted: { color: c.textMuted },
  dayTextSelected: { color: '#fff', fontWeight: '700' },
  footer: { flexDirection: 'row', gap: 10, marginTop: 16 },
  clearBtn: { flex: 1, backgroundColor: c.elevated, borderWidth: 1, borderColor: c.border, borderRadius: R.sm, padding: 13, alignItems: 'center' },
  clearBtnText: { color: c.textSecondary, fontWeight: '700', fontSize: F.md },
  applyBtn: { flex: 2, backgroundColor: c.pink, borderRadius: R.sm, padding: 13, alignItems: 'center' },
  applyBtnDisabled: { backgroundColor: c.elevated, borderWidth: 1, borderColor: c.border },
  applyBtnText: { color: '#fff', fontWeight: '800', fontSize: F.md },
  applyBtnTextDisabled: { color: c.textMuted },
});
