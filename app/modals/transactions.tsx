import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  SafeAreaView, Modal, Image, ScrollView, Dimensions, Alert,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { TransactionRow } from '../../components/TransactionRow';
import { getAllTransactions, Transaction, PaymentMethod } from '../../db/transactions';
import { exportTransactionsZip } from '../../utils/export-csv';
import { Ionicons } from '@expo/vector-icons';
import { C, F, R } from '../../constants/theme';

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

const METHOD_FILTERS: { key: MethodFilter; label: string; iconName?: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'all', label: 'All' },
  { key: 'cash', label: 'Cash', iconName: 'cash-outline' },
  { key: 'gcash', label: 'GCash', iconName: 'phone-portrait-outline' },
  { key: 'bank_transfer', label: 'Bank', iconName: 'business-outline' },
];

function getMethodDisplayName(method: PaymentMethod): string {
  switch (method) {
    case 'gcash': return 'GCash';
    case 'bank_transfer': return 'Bank Transfer';
    default: return 'Cash';
  }
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

function PhotoViewer({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  const scrollRef = useRef<ScrollView>(null);
  const [zoomed, setZoomed] = useState(false);

  function handleDoubleTap() {
    if (zoomed) {
      scrollRef.current?.scrollResponderZoomTo({ x: 0, y: 0, width: SCREEN_W, height: SCREEN_H, animated: true });
    } else {
      scrollRef.current?.scrollResponderZoomTo({ x: SCREEN_W / 4, y: SCREEN_H / 4, width: SCREEN_W / 2, height: SCREEN_H / 2, animated: true });
    }
    setZoomed(!zoomed);
  }

  return (
    <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.photoOverlay}>
        <TouchableOpacity style={styles.photoCloseBtn} onPress={onClose}>
          <Ionicons name="close" size={18} color="#fff" />
        </TouchableOpacity>
        <ScrollView
          ref={scrollRef}
          maximumZoomScale={4}
          minimumZoomScale={1}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.photoScrollContent}
          centerContent
          onScrollEndDrag={(e) => {
            if (e.nativeEvent.zoomScale <= 1) setZoomed(false);
            else setZoomed(true);
          }}
        >
          <TouchableOpacity activeOpacity={1} onPress={handleDoubleTap}>
            {uri && <Image source={{ uri }} style={styles.photoFull} resizeMode="contain" />}
          </TouchableOpacity>
        </ScrollView>
        <Text style={styles.photoHint}>{zoomed ? 'Tap to zoom out' : 'Tap to zoom in · Pinch to zoom'}</Text>
      </View>
    </Modal>
  );
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

  async function handleExport() {
    if (filtered.length === 0) {
      Alert.alert('Nothing to export', 'No transactions match the current filter.');
      return;
    }
    try {
      const label = dateFilter === 'all' ? 'all' : dateFilter;
      await exportTransactionsZip(filtered, label);
    } catch {
      Alert.alert('Export failed', 'Could not export transactions. Please try again.');
    }
  }

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
              {f.iconName && <Ionicons name={f.iconName} size={F.xs} color={methodFilter === f.key ? C.textPrimary : C.textMuted} />}
              {f.iconName ? ' ' : ''}{f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.summaryBar}>
        <View style={styles.summaryLeft}>
          <Text style={styles.summaryCount}>{filtered.length} transaction{filtered.length !== 1 ? 's' : ''}</Text>
          <Text style={styles.summaryTotal}>₱{filteredTotal.toFixed(2)}</Text>
        </View>
        <TouchableOpacity style={styles.exportBtn} onPress={handleExport}>
          <Text style={styles.exportBtnText}><Ionicons name="arrow-up" size={F.xs} color={C.textSecondary} /> Export</Text>
        </TouchableOpacity>
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
                  {selected.is_bundle && (
                    <View style={styles.sheetBundleBadge}>
                      <Text style={styles.sheetBundleText}>Bundle</Text>
                    </View>
                  )}
                </View>

                {selected.items.map((item) => (
                  <View key={item.id} style={styles.itemRow}>
                    <Text style={styles.itemName}>
                      {item.variant_name
                        ? `${item.product_name} — ${item.variant_name} × ${item.quantity}`
                        : `${item.product_name} × ${item.quantity}`}
                    </Text>
                    {!selected.is_bundle && (
                      <Text style={styles.itemPrice}>
                        ₱{(item.price * item.quantity).toFixed(2)}
                      </Text>
                    )}
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

                {selected.customer_handle && (
                  <>
                    <View style={styles.divider} />
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Furbaby / IG</Text>
                      <Text style={[styles.summaryValue, { color: C.pink }]}>{selected.customer_handle}</Text>
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
        <PhotoViewer uri={photoView} onClose={() => setPhotoView(null)} />
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  filterRow: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4,
  },
  filterBtn: {
    flex: 1, paddingVertical: 9, borderRadius: R.sm,
    backgroundColor: C.elevated, alignItems: 'center',
    borderWidth: 1, borderColor: C.borderDark,
  },
  filterBtnActive: { backgroundColor: C.pink, borderColor: C.pink },
  filterText: { color: C.textMuted, fontSize: F.sm, fontWeight: '700' },
  filterTextActive: { color: '#fff' },

  methodRow: {
    flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 4,
  },
  methodBtn: {
    flex: 1, paddingVertical: 7, borderRadius: R.sm,
    backgroundColor: C.surface, alignItems: 'center',
    borderWidth: 1, borderColor: C.borderDark,
  },
  methodBtnActive: { borderColor: C.pink, backgroundColor: C.pinkSubtle },
  methodText: { color: C.textMuted, fontSize: F.xs, fontWeight: '700' },
  methodTextActive: { color: C.textPrimary },

  summaryBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: C.borderDark,
  },
  summaryLeft: { gap: 1 },
  summaryCount: { color: C.textSecondary, fontSize: F.sm },
  summaryTotal: { color: C.pink, fontSize: F.sm, fontWeight: '700' },
  exportBtn: {
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.sm,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  exportBtnText: { color: C.textSecondary, fontSize: F.xs, fontWeight: '700' },

  list: { padding: 16, paddingTop: 10 },
  empty: { color: C.textMuted, textAlign: 'center', marginTop: 40, fontSize: F.md },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: R.xl,
    borderTopRightRadius: R.xl,
    borderTopWidth: 1,
    borderColor: C.borderDark,
    padding: 20,
    paddingBottom: 40,
  },
  sheetTitle: { color: C.textPrimary, fontSize: F.lg, fontWeight: '800', marginBottom: 4 },
  sheetMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  sheetTime: { color: C.textSecondary, fontSize: F.sm },
  sheetMethodBadge: {
    backgroundColor: C.elevated, borderRadius: R.sm,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: C.border,
  },
  sheetMethodText: { color: C.textSecondary, fontSize: F.xs, fontWeight: '700' },
  sheetBundleBadge: {
    backgroundColor: C.pinkSubtle, borderRadius: R.sm,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: C.pinkDim,
  },
  sheetBundleText: { color: C.pink, fontSize: F.xs, fontWeight: '700' },

  itemRow: {
    flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8,
  },
  itemName: { color: C.textPrimary, fontSize: F.md },
  itemPrice: { color: C.textPrimary, fontSize: F.md, fontWeight: '600' },

  divider: { height: 1, backgroundColor: C.borderDark, marginVertical: 12 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  summaryLabel: { color: C.textSecondary, fontSize: F.md },
  summaryValue: { color: C.textPrimary, fontSize: F.md, fontWeight: '700' },

  sheetBtns: { flexDirection: 'row', gap: 12, marginTop: 20 },
  closeBtn: {
    flex: 1, backgroundColor: C.elevated, borderRadius: R.sm,
    padding: 14, alignItems: 'center',
    borderWidth: 1, borderColor: C.border,
  },
  closeBtnText: { color: C.textSecondary, fontWeight: '700', fontSize: F.md },
  voidBtn: {
    flex: 2, backgroundColor: C.red, borderRadius: R.sm,
    padding: 14, alignItems: 'center',
  },
  voidBtnText: { color: '#fff', fontWeight: '800', fontSize: F.md },

  proofLabel: { color: C.textMuted, fontSize: F.xs, fontWeight: '700', letterSpacing: 1, marginBottom: 10 },
  proofRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  refBox: {
    backgroundColor: C.elevated, borderRadius: R.sm,
    padding: 10, flex: 1,
    borderWidth: 1, borderColor: C.borderDark,
  },
  refLabel: { color: C.textMuted, fontSize: F.xs, fontWeight: '600' },
  refValue: { color: C.textPrimary, fontSize: F.md, fontWeight: '700', marginTop: 2 },
  proofThumb: { width: 64, height: 64, borderRadius: R.sm, backgroundColor: C.elevated },

  photoOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.97)' },
  photoCloseBtn: {
    position: 'absolute', top: 52, right: 20, zIndex: 10,
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  photoCloseBtnText: { color: '#fff', fontSize: F.lg, fontWeight: '700' },
  photoScrollContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  photoFull: { width: SCREEN_W, height: SCREEN_H * 0.75 },
  photoHint: { color: C.textMuted, fontSize: F.sm, textAlign: 'center', paddingBottom: 40 },
});
