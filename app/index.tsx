import React, { useState, useCallback } from 'react';
import {
  View, FlatList, Text, TouchableOpacity, StyleSheet, SafeAreaView, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { ProductTile } from '../components/ProductTile';
import { VariantPickerModal } from '../components/VariantPickerModal';
import { useCart } from '../context/CartContext';
import { getActiveProducts, getVariantsByProductId, Product, ProductVariant } from '../db/products';
import { getSavedBundles, deleteSavedBundle, SavedBundle } from '../db/saved-bundles';
import { Ionicons } from '@expo/vector-icons';
import { C, F, R } from '../constants/theme';

export default function POSScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [savedBundles, setSavedBundles] = useState<SavedBundle[]>([]);
  const { items, bundles, total, addItem, removeItem, decrementItem, addBundle, removeBundle, clearCart, clearBundles } = useCart();

  const [variantPickerProduct, setVariantPickerProduct] = useState<Product | null>(null);
  const [variantPickerVariants, setVariantPickerVariants] = useState<ProductVariant[]>([]);

  useFocusEffect(
    useCallback(() => {
      getActiveProducts().then(setProducts);
      getSavedBundles().then(setSavedBundles);
    }, [])
  );

  const getBadge = (productId: number) =>
    items
      .filter((i) => i.productId === productId)
      .reduce((sum, i) => sum + i.quantity, 0);

  const variantInitialQuantities: Record<number, number> = {};
  if (variantPickerProduct) {
    for (const item of items) {
      if (item.productId === variantPickerProduct.id && item.variantId) {
        variantInitialQuantities[item.variantId] = item.quantity;
      }
    }
  }

  const presetCount = (presetId: number) => bundles.filter((b) => b.presetId === presetId).length;

  const removeOnePreset = (presetId: number) => {
    const instances = bundles.filter((b) => b.presetId === presetId);
    if (instances.length > 0) removeBundle(instances[instances.length - 1].cartId);
  };

  const cartCount = bundles.length + items.reduce((s, i) => s + i.quantity, 0);

  async function handleProductPress(product: Product) {
    if (product.has_variants) {
      const variants = await getVariantsByProductId(product.id);
      setVariantPickerVariants(variants);
      setVariantPickerProduct(product);
    } else {
      addItem({ id: product.id, name: product.name, price: product.price! });
    }
  }

  function handleVariantsDone(selections: { variantId: number; variantName: string; price: number; quantity: number }[]) {
    if (variantPickerProduct) {
      removeItem(variantPickerProduct.id);
      for (const s of selections) {
        for (let i = 0; i < s.quantity; i++) {
          addItem({
            id: variantPickerProduct.id,
            name: variantPickerProduct.name,
            price: s.price,
            variantId: s.variantId,
            variantName: s.variantName,
          });
        }
      }
    }
    setVariantPickerProduct(null);
    setVariantPickerVariants([]);
  }

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

  const hasBundlesInCart = bundles.length > 0;

  const presetRows: typeof savedBundles[] = [];
  for (let i = 0; i < savedBundles.length; i += 3) {
    presetRows.push(savedBundles.slice(i, i + 3));
  }

  const listHeader = savedBundles.length > 0 ? (
    <View style={styles.presetsSection}>
      <View style={styles.presetsHeader}>
        <Text style={styles.presetsLabel}>Bundle Presets</Text>
        {hasBundlesInCart && (
          <TouchableOpacity
            onPress={clearBundles}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.presetsClearText}>Clear All</Text>
          </TouchableOpacity>
        )}
      </View>
      {presetRows.map((row, rowIdx) => (
        <View key={rowIdx} style={styles.presetsGridRow}>
          {row.map((b) => {
            const count = presetCount(b.id);
            const isActive = count > 0;
            return (
              <View key={b.id} style={styles.presetTileWrapper}>
                <TouchableOpacity
                  style={[styles.presetTile, isActive && styles.presetTileActive]}
                  onPress={() => handleSavedBundleTap(b)}
                  onLongPress={() => handleSavedBundleLongPress(b)}
                  activeOpacity={0.7}
                >
                  {isActive && (
                    <View style={styles.presetBadge}>
                      <Text style={styles.presetBadgeText}>{count}</Text>
                    </View>
                  )}
                  <Text style={styles.presetTileName} numberOfLines={3}>
                    {b.name}
                  </Text>
                  <Text style={[styles.presetTilePrice, isActive && styles.presetTilePriceActive]}>
                    ₱{b.price.toFixed(2)}
                  </Text>
                  {isActive && (
                    <TouchableOpacity
                      style={styles.presetMinusBtn}
                      onPress={(e) => {
                        e.stopPropagation();
                        removeOnePreset(b.id);
                      }}
                      activeOpacity={0.7}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={styles.presetMinusBtnText}>−</Text>
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              </View>
            );
          })}
          {row.length < 3 && Array.from({ length: 3 - row.length }).map((_, i) => (
            <View key={`spacer-${i}`} style={styles.presetTileWrapper} />
          ))}
        </View>
      ))}
    </View>
  ) : null;

  const listFooter = bundles.length > 0 ? (
    <View style={styles.cartSummary}>
      <View style={styles.cartSummaryHeader}>
        <Text style={styles.cartSummaryLabel}>Bundles in Cart</Text>
        <TouchableOpacity
          style={styles.clearCartBtn}
          onPress={clearBundles}
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
          {bundle.items.map((item, idx) => (
            <View key={item.variantId ? `${item.id}-${item.variantId}` : `${item.id}-${idx}`} style={styles.cartSummaryRow}>
              <Text style={styles.cartSummaryName}>{item.name}</Text>
              <Text style={styles.cartSummaryQty}>×{item.quantity}</Text>
            </View>
          ))}
        </View>
      ))}
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
          {cartCount > 0 && (
            <TouchableOpacity onPress={clearCart} style={styles.clearAllHeaderBtn}>
              <Text style={styles.clearAllHeaderText}>Clear All</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => router.push('/modals/products')} style={styles.headerBtn}>
            <Ionicons name="cube-outline" size={20} color={C.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/modals/transactions')} style={styles.headerBtn}>
            <Ionicons name="receipt-outline" size={20} color={C.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push({ pathname: '/modals/admin', params: { action: 'settings' } })}
            style={styles.headerBtn}
          >
            <Ionicons name="settings-outline" size={20} color={C.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={products}
        keyExtractor={(p) => String(p.id)}
        numColumns={3}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.gridRow}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        renderItem={({ item }) => (
          <View style={styles.tileWrapper}>
            <ProductTile
              id={item.id}
              name={item.name}
              price={item.price}
              hasVariants={item.has_variants === 1}
              badgeCount={getBadge(item.id)}
              onPress={() => handleProductPress(item)}
              onLongPress={() => removeItem(item.id)}
              onMinus={item.has_variants ? undefined : () => decrementItem(item.id)}
            />
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No products yet.{'\n'}Tap <Ionicons name="cube-outline" size={F.md} color={C.textMuted} /> to add some.</Text>
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

      <VariantPickerModal
        visible={!!variantPickerProduct}
        productName={variantPickerProduct?.name ?? ''}
        variants={variantPickerVariants}
        initialQuantities={variantInitialQuantities}
        onDone={handleVariantsDone}
        onClose={() => {
          setVariantPickerProduct(null);
          setVariantPickerVariants([]);
        }}
      />
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
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  clearAllHeaderBtn: {
    backgroundColor: C.redSubtle,
    borderWidth: 1,
    borderColor: C.redDim,
    borderRadius: R.sm,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  clearAllHeaderText: {
    color: C.red,
    fontSize: F.xs,
    fontWeight: '700',
  },
  headerBtn: {
    padding: 10,
    backgroundColor: C.surface,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: C.borderDark,
  },
  headerIcon: { },

  presetsSection: { marginBottom: 12 },
  presetsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    marginBottom: 8,
  },
  presetsLabel: {
    color: C.textMuted,
    fontSize: F.xs,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  presetsClearText: {
    color: C.red,
    fontSize: F.xs,
    fontWeight: '700',
  },
  presetsGridRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  presetTileWrapper: { flex: 1, maxWidth: '33.33%' },
  presetTile: {
    backgroundColor: C.surface,
    borderRadius: R.md,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
    aspectRatio: 0.9,
    borderWidth: 1.5,
    borderColor: C.red,
  },
  presetTileActive: {
    borderColor: C.red,
    borderWidth: 2,
    backgroundColor: C.redSubtle,
  },
  presetBadge: {
    position: 'absolute',
    top: 7,
    right: 7,
    backgroundColor: C.red,
    borderRadius: 13,
    minWidth: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  presetBadgeText: { color: '#fff', fontSize: F.lg, fontWeight: '800' },
  presetTileName: {
    color: C.textPrimary,
    fontSize: F.sm,
    marginTop: 6,
    textAlign: 'center',
    fontWeight: '600',
    lineHeight: 17,
  },
  presetTilePrice: {
    color: C.red,
    fontSize: F.sm,
    fontWeight: '700',
    marginTop: 4,
  },
  presetTilePriceActive: { color: C.red, opacity: 0.8 },
  presetMinusBtn: {
    position: 'absolute',
    bottom: 7,
    right: 7,
    backgroundColor: C.red,
    borderRadius: 10,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
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
    backgroundColor: C.redSubtle,
    borderWidth: 1,
    borderColor: C.redDim,
    borderRadius: R.sm,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  clearCartBtnText: { color: C.red, fontSize: F.xs, fontWeight: '700' },
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
    backgroundColor: C.redSubtle,
    borderWidth: 1,
    borderColor: C.redDim,
    borderRadius: 8,
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartSummaryRemoveText: { color: C.red, fontSize: 16, fontWeight: '800', lineHeight: 18 },
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

  grid: { padding: 12, paddingBottom: 4 },
  gridRow: { gap: 8, marginBottom: 8 },
  tileWrapper: { flex: 1, maxWidth: '33.33%' },

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
