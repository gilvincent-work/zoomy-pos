import React from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { C, F, R } from '../constants/theme';

type Props = {
  categories: string[];
  active: string;
  onSelect: (category: string) => void;
};

/**
 * Horizontally scrollable category pill row for the Option H split-view.
 * The active pill uses the Zoomy brand pink; the rest are quiet surfaces.
 */
export function CategoryTabs({ categories, active, onSelect }: Props) {
  if (categories.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled"
    >
      {categories.map((cat) => {
        const on = cat === active;
        return (
          <TouchableOpacity
            key={cat}
            testID={`category-tab-${cat}`}
            style={[styles.pill, on && styles.pillActive]}
            onPress={() => onSelect(cat)}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.label, on && styles.labelActive]} numberOfLines={1}>
              {cat}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingHorizontal: 2, paddingVertical: 2 },
  pill: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderDark,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  pillActive: {
    backgroundColor: C.pink,
    borderColor: C.pink,
  },
  label: {
    color: C.textSecondary,
    fontSize: F.sm,
    fontWeight: '700',
  },
  labelActive: { color: '#fff' },
});
