import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { F, type Palette } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import type { PosEvent } from '../db/events';

type Props = {
  /** The event this device is logging sales to (the sticky pick or sole event). */
  event: PosEvent | null;
  /** Two or more events cover today and none is picked yet: selling is gated. */
  mustPick?: boolean;
  /** More than one event covers today, so the pick can be switched. */
  switchable?: boolean;
  onPress: () => void;
};

/**
 * Inline event marker that rides on the header's sync line (next to the
 * SyncStatusBar), so it costs zero extra vertical space and never pushes the
 * product tiles down. Three states:
 *  - Pick required (two or more events today, none chosen): a red "Pick event"
 *    prompt. Selling is blocked until the cashier picks, so the chip is the way in.
 *  - Active: names the event this device logs sales to (a dot means opening cash
 *    isn't recorded; a caret means other events are available to switch to).
 *  - Idle (no event today): a quiet "Set up event" affordance.
 * Tapping always opens the relevant sheet (picker when there's a choice, else
 * the setup form).
 */
export function EventBadge({ event, mustPick = false, switchable = false, onPress }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Two or more events today with no pick: the hard gate. Prompt the choice.
  if (mustPick) {
    return (
      <TouchableOpacity
        style={styles.pickChip}
        onPress={onPress}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Several events today. Tap to pick which one this device logs sales to."
      >
        <Text style={styles.cal}>🗓️</Text>
        <Text style={styles.pickLabel} numberOfLines={1}>Pick event</Text>
        <View style={styles.pickDot} />
      </TouchableOpacity>
    );
  }

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
        switchable
          ? `Logging sales to ${label}. Tap to switch event.`
          : floatMissing
            ? `Event day: ${label}. Opening cash not set. Tap to set it.`
            : `Event day: ${label}. Tap to view.`
      }
    >
      <Text style={styles.cal}>🗓️</Text>
      <Text style={styles.label} numberOfLines={1}>{label}</Text>
      {floatMissing && <View style={styles.dot} />}
      {switchable && <Text style={styles.caret}>▾</Text>}
    </TouchableOpacity>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: 200,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: c.pinkSubtle,
  },
  cal: { fontSize: F.xs },
  label: { color: c.pink, fontSize: F.xs, fontWeight: '700', flexShrink: 1 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.pink },
  caret: { color: c.pink, fontSize: F.xs, fontWeight: '700', marginLeft: -1 },
  // Pick-required: red reads as "action needed", distinct from the pink active chip.
  pickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: 200,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: c.redSubtle,
    borderWidth: 1,
    borderColor: c.red,
  },
  pickLabel: { color: c.red, fontSize: F.xs, fontWeight: '800', flexShrink: 1 },
  pickDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.red },
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
