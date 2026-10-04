import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { F, type Palette } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';

type Option<K extends string> = { key: K; label: string };

type Props<K extends string> = {
  options: Option<K>[];
  value: K;
  onChange: (key: K) => void;
  /** Prefix for per-chip testIDs: `${testIDPrefix}-${key}`. */
  testIDPrefix: string;
};

/** Single-select pill row, used for playbook branches and product filters. */
export function ChipRow<K extends string>({ options, value, onChange, testIDPrefix }: Props<K>) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.row}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <TouchableOpacity
            key={o.key}
            testID={`${testIDPrefix}-${o.key}`}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onChange(o.key)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      paddingVertical: 9,
      paddingHorizontal: 14,
      minHeight: 40,
      justifyContent: 'center',
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    chipActive: { backgroundColor: c.pink, borderColor: c.pink },
    label: { color: c.textSecondary, fontSize: F.sm, fontWeight: '700' },
    labelActive: { color: '#fff' },
  });
