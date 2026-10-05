import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { F, R, type Palette } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';
import { QUICK_GUIDE } from '../../constants/playbook';

/** Customer type to product lookup, for a fast answer at the booth. */
export function QuickGuide() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.card} testID="playbook-guide">
      <Text style={styles.title} accessibilityRole="header">Quick product guide</Text>
      {QUICK_GUIDE.map((row, i) => (
        <View key={row.customer} style={[styles.row, i > 0 && styles.rowDivider]}>
          <Text style={styles.customer}>{row.customer}</Text>
          <Text style={styles.recommend}>{row.recommend}</Text>
        </View>
      ))}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    card: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: c.surface,
      borderRadius: R.lg,
      borderWidth: 1,
      borderColor: c.borderDark,
    },
    title: { color: c.textPrimary, fontSize: F.lg, fontWeight: '800', paddingVertical: 8 },
    row: { flexDirection: 'row', gap: 12, paddingVertical: 10 },
    rowDivider: { borderTopWidth: 1, borderTopColor: c.border },
    customer: { flex: 1, color: c.textSecondary, fontSize: F.sm },
    recommend: { flex: 1, color: c.textPrimary, fontSize: F.sm, fontWeight: '700' },
  });
