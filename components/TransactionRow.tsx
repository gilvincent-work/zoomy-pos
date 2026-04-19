import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { Transaction } from '../db/transactions';

type Props = { transaction: Transaction; onPress: (t: Transaction) => void };

export function TransactionRow({ transaction, onPress }: Props) {
  const date = new Date(transaction.created_at);
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const isVoided = transaction.status === 'voided';

  return (
    <TouchableOpacity
      style={[styles.row, isVoided && styles.voided]}
      onPress={() => onPress(transaction)}
      activeOpacity={0.7}
    >
      <View>
        <Text style={styles.time}>{time}</Text>
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
  time: { color: '#aaa', fontSize: 11 },
  items: { color: '#eee', fontSize: 12, marginTop: 2 },
  right: { alignItems: 'flex-end' },
  total: { color: '#e94560', fontSize: 16, fontWeight: 'bold' },
  voidedText: { textDecorationLine: 'line-through', color: '#888' },
  voidedLabel: { color: '#e94560', fontSize: 10, marginTop: 2 },
});
