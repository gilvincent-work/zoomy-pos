import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View, FlatList, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { ProductTile } from '../components/ProductTile';
import { BundleTile } from '../components/BundleTile';
import { VariantPickerModal } from '../components/VariantPickerModal';
import { CategoryTabs } from '../components/CategoryTabs';
import { SubcategoryFilter } from '../components/SubcategoryFilter';
import { CartPanel } from '../components/CartPanel';
import { CartSheet } from '../components/CartSheet';
import { ConfirmPaymentModal } from '../components/ConfirmPaymentModal';
// Hidden until Phase 2 wires real sync data — see header below. Keep, do not delete.
// import { SyncStatusBar } from '../components/SyncStatusBar';
import { useToast } from '../components/Toast';
import { useCart } from '../context/CartContext';
import {
  getActiveProducts, getCategoriesWithSubcategories, getVariantsByProductId, decrementStock,
  Product, ProductVariant, CategoryGroup,
} from '../db/products';
import { getActivePickBundles, SavedBundle } from '../db/saved-bundles';
import { insertTransaction, type PaymentMethod } from '../db/transactions';
import { quickMethodMeta, DEFAULT_ENABLED_PAYMENT_METHODS } from '../constants/payment';
import { getEnabledPaymentMethods, getConfirmOnPay } from '../db/settings';
import { buildInsertItems } from '../utils/cart-transaction';
import { pushSale } from '../utils/sales-sync';
import { lineEmojis } from '../utils/bundles';
import { emojiGraphemes } from '../constants/emoji';
import {
  filterProducts, subcategoriesFor, defaultSelectionFor, initialSelection,
} from '../utils/catalog-filter';
import { useColumns } from '../hooks/useColumns';
import { subscribeCatalogChanged, pullCatalog } from '../utils/catalog-sync';
import { PullToRefresh } from '../components/PullToRefresh';
import { F, R, type Palette } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';

type Selection = { category: string | null; subcategory: string | null };

/** Synthetic category pill that surfaces saved "buy any N" deals as tiles. */
const BUNDLES_CATEGORY = 'Bundles';

// Tile grid geometry. Tiles keep their column width; their height is what adapts
// so a row fits the screen (short wide tiles on a phone in landscape) instead of
// shrinking into unreadable squares.
const GRID_H_CHROME = 24; // grid horizontal padding (12 * 2)
const GRID_V_CHROME = 44; // grid vertical padding (12 + 24) plus one row margin (8)
const COL_GAP = 8; // gap between tiles in a row
const TILE_ASPECT_PHONE = 0.85; // width / height; more compact on phones
const TILE_ASPECT_TABLET = 0.65; // taller, showcase tiles on larger screens
const MIN_TILE_HEIGHT = 128; // never shrink a tile below a usable height; scroll instead

export default function POSScreen() {
  const { mode, colors, toggle } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  // Layout follows device rotation: landscape pins a side cart, portrait uses a sheet.
  const useSideCart = isLandscape;

  const cartWidth = useSideCart ? Math.min(Math.max(width * 0.36, 300), 400) : width;
  const productPaneWidth = useSideCart ? width - cartWidth : width;
  // Bigger, mobile-friendly tiles: 2 columns in portrait, scaling up on wider panes.
  const { numColumns } = useColumns(
    useSideCart ? productPaneWidth : undefined,
    { tileTarget: 175, minCols: 2 }
  );

  // Tiles keep their column width; the height shrinks to fit the measured grid
  // area so a row is never cut off (e.g. the taller Freeze Dried subcategory row
  // in landscape), while never dropping below a usable height so short screens
  // scroll instead of rendering tiny squares.
  const [gridHeight, setGridHeight] = useState(0);
  const isPhone = Math.min(width, height) < 480;
  const tileAspect = isPhone ? TILE_ASPECT_PHONE : TILE_ASPECT_TABLET;
  const tileWidth = (productPaneWidth - GRID_H_CHROME - (numColumns - 1) * COL_GAP) / numColumns;
  const naturalTileHeight = tileWidth / tileAspect;
  const maxRowHeight = gridHeight > 0 ? gridHeight - GRID_V_CHROME : Infinity;
  const tileHeight = Math.min(naturalTileHeight, Math.max(maxRowHeight, MIN_TILE_HEIGHT));

  const [products, setProducts] = useState<Product[]>([]);
  const [groups, setGroups] = useState<CategoryGroup[]>([]);
  const [pickBundles, setPickBundles] = useState<SavedBundle[]>([]);
  const [sel, setSel] = useState<Selection>({ category: null, subcategory: null });

  const { items, bundles, total, addItem, removeItem, decrementItem, clearCart } = useCart();
  const { showToast } = useToast();

  const [variantProduct, setVariantProduct] = useState<Product | null>(null);
  const [variantList, setVariantList] = useState<ProductVariant[]>([]);

  // Quick payment method for the one-tap Pay button. Cash is the bazaar default;
  // which methods are offered (and their order) comes from Settings -> Payment
  // Options, loaded below.
  const [payMethod, setPayMethod] = useState<PaymentMethod>('cash');
  const [enabledMethods, setEnabledMethods] = useState<PaymentMethod[]>(DEFAULT_ENABLED_PAYMENT_METHODS);
  // Gate the Pay press behind a confirm so a stray tap can't book a sale; also
  // configurable in Settings -> Payment Options.
  const [confirmPay, setConfirmPay] = useState(false);
  const [confirmOnPay, setConfirmOnPay] = useState(true);

  // Re-read Settings -> Payment Options on every focus (a device that just came
  // back from that screen should reflect the change immediately). If the
  // selected method got disabled, fall back to the first enabled one.
  const loadPaymentConfig = useCallback(async () => {
    const [methods, confirm] = await Promise.all([getEnabledPaymentMethods(), getConfirmOnPay()]);
    setEnabledMethods(methods);
    setConfirmOnPay(confirm);
    setPayMethod((cur) => (methods.includes(cur) ? cur : methods[0]));
  }, []);

  const loadCatalog = useCallback(async () => {
    const [prods, grps, deals] = await Promise.all([
      getActiveProducts(),
      getCategoriesWithSubcategories(),
      getActivePickBundles(),
    ]);
    setProducts(prods);
    setGroups(grps);
    setPickBundles(deals);
    // Keep the current category if it still exists, otherwise reset to the
    // default: Bundles when there's an active deal (the bazaar-day promo is
    // what staff want front and center), else the first product line.
    setSel((prev) => {
      const stillValid =
        (prev.category === BUNDLES_CATEGORY && deals.length > 0) ||
        (prev.category && grps.some((g) => g.category === prev.category));
      if (stillValid) return prev;
      return deals.length > 0 ? { category: BUNDLES_CATEGORY, subcategory: null } : initialSelection(grps);
    });
  }, []);

  // Pull-to-refresh: fetch Coop's latest catalog, then re-read local SQLite so a
  // Coop product edit shows up without reloading the PWA. Toast reports the outcome.
  const handlePullRefresh = useCallback(async () => {
    const res = await pullCatalog();
    await loadCatalog();
    if (res === null) {
      showToast({ variant: 'error', title: 'Couldn’t reach Coop', message: 'Still showing the last synced catalog.' });
    } else if (res.updated > 0) {
      showToast({ variant: 'success', title: 'Catalog updated', message: `${res.updated} change${res.updated !== 1 ? 's' : ''} from Coop.` });
    } else {
      showToast({ variant: 'success', title: 'Up to date', message: 'No new changes from Coop.' });
    }
  }, [loadCatalog, showToast]);

  useFocusEffect(
    useCallback(() => {
      loadCatalog();
      loadPaymentConfig();
    }, [loadCatalog, loadPaymentConfig])
  );

  // A catalog pull from Coop (price / listing) updates local SQLite; re-read so
  // the tiles reflect the new prices without waiting for the next screen focus.
  useEffect(() => subscribeCatalogChanged(() => { loadCatalog(); }), [loadCatalog]);

  const showingBundles = sel.category === BUNDLES_CATEGORY;
  const categoryNames = [
    ...(pickBundles.length > 0 ? [BUNDLES_CATEGORY] : []),
    ...groups.map((g) => g.category),
  ];
  const visibleProducts = showingBundles
    ? []
    : filterProducts(products, sel.category, sel.subcategory);
  const subs = showingBundles ? [] : subcategoriesFor(groups, sel.category);

  const getBadge = (productId: number) =>
    items.filter((i) => i.productId === productId).reduce((sum, i) => sum + i.quantity, 0);

  // Shared stock-ceiling check for every "+" surface (tile tap, cart stepper):
  // stock is only a real signal once a product has synced with Coop at least
  // once (sku set) — an unsynced row defaults to 0 and isn't "confirmed empty".
  const canIncrementItem = (productId: number) => {
    const product = products.find((p) => p.id === productId);
    if (!product || !product.sku) return true;
    return product.stock - getBadge(productId) > 0;
  };

  const variantInitialQuantities: Record<number, number> = {};
  if (variantProduct) {
    for (const item of items) {
      if (item.productId === variantProduct.id && item.variantId) {
        variantInitialQuantities[item.variantId] = item.quantity;
      }
    }
  }

  async function handleProductPress(product: Product) {
    if (product.has_variants) {
      const variants = await getVariantsByProductId(product.id);
      setVariantList(variants);
      setVariantProduct(product);
    } else {
      if (!canIncrementItem(product.id)) {
        showToast({
          variant: 'error',
          title: 'No stock left',
          message: `${product.name} is out of stock. Restock it in Coop to sell more.`,
        });
        return;
      }
      addItem({ id: product.id, name: product.name, price: product.price! });
    }
  }

  function handleVariantsDone(
    selections: { variantId: number; variantName: string; price: number; quantity: number }[]
  ) {
    if (variantProduct) {
      removeItem(variantProduct.id);
      for (const s of selections) {
        for (let i = 0; i < s.quantity; i++) {
          addItem({
            id: variantProduct.id,
            name: variantProduct.name,
            price: s.price,
            variantId: s.variantId,
            variantName: s.variantName,
          });
        }
      }
    }
    setVariantProduct(null);
    setVariantList([]);
  }

  // Tapping Pay opens the confirm guard instead of booking immediately, unless
  // that guard is turned off in Settings -> Payment Options.
  function handleRequestPay() {
    if (items.length === 0 && bundles.length === 0) return;
    if (confirmOnPay) {
      setConfirmPay(true);
    } else {
      handleConfirmPay();
    }
  }

  // Confirmed: record the sale with the selected quick method, then push to Coop.
  async function handleConfirmPay() {
    setConfirmPay(false);
    if (items.length === 0 && bundles.length === 0) return;
    const saleTotal = total;
    const saleItems = buildInsertItems(items, bundles);
    const method = payMethod;
    const label = quickMethodMeta(method).label;
    // One shared id for both the local row and the Coop push, so the Transactions
    // merge can dedupe this sale against the copy it pulls back from Coop.
    const clientUuid = Crypto.randomUUID();
    try {
      await insertTransaction({
        total: saleTotal,
        cashTendered: saleTotal,
        change: 0,
        paymentMethod: method,
        isBundle: bundles.length > 0,
        clientUuid,
        items: saleItems,
      });
      // Reflect this sale on the local stock cache right away, so the tile
      // warning is correct on the very next tap — it doesn't wait for the next
      // catalog pull (Coop's own stock already deducted server-side when the
      // sale reaches it; this just keeps this device from reading stale
      // between syncs).
      await decrementStock(saleItems.map((i) => ({ productId: i.productId, quantity: i.quantity })));
      await loadCatalog();
      clearCart();
      showToast({
        variant: 'success',
        title: 'Sale recorded',
        message: `${label} ₱${saleTotal.toFixed(2)} · new sale ready`,
      });
      // Write the sale up to Coop (online-only). Fire in the background so the
      // next sale isn't blocked; warn only if the sync fails (sale is saved locally).
      pushSale({ items: saleItems, subtotal: saleTotal, discount: null, total: saleTotal, paymentMethod: method, clientUuid }).then((res) => {
        if (!res.ok) {
          showToast({
            variant: 'error',
            title: 'Not synced to Coop',
            message: 'Sale saved on this device. Check the connection.',
          });
        }
      });
    } catch {
      showToast({
        variant: 'error',
        title: 'Could not save the sale',
        message: 'Please try again.',
      });
    }
  }

  function handleMorePayment() {
    router.push('/modals/payment');
  }

  const productPane = (
    <View style={styles.productPane}>
      <View style={styles.filters}>
        <CategoryTabs
          categories={categoryNames}
          active={sel.category ?? ''}
          onSelect={(category) =>
            setSel(
              category === BUNDLES_CATEGORY
                ? { category: BUNDLES_CATEGORY, subcategory: null }
                : defaultSelectionFor(groups, category)
            )
          }
        />
        {subs.length > 0 && (
          <SubcategoryFilter
            subcategories={subs}
            active={sel.subcategory}
            onSelect={(subcategory) => setSel((prev) => ({ ...prev, subcategory }))}
          />
        )}
      </View>
      <View
        style={styles.gridArea}
        onLayout={(e) => setGridHeight(e.nativeEvent.layout.height)}
      >
      <PullToRefresh onRefresh={handlePullRefresh}>
      {(scroll) => showingBundles ? (
        <FlatList
          {...scroll}
          key={`bundles-${numColumns}`}
          data={pickBundles}
          keyExtractor={(b) => String(b.id)}
          numColumns={numColumns}
          style={styles.grid_list}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.gridRow}
          renderItem={({ item }) => (
            <View style={[styles.tileWrapper, { maxWidth: tileWidth, height: tileHeight }]}>
              <BundleTile
                id={item.id}
                name={item.name}
                price={item.price}
                lineEmojis={item.emoji ? emojiGraphemes(item.emoji) : lineEmojis(products, item.line_categories ?? [])}
                onPress={() => router.push(`/modals/bundle-select?bundleId=${item.id}`)}
              />
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>No bundle deals yet. Tap the gift icon to add one.</Text>
          }
        />
      ) : (
        <FlatList
          {...scroll}
          key={numColumns}
          data={visibleProducts}
          keyExtractor={(p) => String(p.id)}
          numColumns={numColumns}
          style={styles.grid_list}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.gridRow}
          renderItem={({ item }) => (
            <View style={[styles.tileWrapper, { maxWidth: tileWidth, height: tileHeight }]}>
              <ProductTile
                id={item.id}
                name={item.name}
                price={item.price}
                hasVariants={item.has_variants === 1}
                imageUri={item.image_uri ?? null}
                emoji={item.emoji}
                badgeCount={getBadge(item.id)}
                stock={item.sku ? item.stock : undefined}
                onPress={() => handleProductPress(item)}
                onLongPress={() => removeItem(item.id)}
                onMinus={item.has_variants ? undefined : () => decrementItem(item.id)}
                onRemove={() => removeItem(item.id)}
              />
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {products.length === 0
                ? 'No products yet. Import your SKUs from the Products screen.'
                : 'No treats in this category yet.'}
            </Text>
          }
        />
      )}
      </PullToRefresh>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.brandName}>Zoomy</Text>
          {/* Hidden until Phase 2 (Dexie outbox) wires real last-synced + pending counts.
              Marker shows only placeholder state today ("Synced never"). Keep, do not delete. */}
          {/* <SyncStatusBar /> */}
        </View>
        <View style={styles.headerActions}>
          {/* Scan-to-cart is a deferred feature. Hidden until it ships. Keep, do not delete.
          <TouchableOpacity onPress={() => router.push('/modals/scan')} style={styles.headerBtn} accessibilityLabel="Scan product">
            <Ionicons name="scan-outline" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          */}
          <TouchableOpacity onPress={toggle} style={styles.headerBtn} accessibilityLabel={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
            <Ionicons name={mode === 'dark' ? 'sunny-outline' : 'moon-outline'} size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/modals/bundle')} style={styles.headerBtn} accessibilityLabel="Bundle">
            <Ionicons name="gift-outline" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/modals/products')} style={styles.headerBtn} accessibilityLabel="Products">
            <Ionicons name="cube-outline" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/modals/transactions')} style={styles.headerBtn} accessibilityLabel="Transactions">
            <Ionicons name="receipt-outline" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push({ pathname: '/modals/admin', params: { action: 'settings' } })}
            style={styles.headerBtn}
            accessibilityLabel="Settings"
          >
            <Ionicons name="settings-outline" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      {useSideCart ? (
        <View style={styles.landscape}>
          {productPane}
          <View style={[styles.sidePane, { width: cartWidth }]}>
            <CartPanel
              method={payMethod}
              onMethodChange={setPayMethod}
              enabledMethods={enabledMethods}
              onCharge={handleRequestPay}
              onMorePayment={handleMorePayment}
              canIncrement={canIncrementItem}
              compact
            />
          </View>
        </View>
      ) : (
        <View style={styles.portrait}>
          {productPane}
          <CartSheet
            method={payMethod}
            onMethodChange={setPayMethod}
            enabledMethods={enabledMethods}
            onCharge={handleRequestPay}
            onMorePayment={handleMorePayment}
            canIncrement={canIncrementItem}
          />
        </View>
      )}

      <ConfirmPaymentModal
        visible={confirmPay}
        method={payMethod}
        total={total}
        onConfirm={handleConfirmPay}
        onCancel={() => setConfirmPay(false)}
      />

      <VariantPickerModal
        visible={!!variantProduct}
        productName={variantProduct?.name ?? ''}
        variants={variantList}
        initialQuantities={variantInitialQuantities}
        onDone={handleVariantsDone}
        onClose={() => {
          setVariantProduct(null);
          setVariantList([]);
        }}
      />
    </SafeAreaView>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.borderDark,
  },
  headerLeft: { gap: 4 },
  brandName: { color: c.pink, fontSize: F.xl, fontWeight: '800', letterSpacing: 0.3 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerBtn: {
    padding: 10,
    backgroundColor: c.surface,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: c.borderDark,
  },

  landscape: { flex: 1, flexDirection: 'row' },
  portrait: { flex: 1 },
  productPane: { flex: 1 },
  sidePane: {
    borderLeftWidth: 1,
    borderLeftColor: c.borderDark,
  },

  filters: {
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 8,
  },
  gridArea: { flex: 1 },
  grid_list: { flex: 1 },
  grid: { padding: 12, paddingBottom: 24 },
  gridRow: { gap: 8, marginBottom: 8 },
  tileWrapper: { flex: 1 },

  empty: {
    color: c.textMuted,
    textAlign: 'center',
    marginTop: 60,
    fontSize: F.md,
    lineHeight: 24,
    paddingHorizontal: 24,
  },
});
