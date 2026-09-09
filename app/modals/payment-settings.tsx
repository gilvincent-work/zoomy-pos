import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Switch, SafeAreaView, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { QUICK_PAYMENT_METHODS } from '../../constants/payment';
import {
  getEnabledPaymentMethods, setEnabledPaymentMethods,
  getConfirmOnPay, setConfirmOnPay,
} from '../../db/settings';
import type { PaymentMethod } from '../../db/transactions';
import { useToast } from '../../components/Toast';
import { F, R, type Palette } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';

/**
 * Settings -> Payment Options. Controls which quick-tap methods show on the
 * cart Pay control (at least one always stays enabled) and whether tapping Pay
 * opens the confirm-before-recording modal. Both apply immediately — this
 * screen has no separate Save step, matching the listing toggles elsewhere.
 */
export default function PaymentSettingsModal() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { showToast } = useToast();
  const [enabled, setEnabled] = useState<PaymentMethod[]>([]);
  const [confirmOnPay, setConfirmOnPayState] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([getEnabledPaymentMethods(), getConfirmOnPay()]).then(([methods, confirm]) => {
        if (cancelled) return;
        setEnabled(methods);
        setConfirmOnPayState(confirm);
        setLoaded(true);
      });
      return () => { cancelled = true; };
    }, [])
  );

  async function toggleMethod(key: PaymentMethod) {
    const isOn = enabled.includes(key);
    if (isOn && enabled.length <= 1) {
      showToast({ variant: 'error', title: 'At least one method is required', message: 'Enable another method first.' });
      return;
    }
    const next = isOn ? enabled.filter((m) => m !== key) : [...enabled, key];
    setEnabled(next); // optimistic
    await setEnabledPaymentMethods(next);
  }

  async function toggleConfirm(next: boolean) {
    setConfirmOnPayState(next); // optimistic
    await setConfirmOnPay(next);
  }

  if (!loaded) return <SafeAreaView style={styles.container} />;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.sectionLabel}>ACCEPTED METHODS</Text>
        <Text style={styles.hint}>Shown on the cart Pay button, in this order. At least one stays on.</Text>
        <View style={styles.card}>
          {QUICK_PAYMENT_METHODS.map((m, i) => {
            const on = enabled.includes(m.key);
            return (
              <TouchableOpacity
                key={m.key}
                style={[styles.methodRow, i > 0 && styles.methodRowBorder]}
                onPress={() => toggleMethod(m.key)}
                activeOpacity={0.7}
              >
                <Text style={styles.methodEmoji}>{m.emoji}</Text>
                <Text style={styles.methodLabel}>{m.label}</Text>
                <Switch
                  value={on}
                  onValueChange={() => toggleMethod(m.key)}
                  trackColor={{ false: colors.borderDark, true: colors.pink }}
                  thumbColor="#fff"
                />
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.sectionLabel}>CONFIRM BEFORE RECORDING</Text>
        <Text style={styles.hint}>Tapping Pay opens a confirm step first, to avoid accidental taps.</Text>
        <View style={styles.card}>
          <View style={styles.methodRow}>
            <Text style={styles.methodLabel}>Confirmation modal</Text>
            <Switch
              value={confirmOnPay}
              onValueChange={toggleConfirm}
              trackColor={{ false: colors.borderDark, true: colors.pink }}
              thumbColor="#fff"
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  scroll: { padding: 20, gap: 8, paddingBottom: 40 },
  sectionLabel: {
    color: c.textMuted,
    fontSize: F.xs,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 12,
  },
  hint: { color: c.textMuted, fontSize: F.xs, marginTop: -2, marginBottom: 4 },
  card: {
    backgroundColor: c.surface,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: c.border,
    overflow: 'hidden',
  },
  methodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  methodRowBorder: { borderTopWidth: 1, borderTopColor: c.borderDark },
  methodEmoji: { fontSize: 20 },
  methodLabel: { flex: 1, color: c.textPrimary, fontSize: F.md, fontWeight: '700' },
});
