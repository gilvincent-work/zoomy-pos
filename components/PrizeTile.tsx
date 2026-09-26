import React, { useMemo } from 'react';
import { TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import { F, R, type Palette } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';

type Props = {
  onPress: () => void;
};

/**
 * A synthetic tile in the POS Prize category: the fast path to a spin-a-wheel
 * free item. Matches the standard product/bundle tile so it sits consistently in
 * the grid; tapping it opens the prize picker to choose the won product, which is
 * then added to the cart as a free prize line.
 */
export function PrizeTile({ onPress }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <TouchableOpacity
      testID="prize-tile"
      style={styles.tile}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel="Add a free item (prize)"
    >
      <View style={styles.thumb}>
        <Text style={styles.icon}>🎁</Text>
      </View>
      <View style={styles.textArea}>
        <Text style={styles.name} numberOfLines={2}>Free item (prize)</Text>
        <Text style={styles.hint}>Pick the won treat</Text>
      </View>
    </TouchableOpacity>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  tile: {
    backgroundColor: c.surface,
    borderRadius: R.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
    borderWidth: 1.5,
    borderColor: c.green,
  },
  thumb: {
    width: '100%',
    flex: 3,
    backgroundColor: c.greenSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 40, lineHeight: 46 },
  textArea: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingBottom: 4,
  },
  name: {
    color: c.textPrimary,
    fontSize: F.sm,
    marginTop: 6,
    textAlign: 'center',
    fontWeight: '600',
    lineHeight: 17,
  },
  hint: {
    color: c.green,
    fontSize: F.sm,
    fontWeight: '700',
    marginTop: 4,
  },
});
