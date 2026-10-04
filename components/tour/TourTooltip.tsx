import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { F, R, type Palette } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';
import type { TourStep } from './types';

type Props = {
  step: TourStep;
  index: number;
  total: number;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
};

/** The card that explains the spotlighted element and holds Back / Next / Skip. */
export function TourTooltip({ step, index, total, onBack, onNext, onSkip }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isFirst = index === 0;
  const isLast = index === total - 1;

  return (
    <View style={styles.card} testID="tour-tooltip">
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${((index + 1) / total) * 100}%` }]} />
      </View>
      <Text style={styles.title} accessibilityRole="header">{step.title}</Text>
      <Text style={styles.body}>{step.body}</Text>
      {step.auto && (
        <View style={styles.auto}>
          <Ionicons name="play-circle-outline" size={14} color={colors.pink} />
          <Text style={styles.autoText}>{step.auto}</Text>
        </View>
      )}
      <View style={styles.footer}>
        <Text style={styles.count}>{index + 1} of {total}</Text>
        <View style={styles.buttons}>
          {isFirst ? (
            <TouchableOpacity testID="tour-skip" style={styles.secondary} onPress={onSkip} accessibilityRole="button">
              <Text style={styles.secondaryText}>Skip</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity testID="tour-back" style={styles.secondary} onPress={onBack} accessibilityRole="button">
              <Text style={styles.secondaryText}>Back</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity testID="tour-next" style={styles.primary} onPress={onNext} accessibilityRole="button">
            <Text style={styles.primaryText}>{isLast ? 'Done' : 'Next'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    card: {
      gap: 8,
      padding: 16,
      borderRadius: R.lg,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      shadowColor: '#000',
      shadowOpacity: 0.35,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 12,
    },
    progressTrack: { height: 3, borderRadius: 2, backgroundColor: c.elevated, marginBottom: 6, overflow: 'hidden' },
    progressFill: { height: 3, borderRadius: 2, backgroundColor: c.pink },
    title: { color: c.textPrimary, fontSize: F.lg, fontWeight: '800' },
    body: { color: c.textSecondary, fontSize: F.md, lineHeight: 21 },
    auto: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    autoText: { color: c.pink, fontSize: F.xs, fontWeight: '700' },
    footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
    count: { color: c.textMuted, fontSize: F.xs, fontWeight: '700' },
    buttons: { flexDirection: 'row', gap: 8 },
    secondary: {
      minHeight: 40,
      paddingHorizontal: 16,
      justifyContent: 'center',
      borderRadius: R.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.elevated,
    },
    secondaryText: { color: c.textPrimary, fontSize: F.sm, fontWeight: '700' },
    primary: { minHeight: 40, paddingHorizontal: 20, justifyContent: 'center', borderRadius: R.md, backgroundColor: c.pink },
    primaryText: { color: '#fff', fontSize: F.sm, fontWeight: '800' },
  });
