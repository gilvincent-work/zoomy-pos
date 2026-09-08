import React, { useMemo } from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { F, type Palette } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';

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
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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

const makeStyles = (c: Palette) => StyleSheet.create({
  row: { gap: 6, paddingHorizontal: 2, paddingVertical: 2 },
  chip: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: c.pinkSubtle,
    borderColor: c.pink,
  },
  label: {
    color: c.textMuted,
    fontSize: F.xs,
    fontWeight: '700',
  },
  labelActive: { color: c.pink },
});
