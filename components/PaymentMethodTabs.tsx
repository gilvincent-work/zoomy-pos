import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { F, R, type Palette } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import type { PaymentMethod } from '../db/transactions';
import { QUICK_PAYMENT_METHODS } from '../constants/payment';

type Props = {
  /** Currently selected quick method. */
  value: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
  /** Grey out + block taps (e.g. empty cart). */
  disabled?: boolean;
  /** Tighter padding for the portrait peek bar. */
  compact?: boolean;
};

/**
 * Segmented Cash / GCash / Card selector that sits above the Pay button. The
 * active segment lifts to the app background with the brand pink label, so the
 * chosen method reads at a glance before the cashier commits the sale.
 */
export function PaymentMethodTabs({ value, onChange, disabled, compact }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={[styles.track, compact && styles.trackCompact, disabled && styles.trackDisabled]}>
      {QUICK_PAYMENT_METHODS.map((m) => {
        const active = m.key === value;
        return (
          <TouchableOpacity
            key={m.key}
            testID={`pay-method-${m.key}`}
            style={[styles.tab, active && styles.tabActive, compact && styles.tabCompact]}
            onPress={() => onChange(m.key)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled }}
            accessibilityLabel={`Pay with ${m.label}`}
            activeOpacity={0.8}
          >
            <Text
              style={[styles.tabText, active && styles.tabTextActive]}
              numberOfLines={1}
            >
              {m.emoji}  {m.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: c.elevated,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: c.border,
    padding: 3,
    gap: 3,
  },
  trackCompact: { padding: 2, gap: 2 },
  trackDisabled: { opacity: 0.5 },
  tab: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: R.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabCompact: { paddingVertical: 7 },
  tabActive: {
    backgroundColor: c.bg,
    borderWidth: 1,
    borderColor: c.pinkDim,
  },
  tabText: { color: c.textSecondary, fontSize: F.sm, fontWeight: '700' },
  tabTextActive: { color: c.pink },
});
