import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, SectionList, StyleSheet, SafeAreaView, useWindowDimensions,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { getActiveProducts, Product } from '../../db/products';
import { getSavedBundleById, SavedBundle } from '../../db/saved-bundles';
import { categoryOf } from '../../utils/catalog-filter';
import {
  eligibleFlavors, isSelectionComplete, isSelectionFull, totalSelected,
  selectionToBundleItems, bundleLineSummary, BundleSelection,
} from '../../utils/bundles';
import { useCart } from '../../context/CartContext';
import { useToast } from '../../components/Toast';
import { C, F, R } from '../../constants/theme';

type Section = { title: string; data: Product[] };

/** Groups eligible flavors into labelled sections by category, then subcategory. */
function buildSections(products: Product[]): Section[] {
  const sorted = [...products].sort((a, b) => {
    const cat = categoryOf(a).localeCompare(categoryOf(b));
    if (cat !== 0) return cat;
    const sub = (a.subcategory ?? '').localeCompare(b.subcategory ?? '');
    if (sub !== 0) return sub;
    return a.name.localeCompare(b.name);
  });
  const sections: Section[] = [];
  for (const p of sorted) {
    const title = p.subcategory ? `${categoryOf(p)} · ${p.subcategory}` : categoryOf(p);
    const last = sections[sections.length - 1];
    if (last && last.title === title) last.data.push(p);
    else sections.push({ title, data: [p] });
  }
  return sections;
}

export default function BundleSelectModal() {
  const { bundleId } = useLocalSearchParams<{ bundleId?: string }>();
  const id = bundleId ? Number(bundleId) : null;
  const { addBundle } = useCart();
  const { showToast } = useToast();
  // Tighten the fixed header/footer on a short viewport (landscape phone) so the
  // scrolling flavor list has room to work in.
  const { height } = useWindowDimensions();
  const tight = height < 500;

  const [bundle, setBundle] = useState<SavedBundle | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [selection, setSelection] = useState<BundleSelection>({});

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([
        id != null ? getSavedBundleById(id) : Promise.resolve(null),
        getActiveProducts(),
      ]).then(([b, prods]) => {
        if (cancelled) return;
        setBundle(b);
        setProducts(prods);
      });
      return () => { cancelled = true; };
    }, [id])
  );

  const pickCount = bundle?.pick_count ?? 0;
  const lines = bundle?.line_categories ?? [];
  const flavors = eligibleFlavors(products, lines);
  const sections = buildSections(flavors);
  const chosen = totalSelected(selection);
  const full = isSelectionFull(selection, pickCount);
  const complete = isSelectionComplete(selection, pickCount);
  const remaining = pickCount - chosen;

  function increment(productId: number) {
    if (full) {
      showToast({ variant: 'error', title: 'That is all', message: `Take one off to swap. Any ${pickCount}.` });
      return;
    }
    setSelection((prev) => ({ ...prev, [productId]: (prev[productId] ?? 0) + 1 }));
  }

  function decrement(productId: number) {
    setSelection((prev) => {
      const cur = prev[productId] ?? 0;
      if (cur <= 1) {
        const next = { ...prev };
        delete next[productId];
        return next;
      }
      return { ...prev, [productId]: cur - 1 };
    });
  }

  function handleAdd() {
    if (!bundle || !complete) return;
    addBundle({
      presetId: bundle.id,
      name: bundle.name,
      price: bundle.price,
      items: selectionToBundleItems(selection, products),
    });
    showToast({
      variant: 'success',
      title: `${bundle.name} added`,
      message: `₱${bundle.price.toFixed(2)}`,
    });
    router.dismiss();
  }

  if (!bundle) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.missing}>This bundle is no longer available.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.progress, tight && styles.progressTight]}>
        <Text style={[styles.progressTitle, tight && styles.progressTitleTight]}>{bundle.name}</Text>
        <Text style={styles.progressText}>
          {remaining > 0 ? `Pick ${remaining} more` : `All ${pickCount} chosen`}
          {'  ·  '}
          <Text style={styles.progressCount}>{chosen}/{pickCount}</Text>
        </Text>
        {!tight && <Text style={styles.progressLines}>{bundleLineSummary(lines)}</Text>}
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => String(item.id)}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.list}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        renderItem={({ item }) => {
          const qty = selection[item.id] ?? 0;
          return (
            <View style={[styles.row, tight && styles.rowTight]}>
              <Text style={styles.emoji}>{item.emoji}</Text>
              <Text style={styles.name}>{item.name}</Text>
              <View style={styles.stepper}>
                <TouchableOpacity
                  style={[styles.stepBtn, qty === 0 && styles.stepBtnDim]}
                  onPress={() => decrement(item.id)}
                  disabled={qty === 0}
                  accessibilityLabel={`Remove one ${item.name}`}
                >
                  <Text style={[styles.stepIcon, qty === 0 && styles.stepIconDim]}>−</Text>
                </TouchableOpacity>
                <Text style={[styles.qty, qty > 0 && styles.qtyActive]}>{qty}</Text>
                <TouchableOpacity
                  style={[styles.stepBtn, full && qty === 0 && styles.stepBtnDim]}
                  onPress={() => increment(item.id)}
                  accessibilityLabel={`Add one ${item.name}`}
                >
                  <Text style={styles.stepIcon}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.missing}>No flavors available in {bundleLineSummary(lines)} yet.</Text>
        }
      />

      <View style={[styles.footer, tight && styles.footerTight]}>
        <View style={styles.footerInfo}>
          <Text style={styles.footerCount}>{chosen}/{pickCount} chosen</Text>
          <Text style={[styles.footerPrice, tight && styles.footerPriceTight]}>₱{bundle.price.toFixed(2)}</Text>
        </View>
        <TouchableOpacity
          style={[styles.addBtn, !complete && styles.addBtnDisabled, tight && styles.addBtnTight]}
          onPress={handleAdd}
          disabled={!complete}
        >
          <Text style={styles.addText}>{complete ? 'Add to sale' : `Pick ${remaining} more`}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  progress: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.borderDark,
    backgroundColor: C.pinkSubtle,
    gap: 3,
  },
  progressTight: { paddingTop: 8, paddingBottom: 8, gap: 1 },
  progressTitle: { color: C.textPrimary, fontSize: F.lg, fontWeight: '800' },
  progressTitleTight: { fontSize: F.md },
  progressText: { color: C.textSecondary, fontSize: F.sm, fontWeight: '600' },
  progressCount: { color: C.pink, fontWeight: '800' },
  progressLines: { color: C.textMuted, fontSize: F.xs, fontWeight: '600' },

  list: { padding: 16, paddingBottom: 24 },
  sectionHeader: {
    color: C.textMuted,
    fontSize: F.xs,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: C.surface,
    borderRadius: R.sm,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: C.borderDark,
  },
  rowTight: { paddingVertical: 8, marginBottom: 5 },
  emoji: { fontSize: 22, marginRight: 12 },
  name: { flex: 1, color: C.textPrimary, fontSize: F.md, fontWeight: '600' },

  stepper: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: R.sm,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnDim: { borderColor: C.borderDark, opacity: 0.5 },
  stepIcon: { color: C.textPrimary, fontSize: F.lg, fontWeight: '700', lineHeight: 20 },
  stepIconDim: { color: C.textMuted },
  qty: { width: 36, textAlign: 'center', color: C.textSecondary, fontSize: F.md, fontWeight: '700' },
  qtyActive: { color: C.pink },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: C.borderDark,
    backgroundColor: C.surface,
  },
  footerTight: { paddingVertical: 10 },
  footerInfo: { flex: 1 },
  footerCount: { color: C.textMuted, fontSize: F.xs, fontWeight: '700' },
  footerPrice: { color: C.textPrimary, fontSize: F.xl, fontWeight: '800' },
  footerPriceTight: { fontSize: F.lg },
  addBtn: {
    backgroundColor: C.pink,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: R.sm,
    alignItems: 'center',
  },
  addBtnTight: { paddingVertical: 11 },
  addBtnDisabled: { backgroundColor: C.elevated, borderWidth: 1, borderColor: C.border },
  addText: { color: '#fff', fontSize: F.md, fontWeight: '800' },

  missing: { color: C.textMuted, textAlign: 'center', marginTop: 40, fontSize: F.md, paddingHorizontal: 24 },
});
