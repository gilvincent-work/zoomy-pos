import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, Switch, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getAllProducts, createProduct, updateProduct, deleteProduct, Product, ProductVariant, getAllVariantsByProductId } from '../../db/products';
import {
  getAllSavedBundles, toggleSavedBundle, updateSavedBundle, deleteSavedBundle, SavedBundle,
} from '../../db/saved-bundles';
import { Ionicons } from '@expo/vector-icons';
import { C, F, R } from '../../constants/theme';

type VariantFormRow = { id?: number; name: string; price: string };
type ProductForm = { name: string; price: string; hasVariants: boolean; variants: VariantFormRow[] };
type BundleForm = { name: string; price: string };
type FormMode = 'product' | 'bundle';

const EMPTY_PRODUCT: ProductForm = { name: '', price: '', hasVariants: false, variants: [] };
const EMPTY_BUNDLE: BundleForm = { name: '', price: '' };

export default function ProductsModal() {
  const [products, setProducts] = useState<(Product & { variant_count: number })[]>([]);
  const [bundles, setBundles] = useState<SavedBundle[]>([]);
  const [productForm, setProductForm] = useState<ProductForm>(EMPTY_PRODUCT);
  const [bundleForm, setBundleForm] = useState<BundleForm>(EMPTY_BUNDLE);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formMode, setFormMode] = useState<FormMode>('product');
  const [showForm, setShowForm] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refreshAll();
    }, [])
  );

  async function refreshAll() {
    const [p, b] = await Promise.all([getAllProducts(), getAllSavedBundles()]);
    setProducts(p);
    setBundles(b);
  }

  // ─── Product actions ──────────────────────────────────────────────────────

  async function handleSaveProduct() {
    const name = productForm.name.trim();
    if (!name) { Alert.alert('Required', 'Product name is required.'); return; }

    if (productForm.hasVariants) {
      const validVariants = productForm.variants.filter((v) => v.name.trim());
      if (validVariants.length === 0) {
        Alert.alert('Required', 'Add at least one variant.');
        return;
      }
      for (const v of validVariants) {
        const p = parseFloat(v.price);
        if (isNaN(p) || p <= 0) {
          Alert.alert('Invalid price', `Enter a valid price for "${v.name}".`);
          return;
        }
      }
      const parsedVariants = validVariants.map((v) => ({
        id: v.id,
        name: v.name.trim(),
        price: parseFloat(v.price),
      }));

      if (editingId !== null) {
        const existing = products.find((p) => p.id === editingId)!;
        await updateProduct(editingId, {
          name,
          price: null,
          has_variants: true,
          is_active: existing.is_active,
          variants: parsedVariants,
        });
      } else {
        await createProduct({
          name,
          price: null,
          has_variants: true,
          variants: parsedVariants,
        });
      }
    } else {
      const price = parseFloat(productForm.price);
      if (isNaN(price) || price <= 0) {
        Alert.alert('Invalid price', 'Enter a valid price.'); return;
      }

      if (editingId !== null) {
        const existing = products.find((p) => p.id === editingId)!;
        await updateProduct(editingId, {
          name,
          price,
          has_variants: false,
          is_active: existing.is_active,
        });
      } else {
        await createProduct({ name, price, has_variants: false });
      }
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
    });
    setProducts(await getAllProducts());
  }

  async function startEditProduct(product: Product) {
    let variants: VariantFormRow[] = [];
    if (product.has_variants) {
      const dbVariants = await getAllVariantsByProductId(product.id);
      variants = dbVariants.map((v) => ({
        id: v.id,
        name: v.name,
        price: String(v.price),
      }));
    }
    setProductForm({
      name: product.name,
      price: product.price != null ? String(product.price) : '',
      hasVariants: product.has_variants === 1,
      variants,
    });
    setEditingId(product.id);
    setFormMode('product');
    setShowForm(true);
  }

  function confirmDeleteProduct(id: number, name: string) {
    Alert.alert('Delete Product', `Remove "${name}" permanently?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteProduct(id); await refreshAll(); } },
    ]);
  }

  // ─── Bundle actions ───────────────────────────────────────────────────────

  async function handleSaveBundle() {
    const name = bundleForm.name.trim();
    const price = parseFloat(bundleForm.price);
    if (!name) { Alert.alert('Required', 'Bundle name is required.'); return; }
    if (isNaN(price) || price <= 0) { Alert.alert('Invalid price', 'Enter a valid price.'); return; }

    if (editingId !== null) {
      const existing = bundles.find((b) => b.id === editingId)!;
      await updateSavedBundle(editingId, { name, price, items: existing.items });
    }
    await refreshAll();
    cancelForm();
  }

  async function handleToggleBundle(bundle: SavedBundle) {
    await toggleSavedBundle(bundle.id, bundle.is_active === 1 ? 0 : 1);
    setBundles(await getAllSavedBundles());
  }

  function startEditBundle(bundle: SavedBundle) {
    setBundleForm({ name: bundle.name, price: String(bundle.price) });
    setEditingId(bundle.id);
    setFormMode('bundle');
    setShowForm(true);
  }

  function confirmDeleteBundle(id: number, name: string) {
    Alert.alert('Delete Bundle', `Remove "${name}" preset permanently?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteSavedBundle(id); await refreshAll(); } },
    ]);
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
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={styles.form}>
            <Text style={styles.formTitle}>
              {isBundle ? 'Edit Bundle Preset' : (editingId ? 'Edit Product' : 'New Product')}
            </Text>

            <TextInput
              style={styles.input}
              placeholder={isBundle ? 'Bundle name' : 'Product name'}
              placeholderTextColor={C.textMuted}
              value={isBundle ? bundleForm.name : productForm.name}
              onChangeText={(v) =>
                isBundle
                  ? setBundleForm((f) => ({ ...f, name: v }))
                  : setProductForm((f) => ({ ...f, name: v }))
              }
            />

            {!isBundle && (
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Has variants?</Text>
                <Switch
                  value={productForm.hasVariants}
                  onValueChange={(v) => setProductForm((f) => ({
                    ...f,
                    hasVariants: v,
                    price: v ? '' : f.price,
                    variants: v && f.variants.length === 0 ? [{ name: '', price: '' }] : f.variants,
                  }))}
                  trackColor={{ false: C.borderDark, true: C.pink }}
                  thumbColor="#fff"
                />
              </View>
            )}

            {(!isBundle && productForm.hasVariants) ? (
              <View style={styles.variantSection}>
                <Text style={styles.variantLabel}>VARIANTS</Text>
                {productForm.variants.map((v, i) => (
                  <View key={i} style={styles.variantRow}>
                    <TextInput
                      style={[styles.input, { flex: 2 }]}
                      placeholder="Variant name"
                      placeholderTextColor={C.textMuted}
                      value={v.name}
                      onChangeText={(text) =>
                        setProductForm((f) => ({
                          ...f,
                          variants: f.variants.map((vr, vi) =>
                            vi === i ? { ...vr, name: text } : vr
                          ),
                        }))
                      }
                    />
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      placeholder="Price"
                      placeholderTextColor={C.textMuted}
                      value={v.price}
                      onChangeText={(text) =>
                        setProductForm((f) => ({
                          ...f,
                          variants: f.variants.map((vr, vi) =>
                            vi === i ? { ...vr, price: text } : vr
                          ),
                        }))
                      }
                      keyboardType="decimal-pad"
                    />
                    <TouchableOpacity
                      style={styles.variantDeleteBtn}
                      onPress={() =>
                        setProductForm((f) => ({
                          ...f,
                          variants: f.variants.filter((_, vi) => vi !== i),
                        }))
                      }
                    >
                      <Ionicons name="close" size={F.lg} color={C.pink} />
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity
                  style={styles.addVariantBtn}
                  onPress={() =>
                    setProductForm((f) => ({
                      ...f,
                      variants: [...f.variants, { name: '', price: '' }],
                    }))
                  }
                >
                  <Text style={styles.addVariantText}>+ Add Variant</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TextInput
                style={styles.input}
                placeholder="Price (e.g. 120)"
                placeholderTextColor={C.textMuted}
                value={isBundle ? bundleForm.price : productForm.price}
                onChangeText={(v) =>
                  isBundle
                    ? setBundleForm((f) => ({ ...f, price: v }))
                    : setProductForm((f) => ({ ...f, price: v }))
                }
                keyboardType="decimal-pad"
              />
            )}
            <View style={styles.formBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={cancelForm}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => { setFormMode('product'); setShowForm(true); }}
        >
          <Text style={styles.addBtnText}>+ New Product</Text>
        </TouchableOpacity>

        {/* Products section */}
        <Text style={styles.sectionLabel}>Products</Text>
        {products.length === 0 && (
          <Text style={styles.emptyHint}>No products yet.</Text>
        )}
        {products.map((item) => (
          <View key={item.id} style={styles.itemRow}>
            <View style={styles.itemInfo}>
              <View>
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
                <Ionicons name="create-outline" size={14} color={C.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnDanger]}
                onPress={() => confirmDeleteProduct(item.id, item.name)}
              >
                <Ionicons name="trash-outline" size={14} color={C.textSecondary} />
              </TouchableOpacity>
              <Switch
                value={item.is_active === 1}
                onValueChange={() => handleToggleProduct(item)}
                trackColor={{ false: C.borderDark, true: C.pink }}
                thumbColor="#fff"
              />
            </View>
          </View>
        ))}

        {/* Bundle Presets section */}
        <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Bundle Presets</Text>
        {bundles.length === 0 && (
          <Text style={styles.emptyHint}>No bundle presets yet. Create one from the POS screen.</Text>
        )}
        {bundles.map((bundle) => (
          <View key={bundle.id} style={styles.itemRow}>
            <View style={styles.itemInfo}>
              <Ionicons name="cube-outline" size={28} color={C.textSecondary} style={{ marginRight: 12 }} />
              <View>
                <Text style={styles.itemName}>{bundle.name}</Text>
                <Text style={styles.itemSub}>
                  ₱{bundle.price.toFixed(2)} · {bundle.items.length} item{bundle.items.length !== 1 ? 's' : ''}
                </Text>
              </View>
            </View>
            <View style={styles.itemActions}>
              <TouchableOpacity style={styles.actionBtn} onPress={() => startEditBundle(bundle)}>
                <Ionicons name="create-outline" size={14} color={C.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnDanger]}
                onPress={() => confirmDeleteBundle(bundle.id, bundle.name)}
              >
                <Ionicons name="trash-outline" size={14} color={C.textSecondary} />
              </TouchableOpacity>
              <Switch
                value={bundle.is_active === 1}
                onValueChange={() => handleToggleBundle(bundle)}
                trackColor={{ false: C.borderDark, true: C.pink }}
                thumbColor="#fff"
              />
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scrollContent: { padding: 16, paddingBottom: 32 },

  addBtn: {
    backgroundColor: C.pink, borderRadius: R.sm,
    padding: 15, alignItems: 'center', marginBottom: 20,
  },
  addBtnText: { color: '#fff', fontWeight: '800', fontSize: F.md },

  sectionLabel: {
    color: C.textMuted,
    fontSize: F.xs,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  emptyHint: {
    color: C.textMuted,
    fontSize: F.sm,
    textAlign: 'center',
    paddingVertical: 16,
  },

  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.surface,
    borderRadius: R.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: C.borderDark,
  },
  itemInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  itemEmoji: {},
  itemName: { color: C.textPrimary, fontSize: F.md, fontWeight: '700' },
  itemSub: { color: C.pink, fontSize: F.sm, marginTop: 2, fontWeight: '600' },

  itemActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionBtn: {
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.sm,
    padding: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnDanger: { borderColor: C.borderDark },
  actionIcon: {},

  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: R.sm,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  toggleLabel: {
    color: C.textPrimary,
    fontSize: F.md,
    fontWeight: '600',
  },
  variantSection: { gap: 8 },
  variantLabel: {
    color: C.textMuted,
    fontSize: F.xs,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  variantRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  variantDeleteBtn: {
    padding: 10,
  },
  variantDeleteText: {
    color: C.pink,
    fontSize: F.lg,
    fontWeight: '700',
  },
  addVariantBtn: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: C.pink,
    borderRadius: R.sm,
    padding: 12,
    alignItems: 'center',
  },
  addVariantText: {
    color: C.pink,
    fontWeight: '700',
    fontSize: F.md,
  },

  form: { padding: 20, gap: 12 },
  formTitle: { color: C.textPrimary, fontSize: F.xl, fontWeight: '800', marginBottom: 6 },
  input: {
    backgroundColor: C.surface, color: C.textPrimary, borderRadius: R.sm,
    padding: 14, fontSize: F.md, borderWidth: 1, borderColor: C.border,
  },
  formBtns: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: {
    flex: 1, backgroundColor: C.elevated, borderRadius: R.sm,
    padding: 14, alignItems: 'center', borderWidth: 1, borderColor: C.border,
  },
  cancelText: { color: C.textSecondary, fontWeight: '700', fontSize: F.md },
  saveBtn: { flex: 2, backgroundColor: C.pink, borderRadius: R.sm, padding: 14, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: F.md },
});
