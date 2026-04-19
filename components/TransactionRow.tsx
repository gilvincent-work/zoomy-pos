import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { Transaction } from '../db/transactions';

type Props = { transaction: Transaction; onPress: (t: Transaction) => void };

export function TransactionRow({ transaction, onPress }: Props) {
  const date = new Date(transaction.created_at);
  const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const isVoided = transaction.status === 'voided';
  const methodLabel = transaction.payment_method === 'gcash' ? 'GCash'
    : transaction.payment_method === 'bank_transfer' ? 'Bank'
    : 'Cash';

  return (
    <TouchableOpacity
      style={[styles.row, isVoided && styles.voided]}
      onPress={() => onPress(transaction)}
      activeOpacity={0.7}
    >
      <View style={{ flex: 1 }}>
        <View style={styles.topRow}>
          <Text style={styles.time}>{dateStr} {time}</Text>
          <View style={styles.methodBadge}>
            <Text style={styles.methodText}>{methodLabel}</Text>
          </View>
        </View>
        <Text style={styles.items}>
          {transaction.items.map((i) => `${i.product_name} x${i.quantity}`).join(', ')}
        </Text>
      </View>
      <View style={styles.right}>
        <Text style={[styles.total, isVoided && styles.voidedText]}>
          ₱{transaction.total.toFixed(2)}
        </Text>
        {isVoided && <Text style={styles.voidedLabel}>VOIDED</Text>}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#16213e',
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
  },
  voided: { opacity: 0.5 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  time: { color: '#aaa', fontSize: 11 },
  methodBadge: {
    backgroundColor: '#0f3460', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1,
  },
  methodText: { color: '#aaa', fontSize: 9, fontWeight: 'bold' },
  items: { color: '#eee', fontSize: 12, marginTop: 2 },
  right: { alignItems: 'flex-end' },
  total: { color: '#e94560', fontSize: 16, fontWeight: 'bold' },
  voidedText: { textDecorationLine: 'line-through', color: '#888' },
  voidedLabel: { color: '#e94560', fontSize: 10, marginTop: 2 },
});
