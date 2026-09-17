import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { F, type Palette } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import type { PosEvent } from '../db/events';

type Props = {
  event: PosEvent | null;
  onPress: () => void;
};

/**
 * Inline event marker that rides on the header's sync line (next to the
 * SyncStatusBar), so it costs zero extra vertical space and never pushes the
 * product tiles down. On an event day it names the event (a small dot means the
 * opening cash float isn't recorded yet); on a normal day it's a quiet "Set up
 * event" affordance so scheduling/creating an event is always reachable. Either
 * way, tapping opens the event setup sheet. Informational plus a shortcut, never
 * a gate on selling.
 */
export function EventBadge({ event, onPress }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Normal day (no event covers today): a muted entry point to create/schedule.
  if (!event) {
    return (
      <TouchableOpacity
        style={styles.idleChip}
        onPress={onPress}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="No event today. Tap to set up or schedule an event."
      >
        <Text style={styles.cal}>🗓️</Text>
        <Text style={styles.idleLabel} numberOfLines={1}>Set up event</Text>
      </TouchableOpacity>
    );
  }

  const floatMissing = event.opening_cash == null;
  // Prefer a short label: the venue if we have it, else the event name.
  const label = event.venue?.trim() || event.name;

  return (
    <TouchableOpacity
      style={styles.chip}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={
        floatMissing
          ? `Event day: ${label}. Opening cash not set. Tap to set it.`
          : `Event day: ${label}. Tap to view.`
      }
    >
      <Text style={styles.cal}>🗓️</Text>
      <Text style={styles.label} numberOfLines={1}>{label}</Text>
      {floatMissing && <View style={styles.dot} />}
    </TouchableOpacity>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: 180,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: c.pinkSubtle,
  },
  cal: { fontSize: F.xs },
  label: { color: c.pink, fontSize: F.xs, fontWeight: '700', flexShrink: 1 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.pink },
  // Quiet, bordered variant for the normal-day "Set up event" entry point, so it
  // reads as a shortcut without competing with the active-day (pink) chip.
  idleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: 180,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.border,
  },
  idleLabel: { color: c.textMuted, fontSize: F.xs, fontWeight: '700', flexShrink: 1 },
});
