import React, { useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, PanResponder,
  useWindowDimensions, Pressable,
} from 'react-native';
import { C, F, R } from '../constants/theme';
import { useCart } from '../context/CartContext';
import { CartPanel } from './CartPanel';

type Props = {
  onCharge: () => void;
  onMorePayment?: () => void;
};

/**
 * Portrait bottom sheet for the Option H cart. A peek bar pinned to the bottom
 * shows item count + total + Charge; tapping it (or dragging up) expands the full
 * CartPanel. Built on core Animated + PanResponder so no gesture library is needed.
 */
export function CartSheet({ onCharge, onMorePayment }: Props) {
  const { items, bundles, total } = useCart();
  const { height } = useWindowDimensions();
  const sheetHeight = Math.min(height * 0.7, 520);
  const [expanded, setExpanded] = useState(false);
  const translateY = useRef(new Animated.Value(sheetHeight)).current;

  const cartCount = bundles.length + items.reduce((s, i) => s + i.quantity, 0);

  const animateTo = (to: number, onDone?: () => void) => {
    Animated.timing(translateY, {
      toValue: to,
      duration: 220,
      useNativeDriver: true,
    }).start(onDone);
  };

  const open = () => {
    setExpanded(true);
    animateTo(0);
  };
  const close = () => {
    animateTo(sheetHeight, () => setExpanded(false));
  };

  // Drag-down-to-close on the expanded sheet's handle.
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > sheetHeight * 0.3 || g.vy > 0.5) close();
        else animateTo(0);
      },
    })
  ).current;

  // Drag-up-to-open on the collapsed peek bar. The sheet follows the finger as
  // it is pulled up, then settles open or back closed on release.
  const peekPan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy < -6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => setExpanded(true),
      onPanResponderMove: (_, g) => {
        translateY.setValue(Math.max(0, Math.min(sheetHeight, sheetHeight + g.dy)));
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy < -sheetHeight * 0.25 || g.vy < -0.3) animateTo(0);
        else close();
      },
    })
  ).current;

  return (
    <>
      {/* Peek bar — always visible at the bottom in portrait */}
      <View style={styles.peek} {...peekPan.panHandlers}>
        <View style={styles.grabber} />
        <View style={styles.peekRow}>
          <Pressable
            testID="cart-sheet-peek"
            style={styles.peekLeft}
            onPress={open}
            accessibilityRole="button"
            accessibilityLabel="Open current sale"
          >
            <Text style={styles.peekCount}>
              {cartCount > 0 ? `${cartCount} item${cartCount !== 1 ? 's' : ''}` : 'Current Sale'}
            </Text>
            <Text style={styles.peekTotal}>₱{total.toFixed(2)}</Text>
          </Pressable>
          <TouchableOpacity
            testID="cart-sheet-charge"
            style={[styles.peekCharge, cartCount === 0 && styles.peekChargeDisabled]}
            disabled={cartCount === 0}
            onPress={onCharge}
            onLongPress={onMorePayment}
            delayLongPress={350}
          >
            <Text style={styles.peekChargeText}>Cash · Paid</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Expanded sheet + backdrop */}
      {expanded && (
        <Pressable
          testID="cart-sheet-backdrop"
          style={styles.backdrop}
          onPress={close}
        />
      )}
      <Animated.View
        pointerEvents={expanded ? 'auto' : 'none'}
        style={[
          styles.sheet,
          { height: sheetHeight, transform: [{ translateY }] },
        ]}
      >
        <View {...panResponder.panHandlers} style={styles.dragHandleArea}>
          <View style={styles.grabber} />
        </View>
        <CartPanel onCharge={onCharge} onMorePayment={onMorePayment} />
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  peek: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: C.borderDark,
    backgroundColor: C.surface,
  },
  peekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  peekLeft: { flex: 1, gap: 2 },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    alignSelf: 'center',
    marginBottom: 10,
  },
  peekCount: { color: C.textSecondary, fontSize: F.xs, fontWeight: '600' },
  peekTotal: { color: C.textPrimary, fontSize: F.xl, fontWeight: '800' },
  peekCharge: {
    backgroundColor: C.green,
    borderRadius: R.sm,
    paddingVertical: 13,
    paddingHorizontal: 20,
  },
  peekChargeDisabled: { backgroundColor: C.elevated, borderWidth: 1, borderColor: C.border },
  peekChargeText: { color: '#fff', fontSize: F.md, fontWeight: '800' },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: C.bg,
    borderTopLeftRadius: R.xl,
    borderTopRightRadius: R.xl,
    borderWidth: 1,
    borderColor: C.borderDark,
    overflow: 'hidden',
  },
  dragHandleArea: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
});
