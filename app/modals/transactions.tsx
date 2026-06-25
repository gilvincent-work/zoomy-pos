import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  SafeAreaView, Modal, Image, ScrollView, Dimensions, Alert, TextInput,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { TransactionRow } from '../../components/TransactionRow';
import { CalendarRangeModal } from '../../components/CalendarRangeModal';
import { getAllTransactions, updateTransactionRemarks, Transaction, PaymentMethod } from '../../db/transactions';
import { exportTransactionsZip } from '../../utils/export-csv';
import { importTransactionsZip } from '../../utils/import-csv';
import {
  DateFilter, DateRange, getFilterRange, formatRangeLabel, formatRangeForFilename,
} from '../../utils/date-range';
import { Ionicons } from '@expo/vector-icons';
import { C, F, R } from '../../constants/theme';

type MethodFilter = 'all' | PaymentMethod;

const DATE_FILTERS: { key: DateFilter; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'all', label: 'All' },
  { key: 'custom', label: 'Custom' },
];

const METHOD_FILTERS: { key: MethodFilter; label: string; iconName?: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'all', label: 'All' },
  { key: 'cash', label: 'Cash', iconName: 'cash-outline' },
  { key: 'gcash', label: 'GCash', iconName: 'phone-portrait-outline' },
  { key: 'maya', label: 'Maya', iconName: 'phone-portrait-outline' },
  { key: 'bpi', label: 'BPI', iconName: 'business-outline' },
  { key: 'bank_transfer', label: 'Bank', iconName: 'business-outline' },
];

function getMethodDisplayName(method: PaymentMethod): string {
  switch (method) {
    case 'gcash': return 'GCash';
    case 'maya': return 'Maya';
    case 'bpi': return 'BPI';
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
  const [customRange, setCustomRange] = useState<DateRange | null>(null);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [methodFilter, setMethodFilter] = useState<MethodFilter>('all');
  const [photoView, setPhotoView] = useState<string | null>(null);
  const [remarksModalVisible, setRemarksModalVisible] = useState(false);
  const [remarksInput, setRemarksInput] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ variant: 'success' | 'error' | 'info'; title: string; message: string } | null>(null);
  const importResultTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showImportResult(variant: 'success' | 'error' | 'info', title: string, message: string) {
    if (importResultTimer.current) clearTimeout(importResultTimer.current);
    setImportResult({ variant, title, message });
    importResultTimer.current = setTimeout(() => setImportResult(null), 4000);
  }

  useFocusEffect(
    useCallback(() => { getAllTransactions().then(setTransactions); }, [])
  );

  const filtered = useMemo(() => {
    let result = transactions;
    const { start, end } = getFilterRange(dateFilter, customRange);
    if (start) {
      result = result.filter((t) => new Date(t.created_at) >= start);
    }
    if (end) {
      result = result.filter((t) => new Date(t.created_at) <= end);
    }
    if (methodFilter !== 'all') {
      result = result.filter((t) => t.payment_method === methodFilter);
    }
    return result;
  }, [transactions, dateFilter, customRange, methodFilter]);

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
      const label = dateFilter === 'custom' && customRange
        ? formatRangeForFilename(customRange)
        : dateFilter === 'all' ? 'all' : dateFilter;
      await exportTransactionsZip(filtered, label);
    } catch {
      Alert.alert('Export failed', 'Could not export transactions. Please try again.');
    }
  }

  function handleDateFilterPress(key: DateFilter) {
    if (key === 'custom') {
      setCalendarVisible(true);
      return;
    }
    setDateFilter(key);
  }

  async function handleImport() {
    setImporting(true);
    try {
      const { imported, skipped, failed, photosMissing } = await importTransactionsZip();

      // User cancelled file picker — silent return
      if (imported === 0 && skipped === 0 && failed === 0 && photosMissing === 0) return;

      const all = await getAllTransactions();
      setTransactions(all);

      const lines: string[] = [];
      if (imported > 0) lines.push(`${imported} transaction${imported !== 1 ? 's' : ''} imported`);
      if (skipped > 0) lines.push(`${skipped} duplicate${skipped !== 1 ? 's' : ''} skipped`);
      if (failed > 0) lines.push(`${failed} row${failed !== 1 ? 's' : ''} could not be read`);
      if (photosMissing > 0) lines.push(`${photosMissing} proof photo${photosMissing !== 1 ? 's' : ''} not found in ZIP`);

      if (imported > 0) {
        showImportResult('success', 'Import complete', lines.join(' · '));
      } else if (skipped > 0) {
        showImportResult('info', 'Already up to date', lines.join(' · '));
      } else {
        showImportResult('info', 'Nothing imported', lines.join(' · '));
      }
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : '';
      const message = raw.includes('transactions.csv') || raw.includes('Invalid CSV')
        ? raw
        : 'Could not read this file. Make sure you selected a Zoomy export ZIP.';
      showImportResult('error', 'Import failed', message);
    } finally {
      setImporting(false);
    }
  }

  function openRemarksModal() {
    if (!selected) return;
    setRemarksInput(selected.remarks ?? '');
    setRemarksModalVisible(true);
  }

  async function handleSaveRemarks() {
    if (!selected) return;
    const trimmed = remarksInput.trim() || null;
    await updateTransactionRemarks(selected.id, trimmed);
    const updated = { ...selected, remarks: trimmed };
    setSelected(updated);
    setTransactions((prev) => prev.map((t) => t.id === selected.id ? updated : t));
    setRemarksModalVisible(false);
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
            onPress={() => handleDateFilterPress(f.key)}
          >
            <Text style={[styles.filterText, dateFilter === f.key && styles.filterTextActive]} numberOfLines={1}>
              {f.key === 'custom' && dateFilter === 'custom' && customRange
                ? formatRangeLabel(customRange)
                : f.label}
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
        <View style={styles.summaryActions}>
          <TouchableOpacity style={styles.exportBtn} onPress={handleImport} disabled={importing}>
            <Text style={styles.exportBtnText}>
              <Ionicons name="arrow-down" size={F.xs} color={C.textSecondary} /> {importing ? 'Importing…' : 'Import'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.exportBtn} onPress={handleExport}>
            <Text style={styles.exportBtnText}>
              <Ionicons name="arrow-up" size={F.xs} color={C.textSecondary} /> Export
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {importResult && (
        <TouchableOpacity
          style={[
            styles.importBanner,
            importResult.variant === 'success' && styles.importBannerSuccess,
            importResult.variant === 'error' && styles.importBannerError,
          ]}
          onPress={() => {
            if (importResultTimer.current) clearTimeout(importResultTimer.current);
            setImportResult(null);
          }}
          activeOpacity={0.8}
        >
          <View style={styles.importBannerContent}>
            <Text style={styles.importBannerTitle}>{importResult.title}</Text>
            {!!importResult.message && (
              <Text style={styles.importBannerMsg}>{importResult.message}</Text>
            )}
          </View>
          <Ionicons name="close" size={F.sm} color={C.textSecondary} />
        </TouchableOpacity>
      )}

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

                {selected.remarks && (
                  <>
                    <View style={styles.divider} />
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Remarks</Text>
                      <Text style={[styles.summaryValue, { flex: 1, textAlign: 'right' }]}>{selected.remarks}</Text>
                    </View>
                  </>
                )}

                <View style={styles.sheetBtns}>
                  <TouchableOpacity style={styles.closeBtn} onPress={() => setSelected(null)}>
                    <Text style={styles.closeBtnText}>Close</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.remarksBtn} onPress={openRemarksModal}>
                    <Text style={styles.remarksBtnText} numberOfLines={1}>{selected.remarks ? '✎ Remarks' : '+ Remarks'}</Text>
                  </TouchableOpacity>
                  {selected.status === 'completed' && (
                    <TouchableOpacity style={styles.voidBtn} onPress={handleVoid}>
                      <Text style={styles.voidBtnText}>Void</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </View>
        </View>
        <PhotoViewer uri={photoView} onClose={() => setPhotoView(null)} />

        <Modal
          visible={remarksModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setRemarksModalVisible(false)}
        >
          <View style={styles.remarksOverlay}>
            <View style={styles.remarksSheet}>
              <Text style={styles.remarksTitle}>Remarks</Text>
              <TextInput
                style={styles.remarksInput}
                placeholder="e.g. free item given"
                placeholderTextColor={C.textMuted}
                value={remarksInput}
                onChangeText={setRemarksInput}
                multiline
                autoFocus
                autoCapitalize="sentences"
              />
              <View style={styles.remarksBtnsRow}>
                <TouchableOpacity style={styles.remarksCancelBtn} onPress={() => setRemarksModalVisible(false)}>
                  <Text style={styles.remarksCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.remarksSaveBtn} onPress={handleSaveRemarks}>
                  <Text style={styles.remarksSaveText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </Modal>

      <CalendarRangeModal
        visible={calendarVisible}
        initialRange={customRange}
        onApply={(range) => {
          setCustomRange(range);
          setDateFilter('custom');
          setCalendarVisible(false);
        }}
        onClose={() => setCalendarVisible(false)}
      />
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
  summaryActions: { flexDirection: 'row', gap: 8 },
  exportBtn: {
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.sm,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  exportBtnText: { color: C.textSecondary, fontSize: F.xs, fontWeight: '700' },

  importBanner: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: C.elevated,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  importBannerSuccess: { backgroundColor: C.greenSubtle, borderColor: C.greenDim },
  importBannerError: { backgroundColor: C.redSubtle, borderColor: C.redDim },
  importBannerContent: { flex: 1 },
  importBannerTitle: { color: C.textPrimary, fontSize: F.sm, fontWeight: '700' },
  importBannerMsg: { color: C.textSecondary, fontSize: F.xs, marginTop: 2 },

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
  remarksBtn: {
    flex: 1, backgroundColor: C.elevated, borderRadius: R.sm,
    padding: 14, alignItems: 'center',
    borderWidth: 1, borderColor: C.border,
  },
  remarksBtnText: { color: C.textPrimary, fontWeight: '700', fontSize: F.sm },
  voidBtn: {
    flex: 1, backgroundColor: C.red, borderRadius: R.sm,
    padding: 14, alignItems: 'center',
  },
  voidBtnText: { color: '#fff', fontWeight: '800', fontSize: F.md },

  remarksOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  remarksSheet: {
    backgroundColor: C.surface, borderRadius: R.lg,
    padding: 20, width: '100%',
    borderWidth: 1, borderColor: C.borderDark,
  },
  remarksTitle: { color: C.textPrimary, fontSize: F.lg, fontWeight: '800', marginBottom: 14 },
  remarksInput: {
    backgroundColor: C.elevated, borderRadius: R.sm,
    borderWidth: 1, borderColor: C.borderDark,
    padding: 12, color: C.textPrimary, fontSize: F.md,
    minHeight: 80, textAlignVertical: 'top',
    marginBottom: 16,
  },
  remarksBtnsRow: { flexDirection: 'row', gap: 10 },
  remarksCancelBtn: {
    flex: 1, backgroundColor: C.elevated, borderRadius: R.sm,
    padding: 13, alignItems: 'center',
    borderWidth: 1, borderColor: C.border,
  },
  remarksCancelText: { color: C.textSecondary, fontWeight: '700', fontSize: F.md },
  remarksSaveBtn: {
    flex: 2, backgroundColor: C.pink, borderRadius: R.sm,
    padding: 13, alignItems: 'center',
  },
  remarksSaveText: { color: '#fff', fontWeight: '800', fontSize: F.md },

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
