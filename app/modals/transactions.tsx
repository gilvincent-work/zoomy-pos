import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  SafeAreaView, Modal, Image,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { TransactionRow } from '../../components/TransactionRow';
import { getAllTransactions, Transaction, PaymentMethod } from '../../db/transactions';

type DateFilter = 'today' | 'week' | 'month' | 'all';
type MethodFilter = 'all' | PaymentMethod;

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

const DATE_FILTERS: { key: DateFilter; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'all', label: 'All' },
];

const METHOD_FILTERS: { key: MethodFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'cash', label: '💵 Cash' },
  { key: 'gcash', label: '📱 GCash' },
  { key: 'bank_transfer', label: '🏦 Bank' },
];

function getMethodDisplayName(method: PaymentMethod): string {
  switch (method) {
    case 'gcash': return 'GCash';
    case 'bank_transfer': return 'Bank Transfer';
    default: return 'Cash';
  }
}

export default function TransactionsModal() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [dateFilter, setDateFilter] = useState<DateFilter>('today');
  const [methodFilter, setMethodFilter] = useState<MethodFilter>('all');
  const [photoView, setPhotoView] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => { getAllTransactions().then(setTransactions); }, [])
  );

  const filtered = useMemo(() => {
    let result = transactions;
    const start = getFilterStart(dateFilter);
    if (start) {
      result = result.filter((t) => new Date(t.created_at) >= start);
    }
    if (methodFilter !== 'all') {
      result = result.filter((t) => t.payment_method === methodFilter);
    }
    return result;
  }, [transactions, dateFilter, methodFilter]);

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
        {DATE_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterBtn, dateFilter === f.key && styles.filterBtnActive]}
            onPress={() => setDateFilter(f.key)}
          >
            <Text style={[styles.filterText, dateFilter === f.key && styles.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.methodRow}>
        {METHOD_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.methodBtn, methodFilter === f.key && styles.methodBtnActive]}
            onPress={() => setMethodFilter(f.key)}
          >
            <Text style={[styles.methodText, methodFilter === f.key && styles.methodTextActive]}>
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
                <View style={styles.sheetMeta}>
                  <Text style={styles.sheetTime}>
                    {new Date(selected.created_at).toLocaleString()}
                  </Text>
                  <View style={styles.sheetMethodBadge}>
                    <Text style={styles.sheetMethodText}>
                      {getMethodDisplayName(selected.payment_method)}
                    </Text>
                  </View>
                </View>

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
                {selected.payment_method === 'cash' && (
                  <>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Cash</Text>
                      <Text style={styles.summaryValue}>₱{selected.cash_tendered.toFixed(2)}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Change</Text>
                      <Text style={styles.summaryValue}>₱{selected.change.toFixed(2)}</Text>
                    </View>
                  </>
                )}
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Payment</Text>
                  <Text style={styles.summaryValue}>
                    {getMethodDisplayName(selected.payment_method)}
                  </Text>
                </View>

                {selected.payment_method !== 'cash' && (selected.ref_number || selected.proof_photo_uri) && (
                  <>
                    <View style={styles.divider} />
                    <Text style={styles.proofLabel}>PAYMENT PROOF</Text>
                    <View style={styles.proofRow}>
                      {selected.ref_number && (
                        <View style={styles.refBox}>
                          <Text style={styles.refLabel}>REF #</Text>
                          <Text style={styles.refValue}>{selected.ref_number}</Text>
                        </View>
                      )}
                      {selected.proof_photo_uri && (
                        <TouchableOpacity onPress={() => setPhotoView(selected.proof_photo_uri)}>
                          <Image source={{ uri: selected.proof_photo_uri }} style={styles.proofThumb} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </>
                )}

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

      <Modal visible={!!photoView} transparent animationType="fade" onRequestClose={() => setPhotoView(null)}>
        <TouchableOpacity style={styles.photoOverlay} onPress={() => setPhotoView(null)} activeOpacity={1}>
          {photoView && <Image source={{ uri: photoView }} style={styles.photoFull} resizeMode="contain" />}
          <Text style={styles.photoHint}>Tap to close</Text>
        </TouchableOpacity>
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
  methodRow: {
    flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 4,
  },
  methodBtn: {
    flex: 1, paddingVertical: 6, borderRadius: 6,
    backgroundColor: '#16213e', alignItems: 'center',
  },
  methodBtnActive: { backgroundColor: '#0f3460', borderWidth: 1, borderColor: '#e94560' },
  methodText: { color: '#888', fontSize: 11, fontWeight: 'bold' },
  methodTextActive: { color: '#eee' },
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
  sheetMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  sheetTime: { color: '#aaa', fontSize: 12 },
  sheetMethodBadge: {
    backgroundColor: '#0f3460', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2,
  },
  sheetMethodText: { color: '#eee', fontSize: 10, fontWeight: 'bold' },
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
  proofLabel: { color: '#aaa', fontSize: 10, fontWeight: 'bold', marginBottom: 8 },
  proofRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  refBox: { backgroundColor: '#1a1a2e', borderRadius: 6, padding: 8, flex: 1 },
  refLabel: { color: '#888', fontSize: 10 },
  refValue: { color: '#eee', fontSize: 13, fontWeight: 'bold', marginTop: 2 },
  proofThumb: { width: 60, height: 60, borderRadius: 6, backgroundColor: '#1a1a2e' },
  photoOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', alignItems: 'center', justifyContent: 'center' },
  photoFull: { width: '90%', height: '70%' },
  photoHint: { color: '#888', fontSize: 12, marginTop: 16 },
});
