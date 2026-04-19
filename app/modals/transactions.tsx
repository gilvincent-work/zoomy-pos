import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  SafeAreaView, Modal,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { TransactionRow } from '../../components/TransactionRow';
import { getAllTransactions, Transaction } from '../../db/transactions';

type DateFilter = 'today' | 'week' | 'month' | 'all';

function getFilterStart(filter: DateFilter): Date | null {
  const now = new Date();
  switch (filter) {
    case 'today': {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case 'week': {
      const d = new Date(now);
      d.setDate(d.getDate() - d.getDay());
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case 'month': {
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      return d;
    }
    case 'all':
      return null;
  }
}

const FILTERS: { key: DateFilter; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'all', label: 'All' },
];

export default function TransactionsModal() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [filter, setFilter] = useState<DateFilter>('today');

  useFocusEffect(
    useCallback(() => { getAllTransactions().then(setTransactions); }, [])
  );

  const filtered = useMemo(() => {
    const start = getFilterStart(filter);
    if (!start) return transactions;
    return transactions.filter((t) => new Date(t.created_at) >= start);
  }, [transactions, filter]);

  const filteredTotal = useMemo(
    () => filtered.filter((t) => t.status === 'completed').reduce((sum, t) => sum + t.total, 0),
    [filtered]
  );

  function handleVoid() {
    if (!selected) return;
    setSelected(null);
    router.push({
      pathname: '/modals/admin',
      params: { action: 'void_transaction', transactionId: String(selected.id) },
    });
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterBtn, filter === f.key && styles.filterBtnActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.summaryBar}>
        <Text style={styles.summaryCount}>{filtered.length} transaction{filtered.length !== 1 ? 's' : ''}</Text>
        <Text style={styles.summaryTotal}>Total: ₱{filteredTotal.toFixed(2)}</Text>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(t) => String(t.id)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TransactionRow transaction={item} onPress={setSelected} />
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No transactions for this period.</Text>
        }
      />

      <Modal
        visible={!!selected}
        transparent
        animationType="slide"
        onRequestClose={() => setSelected(null)}
      >
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            {selected && (
              <>
                <Text style={styles.sheetTitle}>Transaction #{selected.id}</Text>
                <Text style={styles.sheetTime}>
                  {new Date(selected.created_at).toLocaleString()}
                </Text>

                {selected.items.map((item) => (
                  <View key={item.id} style={styles.itemRow}>
                    <Text style={styles.itemName}>
                      {item.product_name} × {item.quantity}
                    </Text>
                    <Text style={styles.itemPrice}>
                      ₱{(item.price * item.quantity).toFixed(2)}
                    </Text>
                  </View>
                ))}

                <View style={styles.divider} />
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Total</Text>
                  <Text style={styles.summaryValue}>₱{selected.total.toFixed(2)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Cash</Text>
                  <Text style={styles.summaryValue}>₱{selected.cash_tendered.toFixed(2)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Change</Text>
                  <Text style={styles.summaryValue}>₱{selected.change.toFixed(2)}</Text>
                </View>

                <View style={styles.sheetBtns}>
                  <TouchableOpacity style={styles.closeBtn} onPress={() => setSelected(null)}>
                    <Text style={styles.closeBtnText}>Close</Text>
                  </TouchableOpacity>
                  {selected.status === 'completed' && (
                    <TouchableOpacity style={styles.voidBtn} onPress={handleVoid}>
                      <Text style={styles.voidBtnText}>Void Transaction</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  filterRow: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4,
  },
  filterBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 6,
    backgroundColor: '#16213e', alignItems: 'center',
  },
  filterBtnActive: { backgroundColor: '#e94560' },
  filterText: { color: '#888', fontSize: 12, fontWeight: 'bold' },
  filterTextActive: { color: '#fff' },
  summaryBar: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 8,
  },
  summaryCount: { color: '#aaa', fontSize: 12 },
  summaryTotal: { color: '#e94560', fontSize: 12, fontWeight: 'bold' },
  list: { padding: 16, paddingTop: 4 },
  empty: { color: '#666', textAlign: 'center', marginTop: 40 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#16213e', borderTopLeftRadius: 16, borderTopRightRadius: 16,
    padding: 20, paddingBottom: 36,
  },
  sheetTitle: { color: '#eee', fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  sheetTime: { color: '#aaa', fontSize: 12, marginBottom: 14 },
  itemRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginBottom: 6,
  },
  itemName: { color: '#eee', fontSize: 13 },
  itemPrice: { color: '#eee', fontSize: 13 },
  divider: { height: 1, backgroundColor: '#0f3460', marginVertical: 10 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  summaryLabel: { color: '#aaa', fontSize: 13 },
  summaryValue: { color: '#eee', fontSize: 13, fontWeight: 'bold' },
  sheetBtns: { flexDirection: 'row', gap: 12, marginTop: 20 },
  closeBtn: {
    flex: 1, backgroundColor: '#1a1a2e', borderRadius: 8,
    padding: 14, alignItems: 'center',
  },
  closeBtnText: { color: '#aaa', fontWeight: 'bold' },
  voidBtn: {
    flex: 2, backgroundColor: '#c0392b', borderRadius: 8,
    padding: 14, alignItems: 'center',
  },
  voidBtnText: { color: '#fff', fontWeight: 'bold' },
});
