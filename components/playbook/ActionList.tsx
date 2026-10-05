import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { F, type Palette } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';

/** Plain checklist of things to do or know. */
export function ActionList({ items }: { items: string[] }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.list}>
      {items.map((text) => (
        <View key={text} style={styles.row}>
          <Ionicons name="checkmark-circle-outline" size={18} color={colors.green} style={styles.icon} />
          <Text style={styles.text}>{text}</Text>
        </View>
      ))}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    list: { gap: 10 },
    row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
    icon: { marginTop: 1 },
    text: { flex: 1, color: c.textSecondary, fontSize: F.md, lineHeight: 21 },
  });
