import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Modal,
  StyleSheet, SafeAreaView,
} from 'react-native';
import { ProductTile } from './ProductTile';
import { ProductVariant } from '../db/products';
import { C, F, R } from '../constants/theme';
import { useColumns } from '../hooks/useColumns';

type Props = {
  visible: boolean;
  productName: string;
  variants: ProductVariant[];
  initialQuantities: Record<number, number>;
  onDone: (selections: { variantId: number; variantName: string; price: number; quantity: number }[]) => void;
  onClose: () => void;
};

export function VariantPickerModal({ visible, productName, variants, initialQuantities, onDone, onClose }: Props) {
  const { numColumns, tileMaxWidth } = useColumns();
  const [quantities, setQuantities] = useState<Record<number, number>>({});

  useEffect(() => {
    if (visible) {
      setQuantities(initialQuantities);
    }
  }, [visible, initialQuantities]);

  function increment(variantId: number) {
    setQuantities((q) => ({ ...q, [variantId]: (q[variantId] ?? 0) + 1 }));
  }

  function remove(variantId: number) {
    setQuantities((q) => {
      const next = { ...q };
      delete next[variantId];
      return next;
    });
  }

  function decrement(variantId: number) {
    setQuantities((q) => {
      const current = q[variantId] ?? 0;
      if (current <= 1) {
        const next = { ...q };
        delete next[variantId];
        return next;
      }
      return { ...q, [variantId]: current - 1 };
    });
  }

  function handleDone() {
    const selections = variants
      .filter((v) => (quantities[v.id] ?? 0) > 0)
      .map((v) => ({
        variantId: v.id,
        variantName: v.name,
        price: v.price,
        quantity: quantities[v.id],
      }));
    onDone(selections);
  }

  const totalItems = Object.values(quantities).reduce((s, q) => s + q, 0);
  const totalPrice = variants.reduce((s, v) => s + v.price * (quantities[v.id] ?? 0), 0);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <SafeAreaView style={styles.sheet}>
          <Text style={styles.title}>{productName}</Text>
          <Text style={styles.subtitle}>Select variants</Text>

          <FlatList
            key={numColumns}
            data={variants}
            keyExtractor={(v) => String(v.id)}
            numColumns={numColumns}
            contentContainerStyle={styles.grid}
            columnWrapperStyle={styles.row}
            renderItem={({ item }) => (
              <View style={[styles.tileWrapper, { maxWidth: tileMaxWidth }]}>
                <ProductTile
                  id={item.id}
                  name={item.name}
                  price={item.price}
                  badgeCount={quantities[item.id] ?? 0}
                  onPress={() => increment(item.id)}
                  onLongPress={() => remove(item.id)}
                  onMinus={() => decrement(item.id)}
                />
              </View>
            )}
            ListEmptyComponent={
              <Text style={styles.empty}>No active variants for this product.</Text>
            }
          />

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.doneBtn} onPress={handleDone}>
              <Text style={styles.doneText}>
                {totalItems > 0
                  ? `Done (${totalItems} item${totalItems !== 1 ? 's' : ''} — ₱${totalPrice.toFixed(2)})`
                  : 'Done'}
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: C.bg,
    borderTopLeftRadius: R.xl,
    borderTopRightRadius: R.xl,
    borderTopWidth: 1,
    borderColor: C.borderDark,
    maxHeight: '85%',
  },
  title: {
    color: C.textPrimary,
    fontSize: F.xl,
    fontWeight: '800',
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  subtitle: {
    color: C.textSecondary,
    fontSize: F.sm,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  grid: { padding: 12, paddingBottom: 4 },
  row: { gap: 8, marginBottom: 8 },
  tileWrapper: { flex: 1 },
  empty: {
    color: C.textMuted,
    textAlign: 'center',
    marginTop: 40,
    fontSize: F.md,
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: C.borderDark,
    backgroundColor: C.surface,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.sm,
    padding: 14,
    alignItems: 'center',
  },
  cancelText: { color: C.textSecondary, fontWeight: '700', fontSize: F.md },
  doneBtn: {
    flex: 2,
    backgroundColor: C.pink,
    borderRadius: R.sm,
    padding: 14,
    alignItems: 'center',
  },
  doneText: { color: '#fff', fontWeight: '800', fontSize: F.md },
});
