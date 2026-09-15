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
 * Inline "event day" marker that rides on the header's sync line (next to the
 * SyncStatusBar), so it costs zero extra vertical space and never pushes the
 * product tiles down. Shown only on an event day (event != null). A small dot
 * means the opening cash float isn't recorded yet; tapping opens the event
 * setup sheet. Informational plus a shortcut, never a gate on selling.
 */
export function EventBadge({ event, onPress }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  if (!event) return null;

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
});
