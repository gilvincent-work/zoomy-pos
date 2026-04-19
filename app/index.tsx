import React, { useState, useCallback } from 'react';
import {
  View, FlatList, Text, TouchableOpacity, StyleSheet, SafeAreaView,
} from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { ProductTile } from '../components/ProductTile';
import { useCart } from '../context/CartContext';
import { getActiveProducts, Product } from '../db/products';

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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.push('/modals/products')} style={styles.headerBtn}>
          <Text style={styles.headerIcon}>📦</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/modals/transactions')} style={styles.headerBtn}>
          <Text style={styles.headerIcon}>🧾</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push({ pathname: '/modals/admin', params: { action: 'change_pin' } })}
          style={styles.headerBtn}
        >
          <Text style={styles.headerIcon}>⚙️</Text>
        </TouchableOpacity>
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
          <Text style={styles.empty}>No products yet. Tap 📦 to add some.</Text>
        }
      />

      <View style={styles.footer}>
        <Text style={styles.total}>₱{total.toFixed(2)}</Text>
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
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  headerBtn: { padding: 8 },
  headerIcon: { fontSize: 22 },
  grid: { padding: 12 },
  row: { gap: 8, marginBottom: 8 },
  tileWrapper: { flex: 1, maxWidth: '33.33%' },
  empty: { color: '#666', textAlign: 'center', marginTop: 60, fontSize: 14 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#0f3460',
    backgroundColor: '#16213e',
  },
  total: { color: '#eee', fontSize: 22, fontWeight: 'bold' },
  chargeBtn: {
    backgroundColor: '#e94560',
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 8,
  },
  chargeBtnDisabled: { backgroundColor: '#555' },
  chargeBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});
