import React from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { C, F } from '../constants/theme';

type Props = {
  subcategories: string[];
  active: string | null;
  onSelect: (subcategory: string) => void;
};

/**
 * Secondary filter row shown only for categories that have subcategories
 * (e.g. Freeze Dried → Fish / Meats / Cat Grass · Yogurt / Super Food).
 * Lighter weight than CategoryTabs so the hierarchy reads clearly.
 */
export function SubcategoryFilter({ subcategories, active, onSelect }: Props) {
  if (subcategories.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled"
    >
      {subcategories.map((sub) => {
        const on = sub === active;
        return (
          <TouchableOpacity
            key={sub}
            testID={`subcategory-chip-${sub}`}
            style={[styles.chip, on && styles.chipActive]}
            onPress={() => onSelect(sub)}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.label, on && styles.labelActive]} numberOfLines={1}>
              {sub}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 6, paddingHorizontal: 2, paddingVertical: 2 },
  chip: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: C.pinkSubtle,
    borderColor: C.pink,
  },
  label: {
    color: C.textMuted,
    fontSize: F.xs,
    fontWeight: '700',
  },
  labelActive: { color: C.pink },
});
