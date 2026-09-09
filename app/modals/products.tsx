import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, Switch, Alert, KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { router } from 'expo-router';
import { bundleLineSummary, lineEmojis } from '../../utils/bundles';
import { getAllProducts, updateProduct, deleteProduct, Product } from '../../db/products';
import {
  getAllSavedBundles, toggleSavedBundle, updateSavedBundle, deleteSavedBundle,
  updateBundleEmoji, getSavedBundleById, SavedBundle,
} from '../../db/saved-bundles';
import { pushBundle, deleteBundleRemote } from '../../utils/bundles-sync';
import { categoryOf } from '../../utils/catalog-filter';
import { CategoryTabs } from '../../components/CategoryTabs';
import { SubcategoryFilter } from '../../components/SubcategoryFilter';
import { PullToRefresh } from '../../components/PullToRefresh';
import { PRODUCT_EMOJIS, MAX_EMOJI, emojiGraphemes, clampEmoji } from '../../constants/emoji';
import { Ionicons } from '@expo/vector-icons';
import { F, R, type Palette } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../components/Toast';

/** Pseudo-pill that shows every product line at once; the default view. */
const ALL_LINES = 'All';
/** Pseudo-pill that shows the Bundle Presets instead of individual products. */
const BUNDLES_LINE = 'Bundles';

async function confirmAction(
  title: string,
  message: string,
  destructiveLabel: string
): Promise<boolean> {
  if (Platform.OS === 'web') {
    return window.confirm(`${title}\n\n${message}`);
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: destructiveLabel, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

type ProductForm = { name: string; price: string; emoji: string };
type BundleForm = { name: string; price: string };
type FormMode = 'product' | 'bundle';

const EMPTY_PRODUCT: ProductForm = { name: '', price: '', emoji: '🍬' };
const EMPTY_BUNDLE: BundleForm = { name: '', price: '' };

export default function ProductsModal() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { showToast } = useToast();
  const navigation = useNavigation();
  const [products, setProducts] = useState<(Product & { variant_count: number })[]>([]);
  const [bundles, setBundles] = useState<SavedBundle[]>([]);
  const [productForm, setProductForm] = useState<ProductForm>(EMPTY_PRODUCT);
  const [bundleForm, setBundleForm] = useState<BundleForm>(EMPTY_BUNDLE);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formMode, setFormMode] = useState<FormMode>('product');
  const [showForm, setShowForm] = useState(false);
  // Bundle emoji editor (tap-only palette in a small modal).
  const [emojiBundle, setEmojiBundle] = useState<SavedBundle | null>(null);
  const [emojiDraft, setEmojiDraft] = useState('');
  // Which product line's pills is active on the list view. "All" shows everything.
  const [activeLine, setActiveLine] = useState<string>(ALL_LINES);
  // Optional secondary filter within a line (e.g. Freeze Dried → Meats). null = whole line.
  const [activeSub, setActiveSub] = useState<string | null>(null);

  // The form is an in-place sub-view, not its own route. Hide the modal's native
  // "Products" header while it's open so the form's own back arrow is the single
  // affordance, and it returns to the product list (not out to the POS page).
  useEffect(() => {
    navigation.setOptions({ headerShown: !showForm });
  }, [navigation, showForm]);

  useFocusEffect(
    useCallback(() => {
      refreshAll();
    }, [])
  );

  // Pills, derived from the loaded catalog: "All", each distinct product line
  // (alphabetical), then a "Bundles" pill (only when presets exist). Lets staff
  // jump straight to a line or the bundles instead of scrolling one long list.
  const lineNames = useMemo(() => {
    const lines = Array.from(new Set(products.map(categoryOf))).sort((a, b) => a.localeCompare(b));
    return [ALL_LINES, ...lines, ...(bundles.length > 0 ? [BUNDLES_LINE] : [])];
  }, [products, bundles]);

  // "All" shows both sections; a product line shows only its products; "Bundles"
  // shows only the presets.
  const showProducts = activeLine !== BUNDLES_LINE;
  const showBundles = activeLine === ALL_LINES || activeLine === BUNDLES_LINE;

  // Subcategory chips for the active line (e.g. Freeze Dried has Fish / Meats /
  // Cat Grass · Yogurt / Super Food). Empty for "All", "Bundles", and lines with
  // no subcategories, so no secondary row shows there.
  const subNames = useMemo(() => {
    if (activeLine === ALL_LINES || activeLine === BUNDLES_LINE) return [];
    const subs = new Set<string>();
    for (const p of products) {
      if (categoryOf(p) === activeLine && p.subcategory && p.subcategory.trim()) {
        subs.add(p.subcategory);
      }
    }
    return Array.from(subs).sort((a, b) => a.localeCompare(b));
  }, [products, activeLine]);

  const visibleProducts = useMemo(() => {
    if (activeLine === ALL_LINES || activeLine === BUNDLES_LINE) return products;
    return products.filter((p) => {
      if (categoryOf(p) !== activeLine) return false;
      return activeSub == null || p.subcategory === activeSub;
    });
  }, [products, activeLine, activeSub]);

  // Switching lines clears any subcategory narrowing; tapping the active
  // subcategory again clears back to the whole line.
  function selectLine(line: string) {
    setActiveLine(line);
    setActiveSub(null);
  }
  function selectSub(sub: string) {
    setActiveSub((cur) => (cur === sub ? null : sub));
  }

  async function refreshAll() {
    const [p, b] = await Promise.all([getAllProducts(), getAllSavedBundles()]);
    setProducts(p);
    setBundles(b);
  }

  // ─── Product actions ──────────────────────────────────────────────────────

  // The POS edits only a product's display name and price (creation, photos and
  // variants are Coop-owned). A product's other fields are preserved untouched:
  // for the rare variant product, its variant pricing and null base price stay as
  // they are and only the name is updated.
  async function handleSaveProduct() {
    const name = productForm.name.trim();
    if (!name) { Alert.alert('Required', 'Product name is required.'); return; }
    if (editingId === null) return; // creation is Coop-only; no create path here.

    const existing = products.find((p) => p.id === editingId)!;
    const emoji = clampEmoji(productForm.emoji) || '🍬';

    if (existing.has_variants === 1) {
      await updateProduct(editingId, {
        name,
        price: null,
        has_variants: true,
        is_active: existing.is_active,
        emoji,
        image_uri: existing.image_uri,
        // Preserve the product's tab; updateProduct writes category/subcategory
        // unconditionally, so omitting these wiped them to Uncategorized.
        category: existing.category,
        subcategory: existing.subcategory,
        sku: existing.sku,
        // No variants array: updateProduct leaves the existing variants intact.
      });
    } else {
      const price = parseFloat(productForm.price);
      if (isNaN(price) || price <= 0) {
        Alert.alert('Invalid price', 'Enter a valid price.'); return;
      }
      await updateProduct(editingId, {
        name,
        price,
        has_variants: false,
        is_active: existing.is_active,
        emoji,
        image_uri: existing.image_uri,
        category: existing.category,
        subcategory: existing.subcategory,
        sku: existing.sku,
      });
    }

    await refreshAll();
    cancelForm();
  }

  async function handleToggleProduct(product: Product) {
    await updateProduct(product.id, {
      name: product.name,
      price: product.price,
      has_variants: product.has_variants === 1,
      is_active: product.is_active === 1 ? 0 : 1,
      // Preserve tab + image (updateProduct writes these unconditionally).
      category: product.category,
      subcategory: product.subcategory,
      image_uri: product.image_uri,
      sku: product.sku,
    });
    setProducts(await getAllProducts());
  }

  function startEditProduct(product: Product) {
    setProductForm({
      name: product.name,
      price: product.price != null ? String(product.price) : '',
      emoji: product.emoji || '🍬',
    });
    setEditingId(product.id);
    setFormMode('product');
    setShowForm(true);
  }

  async function confirmDeleteProduct(id: number, name: string) {
    const ok = await confirmAction('Delete Product', `Remove "${name}" permanently?`, 'Delete');
    if (!ok) return;
    try {
      await deleteProduct(id);
      await refreshAll();
      showToast({ variant: 'success', title: 'Product deleted' });
    } catch (e) {
      showToast({
        variant: 'error',
        title: 'Delete failed',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // ─── Bundle actions ───────────────────────────────────────────────────────

  async function handleSaveBundle() {
    const name = bundleForm.name.trim();
    const price = parseFloat(bundleForm.price);
    if (!name) { Alert.alert('Required', 'Bundle name is required.'); return; }
    if (isNaN(price) || price <= 0) { Alert.alert('Invalid price', 'Enter a valid price.'); return; }

    if (editingId !== null) {
      await updateSavedBundle(editingId, { name, price, items: bundles.find((b) => b.id === editingId)!.items });
      const saved = await getSavedBundleById(editingId);
      if (saved) pushBundle(saved); // share the edit to Coop / other devices
    }
    await refreshAll();
    cancelForm();
  }

  async function handleToggleBundle(bundle: SavedBundle) {
    await toggleSavedBundle(bundle.id, bundle.is_active === 1 ? 0 : 1);
    const saved = await getSavedBundleById(bundle.id);
    if (saved) pushBundle(saved);
    setBundles(await getAllSavedBundles());
  }

  function startEditBundle(bundle: SavedBundle) {
    // Pick bundles carry lines and an amount, so edit them in the full Add Bundle
    // screen; the inline form only handles a legacy fixed bundle's name and price.
    if (bundle.bundle_type === 'pick') {
      router.push(`/modals/bundle?editId=${bundle.id}`);
      return;
    }
    setBundleForm({ name: bundle.name, price: String(bundle.price) });
    setEditingId(bundle.id);
    setFormMode('bundle');
    setShowForm(true);
  }

  async function confirmDeleteBundle(id: number, name: string) {
    const ok = await confirmAction('Delete Bundle', `Remove "${name}" preset permanently?`, 'Delete');
    if (!ok) return;
    try {
      const uuid = bundles.find((b) => b.id === id)?.bundle_uuid ?? null;
      await deleteSavedBundle(id);
      deleteBundleRemote(uuid); // remove it from Coop / other devices too
      await refreshAll();
      showToast({ variant: 'success', title: 'Bundle deleted' });
    } catch (e) {
      showToast({
        variant: 'error',
        title: 'Delete failed',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  function openBundleEmoji(bundle: SavedBundle) {
    setEmojiBundle(bundle);
    setEmojiDraft(bundle.emoji ?? '');
  }

  async function saveBundleEmoji() {
    if (!emojiBundle) return;
    const emoji = clampEmoji(emojiDraft) || null; // empty clears -> derive from lines
    await updateBundleEmoji(emojiBundle.id, emoji);
    const saved = await getSavedBundleById(emojiBundle.id);
    if (saved) pushBundle(saved);
    setEmojiBundle(null);
    await refreshAll();
  }

  // ─── Shared ───────────────────────────────────────────────────────────────

  function cancelForm() {
    setShowForm(false);
    setProductForm(EMPTY_PRODUCT);
    setBundleForm(EMPTY_BUNDLE);
    setEditingId(null);
  }

  function handleSave() {
    if (formMode === 'product') return handleSaveProduct();
    return handleSaveBundle();
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  if (showForm) {
    const isBundle = formMode === 'bundle';
    return (
      <SafeAreaView style={styles.container}>
        {/* Own back arrow (native header is hidden while the form is open) so
            "back" returns to the product list rather than out to the POS page. */}
        <View style={styles.formHeader}>
          <TouchableOpacity onPress={cancelForm} style={styles.backBtn} accessibilityLabel="Back to products">
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.formHeaderTitle}>{isBundle ? 'Edit Bundle Preset' : 'Edit Product'}</Text>
        </View>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            {!isBundle && (() => {
              const chosen = emojiGraphemes(productForm.emoji);
              const full = chosen.length >= MAX_EMOJI;
              return (
                <>
                  <Text style={styles.fieldLabel}>Emoji</Text>
                  <Text style={styles.emojiHint}>Tap to pick up to {MAX_EMOJI}. No typing needed.</Text>
                  <View style={styles.emojiPreviewRow}>
                    <View style={styles.emojiPreview}>
                      <Text style={styles.emojiPreviewText}>{productForm.emoji || '🍬'}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.emojiClearBtn}
                      onPress={() =>
                        setProductForm((f) => ({ ...f, emoji: emojiGraphemes(f.emoji).slice(0, -1).join('') }))
                      }
                      disabled={chosen.length === 0}
                      accessibilityLabel="Remove last emoji"
                    >
                      <Ionicons name="backspace-outline" size={18} color={chosen.length === 0 ? colors.textMuted : colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.emojiGrid}>
                    {PRODUCT_EMOJIS.map((e) => (
                      <TouchableOpacity
                        key={e}
                        style={[styles.emojiPick, full && styles.emojiPickDisabled]}
                        // Append until 3 are chosen; then further taps are ignored
                        // (backspace clears). Keeps the "max 3" rule obvious.
                        onPress={() => !full && setProductForm((f) => ({ ...f, emoji: clampEmoji(f.emoji + e) }))}
                        disabled={full}
                        accessibilityLabel={`Add ${e}`}
                      >
                        <Text style={styles.emojiPickText}>{e}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              );
            })()}

            <Text style={styles.fieldLabel}>Display name</Text>
            <TextInput
              style={styles.input}
              placeholder={isBundle ? 'Bundle name' : 'Product name'}
              placeholderTextColor={colors.textMuted}
              value={isBundle ? bundleForm.name : productForm.name}
              onChangeText={(v) =>
                isBundle
                  ? setBundleForm((f) => ({ ...f, name: v }))
                  : setProductForm((f) => ({ ...f, name: v }))
              }
            />

            <Text style={styles.fieldLabel}>Price</Text>
            <TextInput
              style={styles.input}
              placeholder="Price (e.g. 120)"
              placeholderTextColor={colors.textMuted}
              value={isBundle ? bundleForm.price : productForm.price}
              onChangeText={(v) =>
                isBundle
                  ? setBundleForm((f) => ({ ...f, price: v }))
                  : setProductForm((f) => ({ ...f, price: v }))
              }
              keyboardType="decimal-pad"
            />

            <View style={styles.formBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={cancelForm}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <PullToRefresh onRefresh={refreshAll}>
        {(scroll) => (
      <ScrollView {...scroll} contentContainerStyle={styles.scrollContent}>
        {/* Product creation is Coop-only (POS co-edits name/price/listing and unlists,
            but never creates). Hidden, not deleted, so it can be restored if that
            ownership decision changes.
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => { setFormMode('product'); setShowForm(true); }}
        >
          <Text style={styles.addBtnText}>+ New Product</Text>
        </TouchableOpacity>
        */}

        {/* Product-line pills: filter the list by line so staff don't scroll one
            long alphabetical list (e.g. every "Beef ..." at once). */}
        {lineNames.length > 1 && (
          <View style={styles.pillRow}>
            <CategoryTabs categories={lineNames} active={activeLine} onSelect={selectLine} />
          </View>
        )}

        {/* Secondary chips for lines that have subcategories (e.g. Freeze Dried). */}
        {subNames.length > 0 && (
          <View style={styles.subRow}>
            <SubcategoryFilter subcategories={subNames} active={activeSub} onSelect={selectSub} />
          </View>
        )}

        {/* Products section */}
        {showProducts && (
        <>
        <Text style={styles.sectionLabel}>Products</Text>
        {visibleProducts.length === 0 && (
          <Text style={styles.emptyHint}>
            {products.length === 0 ? 'No products yet.' : 'No products in this line.'}
          </Text>
        )}
        {visibleProducts.map((item) => (
          <View key={item.id} style={styles.itemRow}>
            <View style={styles.itemInfo}>
              <Text style={styles.itemEmoji}>{item.emoji || '🍬'}</Text>
              <View style={styles.itemText}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemSub}>
                  {item.has_variants
                    ? `${item.variant_count} variant${item.variant_count !== 1 ? 's' : ''}`
                    : `₱${(item.price ?? 0).toFixed(2)}`}
                </Text>
              </View>
            </View>
            <View style={styles.itemActions}>
              <TouchableOpacity style={styles.actionBtn} onPress={() => startEditProduct(item)}>
                <Ionicons name="create-outline" size={14} color={colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnDanger]}
                onPress={() => confirmDeleteProduct(item.id, item.name)}
              >
                <Ionicons name="trash-outline" size={14} color={colors.textSecondary} />
              </TouchableOpacity>
              <Switch
                value={item.is_active === 1}
                onValueChange={() => handleToggleProduct(item)}
                trackColor={{ false: colors.borderDark, true: colors.pink }}
                thumbColor="#fff"
              />
            </View>
          </View>
        ))}

        </>
        )}

        {/* Bundle Presets section */}
        {showBundles && (
        <>
        <Text style={[styles.sectionLabel, showProducts && { marginTop: 20 }]}>Bundle Presets</Text>
        {bundles.length === 0 && (
          <Text style={styles.emptyHint}>No bundle presets yet. Create one from the POS screen.</Text>
        )}
        {bundles.map((bundle) => (
          <View key={bundle.id} style={styles.itemRow}>
            <View style={styles.itemInfo}>
              <TouchableOpacity onPress={() => openBundleEmoji(bundle)} accessibilityLabel={`Edit emoji for ${bundle.name}`}>
                <Text style={styles.itemEmoji}>
                  {bundle.emoji || lineEmojis(products, bundle.line_categories ?? []).join('') || '🎁'}
                </Text>
              </TouchableOpacity>
              <View style={styles.itemText}>
                <Text style={styles.itemName}>{bundle.name}</Text>
                <Text style={styles.itemSub}>
                  {bundle.bundle_type === 'pick'
                    ? `₱${bundle.price.toFixed(2)} · Any ${bundle.pick_count ?? 0} · ${bundleLineSummary(bundle.line_categories ?? [])}`
                    : `₱${bundle.price.toFixed(2)} · ${bundle.items.length} item${bundle.items.length !== 1 ? 's' : ''}`}
                </Text>
              </View>
            </View>
            <View style={styles.itemActions}>
              <TouchableOpacity style={styles.actionBtn} onPress={() => startEditBundle(bundle)}>
                <Ionicons name="create-outline" size={14} color={colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnDanger]}
                onPress={() => confirmDeleteBundle(bundle.id, bundle.name)}
              >
                <Ionicons name="trash-outline" size={14} color={colors.textSecondary} />
              </TouchableOpacity>
              <Switch
                value={bundle.is_active === 1}
                onValueChange={() => handleToggleBundle(bundle)}
                trackColor={{ false: colors.borderDark, true: colors.pink }}
                thumbColor="#fff"
              />
            </View>
          </View>
        ))}
        </>
        )}
      </ScrollView>
        )}
      </PullToRefresh>

      {/* Bundle emoji editor: tap-only palette, up to 3 (matches the product picker). */}
      <Modal visible={!!emojiBundle} transparent animationType="fade" onRequestClose={() => setEmojiBundle(null)}>
        <TouchableOpacity style={styles.emojiOverlay} activeOpacity={1} onPress={() => setEmojiBundle(null)}>
          <TouchableOpacity style={styles.emojiCard} activeOpacity={1} onPress={() => {}}>
            <Text style={styles.emojiCardTitle}>Bundle emoji</Text>
            <Text style={styles.emojiHint}>Tap to pick up to {MAX_EMOJI}. Leave empty to use the line emojis.</Text>
            <View style={styles.emojiPreviewRow}>
              <View style={styles.emojiPreview}>
                <Text style={styles.emojiPreviewText}>
                  {emojiDraft || (emojiBundle ? lineEmojis(products, emojiBundle.line_categories ?? []).join('') : '') || '🎁'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.emojiClearBtn}
                onPress={() => setEmojiDraft((d) => emojiGraphemes(d).slice(0, -1).join(''))}
                disabled={emojiDraft.length === 0}
                accessibilityLabel="Remove last emoji"
              >
                <Ionicons name="backspace-outline" size={18} color={emojiDraft.length === 0 ? colors.textMuted : colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.emojiGrid}>
              {PRODUCT_EMOJIS.map((e) => {
                const full = emojiGraphemes(emojiDraft).length >= MAX_EMOJI;
                return (
                  <TouchableOpacity
                    key={e}
                    style={[styles.emojiPick, full && styles.emojiPickDisabled]}
                    onPress={() => !full && setEmojiDraft((d) => clampEmoji(d + e))}
                    disabled={full}
                  >
                    <Text style={styles.emojiPickText}>{e}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.formBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEmojiBundle(null)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={saveBundleEmoji}>
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  scrollContent: { padding: 16, paddingBottom: 32 },

  addBtn: {
    backgroundColor: c.pink, borderRadius: R.sm,
    padding: 15, alignItems: 'center', marginBottom: 20,
  },
  addBtnText: { color: '#fff', fontWeight: '800', fontSize: F.md },

  sectionLabel: {
    color: c.textMuted,
    fontSize: F.xs,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  emptyHint: {
    color: c.textMuted,
    fontSize: F.sm,
    textAlign: 'center',
    paddingVertical: 16,
  },

  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: c.surface,
    borderRadius: R.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: c.borderDark,
  },
  itemInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  itemEmoji: { fontSize: 24, width: 30, textAlign: 'center' },
  itemText: { flex: 1, minWidth: 0 },
  itemName: { color: c.textPrimary, fontSize: F.md, fontWeight: '700' },
  itemSub: { color: c.pink, fontSize: F.sm, marginTop: 2, fontWeight: '600' },

  itemActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionBtn: {
    backgroundColor: c.elevated,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: R.sm,
    padding: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnDanger: { borderColor: c.borderDark },
  actionIcon: {},

  pillRow: { marginBottom: 16 },
  subRow: { marginTop: -8, marginBottom: 16 },

  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: c.borderDark,
  },
  backBtn: { padding: 4 },
  formHeaderTitle: { color: c.textPrimary, fontSize: F.lg, fontWeight: '800' },

  form: { padding: 20, paddingBottom: 40, gap: 8 },
  fieldLabel: {
    color: c.textMuted,
    fontSize: F.xs,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 8,
  },
  input: {
    backgroundColor: c.surface, color: c.textPrimary, borderRadius: R.sm,
    padding: 14, fontSize: F.md, borderWidth: 1, borderColor: c.border,
  },
  emojiOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  emojiCard: {
    width: '100%', maxWidth: 380, backgroundColor: c.surface, borderRadius: R.lg,
    borderWidth: 1, borderColor: c.borderDark, padding: 20, gap: 4,
  },
  emojiCardTitle: { color: c.textPrimary, fontSize: F.lg, fontWeight: '800' },
  emojiHint: { color: c.textMuted, fontSize: F.xs, marginTop: -2, marginBottom: 4 },
  emojiPreviewRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  emojiPreview: {
    minWidth: 96, height: 48, borderRadius: R.sm, alignItems: 'center', justifyContent: 'center',
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12,
  },
  emojiPreviewText: { fontSize: 26 },
  emojiClearBtn: {
    width: 44, height: 44, borderRadius: R.sm, alignItems: 'center', justifyContent: 'center',
    backgroundColor: c.elevated, borderWidth: 1, borderColor: c.border,
  },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emojiPick: {
    width: 44, height: 44, borderRadius: R.sm, alignItems: 'center', justifyContent: 'center',
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
  },
  emojiPickDisabled: { opacity: 0.4 },
  emojiPickText: { fontSize: 22 },
  formBtns: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: {
    flex: 1, backgroundColor: c.elevated, borderRadius: R.sm,
    padding: 14, alignItems: 'center', borderWidth: 1, borderColor: c.border,
  },
  cancelText: { color: c.textSecondary, fontWeight: '700', fontSize: F.md },
  saveBtn: { flex: 2, backgroundColor: c.pink, borderRadius: R.sm, padding: 14, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: F.md },
});
