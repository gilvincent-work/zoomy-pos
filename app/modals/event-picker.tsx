import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, SafeAreaView, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { F, R, type Palette } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';
import {
  getActiveEventsForDate,
  getSelectedEventId,
  setSelectedEventId,
  type PosEvent,
} from '../../db/events';

/**
 * Event picker (multi-event). When two or more events run today the cashier must
 * declare which one this device logs sales to; this sheet is that choice. The pick
 * is sticky (persisted) until the cashier switches or the event ends. Picking an
 * event with no opening cash yet hands off to the setup form to count the float
 * (once any device records it, it syncs and this stops nudging). Only today's
 * open events are listed, newest first.
 */
export default function EventPickerModal() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [events, setEvents] = useState<PosEvent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([getActiveEventsForDate(), getSelectedEventId()]).then(([evs, sel]) => {
        if (cancelled) return;
        // Default to alphabetical order by the label shown (venue, else name),
        // case-insensitive, so the list reads A to Z regardless of create order.
        const labelOf = (e: PosEvent) => (e.venue?.trim() || e.name || '').toLowerCase();
        setEvents([...evs].sort((a, b) => labelOf(a).localeCompare(labelOf(b))));
        setSelectedId(sel);
        setLoaded(true);
      });
      return () => { cancelled = true; };
    }, [])
  );

  async function choose(e: PosEvent) {
    await setSelectedEventId(e.event_id);
    // Prompt for the opening float only when it isn't recorded yet (on any device).
    if (e.opening_cash == null) {
      router.replace('/modals/event-setup');
    } else {
      router.back();
    }
  }

  if (!loaded) return <SafeAreaView style={styles.container} />;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.sectionLabel}>TODAY'S EVENTS</Text>
        <Text style={styles.hint}>
          Pick the event this device is logging sales to. Every sale is tagged to it until you switch.
        </Text>

        {events.length === 0 ? (
          <Text style={styles.empty}>No events running today. Schedule one to start tagging sales.</Text>
        ) : (
          events.map((e) => {
            const isSel = e.event_id === selectedId;
            const label = e.venue?.trim() || e.name;
            return (
              <TouchableOpacity
                key={e.event_id}
                style={[styles.row, isSel && styles.rowSel]}
                onPress={() => choose(e)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Log sales to ${label}${isSel ? ', currently selected' : ''}`}
              >
                <View style={styles.rowText}>
                  <Text style={styles.rowName} numberOfLines={1}>{label}</Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>{metaLine(e)}</Text>
                </View>
                {isSel && <Text style={styles.check}>✓</Text>}
              </TouchableOpacity>
            );
          })
        )}

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => router.replace('/modals/event-setup')}
          activeOpacity={0.85}
        >
          <Text style={styles.secondaryBtnText}>Schedule another event</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

/** "Sep 16 to 18 · Float ₱1,500" style one-liner for a picker row. */
function metaLine(e: PosEvent): string {
  const dates = dateLabel(e.starts_on, e.ends_on);
  const cash = e.opening_cash == null ? 'Set float' : `Float ₱${e.opening_cash.toLocaleString()}`;
  return dates ? `${dates} · ${cash}` : cash;
}

function dateLabel(start: string | null, end: string | null): string {
  const from = start ?? end;
  const to = end ?? start;
  if (!from) return '';
  if (!to || from === to) return from;
  return `${from} to ${to}`;
}

const makeStyles = (c: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  scroll: { padding: 20, gap: 8, paddingBottom: 40 },
  sectionLabel: {
    color: c.textMuted, fontSize: F.xs, fontWeight: '700', letterSpacing: 1,
    textTransform: 'uppercase', marginTop: 14,
  },
  hint: { color: c.textMuted, fontSize: F.xs, marginTop: -2, marginBottom: 8 },
  empty: { color: c.textMuted, fontSize: F.md, lineHeight: 22, marginVertical: 12 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: c.surface, borderRadius: R.md, borderWidth: 1, borderColor: c.border,
    paddingVertical: 14, paddingHorizontal: 16, marginTop: 4,
  },
  rowSel: { borderColor: c.pink, backgroundColor: c.pinkSubtle },
  rowText: { flex: 1, gap: 3 },
  rowName: { color: c.textPrimary, fontSize: F.md, fontWeight: '700' },
  rowMeta: { color: c.textSecondary, fontSize: F.xs, fontWeight: '600' },
  check: { color: c.pink, fontSize: F.lg, fontWeight: '800' },
  secondaryBtn: {
    backgroundColor: c.surface, borderRadius: R.md, borderWidth: 1, borderColor: c.border,
    paddingVertical: 13, alignItems: 'center', marginTop: 16,
  },
  secondaryBtnText: { color: c.textSecondary, fontSize: F.md, fontWeight: '700' },
});
