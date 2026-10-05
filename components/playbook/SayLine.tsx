import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { F, R, type Palette } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';

/** A line the seller says out loud, set apart from instructions to the seller. */
export function SayLine({ text }: { text: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.box} accessibilityLabel={`Say this: ${text}`}>
      <View style={styles.head}>
        <Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.pink} />
        <Text style={styles.caption}>SAY THIS</Text>
      </View>
      <Text style={styles.quote}>{`“${text}”`}</Text>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    box: {
      gap: 6,
      padding: 12,
      borderRadius: R.md,
      backgroundColor: c.pinkSubtle,
      borderWidth: 1,
      borderColor: c.pinkDim,
    },
    head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    caption: { color: c.pink, fontSize: F.xs, fontWeight: '800', letterSpacing: 1 },
    quote: { color: c.textPrimary, fontSize: F.md, lineHeight: 22, fontStyle: 'italic' },
  });
