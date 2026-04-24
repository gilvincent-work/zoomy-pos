import React from 'react';
import { TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import { C, F, R } from '../constants/theme';

type Props = {
  id: number;
  name: string;
  price?: number | null;
  hasVariants?: boolean;
  badgeCount: number;
  onPress: (id: number) => void;
  onLongPress: (id: number) => void;
  onMinus?: (id: number) => void;
};

export function ProductTile({ id, name, price, hasVariants, badgeCount, onPress, onLongPress, onMinus }: Props) {
  const active = badgeCount > 0;
  return (
    <TouchableOpacity
      testID="tile"
      style={[styles.tile, active && styles.tileActive]}
      onPress={() => onPress(id)}
      onLongPress={() => onLongPress(id)}
      activeOpacity={0.7}
    >
      {active && (
        <View style={styles.badge}>
          <Text style={styles.badgeText} testID="badge">{badgeCount}</Text>
        </View>
      )}
      <Text style={styles.name} numberOfLines={3}>{name}</Text>
      {!hasVariants && price != null && (
        <Text style={styles.price}>₱{price.toFixed(2)}</Text>
      )}
      {active && onMinus && (
        <TouchableOpacity
          testID="minus-btn"
          style={styles.minusBtn}
          onPress={(e) => {
            e.stopPropagation();
            onMinus(id);
          }}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.minusText}>−</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: C.surface,
    borderRadius: R.md,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
    aspectRatio: 0.9,
    borderWidth: 1.5,
    borderColor: C.borderDark,
  },
  tileActive: {
    borderColor: C.pink,
    backgroundColor: C.pinkSubtle,
  },
  badge: {
    position: 'absolute',
    top: 7,
    right: 7,
    backgroundColor: C.pink,
    borderRadius: 10,
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: { color: '#fff', fontSize: F.sm, fontWeight: '800' },
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
  minusBtn: {
    position: 'absolute',
    bottom: 7,
    right: 7,
    backgroundColor: C.pink,
    borderRadius: 10,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  minusText: { color: '#fff', fontSize: 18, fontWeight: '800', lineHeight: 20 },
});
