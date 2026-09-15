import React, { useMemo } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, Pressable } from 'react-native';
import { F, R, type Palette } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import type { PaymentMethod, PetType } from '../db/transactions';
import { quickMethodMeta } from '../constants/payment';

type Props = {
  visible: boolean;
  method: PaymentMethod;
  total: number;
  customerHandle: string;
  onChangeCustomerHandle: (value: string) => void;
  petType: PetType | null;
  onChangePetType: (value: PetType | null) => void;
  onConfirm: () => void;
  onCancel: () => void;
};

const PET_OPTIONS: { key: PetType; emoji: string; label: string }[] = [
  { key: 'dog', emoji: '🐶', label: 'Dog' },
  { key: 'cat', emoji: '🐱', label: 'Cat' },
  { key: 'both', emoji: '🐶🐱', label: 'Both' },
];

/**
 * A last-tap guard before a sale is committed. Restates the chosen method and
 * the amount so an accidental Pay press can be waved off. Tapping the backdrop
 * cancels; only the green Paid button records.
 */
export function ConfirmPaymentModal({ visible, method, total, customerHandle, onChangeCustomerHandle, petType, onChangePetType, onConfirm, onCancel }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const meta = quickMethodMeta(method);

  // Tapping the selected pet clears it (back to untagged), so the choice is
  // never sticky and a wrong tap is one tap to undo.
  const pickPet = (p: PetType) => onChangePetType(petType === p ? null : p);

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

          <Text style={styles.handleLabel}>
            FURBABY / IG HANDLE <Text style={styles.optionalTag}>optional</Text>
          </Text>
          <TextInput
            testID="confirm-pay-handle"
            style={styles.handleInput}
            placeholder="@username or furbaby name"
            placeholderTextColor={colors.textMuted}
            value={customerHandle}
            onChangeText={onChangeCustomerHandle}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.handleLabel}>
            PET <Text style={styles.optionalTag}>tap one, optional</Text>
          </Text>
          <View style={styles.petRow}>
            {PET_OPTIONS.map((opt) => {
              const active = petType === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  testID={`pet-chip-${opt.key}`}
                  style={[styles.petChip, active && styles.petChipActive]}
                  onPress={() => pickPet(opt.key)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Tag as ${opt.label}`}
                >
                  <Text style={styles.petEmoji}>{opt.emoji}</Text>
                  <Text style={[styles.petLabel, active && styles.petLabelActive]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
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
  handleLabel: {
    color: c.textMuted,
    fontSize: F.xs,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  optionalTag: { color: c.textMuted, fontSize: F.xs, fontWeight: '400', letterSpacing: 0, textTransform: 'none' },
  handleInput: {
    backgroundColor: c.elevated,
    color: c.textPrimary,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: c.border,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: F.md,
  },
  petRow: { flexDirection: 'row', gap: 8, marginTop: 6, marginBottom: 4 },
  petChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 10,
    borderRadius: R.md,
    borderWidth: 1.5,
    borderColor: c.border,
    backgroundColor: c.elevated,
  },
  petChipActive: { borderColor: c.pink, backgroundColor: c.pinkSubtle },
  petEmoji: { fontSize: F.lg },
  petLabel: { color: c.textSecondary, fontSize: F.xs, fontWeight: '700' },
  petLabelActive: { color: c.pink },
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
