import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, TextInput,
  StyleSheet, SafeAreaView, Alert, Modal,
} from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { getActiveProducts, Product } from '../../db/products';
import { saveBundlePreset } from '../../db/saved-bundles';
import { useCart } from '../../context/CartContext';
import { C, F, R } from '../../constants/theme';

export default function BundleModal() {
  const [products, setProducts] = useState<Product[]>([]);
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [price, setPrice] = useState('');
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [bundleName, setBundleName] = useState('');
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [savedBundleName, setSavedBundleName] = useState('');
  const { addBundle } = useCart();

  useFocusEffect(
    useCallback(() => {
      getActiveProducts().then(setProducts);
    }, [])
  );

  const totalSelected = Object.values(quantities).reduce((s, q) => s + q, 0);
  const parsedPrice = parseFloat(price);
  const canConfirm = totalSelected > 0 && parsedPrice > 0;

  const increment = (id: number) =>
    setQuantities((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));

  const decrement = (id: number) =>
    setQuantities((prev) => {
      const cur = prev[id] ?? 0;
      if (cur <= 1) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: cur - 1 };
    });

  function buildBundleItems() {
    return products
      .filter((p) => (quantities[p.id] ?? 0) > 0)
      .map((p) => ({ id: p.id, name: p.name, quantity: quantities[p.id] }));
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

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={products}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={styles.list}
        ListHeaderComponent={<Text style={styles.sectionLabel}>Select Items</Text>}
        renderItem={({ item }) => {
          const qty = quantities[item.id] ?? 0;
          return (
            <View style={styles.itemRow}>
              <Text style={styles.emoji}>{item.emoji}</Text>
              <Text style={styles.itemName}>{item.name}</Text>
              <View style={styles.stepper}>
                <TouchableOpacity
                  style={[styles.stepBtn, qty === 0 && styles.stepBtnDim]}
                  onPress={() => decrement(item.id)}
                  disabled={qty === 0}
                >
                  <Text style={[styles.stepIcon, qty === 0 && styles.stepIconDim]}>−</Text>
                </TouchableOpacity>
                <Text style={[styles.qty, qty > 0 && styles.qtyActive]}>{qty}</Text>
                <TouchableOpacity style={styles.stepBtn} onPress={() => increment(item.id)}>
                  <Text style={styles.stepIcon}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>No active products.</Text>}
        ListFooterComponent={
          <View style={styles.priceSection}>
            <Text style={styles.sectionLabel}>Bundle Price</Text>
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
        }
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
              <Text style={styles.successIconText}>✓</Text>
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

  sectionLabel: {
    color: C.textMuted,
    fontSize: F.xs,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginTop: 16,
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

  priceSection: { marginTop: 8 },
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
    backgroundColor: C.elevated,
    paddingVertical: 16,
    borderRadius: R.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: C.textSecondary, fontSize: F.md, fontWeight: '700' },
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
  successIconText: { color: '#fff', fontSize: 28, fontWeight: '800' },
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
    backgroundColor: C.pink,
    borderRadius: R.sm,
    paddingVertical: 13,
    alignItems: 'center',
  },
  modalOkBtnDisabled: { backgroundColor: C.elevated, borderColor: C.border, borderWidth: 1 },
  modalOkText: { color: '#fff', fontWeight: '800', fontSize: F.md },
});
