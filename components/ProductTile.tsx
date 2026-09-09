import React, { useMemo } from 'react';
import { TouchableOpacity, Text, View, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { F, R, type Palette } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';

type Props = {
  id: number;
  name: string;
  price?: number | null;
  hasVariants?: boolean;
  imageUri?: string | null;
  emoji?: string | null;
  badgeCount: number;
  /** Cached Coop stock (Product.stock). Omit to skip the low/oversold warning
   *  (e.g. no stock signal yet, or not meaningful — variant products, where
   *  stock isn't tracked per variant). */
  stock?: number;
  onPress: (id: number) => void;
  onLongPress: (id: number) => void;
  onMinus?: (id: number) => void;
  /** Clears the whole item (all quantity). When set, a clear button shows on the active tile. */
  onRemove?: (id: number) => void;
};

export function ProductTile({ id, name, price, hasVariants, imageUri, emoji, badgeCount, stock, onPress, onLongPress, onMinus, onRemove }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const active = badgeCount > 0;
  // Non-blocking stock warning: the cashier can still ring it up, but sees a
  // heads-up once the quantity in the cart meets or passes what's on hand.
  // Variant products have no per-variant stock, so they're excluded.
  const stockKnown = !hasVariants && stock != null && active;
  const isOversold = stockKnown && stock! < badgeCount;
  const isLastStock = stockKnown && !isOversold && stock === badgeCount;
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
      {(isOversold || isLastStock) && (
        <View
          style={[styles.stockWarning, isOversold ? styles.stockWarningOversold : styles.stockWarningLast]}
          testID="stock-warning"
        >
          <Text style={styles.stockWarningText} numberOfLines={1}>
            {isOversold ? 'Oversold' : 'Last stock'}
          </Text>
        </View>
      )}
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
    borderColor: c.borderDark,
  },
  tileActive: {
    borderColor: c.pink,
    backgroundColor: c.pinkSubtle,
  },
  photo: {
    width: '100%',
    flex: 3,
  },
  emojiThumb: {
    width: '100%',
    flex: 3,
    backgroundColor: c.elevated,
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
    backgroundColor: c.pink,
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
    backgroundColor: c.pink,
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
  // Non-blocking stock heads-up, pinned along the tile's bottom edge so it never
  // collides with the top-corner qty/clear controls. Oversold reuses the app's
  // red (already "bad"/destructive elsewhere); last-stock uses a plain amber —
  // there's no warning token in the palette, so this is a literal color.
  stockWarning: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    elevation: 4,
  },
  stockWarningLast: { backgroundColor: '#f5a524' },
  stockWarningOversold: { backgroundColor: c.red },
  stockWarningText: { color: '#fff', fontSize: F.xs, fontWeight: '800', letterSpacing: 0.3 },
  name: {
    color: c.textPrimary,
    fontSize: F.sm,
    marginTop: 6,
    textAlign: 'center',
    fontWeight: '600',
    lineHeight: 17,
  },
  price: {
    color: c.pink,
    fontSize: F.sm,
    fontWeight: '700',
    marginTop: 4,
  },
});
