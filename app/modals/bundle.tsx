import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, TextInput,
  StyleSheet, SafeAreaView, Alert, Modal,
} from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { getActiveProducts, getVariantsByProductId, Product, ProductVariant } from '../../db/products';
import { saveBundlePreset, BundleItemInput } from '../../db/saved-bundles';
import { useCart } from '../../context/CartContext';
import { Ionicons } from '@expo/vector-icons';
import { C, F, R } from '../../constants/theme';

export default function BundleModal() {
  const [products, setProducts] = useState<Product[]>([]);
  const [productVariants, setProductVariants] = useState<Record<number, ProductVariant[]>>({});
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [price, setPrice] = useState('');
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [bundleName, setBundleName] = useState('');
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [savedBundleName, setSavedBundleName] = useState('');
  const { addBundle } = useCart();

  useFocusEffect(
    useCallback(() => {
      getActiveProducts().then(async (prods) => {
        setProducts(prods);
        const variantMap: Record<number, ProductVariant[]> = {};
        for (const p of prods) {
          if (p.has_variants) {
            variantMap[p.id] = await getVariantsByProductId(p.id);
          }
        }
        setProductVariants(variantMap);
      });
    }, [])
  );

  const totalSelected = Object.values(quantities).reduce((s, q) => s + q, 0);
  const parsedPrice = parseFloat(price);
  const canConfirm = totalSelected > 0 && parsedPrice > 0;

  const incrementProduct = (id: number) =>
    setQuantities((prev) => {
      const key = `p_${id}`;
      return { ...prev, [key]: (prev[key] ?? 0) + 1 };
    });

  const decrementProduct = (id: number) =>
    setQuantities((prev) => {
      const key = `p_${id}`;
      const cur = prev[key] ?? 0;
      if (cur <= 1) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: cur - 1 };
    });

  const incrementVariant = (variantId: number) =>
    setQuantities((prev) => {
      const key = `v_${variantId}`;
      return { ...prev, [key]: (prev[key] ?? 0) + 1 };
    });

  const decrementVariant = (variantId: number) =>
    setQuantities((prev) => {
      const key = `v_${variantId}`;
      const cur = prev[key] ?? 0;
      if (cur <= 1) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: cur - 1 };
    });

  function buildBundleItems(): BundleItemInput[] {
    const items: BundleItemInput[] = [];
    for (const [key, qty] of Object.entries(quantities)) {
      if (qty <= 0) continue;
      if (key.startsWith('p_')) {
        const productId = Number(key.slice(2));
        const product = products.find((p) => p.id === productId);
        if (product) items.push({ id: product.id, name: product.name, quantity: qty });
      } else if (key.startsWith('v_')) {
        const variantId = Number(key.slice(2));
        for (const [pid, variants] of Object.entries(productVariants)) {
          const variant = variants.find((v) => v.id === variantId);
          if (variant) {
            const product = products.find((p) => p.id === Number(pid));
            items.push({
              id: Number(pid),
              name: product ? `${product.name} - ${variant.name}` : variant.name,
              quantity: qty,
              variantId,
              variantName: variant.name,
            });
            break;
          }
        }
      }
    }
    return items;
  }

  function handleAddToCart() {
    if (!canConfirm) return;
    addBundle({ presetId: null, name: 'Bundle', price: parsedPrice, items: buildBundleItems() });
    router.dismiss();
  }

  function handleSave() {
    if (!canConfirm) return;
    setBundleName('');
    setSaveModalVisible(true);
  }

  async function handleSaveConfirm() {
    if (!bundleName.trim()) return;
    const name = bundleName.trim();
    try {
      await saveBundlePreset(name, buildBundleItems(), parsedPrice);
      setSaveModalVisible(false);
      setSavedBundleName(name);
      setSuccessModalVisible(true);
    } catch {
      Alert.alert('Error', 'Could not save the bundle preset.');
    }
  }

  function renderStepper(key: string, onIncrement: () => void, onDecrement: () => void) {
    const qty = quantities[key] ?? 0;
    return (
      <View style={styles.stepper}>
        <TouchableOpacity
          style={[styles.stepBtn, qty === 0 && styles.stepBtnDim]}
          onPress={onDecrement}
          disabled={qty === 0}
        >
          <Text style={[styles.stepIcon, qty === 0 && styles.stepIconDim]}>−</Text>
        </TouchableOpacity>
        <Text style={[styles.qty, qty > 0 && styles.qtyActive]}>{qty}</Text>
        <TouchableOpacity style={styles.stepBtn} onPress={onIncrement}>
          <Text style={styles.stepIcon}>+</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.stickyPrice}>
        <Text style={styles.stickyPriceLabel}>Bundle Price</Text>
        <View style={styles.priceBox}>
          <Text style={styles.currencySign}>₱</Text>
          <TextInput
            style={styles.priceInput}
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={C.textMuted}
            returnKeyType="done"
          />
        </View>
      </View>

      <FlatList
        data={products}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.listHeaderRow}>
            <Text style={styles.sectionLabel}>Select Items</Text>
            {totalSelected > 0 && (
              <TouchableOpacity onPress={() => setQuantities({})} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.clearAllText}>Clear All</Text>
              </TouchableOpacity>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const isVariant = item.has_variants === 1;
          const variants = isVariant ? (productVariants[item.id] ?? []) : [];

          if (isVariant) {
            return (
              <View style={styles.variantGroup}>
                <Text style={styles.variantGroupName}>{item.name}</Text>
                {variants.map((v) => (
                  <View key={v.id} style={styles.variantRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.variantName}>{v.name}</Text>
                      <Text style={styles.variantPrice}>₱{v.price.toFixed(2)}</Text>
                    </View>
                    {renderStepper(`v_${v.id}`, () => incrementVariant(v.id), () => decrementVariant(v.id))}
                  </View>
                ))}
                {variants.length === 0 && (
                  <Text style={styles.noVariants}>No active variants</Text>
                )}
              </View>
            );
          }

          return (
            <View style={styles.itemRow}>
              <Text style={styles.emoji}>{item.emoji}</Text>
              <Text style={styles.itemName}>{item.name}</Text>
              {renderStepper(`p_${item.id}`, () => incrementProduct(item.id), () => decrementProduct(item.id))}
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>No active products.</Text>}
      />

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.saveBtn, !canConfirm && styles.saveBtnDisabled]}
          disabled={!canConfirm}
          onPress={handleSave}
        >
          <Text style={styles.saveBtnText}>Save</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.confirmBtn, !canConfirm && styles.confirmBtnDisabled]}
          disabled={!canConfirm}
          onPress={handleAddToCart}
        >
          <Text style={styles.confirmBtnText}>Add to Cart</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={successModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => { setSuccessModalVisible(false); router.dismiss(); }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark" size={28} color="#fff" />
            </View>
            <Text style={styles.successTitle}>Bundle Saved!</Text>
            <Text style={styles.successSubtitle}>
              "{savedBundleName}" is now available as a preset on the POS screen.
            </Text>
            <TouchableOpacity
              style={styles.successBtn}
              onPress={() => { setSuccessModalVisible(false); router.dismiss(); }}
            >
              <Text style={styles.successBtnText}>Go to POS</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={saveModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSaveModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Save Bundle Preset</Text>
            <Text style={styles.modalSubtitle}>
              Give this bundle a name so you can quickly apply it later.
            </Text>
            <TextInput
              style={styles.modalInput}
              value={bundleName}
              onChangeText={setBundleName}
              placeholder="Bundle name"
              placeholderTextColor={C.textMuted}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleSaveConfirm}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setSaveModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalOkBtn, !bundleName.trim() && styles.modalOkBtnDisabled]}
                onPress={handleSaveConfirm}
                disabled={!bundleName.trim()}
              >
                <Text style={styles.modalOkText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },

  listHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginTop: 16,
  },
  sectionLabel: {
    color: C.textMuted,
    fontSize: F.xs,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  clearAllText: {
    color: C.red,
    fontSize: F.xs,
    fontWeight: '700',
  },

  itemRow: {
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
  emoji: { fontSize: 22, marginRight: 12 },
  itemName: { flex: 1, color: C.textPrimary, fontSize: F.md, fontWeight: '600' },

  variantGroup: {
    backgroundColor: C.surface,
    borderRadius: R.sm,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: C.borderDark,
    overflow: 'hidden',
  },
  variantGroupName: {
    color: C.pink,
    fontSize: F.md,
    fontWeight: '700',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
  },
  variantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    paddingLeft: 24,
    borderTopWidth: 1,
    borderTopColor: C.borderDark,
  },
  variantName: {
    color: C.textPrimary,
    fontSize: F.sm,
    fontWeight: '600',
  },
  variantPrice: {
    color: C.textSecondary,
    fontSize: F.xs,
    marginTop: 1,
  },
  noVariants: {
    color: C.textMuted,
    fontSize: F.sm,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },

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
  stepBtnDim: { borderColor: C.borderDark },
  stepIcon: { color: C.textPrimary, fontSize: F.lg, fontWeight: '700', lineHeight: 20 },
  stepIconDim: { color: C.textMuted },
  qty: {
    width: 36,
    textAlign: 'center',
    color: C.textSecondary,
    fontSize: F.md,
    fontWeight: '700',
  },
  qtyActive: { color: C.pink },

  empty: { color: C.textMuted, textAlign: 'center', marginTop: 40, fontSize: F.md },

  stickyPrice: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.borderDark,
    backgroundColor: C.bg,
  },
  stickyPriceLabel: {
    color: C.textMuted,
    fontSize: F.xs,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  priceBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  currencySign: { color: C.textSecondary, fontSize: F.xxl, fontWeight: '700', marginRight: 8 },
  priceInput: { flex: 1, color: C.textPrimary, fontSize: F.xxl, fontWeight: '800' },

  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: C.borderDark,
    backgroundColor: C.surface,
  },
  saveBtn: {
    flex: 1,
    backgroundColor: C.green,
    paddingVertical: 16,
    borderRadius: R.sm,
    alignItems: 'center',
  },
  saveBtnDisabled: { backgroundColor: C.elevated, borderWidth: 1, borderColor: C.border },
  saveBtnText: { color: '#fff', fontSize: F.md, fontWeight: '700' },
  confirmBtn: {
    flex: 2,
    backgroundColor: C.pink,
    paddingVertical: 16,
    borderRadius: R.sm,
    alignItems: 'center',
  },
  confirmBtnDisabled: { backgroundColor: C.elevated, borderWidth: 1, borderColor: C.border },
  confirmBtnText: { color: '#fff', fontSize: F.lg, fontWeight: '800' },

  successIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: C.pink,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    alignSelf: 'center',
  },
  successIconText: {},
  successTitle: {
    color: C.textPrimary,
    fontSize: F.xl,
    fontWeight: '800',
    marginBottom: 6,
    textAlign: 'center',
  },
  successSubtitle: {
    color: C.textSecondary,
    fontSize: F.sm,
    textAlign: 'center',
    marginBottom: 22,
    lineHeight: 18,
  },
  successBtn: {
    backgroundColor: C.pink,
    borderRadius: R.sm,
    paddingVertical: 14,
    alignItems: 'center',
  },
  successBtnText: { color: '#fff', fontWeight: '800', fontSize: F.md },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  modalSheet: {
    backgroundColor: C.surface,
    borderRadius: R.xl,
    borderWidth: 1,
    borderColor: C.borderDark,
    padding: 24,
    width: '100%',
  },
  modalTitle: {
    color: C.textPrimary,
    fontSize: F.lg,
    fontWeight: '800',
    marginBottom: 6,
  },
  modalSubtitle: {
    color: C.textSecondary,
    fontSize: F.sm,
    marginBottom: 16,
    lineHeight: 18,
  },
  modalInput: {
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.sm,
    paddingVertical: 12,
    paddingHorizontal: 14,
    color: C.textPrimary,
    fontSize: F.md,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.sm,
    paddingVertical: 13,
    alignItems: 'center',
  },
  modalCancelText: { color: C.textSecondary, fontWeight: '700', fontSize: F.md },
  modalOkBtn: {
    flex: 1,
    backgroundColor: C.green,
    borderRadius: R.sm,
    paddingVertical: 13,
    alignItems: 'center',
  },
  modalOkBtnDisabled: { backgroundColor: C.elevated, borderColor: C.border, borderWidth: 1 },
  modalOkText: { color: '#fff', fontWeight: '800', fontSize: F.md },
});
