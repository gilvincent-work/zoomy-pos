import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, TextInput,
  StyleSheet, SafeAreaView, Alert,
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
  const { setBundle } = useCart();

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
    setBundle(buildBundleItems(), parsedPrice);
    router.dismiss();
  }

  function handleSave() {
    if (!canConfirm) return;
    Alert.prompt(
      'Save Bundle Preset',
      'Give this bundle a name so you can quickly apply it later.',
      async (name) => {
        if (!name?.trim()) return;
        try {
          await saveBundlePreset(name.trim(), buildBundleItems(), parsedPrice);
          Alert.alert('Saved!', `"${name.trim()}" is now available as a preset on the POS screen.`);
        } catch {
          Alert.alert('Error', 'Could not save the bundle preset.');
        }
      },
      'plain-text',
      '',
      'default'
    );
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
});
