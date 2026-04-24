import React, { useState, useCallback } from 'react';
import {
  View, FlatList, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCart } from '../context/CartContext';
import { getActiveProducts, Product } from '../db/products';
import { getSavedBundles, deleteSavedBundle, SavedBundle } from '../db/saved-bundles';
import { C, F, R } from '../constants/theme';

export default function POSScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [savedBundles, setSavedBundles] = useState<SavedBundle[]>([]);
  const { items, bundles, total, addItem, decrementItem, addBundle, removeBundle, clearCart } = useCart();

  useFocusEffect(
    useCallback(() => {
      getActiveProducts().then(setProducts);
      getSavedBundles().then(setSavedBundles);
    }, [])
  );

  const getBadge = (productId: number) =>
    items.find((i) => i.productId === productId)?.quantity ?? 0;

  const presetCount = (presetId: number) => bundles.filter((b) => b.presetId === presetId).length;

  const removeOnePreset = (presetId: number) => {
    const instances = bundles.filter((b) => b.presetId === presetId);
    if (instances.length > 0) removeBundle(instances[instances.length - 1].cartId);
  };

  const cartCount = bundles.length + items.reduce((s, i) => s + i.quantity, 0);

  function handleSavedBundleTap(bundle: SavedBundle) {
    addBundle({ presetId: bundle.id, name: bundle.name, price: bundle.price, items: bundle.items });
  }

  function handleSavedBundleLongPress(bundle: SavedBundle) {
    Alert.alert(
      'Delete Preset',
      `Remove "${bundle.name}" from presets?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteSavedBundle(bundle.id);
            setSavedBundles((prev) => prev.filter((b) => b.id !== bundle.id));
          },
        },
      ]
    );
  }

  function handleBundleButtonPress() {
    router.push('/modals/bundle');
  }

  const listFooter = (savedBundles.length > 0 || cartCount > 0) ? (
    <View>
      {/* Bundle Presets */}
      {savedBundles.length > 0 && (
        <View style={styles.presetsSection}>
          <Text style={styles.presetsLabel}>Bundle Presets</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.presetsRow}
          >
            {savedBundles.map((b) => {
              const count = presetCount(b.id);
              const isActive = count > 0;
              return (
                <View key={b.id} style={styles.presetChipWrapper}>
                  <TouchableOpacity
                    style={[styles.presetChip, isActive && styles.presetChipActive]}
                    onPress={() => handleSavedBundleTap(b)}
                    onLongPress={() => handleSavedBundleLongPress(b)}
                    activeOpacity={0.7}
                  >
                    {isActive && (
                      <View style={styles.presetBadge}>
                        <Text style={styles.presetBadgeText}>{count}</Text>
                      </View>
                    )}
                    <Text style={[styles.presetChipName, isActive && styles.presetChipNameActive]}>
                      {b.name}
                    </Text>
                    <Text style={[styles.presetChipPrice, isActive && styles.presetChipPriceActive]}>
                      ₱{b.price.toFixed(2)}
                    </Text>
                  </TouchableOpacity>
                  {isActive && (
                    <TouchableOpacity
                      style={styles.presetMinusBtn}
                      onPress={() => removeOnePreset(b.id)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.presetMinusBtnText}>−</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Cart Summary — bundles only (individual items show inline in the product list) */}
      {bundles.length > 0 && (
        <View style={styles.cartSummary}>
          <View style={styles.cartSummaryHeader}>
            <Text style={styles.cartSummaryLabel}>Bundles in Cart</Text>
            <TouchableOpacity
              style={styles.clearCartBtn}
              onPress={clearCart}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.clearCartBtnText}>Clear All</Text>
            </TouchableOpacity>
          </View>

          {bundles.map((bundle, idx) => (
            <View key={bundle.cartId}>
              {idx > 0 && <View style={styles.cartSummaryBundleSep} />}
              <View style={styles.cartSummaryBundleHeader}>
                <Text style={styles.cartSummaryBundleTag}>Bundle</Text>
                <View style={styles.cartSummaryBundleRight}>
                  <Text style={styles.cartSummaryBundlePrice}>₱{bundle.price.toFixed(2)}</Text>
                  <TouchableOpacity
                    style={styles.cartSummaryRemoveBtn}
                    onPress={() => removeBundle(bundle.cartId)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.cartSummaryRemoveText}>−</Text>
                  </TouchableOpacity>
                </View>
              </View>
              {bundle.items.map((item) => (
                <View key={item.id} style={styles.cartSummaryRow}>
                  <Text style={styles.cartSummaryName}>{item.name}</Text>
                  <Text style={styles.cartSummaryQty}>×{item.quantity}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      )}
    </View>
  ) : null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.brandName}>Zoomy</Text>
          <Text style={styles.brandSub}>Point of Sale</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => router.push('/modals/products')} style={styles.headerBtn}>
            <Text style={styles.headerIcon}>📦</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/modals/transactions')} style={styles.headerBtn}>
            <Text style={styles.headerIcon}>🧾</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push({ pathname: '/modals/admin', params: { action: 'settings' } })}
            style={styles.headerBtn}
          >
            <Text style={styles.headerIcon}>⚙️</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={products}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={styles.productList}
        ListFooterComponent={listFooter}
        renderItem={({ item }) => {
          const qty = getBadge(item.id);
          return (
            <View style={[styles.productRow, qty > 0 && styles.productRowActive]}>
              <Text style={styles.productEmoji}>{item.emoji}</Text>
              <Text style={styles.productName}>{item.name}</Text>
              <View style={styles.productStepper}>
                <TouchableOpacity
                  style={[styles.stepBtn, qty === 0 && styles.stepBtnDim]}
                  onPress={() => decrementItem(item.id)}
                  disabled={qty === 0}
                >
                  <Text style={[styles.stepIcon, qty === 0 && styles.stepIconDim]}>−</Text>
                </TouchableOpacity>
                <Text style={[styles.stepQty, qty > 0 && styles.stepQtyActive]}>{qty}</Text>
                <TouchableOpacity
                  style={styles.stepBtn}
                  onPress={() => addItem({ id: item.id, name: item.name, price: item.price })}
                >
                  <Text style={styles.stepIcon}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.empty}>No products yet.{'\n'}Tap 📦 to add some.</Text>
        }
      />

      <View style={styles.footer}>
        <View style={styles.footerLeft}>
          {cartCount > 0 && (
            <Text style={styles.cartCount}>{cartCount} item{cartCount !== 1 ? 's' : ''}</Text>
          )}
          <Text style={styles.total}>₱{total.toFixed(2)}</Text>
        </View>
        <View style={styles.footerActions}>
          <TouchableOpacity style={styles.bundleBtn} onPress={handleBundleButtonPress}>
            <Text style={styles.bundleBtnText}>Bundle</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chargeBtn, items.length === 0 && bundles.length === 0 && styles.chargeBtnDisabled]}
            disabled={items.length === 0 && bundles.length === 0}
            onPress={() => router.push('/modals/payment')}
          >
            <Text style={styles.chargeBtnText}>Charge</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.borderDark,
  },
  headerLeft: { gap: 1 },
  brandName: { color: C.pink, fontSize: F.xl, fontWeight: '800', letterSpacing: 0.3 },
  brandSub: { color: C.textMuted, fontSize: F.xs, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' },
  headerActions: { flexDirection: 'row', gap: 4 },
  headerBtn: {
    padding: 10,
    backgroundColor: C.surface,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: C.borderDark,
  },
  headerIcon: { fontSize: 20 },

  presetsSection: { marginBottom: 4 },
  presetsLabel: {
    color: C.textMuted,
    fontSize: F.xs,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    paddingHorizontal: 2,
    marginBottom: 8,
  },
  presetsRow: { gap: 8, paddingBottom: 12 },
  presetChipWrapper: { position: 'relative' },
  presetChip: {
    backgroundColor: C.pinkSubtle,
    borderWidth: 1.5,
    borderColor: C.pinkDim,
    borderRadius: R.md,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 2,
  },
  presetChipActive: {
    borderColor: C.pink,
    borderWidth: 2,
    backgroundColor: C.pinkSubtle,
  },
  presetBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: C.pink,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    borderWidth: 2,
    borderColor: C.bg,
  },
  presetBadgeText: { color: '#fff', fontSize: F.xs, fontWeight: '800' },
  presetChipName: { color: C.pink, fontSize: F.sm, fontWeight: '800' },
  presetChipNameActive: { color: C.pink },
  presetChipPrice: { color: C.textSecondary, fontSize: F.xs, fontWeight: '600' },
  presetChipPriceActive: { color: C.pink, opacity: 0.8 },
  presetMinusBtn: {
    position: 'absolute',
    bottom: -10,
    alignSelf: 'center',
    left: '50%',
    transform: [{ translateX: -12 }],
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: C.pink,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: C.bg,
  },
  presetMinusBtnText: { color: '#fff', fontSize: 18, fontWeight: '800', lineHeight: 20 },

  cartSummary: {
    marginTop: 8,
    marginBottom: 8,
    backgroundColor: C.surface,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.borderDark,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  cartSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cartSummaryLabel: {
    color: C.textMuted,
    fontSize: F.xs,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  clearCartBtn: {
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.sm,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  clearCartBtnText: { color: C.textSecondary, fontSize: F.xs, fontWeight: '700' },
  cartSummaryBundleSep: {
    height: 1,
    backgroundColor: C.borderDark,
    marginVertical: 8,
  },
  cartSummaryBundleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  cartSummaryBundleTag: {
    color: C.pink,
    fontSize: F.xs,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    backgroundColor: C.pinkSubtle,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: C.pinkDim,
  },
  cartSummaryBundleRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cartSummaryBundlePrice: {
    color: C.textSecondary,
    fontSize: F.sm,
    fontWeight: '700',
  },
  cartSummaryRemoveBtn: {
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartSummaryRemoveText: { color: C.textSecondary, fontSize: 16, fontWeight: '800', lineHeight: 18 },
  cartSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: C.borderDark,
  },
  cartSummaryName: {
    color: C.textPrimary,
    fontSize: F.sm,
    fontWeight: '500',
    flex: 1,
  },
  cartSummaryQty: {
    color: C.textSecondary,
    fontSize: F.sm,
    fontWeight: '700',
  },
  cartSummaryDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
    gap: 8,
  },
  cartSummaryDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: C.borderDark,
  },
  cartSummaryDividerLabel: {
    color: C.textMuted,
    fontSize: F.xs,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },

  productList: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 14,
    backgroundColor: C.surface,
    borderRadius: R.sm,
    marginBottom: 6,
    borderWidth: 1.5,
    borderColor: C.borderDark,
  },
  productRowActive: {
    borderColor: C.pink,
    backgroundColor: C.pinkSubtle,
  },
  productEmoji: { fontSize: 22, marginRight: 12 },
  productName: { flex: 1, color: C.textPrimary, fontSize: F.md, fontWeight: '600' },
  productStepper: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  stepBtn: {
    width: 34,
    height: 34,
    borderRadius: R.sm,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnDim: { borderColor: C.borderDark },
  stepIcon: { color: C.textPrimary, fontSize: F.lg, fontWeight: '700', lineHeight: 20 },
  stepIconDim: { color: C.textMuted },
  stepQty: {
    width: 34,
    textAlign: 'center',
    color: C.textSecondary,
    fontSize: F.md,
    fontWeight: '700',
  },
  stepQtyActive: { color: C.pink },

  empty: {
    color: C.textMuted,
    textAlign: 'center',
    marginTop: 80,
    fontSize: F.md,
    lineHeight: 24,
  },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: C.borderDark,
    backgroundColor: C.surface,
    gap: 12,
  },
  footerLeft: { flex: 1, gap: 2 },
  cartCount: { color: C.textSecondary, fontSize: F.sm, fontWeight: '600' },
  total: { color: C.textPrimary, fontSize: F.xxl, fontWeight: '800' },

  footerActions: { flexDirection: 'row', gap: 8 },

  bundleBtn: {
    backgroundColor: C.elevated,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: C.border,
  },
  bundleBtnText: { color: C.textSecondary, fontWeight: '700', fontSize: F.md },

  chargeBtn: {
    backgroundColor: C.red,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: R.sm,
  },
  chargeBtnDisabled: { backgroundColor: C.elevated, borderWidth: 1, borderColor: C.border },
  chargeBtnText: { color: '#fff', fontWeight: '800', fontSize: F.lg },
});
