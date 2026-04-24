import React, { useState, useCallback } from 'react';
import {
  View, FlatList, Text, TouchableOpacity, StyleSheet, SafeAreaView,
} from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { ProductTile } from '../components/ProductTile';
import { useCart } from '../context/CartContext';
import { getActiveProducts, Product } from '../db/products';
import { C, F, R } from '../constants/theme';

export default function POSScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const { items, total, addItem, removeItem, decrementItem } = useCart();

  useFocusEffect(
    useCallback(() => {
      getActiveProducts().then(setProducts);
    }, [])
  );

  const getBadge = (productId: number) =>
    items.find((i) => i.productId === productId)?.quantity ?? 0;

  const cartCount = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.brandName}>Zoomy</Text>
          <Text style={styles.brandSub}>Point of Sale</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => router.push('/modals/products')} style={styles.headerBtn}>
            <Text style={styles.headerIcon}>📦</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/modals/transactions')} style={styles.headerBtn}>
            <Text style={styles.headerIcon}>🧾</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push({ pathname: '/modals/admin', params: { action: 'settings' } })}
            style={styles.headerBtn}
          >
            <Text style={styles.headerIcon}>⚙️</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={products}
        keyExtractor={(p) => String(p.id)}
        numColumns={3}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.row}
        renderItem={({ item }) => (
          <View style={styles.tileWrapper}>
            <ProductTile
              id={item.id}
              name={item.name}
              emoji={item.emoji}
              badgeCount={getBadge(item.id)}
              onPress={() => addItem({ id: item.id, name: item.name, price: item.price })}
              onLongPress={() => removeItem(item.id)}
              onMinus={() => decrementItem(item.id)}
            />
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No products yet.{'\n'}Tap 📦 to add some.</Text>
        }
      />

      <View style={styles.footer}>
        <View style={styles.footerLeft}>
          {cartCount > 0 && (
            <Text style={styles.cartCount}>{cartCount} item{cartCount !== 1 ? 's' : ''}</Text>
          )}
          <Text style={styles.total}>₱{total.toFixed(2)}</Text>
        </View>
        <TouchableOpacity
          style={[styles.chargeBtn, items.length === 0 && styles.chargeBtnDisabled]}
          disabled={items.length === 0}
          onPress={() => router.push('/modals/payment')}
        >
          <Text style={styles.chargeBtnText}>Charge</Text>
        </TouchableOpacity>
      </View>
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
  headerActions: { flexDirection: 'row', gap: 4 },
  headerBtn: {
    padding: 10,
    backgroundColor: C.surface,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: C.borderDark,
  },
  headerIcon: { fontSize: 20 },

  grid: { padding: 12, paddingBottom: 4 },
  row: { gap: 8, marginBottom: 8 },
  tileWrapper: { flex: 1, maxWidth: '33.33%' },

  empty: {
    color: C.textMuted,
    textAlign: 'center',
    marginTop: 80,
    fontSize: F.md,
    lineHeight: 24,
  },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: C.borderDark,
    backgroundColor: C.surface,
    gap: 12,
  },
  footerLeft: { flex: 1, gap: 2 },
  cartCount: { color: C.textSecondary, fontSize: F.sm, fontWeight: '600' },
  total: { color: C.textPrimary, fontSize: F.xxl, fontWeight: '800' },

  chargeBtn: {
    backgroundColor: C.red,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: R.sm,
  },
  chargeBtnDisabled: { backgroundColor: C.elevated, borderWidth: 1, borderColor: C.border },
  chargeBtnText: { color: '#fff', fontWeight: '800', fontSize: F.lg },
});
