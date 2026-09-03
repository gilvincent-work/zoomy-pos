import React from 'react';
import { TouchableOpacity, Text, View, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, F, R } from '../constants/theme';

type Props = {
  id: number;
  name: string;
  price?: number | null;
  hasVariants?: boolean;
  imageUri?: string | null;
  emoji?: string | null;
  badgeCount: number;
  onPress: (id: number) => void;
  onLongPress: (id: number) => void;
  onMinus?: (id: number) => void;
  /** Clears the whole item (all quantity). When set, a clear button shows on the active tile. */
  onRemove?: (id: number) => void;
};

export function ProductTile({ id, name, price, hasVariants, imageUri, emoji, badgeCount, onPress, onLongPress, onMinus, onRemove }: Props) {
  const active = badgeCount > 0;
  return (
    <TouchableOpacity
      testID="tile"
      style={[styles.tile, active && styles.tileActive]}
      onPress={() => onPress(id)}
      onLongPress={() => onLongPress(id)}
      activeOpacity={0.7}
    >
      {imageUri ? (
        <>
          <Image source={{ uri: imageUri }} style={styles.photo} resizeMode="cover" />
          <View style={styles.textArea}>
            <Text style={styles.name} numberOfLines={2}>{name}</Text>
            {!hasVariants && price != null && (
              <Text style={styles.price}>₱{price.toFixed(2)}</Text>
            )}
          </View>
        </>
      ) : emoji ? (
        <>
          <View style={styles.emojiThumb}>
            <Text style={styles.emojiText}>{emoji}</Text>
          </View>
          <View style={styles.textArea}>
            <Text style={styles.name} numberOfLines={2}>{name}</Text>
            {!hasVariants && price != null && (
              <Text style={styles.price}>₱{price.toFixed(2)}</Text>
            )}
          </View>
        </>
      ) : (
        <View style={styles.noImageContent}>
          <Text style={styles.name} numberOfLines={3}>{name}</Text>
          {!hasVariants && price != null && (
            <Text style={styles.price}>₱{price.toFixed(2)}</Text>
          )}
        </View>
      )}
      {active && onRemove && (
        <TouchableOpacity
          testID="remove-btn"
          style={styles.clearBtn}
          onPress={(e) => {
            e?.stopPropagation?.();
            onRemove(id);
          }}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel={`Remove all ${name}`}
        >
          <Ionicons name="close" size={16} color="#fff" />
        </TouchableOpacity>
      )}
      {active && (onMinus ? (
        <View style={styles.qtyControl}>
          <TouchableOpacity
            testID="minus-btn"
            style={styles.qtyMinus}
            onPress={(e) => {
              e?.stopPropagation?.();
              onMinus(id);
            }}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 6 }}
          >
            <Text style={styles.qtyMinusText}>−</Text>
          </TouchableOpacity>
          <Text style={styles.qtyCount} testID="badge">{badgeCount}</Text>
        </View>
      ) : (
        <View style={styles.badge}>
          <Text style={styles.badgeText} testID="badge">{badgeCount}</Text>
        </View>
      ))}
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
    width: '100%',
    height: '100%',
    borderWidth: 1.5,
    borderColor: C.borderDark,
  },
  tileActive: {
    borderColor: C.pink,
    backgroundColor: C.pinkSubtle,
  },
  photo: {
    width: '100%',
    flex: 3,
  },
  emojiThumb: {
    width: '100%',
    flex: 3,
    backgroundColor: C.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiText: { fontSize: 40, lineHeight: 46 },
  textArea: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingBottom: 4,
  },
  noImageContent: {
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 7,
    right: 7,
    backgroundColor: C.pink,
    borderRadius: 13,
    minWidth: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    zIndex: 10,
    elevation: 4,
  },
  badgeText: { color: '#fff', fontSize: F.lg, fontWeight: '800' },
  // Active-tile control: minus + live count, grouped top-right over the empty
  // thumbnail corner so it never overlaps the name/price band.
  qtyControl: {
    position: 'absolute',
    top: 7,
    right: 7,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.pink,
    borderRadius: 16,
    height: 32,
    paddingLeft: 3,
    paddingRight: 11,
    gap: 3,
    zIndex: 10,
    elevation: 4,
  },
  qtyMinus: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  qtyMinusText: { color: '#fff', fontSize: 19, fontWeight: '800', lineHeight: 21 },
  // Clear-whole-item control, top-left so it never sits next to the decrement pill.
  clearBtn: {
    position: 'absolute',
    top: 7,
    left: 7,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 10,
    elevation: 4,
  },
  qtyCount: {
    color: '#fff',
    fontSize: F.md,
    fontWeight: '800',
    minWidth: 15,
    textAlign: 'center',
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
