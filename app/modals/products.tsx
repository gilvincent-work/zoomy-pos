import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, Switch, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getAllProducts, createProduct, updateProduct, Product } from '../../db/products';

type FormState = { name: string; price: string; emoji: string };
const EMPTY_FORM: FormState = { name: '', price: '', emoji: '🍬' };

export default function ProductsModal() {
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);

  useFocusEffect(
    useCallback(() => { getAllProducts().then(setProducts); }, [])
  );

  async function handleSave() {
    const name = form.name.trim();
    const price = parseFloat(form.price);
    const emoji = form.emoji.trim() || '🍬';

    if (!name) { Alert.alert('Required', 'Product name is required.'); return; }
    if (isNaN(price) || price <= 0) { Alert.alert('Invalid price', 'Enter a valid price.'); return; }

    if (editingId !== null) {
      const existing = products.find((p) => p.id === editingId)!;
      await updateProduct(editingId, { name, price, emoji, is_active: existing.is_active });
    } else {
      await createProduct({ name, price, emoji });
    }

    const updated = await getAllProducts();
    setProducts(updated);
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
  }

  async function handleToggle(product: Product) {
    await updateProduct(product.id, {
      name: product.name,
      price: product.price,
      emoji: product.emoji,
      is_active: product.is_active === 1 ? 0 : 1,
    });
    const updated = await getAllProducts();
    setProducts(updated);
  }

  function startEdit(product: Product) {
    setForm({ name: product.name, price: String(product.price), emoji: product.emoji });
    setEditingId(product.id);
    setShowForm(true);
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        {showForm ? (
          <View style={styles.form}>
            <Text style={styles.formTitle}>{editingId ? 'Edit Product' : 'New Product'}</Text>
            <TextInput
              style={styles.input}
              placeholder="Emoji"
              placeholderTextColor="#666"
              value={form.emoji}
              onChangeText={(v) => setForm((f) => ({ ...f, emoji: v }))}
              maxLength={2}
            />
            <TextInput
              style={styles.input}
              placeholder="Product name"
              placeholderTextColor="#666"
              value={form.name}
              onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
            />
            <TextInput
              style={styles.input}
              placeholder="Price (e.g. 120)"
              placeholderTextColor="#666"
              value={form.price}
              onChangeText={(v) => setForm((f) => ({ ...f, price: v }))}
              keyboardType="decimal-pad"
            />
            <View style={styles.formBtns}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => { setShowForm(false); setForm(EMPTY_FORM); setEditingId(null); }}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            <TouchableOpacity style={styles.addBtn} onPress={() => setShowForm(true)}>
              <Text style={styles.addBtnText}>+ New Product</Text>
            </TouchableOpacity>
            <FlatList
              data={products}
              keyExtractor={(p) => String(p.id)}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => (
                <View style={styles.productRow}>
                  <TouchableOpacity style={styles.productInfo} onPress={() => startEdit(item)}>
                    <Text style={styles.productEmoji}>{item.emoji}</Text>
                    <View>
                      <Text style={styles.productName}>{item.name}</Text>
                      <Text style={styles.productPrice}>₱{item.price.toFixed(2)}</Text>
                    </View>
                  </TouchableOpacity>
                  <Switch
                    value={item.is_active === 1}
                    onValueChange={() => handleToggle(item)}
                    trackColor={{ false: '#333', true: '#e94560' }}
                    thumbColor="#fff"
                  />
                </View>
              )}
              ListEmptyComponent={
                <Text style={styles.empty}>No products yet. Tap "+ New Product" above.</Text>
              }
            />
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  list: { padding: 16 },
  addBtn: {
    margin: 16, backgroundColor: '#e94560', borderRadius: 8,
    padding: 14, alignItems: 'center',
  },
  addBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  productRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#16213e', borderRadius: 8, padding: 14, marginBottom: 8,
  },
  productInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  productEmoji: { fontSize: 28 },
  productName: { color: '#eee', fontSize: 14, fontWeight: 'bold' },
  productPrice: { color: '#e94560', fontSize: 12, marginTop: 2 },
  empty: { color: '#666', textAlign: 'center', marginTop: 40 },
  form: { padding: 20, gap: 12 },
  formTitle: { color: '#eee', fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  input: {
    backgroundColor: '#16213e', color: '#eee', borderRadius: 8,
    padding: 14, fontSize: 15, borderWidth: 1, borderColor: '#0f3460',
  },
  formBtns: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: {
    flex: 1, backgroundColor: '#16213e', borderRadius: 8,
    padding: 14, alignItems: 'center',
  },
  cancelText: { color: '#aaa', fontWeight: 'bold' },
  saveBtn: {
    flex: 2, backgroundColor: '#e94560', borderRadius: 8,
    padding: 14, alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});
