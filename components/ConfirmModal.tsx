import React, { useMemo } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Pressable } from 'react-native';
import { F, R, type Palette } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';

type Props = {
  visible: boolean;
  title: string;
  message: string;
  /** Label for the affirmative action, e.g. "Delete". */
  confirmLabel: string;
  /** Red confirm button for destructive actions (delete). Default true. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * A generic in-app confirm dialog, themed to match the rest of the POS (used
 * in place of the browser's native window.confirm / Alert.alert, which look
 * out of place and can't be restyled). Tapping the backdrop cancels.
 */
export function ConfirmModal({ visible, title, message, confirmLabel, destructive = true, onConfirm, onCancel }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        {/* Stop propagation so taps on the card don't dismiss it. */}
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          <View style={styles.actions}>
            <TouchableOpacity
              testID="confirm-modal-cancel"
              style={[styles.btn, styles.cancel]}
              onPress={onCancel}
              activeOpacity={0.85}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="confirm-modal-confirm"
              style={[styles.btn, destructive ? styles.destructive : styles.confirm]}
              onPress={onConfirm}
              activeOpacity={0.85}
            >
              <Text style={styles.confirmText}>{confirmLabel}</Text>
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
  message: { color: c.textSecondary, fontSize: F.sm, marginTop: 2, lineHeight: 19 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
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
  destructive: { backgroundColor: c.red },
  confirmText: { color: '#fff', fontSize: F.md, fontWeight: '800' },
});
