import React, { useMemo } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Pressable } from 'react-native';
import { F, R, type Palette } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import type { PaymentMethod } from '../db/transactions';
import { quickMethodMeta } from '../constants/payment';

type Props = {
  visible: boolean;
  method: PaymentMethod;
  total: number;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * A last-tap guard before a sale is committed. Restates the chosen method and
 * the amount so an accidental Pay press can be waved off. Tapping the backdrop
 * cancels; only the green Paid button records.
 */
export function ConfirmPaymentModal({ visible, method, total, onConfirm, onCancel }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const meta = quickMethodMeta(method);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        {/* Stop propagation so taps on the card don't dismiss it. */}
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>Confirm payment</Text>
          <Text style={styles.subtitle}>Record this sale as paid?</Text>

          <View style={styles.summary}>
            <Text style={styles.method}>{meta.emoji}  {meta.label}</Text>
            <Text style={styles.total}>₱{total.toFixed(2)}</Text>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              testID="confirm-pay-cancel"
              style={[styles.btn, styles.cancel]}
              onPress={onCancel}
              activeOpacity={0.85}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="confirm-pay-confirm"
              style={[styles.btn, styles.confirm]}
              onPress={onConfirm}
              activeOpacity={0.85}
            >
              <Text style={styles.confirmText}>{meta.emoji}  Paid</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: c.surface,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: c.borderDark,
    padding: 20,
    gap: 6,
  },
  title: { color: c.textPrimary, fontSize: F.lg, fontWeight: '800' },
  subtitle: { color: c.textSecondary, fontSize: F.sm },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: c.elevated,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginTop: 8,
    marginBottom: 4,
  },
  method: { color: c.textPrimary, fontSize: F.md, fontWeight: '700' },
  total: { color: c.textPrimary, fontSize: F.xl, fontWeight: '800' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: R.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancel: { backgroundColor: c.elevated, borderWidth: 1, borderColor: c.border },
  cancelText: { color: c.textSecondary, fontSize: F.md, fontWeight: '700' },
  confirm: { backgroundColor: c.green },
  confirmText: { color: '#fff', fontSize: F.md, fontWeight: '800' },
});
