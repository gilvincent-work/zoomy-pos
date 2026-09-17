import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { F, R, type Palette } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import type { PetType } from '../db/transactions';

type Props = {
  value: PetType | null;
  onChange: (value: PetType | null) => void;
  disabled?: boolean;
};

const OPTIONS: { key: PetType; emoji: string; label: string }[] = [
  { key: 'dog', emoji: '🐶', label: 'Dog' },
  { key: 'cat', emoji: '🐱', label: 'Cat' },
  { key: 'both', emoji: '🐶🐱', label: 'Both' },
];

/**
 * The Dog/Cat/Both pet tag for the sale in progress. Lives on the cart (next to
 * the payment method) so it's always available, whether or not the confirm-
 * payment guard is enabled. Tapping the selected chip clears it back to untagged,
 * so a wrong tap is one tap to undo and skipping stays effortless.
 */
export function PetTypeChips({ value, onChange, disabled }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const pick = (p: PetType) => onChange(value === p ? null : p);

  return (
    <View style={styles.row}>
      <Text style={styles.caption}>PET</Text>
      <View style={styles.chips}>
        {OPTIONS.map((opt) => {
          const active = value === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              testID={`pet-chip-${opt.key}`}
              style={[styles.chip, active && styles.chipActive, disabled && styles.chipDisabled]}
              onPress={() => pick(opt.key)}
              disabled={disabled}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityState={{ selected: active, disabled: Boolean(disabled) }}
              accessibilityLabel={`Tag sale as ${opt.label}`}
            >
              <Text style={styles.emoji}>{opt.emoji}</Text>
              <Text style={[styles.label, active && styles.labelActive]}>{opt.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    caption: {
      color: c.textMuted,
      fontSize: F.xs,
      fontWeight: '700',
      letterSpacing: 1,
      width: 30,
    },
    chips: { flex: 1, flexDirection: 'row', gap: 6 },
    chip: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingVertical: 7,
      borderRadius: R.sm,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    chipActive: { borderColor: c.pink, backgroundColor: c.pinkSubtle },
    chipDisabled: { opacity: 0.4 },
    emoji: { fontSize: F.sm },
    label: { color: c.textSecondary, fontSize: F.xs, fontWeight: '700' },
    labelActive: { color: c.pink },
  });
