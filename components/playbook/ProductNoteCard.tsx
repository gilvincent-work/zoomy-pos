import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { F, R, type Palette } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';
import type { ProductNote } from '../../constants/playbook';
import { ActionList } from './ActionList';

/** A product's talking points, audience tags and expiry. */
export function ProductNoteCard({ note }: { note: ProductNote }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.card} testID={`playbook-note-${note.id}`}>
      <Text style={styles.name} accessibilityRole="header">{note.name}</Text>
      <ActionList items={note.facts} />
      <View style={styles.tags}>
        {note.tags.map((t) => (
          <View key={t} style={styles.tag}>
            <Text style={styles.tagText}>{t}</Text>
          </View>
        ))}
        {note.expiry && (
          <View style={[styles.tag, styles.expiry]}>
            <Text style={[styles.tagText, styles.expiryText]}>Expires: {note.expiry}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    card: {
      gap: 12,
      padding: 16,
      backgroundColor: c.surface,
      borderRadius: R.lg,
      borderWidth: 1,
      borderColor: c.borderDark,
    },
    name: { color: c.textPrimary, fontSize: F.lg, fontWeight: '800' },
    tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    tag: { paddingVertical: 5, paddingHorizontal: 9, borderRadius: R.sm, backgroundColor: c.elevated },
    tagText: { color: c.textSecondary, fontSize: F.xs, fontWeight: '700' },
    expiry: { backgroundColor: c.redSubtle },
    expiryText: { color: c.red },
  });
