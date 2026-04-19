import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { DenominationButton } from '../../components/DenominationButton';
import { useCart, CartItem } from '../../context/CartContext';
import { insertTransaction, PaymentMethod } from '../../db/transactions';

const DENOMINATIONS = [1, 5, 10, 20, 50, 100, 200, 500, 1000];

const PAYMENT_METHODS: { key: PaymentMethod; label: string; icon: string }[] = [
  { key: 'cash', label: 'Cash', icon: '💵' },
  { key: 'gcash', label: 'GCash', icon: '📱' },
  { key: 'bank_transfer', label: 'Bank', icon: '🏦' },
];

export default function PaymentModal() {
  const { items, total, clearCart, addItem, decrementItem } = useCart();
  const [tendered, setTendered] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>('cash');

  const isCash = method === 'cash';
  const change = tendered - total;
  const canConfirm = isCash
    ? tendered >= total && items.length > 0
    : items.length > 0;

  async function handleConfirm() {
    try {
      await insertTransaction({
        total,
        cashTendered: isCash ? tendered : total,
        change: isCash ? change : 0,
        paymentMethod: method,
        items: items.map((i) => ({
          productId: i.productId,
          productName: i.productName,
          price: i.price,
          quantity: i.quantity,
        })),
      });
      clearCart();
      router.dismiss();
    } catch {
      Alert.alert('Error', 'Failed to save transaction. Please try again.');
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.sectionLabel}>ORDER SUMMARY</Text>
        {items.map((item) => (
          <View key={item.productId} style={styles.itemRow}>
            <Text style={styles.itemName}>{item.productName}</Text>
            <View style={styles.qtyControls}>
              <TouchableOpacity
                style={styles.qtyBtn}
                onPress={() => decrementItem(item.productId)}
              >
                <Text style={styles.qtyBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.qtyText}>{item.quantity}</Text>
              <TouchableOpacity
                style={styles.qtyBtn}
                onPress={() => addItem({ id: item.productId, name: item.productName, price: item.price })}
              >
                <Text style={styles.qtyBtnText}>+</Text>
              </TouchableOpacity>
              <Text style={styles.itemTotal}>₱{(item.price * item.quantity).toFixed(2)}</Text>
            </View>
          </View>
        ))}
        <View style={styles.divider} />
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>TOTAL</Text>
          <Text style={styles.totalAmount}>₱{total.toFixed(2)}</Text>
        </View>

        <Text style={styles.sectionLabel}>PAYMENT METHOD</Text>
        <View style={styles.methodRow}>
          {PAYMENT_METHODS.map((m) => (
            <TouchableOpacity
              key={m.key}
              style={[styles.methodBtn, method === m.key && styles.methodBtnActive]}
              onPress={() => { setMethod(m.key); if (m.key !== 'cash') setTendered(0); }}
            >
              <Text style={styles.methodIcon}>{m.icon}</Text>
              <Text style={[styles.methodLabel, method === m.key && styles.methodLabelActive]}>
                {m.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {isCash && (
          <>
            <Text style={styles.sectionLabel}>CASH TENDERED</Text>
            <View style={styles.tenderedBox}>
              <Text style={styles.tenderedAmount}>₱{tendered.toFixed(2)}</Text>
            </View>

            <View style={styles.denomGrid}>
              {DENOMINATIONS.map((d) => (
                <View key={d} style={styles.denomCell}>
                  <DenominationButton amount={d} onPress={(v) => setTendered((t) => t + v)} />
                </View>
              ))}
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.clearBtn} onPress={() => setTendered(0)}>
                <Text style={styles.clearBtnText}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.exactBtn}
                onPress={() => setTendered(total)}
              >
                <Text style={styles.exactBtnText}>Exact</Text>
              </TouchableOpacity>
            </View>

            {tendered > 0 && (
              <View style={styles.changeBox}>
                <Text style={styles.changeLabel}>CHANGE</Text>
                <Text style={[styles.changeAmount, change < 0 && styles.changeNegative]}>
                  ₱{Math.abs(change).toFixed(2)}
                </Text>
              </View>
            )}
          </>
        )}

        {!isCash && (
          <View style={styles.digitalBox}>
            <Text style={styles.digitalIcon}>
              {PAYMENT_METHODS.find((m) => m.key === method)?.icon}
            </Text>
            <Text style={styles.digitalAmount}>₱{total.toFixed(2)}</Text>
            <Text style={styles.digitalHint}>
              Collect via {method === 'gcash' ? 'GCash' : 'Bank Transfer'} before confirming
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.cancelBtn} onPress={() => router.dismiss()}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.confirmBtn, !canConfirm && styles.confirmBtnDisabled]}
          disabled={!canConfirm}
          onPress={handleConfirm}
        >
          <Text style={styles.confirmBtnText}>Confirm Sale</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  scroll: { padding: 16 },
  sectionLabel: { color: '#aaa', fontSize: 11, fontWeight: 'bold', marginTop: 16, marginBottom: 8 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  itemName: { color: '#eee', fontSize: 14, flex: 1 },
  qtyControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn: {
    backgroundColor: '#0f3460', borderRadius: 6, width: 28, height: 28,
    alignItems: 'center', justifyContent: 'center',
  },
  qtyBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  qtyText: { color: '#eee', fontSize: 14, fontWeight: 'bold', minWidth: 20, textAlign: 'center' },
  itemTotal: { color: '#eee', fontSize: 14, minWidth: 70, textAlign: 'right' },
  divider: { height: 1, backgroundColor: '#0f3460', marginVertical: 10 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { color: '#aaa', fontSize: 14, fontWeight: 'bold' },
  totalAmount: { color: '#e94560', fontSize: 24, fontWeight: 'bold' },
  methodRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  methodBtn: {
    flex: 1, backgroundColor: '#16213e', borderRadius: 8,
    paddingVertical: 12, alignItems: 'center', borderWidth: 2, borderColor: 'transparent',
  },
  methodBtnActive: { borderColor: '#e94560', backgroundColor: '#1a1a2e' },
  methodIcon: { fontSize: 24, marginBottom: 4 },
  methodLabel: { color: '#888', fontSize: 12, fontWeight: 'bold' },
  methodLabelActive: { color: '#e94560' },
  tenderedBox: {
    backgroundColor: '#16213e',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  tenderedAmount: { color: '#fff', fontSize: 28, fontWeight: 'bold' },
  denomGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  denomCell: { width: '30%' },
  actionRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  clearBtn: {
    flex: 1, backgroundColor: '#16213e', borderRadius: 6,
    padding: 12, alignItems: 'center',
  },
  clearBtnText: { color: '#aaa', fontWeight: 'bold' },
  exactBtn: {
    flex: 1, backgroundColor: '#0f3460', borderRadius: 6,
    padding: 12, alignItems: 'center',
  },
  exactBtnText: { color: '#eee', fontWeight: 'bold' },
  changeBox: {
    backgroundColor: '#0d7a3e', borderRadius: 8, padding: 14,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  changeLabel: { color: '#fff', fontWeight: 'bold' },
  changeAmount: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  changeNegative: { color: '#ffaaaa' },
  digitalBox: {
    backgroundColor: '#16213e', borderRadius: 8, padding: 24,
    alignItems: 'center', marginTop: 8,
  },
  digitalIcon: { fontSize: 36, marginBottom: 8 },
  digitalAmount: { color: '#fff', fontSize: 28, fontWeight: 'bold', marginBottom: 4 },
  digitalHint: { color: '#aaa', fontSize: 12, textAlign: 'center' },
  footer: {
    flexDirection: 'row', gap: 12, padding: 16,
    borderTopWidth: 1, borderTopColor: '#0f3460',
  },
  cancelBtn: {
    flex: 1, backgroundColor: '#16213e', borderRadius: 8,
    padding: 14, alignItems: 'center',
  },
  cancelBtnText: { color: '#aaa', fontWeight: 'bold', fontSize: 15 },
  confirmBtn: {
    flex: 2, backgroundColor: '#e94560', borderRadius: 8,
    padding: 14, alignItems: 'center',
  },
  confirmBtnDisabled: { backgroundColor: '#555' },
  confirmBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});
