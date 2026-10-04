import React, { useMemo } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { F, R, type Palette } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';

type Props = {
  visible: boolean;
  onTakeTour: () => void;
  onNotNow: () => void;
};

/** One-time offer shown on a fresh install. The Tutorial button always replays the tour. */
export function TourPrompt({ visible, onTakeTour, onNotNow }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onNotNow}>
      <View style={styles.backdrop}>
        <View style={styles.card} testID="tour-prompt">
          <Text style={styles.title} accessibilityRole="header">Take a quick tour?</Text>
          <Text style={styles.body}>
            See how the register works, from adding treats to taking payment. It takes about two minutes and saves nothing.
            You can replay it any time with the Tutorial button.
          </Text>
          <View style={styles.actions}>
            <TouchableOpacity testID="tour-prompt-skip" style={[styles.btn, styles.secondary]} onPress={onNotNow} accessibilityRole="button">
              <Text style={styles.secondaryText}>Not now</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="tour-prompt-start" style={[styles.btn, styles.primary]} onPress={onTakeTour} accessibilityRole="button">
              <Text style={styles.primaryText}>Take the tour</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
    card: {
      width: '100%',
      maxWidth: 420,
      gap: 10,
      padding: 20,
      borderRadius: R.lg,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    title: { color: c.textPrimary, fontSize: F.xl, fontWeight: '800' },
    body: { color: c.textSecondary, fontSize: F.md, lineHeight: 22 },
    actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
    btn: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: R.md },
    secondary: { borderWidth: 1, borderColor: c.border, backgroundColor: c.elevated },
    secondaryText: { color: c.textPrimary, fontSize: F.md, fontWeight: '700' },
    primary: { backgroundColor: c.pink },
    primaryText: { color: '#fff', fontSize: F.md, fontWeight: '800' },
  });
