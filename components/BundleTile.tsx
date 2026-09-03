import React from 'react';
import { TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import { C, F, R } from '../constants/theme';

type Props = {
  id: number;
  name: string;
  price: number;
  /** One emoji per product line the deal draws from, shown in the thumbnail. */
  lineEmojis: string[];
  onPress: (id: number) => void;
};

/**
 * A "buy any N" deal in the POS Bundles category. Matches the standard product
 * tile so bundles sit consistently in the grid; the thumbnail shows the icons of
 * the product lines a customer can choose from.
 */
export function BundleTile({ id, name, price, lineEmojis, onPress }: Props) {
  const icons = lineEmojis.length > 0 ? lineEmojis : ['🎁'];
  const iconSize = icons.length >= 3 ? 30 : 38;
  return (
    <TouchableOpacity
      testID="bundle-tile"
      style={styles.tile}
      onPress={() => onPress(id)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ₱${price.toFixed(2)}`}
    >
      <View style={styles.thumb}>
        <View style={styles.icons}>
          {icons.map((emoji, i) => (
            <Text key={i} style={[styles.icon, { fontSize: iconSize }]}>{emoji}</Text>
          ))}
        </View>
      </View>
      <View style={styles.textArea}>
        <Text style={styles.name} numberOfLines={2}>{name}</Text>
        <Text style={styles.price}>₱{price.toFixed(2)}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: C.surface,
    borderRadius: R.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    aspectRatio: 0.65,
    borderWidth: 1.5,
    borderColor: C.borderDark,
  },
  thumb: {
    width: '100%',
    flex: 3,
    backgroundColor: C.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icons: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 8,
  },
  icon: { lineHeight: 44 },
  textArea: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingBottom: 4,
  },
  name: {
    color: C.textPrimary,
    fontSize: F.sm,
    marginTop: 6,
    textAlign: 'center',
    fontWeight: '600',
    lineHeight: 17,
  },
  price: {
    color: C.pink,
    fontSize: F.sm,
    fontWeight: '700',
    marginTop: 4,
  },
});
