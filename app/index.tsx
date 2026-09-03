import React, { useState, useCallback } from 'react';
import {
  View, FlatList, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { ProductTile } from '../components/ProductTile';
import { BundleTile } from '../components/BundleTile';
import { VariantPickerModal } from '../components/VariantPickerModal';
import { CategoryTabs } from '../components/CategoryTabs';
import { SubcategoryFilter } from '../components/SubcategoryFilter';
import { CartPanel } from '../components/CartPanel';
import { CartSheet } from '../components/CartSheet';
import { useToast } from '../components/Toast';
import { useCart } from '../context/CartContext';
import {
  getActiveProducts, getCategoriesWithSubcategories, getVariantsByProductId,
  Product, ProductVariant, CategoryGroup,
} from '../db/products';
import { getActivePickBundles, SavedBundle } from '../db/saved-bundles';
import { insertTransaction } from '../db/transactions';
import { buildInsertItems } from '../utils/cart-transaction';
import { lineEmojis } from '../utils/bundles';
import {
  filterProducts, subcategoriesFor, defaultSelectionFor, initialSelection,
} from '../utils/catalog-filter';
import { useColumns } from '../hooks/useColumns';
import { C, F, R } from '../constants/theme';

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

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([
        getActiveProducts(),
        getCategoriesWithSubcategories(),
        getActivePickBundles(),
      ]).then(([prods, grps, deals]) => {
        if (cancelled) return;
        setProducts(prods);
        setGroups(grps);
        setPickBundles(deals);
        // Keep the current category if it still exists, otherwise reset to the first.
        setSel((prev) => {
          const stillValid =
            (prev.category === BUNDLES_CATEGORY && deals.length > 0) ||
            (prev.category && grps.some((g) => g.category === prev.category));
          return stillValid ? prev : initialSelection(grps);
        });
      });
      return () => { cancelled = true; };
    }, [])
  );

  const showingBundles = sel.category === BUNDLES_CATEGORY;
  const categoryNames = [
    ...groups.map((g) => g.category),
    ...(pickBundles.length > 0 ? [BUNDLES_CATEGORY] : []),
  ];
  const visibleProducts = showingBundles
    ? []
    : filterProducts(products, sel.category, sel.subcategory);
  const subs = showingBundles ? [] : subcategoriesFor(groups, sel.category);

  const getBadge = (productId: number) =>
    items.filter((i) => i.productId === productId).reduce((sum, i) => sum + i.quantity, 0);

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

  async function handleInstantCash() {
    if (items.length === 0 && bundles.length === 0) return;
    const saleTotal = total;
    try {
      await insertTransaction({
        total: saleTotal,
        cashTendered: saleTotal,
        change: 0,
        paymentMethod: 'cash',
        isBundle: bundles.length > 0,
        items: buildInsertItems(items, bundles),
      });
      clearCart();
      showToast({
        variant: 'success',
        title: 'Sale recorded',
        message: `Cash ₱${saleTotal.toFixed(2)} · new sale ready`,
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
      {showingBundles ? (
        <FlatList
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
                lineEmojis={lineEmojis(products, item.line_categories ?? [])}
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
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.brandName}>Zoomy</Text>
          <Text style={styles.brandSub}>Point of Sale</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => router.push('/modals/scan')} style={styles.headerBtn} accessibilityLabel="Scan product">
            <Ionicons name="scan-outline" size={20} color={C.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/modals/bundle')} style={styles.headerBtn} accessibilityLabel="Bundle">
            <Ionicons name="gift-outline" size={20} color={C.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/modals/products')} style={styles.headerBtn} accessibilityLabel="Products">
            <Ionicons name="cube-outline" size={20} color={C.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/modals/transactions')} style={styles.headerBtn} accessibilityLabel="Transactions">
            <Ionicons name="receipt-outline" size={20} color={C.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      {useSideCart ? (
        <View style={styles.landscape}>
          {productPane}
          <View style={[styles.sidePane, { width: cartWidth }]}>
            <CartPanel onCharge={handleInstantCash} onMorePayment={handleMorePayment} compact />
          </View>
        </View>
      ) : (
        <View style={styles.portrait}>
          {productPane}
          <CartSheet onCharge={handleInstantCash} onMorePayment={handleMorePayment} />
        </View>
      )}

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
  headerBtn: {
    padding: 10,
    backgroundColor: C.surface,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: C.borderDark,
  },

  landscape: { flex: 1, flexDirection: 'row' },
  portrait: { flex: 1 },
  productPane: { flex: 1 },
  sidePane: {
    borderLeftWidth: 1,
    borderLeftColor: C.borderDark,
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
    color: C.textMuted,
    textAlign: 'center',
    marginTop: 60,
    fontSize: F.md,
    lineHeight: 24,
    paddingHorizontal: 24,
  },
});
