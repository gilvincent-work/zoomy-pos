import React from 'react';
import { TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import { C, F, R } from '../constants/theme';

type Props = {
  id: number;
  name: string;
  price: number;
  pickCount: number;
  lineSummary: string;
  onPress: (id: number) => void;
};

/**
 * A "buy any N" deal shown in the POS Bundles category. Tapping it opens the
 * flavor picker. Styled as a deal: pink-rimmed with a gift glyph.
 */
export function BundleTile({ id, name, price, pickCount, lineSummary, onPress }: Props) {
  return (
    <TouchableOpacity
      testID="bundle-tile"
      style={styles.tile}
      onPress={() => onPress(id)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ₱${price.toFixed(2)}, pick any ${pickCount}`}
    >
      <View style={styles.thumb}>
        <Text style={styles.emoji}>🎁</Text>
      </View>
      <View style={styles.textArea}>
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
        <Text style={styles.price}>₱{price.toFixed(2)}</Text>
        <Text style={styles.sub} numberOfLines={2}>Any {pickCount} · {lineSummary}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: C.pinkSubtle,
    borderRadius: R.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    aspectRatio: 0.65,
    borderWidth: 1.5,
    borderColor: C.pink,
  },
  thumb: {
    width: '100%',
    flex: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 40, lineHeight: 46 },
  textArea: {
    flex: 1.4,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingBottom: 6,
  },
  name: {
    color: C.textPrimary,
    fontSize: F.sm,
    marginTop: 4,
    textAlign: 'center',
    fontWeight: '700',
  },
  price: {
    color: C.pink,
    fontSize: F.md,
    fontWeight: '800',
    marginTop: 2,
  },
  sub: {
    color: C.textSecondary,
    fontSize: F.xs,
    textAlign: 'center',
    marginTop: 3,
    lineHeight: 14,
  },
});
