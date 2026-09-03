import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, F, R } from '../constants/theme';
import { useCart } from '../context/CartContext';

type Props = {
  /** One-tap instant cash: record the sale as paid-in-cash. */
  onCharge: () => void;
  /** Secondary path to the full payment modal (GCash QR, change, receipt photo). */
  onMorePayment?: () => void;
  /** Compact spacing for the narrow landscape side pane. */
  compact?: boolean;
};

/**
 * The shared "Current Sale" panel for Option H. Renders line items (with − qty +
 * steppers) and bundles, the running total, and a one-tap cash button. Reads and
 * writes the same CartContext the product grid uses, so it stays in sync automatically.
 */
export function CartPanel({ onCharge, onMorePayment, compact }: Props) {
  const { items, bundles, total, addItem, decrementItem, removeLine, removeBundle } = useCart();
  const isEmpty = items.length === 0 && bundles.length === 0;
  // On a short viewport (landscape phone) the fixed total + Charge block crowds
  // the receipt, so tighten those and give the scrolling lines more room.
  const { height } = useWindowDimensions();
  const tight = height < 500;

  return (
    <View style={styles.container}>
      <View style={[styles.header, tight && styles.headerTight]}>
        <Text style={styles.headerLabel}>Current Sale</Text>
      </View>

      <ScrollView
        style={styles.lines}
        contentContainerStyle={styles.linesContent}
        showsVerticalScrollIndicator={false}
      >
        {isEmpty ? (
          <Text style={styles.empty}>Tap treats to build the receipt.</Text>
        ) : (
          <>
            {items.map((item) => {
              const key = item.variantId ? `${item.productId}-${item.variantId}` : `${item.productId}`;
              const lineTotal = item.price * item.quantity;
              return (
                <View key={key} style={styles.line}>
                  <View style={styles.lineInfo}>
                    <Text style={styles.lineName} numberOfLines={1}>
                      {item.productName}
                      {item.variantName ? ` · ${item.variantName}` : ''}
                    </Text>
                    <Text style={styles.lineUnit}>₱{item.price.toFixed(2)} each</Text>
                  </View>
                  <View style={styles.stepper}>
                    <TouchableOpacity
                      testID={`cart-minus-${key}`}
                      style={styles.stepBtn}
                      onPress={() => decrementItem(item.productId, item.variantId)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Text style={styles.stepMinus}>−</Text>
                    </TouchableOpacity>
                    <Text style={styles.stepQty}>{item.quantity}</Text>
                    <TouchableOpacity
                      testID={`cart-plus-${key}`}
                      style={[styles.stepBtn, styles.stepPlus]}
                      onPress={() =>
                        addItem({
                          id: item.productId,
                          name: item.productName,
                          price: item.price,
                          variantId: item.variantId,
                          variantName: item.variantName,
                        })
                      }
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Text style={styles.stepPlusText}>+</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.lineTotal}>₱{lineTotal.toFixed(2)}</Text>
                  <TouchableOpacity
                    testID={`cart-remove-${key}`}
                    style={styles.removeBtn}
                    onPress={() => removeLine(item.productId, item.variantId)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel={`Remove ${item.productName}`}
                  >
                    <Ionicons name="trash-outline" size={16} color={C.textMuted} />
                  </TouchableOpacity>
                </View>
              );
            })}

            {bundles.map((bundle) => (
              <View key={bundle.cartId} style={styles.line}>
                <View style={styles.lineInfo}>
                  <Text style={styles.lineName} numberOfLines={1}>
                    <Text style={styles.bundleTag}>Bundle · </Text>
                    {bundle.name}
                  </Text>
                  <Text style={styles.lineUnit} numberOfLines={1}>
                    {bundle.items.map((i) => `${i.name}×${i.quantity}`).join(', ')}
                  </Text>
                </View>
                <TouchableOpacity
                  testID={`cart-bundle-remove-${bundle.cartId}`}
                  style={[styles.stepBtn, styles.bundleRemove]}
                  onPress={() => removeBundle(bundle.cartId)}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text style={styles.stepMinus}>−</Text>
                </TouchableOpacity>
                <Text style={styles.lineTotal}>₱{bundle.price.toFixed(2)}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      <View style={[styles.footer, compact && styles.footerCompact, tight && styles.footerTight]}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={[styles.totalValue, tight && styles.totalValueTight]}>₱{total.toFixed(2)}</Text>
        </View>
        <TouchableOpacity
          testID="cart-charge"
          style={[styles.charge, isEmpty && styles.chargeDisabled, tight && styles.chargeTight]}
          disabled={isEmpty}
          onPress={onCharge}
          onLongPress={onMorePayment}
          delayLongPress={350}
          activeOpacity={0.85}
        >
          <Text style={styles.chargeText}>💵  Cash · Paid</Text>
        </TouchableOpacity>
        {onMorePayment && (
          <TouchableOpacity
            testID="cart-more-payment"
            style={styles.moreBtn}
            onPress={onMorePayment}
            disabled={isEmpty}
          >
            <Text style={[styles.moreText, isEmpty && styles.moreTextDisabled]}>
              GCash / other · change
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerTight: { paddingTop: 6, paddingBottom: 4 },
  headerLabel: {
    color: C.textMuted,
    fontSize: F.xs,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  lines: { flex: 1 },
  linesContent: { paddingHorizontal: 12, paddingBottom: 8, gap: 8 },
  empty: {
    color: C.textMuted,
    fontSize: F.sm,
    paddingVertical: 24,
    paddingHorizontal: 4,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: C.borderDark,
  },
  lineInfo: { flex: 1, minWidth: 0, gap: 2 },
  lineName: { color: C.textPrimary, fontSize: F.sm, fontWeight: '600' },
  lineUnit: { color: C.textMuted, fontSize: F.xs },
  bundleTag: { color: C.pink, fontWeight: '800' },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 999,
    overflow: 'hidden',
  },
  stepBtn: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepPlus: { backgroundColor: C.pink },
  stepMinus: { color: C.red, fontSize: 18, fontWeight: '800', lineHeight: 20 },
  stepPlusText: { color: '#fff', fontSize: 18, fontWeight: '800', lineHeight: 20 },
  stepQty: {
    minWidth: 26,
    textAlign: 'center',
    color: C.textPrimary,
    fontSize: F.sm,
    fontWeight: '800',
  },
  bundleRemove: {
    borderWidth: 1,
    borderColor: C.redDim,
    backgroundColor: C.redSubtle,
    borderRadius: 8,
    width: 26,
    height: 26,
  },
  lineTotal: {
    color: C.textPrimary,
    fontSize: F.sm,
    fontWeight: '800',
    minWidth: 56,
    textAlign: 'right',
  },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: C.borderDark,
    padding: 14,
    gap: 10,
    backgroundColor: C.surface,
  },
  footerCompact: { padding: 12, gap: 8 },
  footerTight: { padding: 10, gap: 6 },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  totalLabel: { color: C.textSecondary, fontSize: F.sm, fontWeight: '700' },
  totalValue: { color: C.textPrimary, fontSize: F.xxl, fontWeight: '800' },
  totalValueTight: { fontSize: F.xl },
  charge: {
    backgroundColor: C.green,
    borderRadius: R.md,
    paddingVertical: 15,
    alignItems: 'center',
  },
  chargeTight: { paddingVertical: 10 },
  chargeDisabled: { backgroundColor: C.elevated, borderWidth: 1, borderColor: C.border },
  chargeText: { color: '#fff', fontSize: F.lg, fontWeight: '800' },
  moreBtn: { alignItems: 'center', paddingVertical: 4 },
  moreText: { color: C.textSecondary, fontSize: F.xs, fontWeight: '700' },
  moreTextDisabled: { color: C.textMuted },
});
