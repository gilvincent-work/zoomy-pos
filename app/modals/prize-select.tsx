import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, SafeAreaView, StyleSheet,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { F, R, type Palette } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../components/Toast';
import { CategoryTabs } from '../../components/CategoryTabs';
import { SubcategoryFilter } from '../../components/SubcategoryFilter';
import { getActiveProducts, getCategoriesWithSubcategories, type Product, type CategoryGroup } from '../../db/products';
import {
  filterProducts, subcategoriesFor, defaultSelectionFor, initialSelection,
} from '../../utils/catalog-filter';
import { useCart } from '../../context/CartContext';

type Selection = { category: string | null; subcategory: string | null };

/**
 * Prize picker: the fast path to a spin-a-wheel free item. Reuses the main grid's
 * Product Line tabs + subcategory filter to narrow the catalog, then a tap adds
 * the chosen treat to the cart as a free prize line (addPrize) — ₱0, excluded
 * from the total, recorded separately as a prize at checkout, exactly like the
 * per-cart-line gift toggle. See app/index.tsx (Prize category) and CartContext.
 */
export default function PrizeSelectModal() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { showToast } = useToast();
  const { items, addPrize } = useCart();

  const [products, setProducts] = useState<Product[]>([]);
  const [groups, setGroups] = useState<CategoryGroup[]>([]);
  const [sel, setSel] = useState<Selection>({ category: null, subcategory: null });

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([getActiveProducts(), getCategoriesWithSubcategories()]).then(([prods, grps]) => {
        if (cancelled) return;
        setProducts(prods);
        setGroups(grps);
        setSel((prev) => (prev.category ? prev : initialSelection(grps)));
      });
      return () => { cancelled = true; };
    }, [])
  );

  const categoryNames = groups.map((g) => g.category);
  const visibleProducts = filterProducts(products, sel.category, sel.subcategory);
  const subs = subcategoriesFor(groups, sel.category);

  function pick(product: Product) {
    // The cart keys one line per product (and variant), so a product can't be
    // both paid and a free prize at once. If it's already a paid line, don't lose
    // that revenue by converting it: point staff at the per-line gift toggle.
    const paidLine = items.find(
      (i) => i.productId === product.id && !i.isPrize
    );
    if (paidLine) {
      showToast({
        variant: 'error',
        title: 'Already in the cart',
        message: `${product.name} is already in the cart. Use the gift icon on that line to make it the free one.`,
      });
      return;
    }
    // Oversold heads-up (non-blocking): a prize may still be given against low
    // stock. Only meaningful once the product has synced with Coop (sku set), so
    // its cached stock is a real signal; count what the cart already reserves.
    const reserved = items
      .filter((i) => i.productId === product.id)
      .reduce((sum, i) => sum + i.quantity, 0);
    const oversold = product.sku != null && product.stock - reserved <= 0;
    addPrize({ id: product.id, name: product.name, price: product.price ?? 0 });
    if (oversold) {
      showToast({
        variant: 'error',
        title: 'Added, but past stock',
        message: `${product.name} is out of stock. It will be recorded as oversold, restock it in Coop.`,
      });
    } else {
      showToast({
        variant: 'success',
        title: 'Prize added',
        message: `${product.name} added as a free prize.`,
      });
    }
    router.back();
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.filters}>
        <CategoryTabs
          categories={categoryNames}
          active={sel.category ?? ''}
          onSelect={(category) => setSel(defaultSelectionFor(groups, category))}
        />
        {subs.length > 0 && (
          <SubcategoryFilter
            subcategories={subs}
            active={sel.subcategory}
            onSelect={(subcategory) => setSel((prev) => ({ ...prev, subcategory }))}
          />
        )}
      </View>

      <FlatList
        data={visibleProducts}
        keyExtractor={(p) => String(p.id)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <Text style={styles.hint}>
            Choose the treat a customer won. It joins the cart as a free prize (no charge), attached to the sale when you take payment.
          </Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            testID={`prize-pick-${item.id}`}
            style={styles.row}
            onPress={() => pick(item)}
            activeOpacity={0.7}
          >
            <View style={styles.rowInfo}>
              <Text style={styles.rowName} numberOfLines={2}>
                {item.emoji ? `${item.emoji}  ` : ''}{item.name}
              </Text>
              {!item.sku && <Text style={styles.rowMeta}>Not synced to Coop yet</Text>}
            </View>
            <Text style={styles.rowAction}>Add prize</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No treats in this category yet.</Text>}
      />
    </SafeAreaView>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  filters: { paddingHorizontal: 12, paddingTop: 10, gap: 8 },
  listContent: { padding: 16, paddingBottom: 24, gap: 8 },
  hint: { color: c.textMuted, fontSize: F.sm, lineHeight: 19, marginBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: c.surface,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: c.borderDark,
  },
  rowInfo: { flex: 1, minWidth: 0, gap: 2 },
  rowName: { color: c.textPrimary, fontSize: F.md, fontWeight: '600', lineHeight: 19 },
  rowMeta: { color: c.textMuted, fontSize: F.xs },
  rowAction: { color: c.green, fontSize: F.sm, fontWeight: '800' },
  empty: { color: c.textMuted, textAlign: 'center', marginTop: 32, fontSize: F.md },
});
