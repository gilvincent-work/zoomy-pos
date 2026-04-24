import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { Transaction } from '../db/transactions';
import { C, F, R } from '../constants/theme';

type Props = { transaction: Transaction; onPress: (t: Transaction) => void };

export function TransactionRow({ transaction, onPress }: Props) {
  const date = new Date(transaction.created_at);
  const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const isVoided = transaction.status === 'voided';
  const methodLabel = transaction.payment_method === 'gcash' ? 'GCash'
    : transaction.payment_method === 'bank_transfer' ? 'Bank'
    : 'Cash';
  const hasProof = !!transaction.ref_number || !!transaction.proof_photo_uri;
  const isDigital = transaction.payment_method !== 'cash';

  return (
    <TouchableOpacity
      style={[styles.row, isVoided && styles.voided]}
      onPress={() => onPress(transaction)}
      activeOpacity={0.7}
    >
      <View style={{ flex: 1 }}>
        <View style={styles.topRow}>
          <Text style={styles.time}>{dateStr} · {time}</Text>
          <View style={styles.methodBadge}>
            <Text style={styles.methodText}>{methodLabel}</Text>
          </View>
          {isDigital && (
            <View style={[styles.proofBadge, hasProof ? styles.proofBadgeGreen : styles.proofBadgeRed]}>
              <Text style={styles.proofBadgeText}>{hasProof ? '✓ Proof' : 'No Proof'}</Text>
            </View>
          )}
        </View>
        <Text style={styles.items} numberOfLines={2}>
          {transaction.items.map((i) => `${i.product_name} ×${i.quantity}`).join('  ·  ')}
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
    backgroundColor: C.surface,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.borderDark,
    padding: 16,
    marginBottom: 8,
  },
  voided: { opacity: 0.45 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  time: { color: C.textSecondary, fontSize: F.sm },
  methodBadge: {
    backgroundColor: C.elevated,
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: C.border,
  },
  methodText: { color: C.textSecondary, fontSize: F.xs, fontWeight: '700' },
  items: { color: C.textPrimary, fontSize: F.md, lineHeight: 20 },
  right: { alignItems: 'flex-end', paddingLeft: 12 },
  total: { color: C.pink, fontSize: F.xl, fontWeight: '800' },
  voidedText: { textDecorationLine: 'line-through', color: C.textMuted },
  voidedLabel: { color: C.red, fontSize: F.xs, marginTop: 3, fontWeight: '700' },
  proofBadge: { borderRadius: 4, paddingHorizontal: 7, paddingVertical: 2 },
  proofBadgeGreen: { backgroundColor: C.greenSubtle },
  proofBadgeRed: { backgroundColor: C.redSubtle },
  proofBadgeText: { color: C.textPrimary, fontSize: F.xs, fontWeight: '700' },
});
