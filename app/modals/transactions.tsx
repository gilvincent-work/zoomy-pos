import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  SafeAreaView, Modal, Image, ScrollView, Dimensions, Alert, TextInput,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { TransactionRow } from '../../components/TransactionRow';
import { CalendarRangeModal } from '../../components/CalendarRangeModal';
import { PullToRefresh } from '../../components/PullToRefresh';
import { getAllTransactions, updateTransactionRemarks, markRemarksSynced, deleteTransactionsByClientUuids, replaceLocalTransactionContents, Transaction, PaymentMethod } from '../../db/transactions';
import { fetchRemoteOrders, setRemoteOrderRemarks, editRemoteOrder } from '../../utils/orders-remote';
import { mergeTransactions, isLocalTransaction, transactionsToPrune } from '../../utils/merge-transactions';
import { refreshPendingCount } from '../../utils/outbox';
import { exportTransactionsZip } from '../../utils/export-csv';
import { importTransactionsZip } from '../../utils/import-csv';
import { getAllProducts, Product } from '../../db/products';
import { pullCatalog } from '../../utils/catalog-sync';
import { isSupabaseConfigured } from '../../lib/supabase';
import { quickMethodMeta } from '../../constants/payment';
import {
  DateFilter, DateRange, getFilterRange, formatRangeLabel, formatRangeForFilename,
} from '../../utils/date-range';
import { Ionicons } from '@expo/vector-icons';
import { F, R, type Palette } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';

// Payment methods offered in the edit form.
const EDIT_METHODS: PaymentMethod[] = ['cash', 'qrph', 'gcash', 'maya', 'card'];
// One editable line in the edit form: a local catalog product, a qty, a price.
type EditLine = { productId: number; name: string; sku: string; qty: string; price: string };

type MethodFilter = 'all' | PaymentMethod;

const DATE_FILTERS: { key: DateFilter; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'all', label: 'All' },
  { key: 'custom', label: 'Custom' },
];

const METHOD_FILTERS: { key: MethodFilter; label: string; iconName?: keyof typeof Ionicons.glyphMap }[] = [
  // Only the four tap-to-record methods (matches the cart Pay control). BPI and
  // bank_transfer still exist on old records but aren't offered as quick filters.
  { key: 'all', label: 'All methods', iconName: 'wallet-outline' },
  { key: 'cash', label: 'Cash', iconName: 'cash-outline' },
  { key: 'qrph', label: 'QRPH', iconName: 'qr-code-outline' },
  { key: 'gcash', label: 'GCash', iconName: 'phone-portrait-outline' },
  { key: 'maya', label: 'Maya', iconName: 'phone-portrait-outline' },
  { key: 'card', label: 'Card', iconName: 'card-outline' },
];

function getMethodDisplayName(method: PaymentMethod): string {
  switch (method) {
    case 'qrph': return 'QRPH';
    case 'gcash': return 'GCash';
    case 'card': return 'Card';
    case 'maya': return 'Maya';
    case 'bpi': return 'BPI';
    case 'bank_transfer': return 'Bank Transfer';
    default: return 'Cash';
  }
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

function PhotoViewer({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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

type DropdownOption<T extends string> = {
  key: T;
  label: string;
  iconName?: keyof typeof Ionicons.glyphMap;
};

function Dropdown<T extends string>({
  options,
  selectedKey,
  displayLabel,
  leadingIcon,
  onSelect,
}: {
  options: DropdownOption<T>[];
  selectedKey: T;
  displayLabel: string;
  leadingIcon?: keyof typeof Ionicons.glyphMap;
  onSelect: (key: T) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<{ left: number; top: number; width: number } | null>(null);

  function handleOpen() {
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ left: x, top: y + height + 4, width });
      setOpen(true);
    });
  }

  return (
    <View style={styles.ddWrap}>
      <TouchableOpacity ref={triggerRef} style={styles.ddTrigger} onPress={handleOpen} activeOpacity={0.7}>
        {leadingIcon && <Ionicons name={leadingIcon} size={F.sm} color={colors.textSecondary} />}
        <Text style={styles.ddTriggerText} numberOfLines={1}>{displayLabel}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={F.sm} color={colors.textMuted} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.ddOverlay} activeOpacity={1} onPress={() => setOpen(false)}>
          {anchor && (
            <View style={[styles.ddMenu, { left: anchor.left, top: anchor.top, width: anchor.width }]}>
              {options.map((opt) => {
                const active = opt.key === selectedKey;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[styles.ddItem, active && styles.ddItemActive]}
                    onPress={() => { setOpen(false); onSelect(opt.key); }}
                    activeOpacity={0.7}
                  >
                    {opt.iconName && (
                      <Ionicons name={opt.iconName} size={F.sm} color={active ? colors.pink : colors.textMuted} />
                    )}
                    <Text style={[styles.ddItemText, active && styles.ddItemTextActive]} numberOfLines={1}>
                      {opt.label}
                    </Text>
                    {active && <Ionicons name="checkmark" size={F.sm} color={colors.pink} style={styles.ddCheck} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

export default function TransactionsModal() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [dateFilter, setDateFilter] = useState<DateFilter>('today');
  const [customRange, setCustomRange] = useState<DateRange | null>(null);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [methodFilter, setMethodFilter] = useState<MethodFilter>('all');
  const [photoView, setPhotoView] = useState<string | null>(null);
  const [remarksModalVisible, setRemarksModalVisible] = useState(false);
  const [remarksInput, setRemarksInput] = useState('');
  // Edit form (online-only): the local catalog for the product picker, and the
  // in-progress edit draft. editingTx null = editor closed.
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editMethod, setEditMethod] = useState<PaymentMethod>('cash');
  const [editHandle, setEditHandle] = useState('');
  const [editLines, setEditLines] = useState<EditLine[]>([]);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ variant: 'success' | 'error' | 'info'; title: string; message: string } | null>(null);
  const importResultTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showImportResult(variant: 'success' | 'error' | 'info', title: string, message: string) {
    if (importResultTimer.current) clearTimeout(importResultTimer.current);
    setImportResult({ variant, title, message });
    importResultTimer.current = setTimeout(() => setImportResult(null), 4000);
  }

  // Local sales are the rich source; Coop fills in sales made on other devices,
  // so every device shows the same list. Remote is best-effort (offline -> local
  // only). Local resolves first for an instant paint, then the merge fills in.
  //
  // A successful remote fetch also pulls deletions: any local row already
  // confirmed synced to Coop (synced_at set) but now absent from Coop's list
  // gets permanently removed from this device too (transactionsToPrune). A
  // failed/unconfigured fetch never prunes anything — only a confirmed-empty
  // or confirmed-populated remote result counts as "Coop has spoken."
  const loadTransactions = useCallback(async () => {
    const local = await getAllTransactions();
    setTransactions(local);
    // Keep the "N pending" marker honest while viewing history (a background
    // drain may have synced rows since it was last computed).
    refreshPendingCount().catch(() => {});
    const remote = await fetchRemoteOrders();
    if (!remote.ok) return;

    // Show the cross-device merged list FIRST. This must never be blocked by the
    // deletion-prune below: if that prune ever throws (e.g. a local delete
    // fails), the merged view — the whole point of this screen — still stands.
    setTransactions(mergeTransactions(local, remote.orders));

    // Best-effort: permanently drop local rows Coop no longer has (a sale
    // deleted on Coop). Wrapped so a failure can't strand the display at
    // local-only, and re-merged from fresh local rows on success.
    try {
      const remoteUuids = new Set(
        remote.orders.map((r) => r.client_uuid).filter((u): u is string => !!u)
      );
      const toPrune = transactionsToPrune(local, remoteUuids);
      if (toPrune.length > 0) {
        await deleteTransactionsByClientUuids(toPrune.map((t) => t.client_uuid!));
        const fresh = await getAllTransactions();
        setTransactions(mergeTransactions(fresh, remote.orders));
      }
    } catch {
      // Prune is non-critical; the merged list above is already displayed.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadTransactions();
      // Load the catalog for the edit form's product picker (best-effort).
      getAllProducts().then(setCatalog).catch(() => {});
    }, [loadTransactions])
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

      await loadTransactions();

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
    // Local rows persist to SQLite (updateTransactionRemarks nulls
    // remarks_synced_at); any synced row (has a client_uuid) also writes to Coop
    // so the note shows on every device. If that Coop write fails, the outbox
    // drain retries it later.
    if (isLocalTransaction(selected)) {
      await updateTransactionRemarks(selected.id, trimmed);
    }
    if (selected.client_uuid) {
      if (await setRemoteOrderRemarks(selected.client_uuid, trimmed)) {
        await markRemarksSynced(selected.client_uuid);
      }
    }
    refreshPendingCount().catch(() => {});
    const updated = { ...selected, remarks: trimmed };
    setSelected(updated);
    setTransactions((prev) => prev.map((t) => t.id === selected.id ? updated : t));
    setRemarksModalVisible(false);
  }

  // A sale can be voided from any device: locally if it lives here, and on Coop
  // (by client_uuid) so other devices see it. The admin PIN gate does both.
  const canVoid = !!selected && selected.status === 'completed' && (isLocalTransaction(selected) || !!selected.client_uuid);

  function handleVoid() {
    if (!selected) return;
    const { id, client_uuid } = selected;
    setSelected(null);
    router.push({
      pathname: '/modals/admin',
      params: { action: 'void_transaction', transactionId: String(id), clientUuid: client_uuid ?? '' },
    });
  }

  // Unvoiding restores a voided sale (re-applies its inventory + revenue on Coop),
  // so it's online-only and needs the sale to already live on Coop (client_uuid).
  // The admin PIN gate performs it; failure leaves the sale voided.
  const canUnvoid =
    !!selected &&
    selected.status === 'voided' &&
    !!selected.client_uuid &&
    isSupabaseConfigured();

  function handleUnvoid() {
    if (!selected) return;
    const { id, client_uuid } = selected;
    setSelected(null);
    router.push({
      pathname: '/modals/admin',
      params: { action: 'unvoid_transaction', transactionId: String(id), clientUuid: client_uuid ?? '' },
    });
  }

  // Editing is online-only (it calls edit_pos_order on Coop) and limited to a
  // completed, non-bundle sale that lives on THIS device (isLocalTransaction) and
  // has reached Coop (client_uuid). Bundle sales are excluded — their price lives
  // in the total, not the lines, so re-applying lines would zero the revenue.
  // Other devices' sales are edited from the Coop dashboard, which seeds directly
  // from the order (no fragile local catalog re-match). Requires the catalog
  // loaded so line-seeding can resolve every item to a SKU.
  const canEdit =
    !!selected &&
    selected.status === 'completed' &&
    !!selected.client_uuid &&
    !selected.is_bundle &&
    isLocalTransaction(selected) &&
    catalog.length > 0 &&
    isSupabaseConfigured();

  function openEdit() {
    if (!selected) return;
    setEditError(null);
    setEditMethod((EDIT_METHODS.includes(selected.payment_method) ? selected.payment_method : 'cash'));
    setEditHandle(selected.customer_handle ?? '');
    // Seed lines from the sale's items, matching each to a catalog product (by
    // sku when the item carries a product, else by name) so the edit can map to
    // a Coop SKU. Items that can't be matched to a sku are dropped from the
    // editable set (they can't be re-applied server-side).
    const seeded: EditLine[] = [];
    for (const it of selected.items) {
      const prod =
        (it.product_id != null && catalog.find((p) => p.id === it.product_id)) ||
        catalog.find((p) => p.name === it.product_name);
      if (prod && prod.sku) {
        seeded.push({ productId: prod.id, name: prod.name, sku: prod.sku, qty: String(it.quantity), price: String(it.price) });
      }
    }
    setEditLines(seeded);
    setEditingTx(selected);
  }

  function editTotal(): number {
    return editLines.reduce((sum, l) => sum + (Number(l.qty) || 0) * (Number(l.price) || 0), 0);
  }
  function setEditLine(i: number, patch: Partial<EditLine>) {
    setEditLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function removeEditLine(i: number) {
    setEditLines((ls) => ls.filter((_, idx) => idx !== i));
  }
  function addEditProduct(p: Product) {
    if (!p.sku) return;
    setPickerOpen(false);
    setEditLines((ls) => [...ls, { productId: p.id, name: p.name, sku: p.sku!, qty: '1', price: String(p.price ?? 0) }]);
  }

  async function handleSaveEdit() {
    if (!editingTx || !editingTx.client_uuid) return;
    const lines = editLines.filter((l) => l.sku && (Number(l.qty) || 0) > 0);
    if (lines.length === 0) { setEditError('An order needs at least one item.'); return; }
    setEditSaving(true);
    setEditError(null);
    const res = await editRemoteOrder(
      editingTx.client_uuid,
      { payment_method: editMethod, customer_handle: editHandle.trim() },
      lines.map((l) => ({ product_id: l.sku, qty: Number(l.qty), unit_price: Number(l.price) || 0 })),
    );
    setEditSaving(false);
    if (!res.ok) { setEditError(res.error ?? 'Edit failed.'); return; }

    // Mirror the confirmed edit onto the local row (if this device holds it).
    if (isLocalTransaction(editingTx)) {
      const total = editTotal();
      await replaceLocalTransactionContents(
        editingTx.id,
        { paymentMethod: editMethod, customerHandle: editHandle.trim() || null, total },
        lines.map((l) => ({ productId: l.productId, productName: l.name, price: Number(l.price) || 0, quantity: Number(l.qty) })),
      );
    }
    setEditingTx(null);
    setSelected(null);
    await loadTransactions();       // reflect the edit (re-fetches Coop too)
    pullCatalog().catch(() => {});  // refresh local stock cache after reconcile
    getAllProducts().then(setCatalog).catch(() => {});
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.filterRow}>
        <Dropdown
          options={DATE_FILTERS}
          selectedKey={dateFilter}
          leadingIcon="calendar-outline"
          displayLabel={
            dateFilter === 'custom' && customRange
              ? formatRangeLabel(customRange)
              : DATE_FILTERS.find((f) => f.key === dateFilter)?.label ?? 'Today'
          }
          onSelect={handleDateFilterPress}
        />
        <Dropdown
          options={METHOD_FILTERS}
          selectedKey={methodFilter}
          leadingIcon={METHOD_FILTERS.find((f) => f.key === methodFilter)?.iconName ?? 'wallet-outline'}
          displayLabel={METHOD_FILTERS.find((f) => f.key === methodFilter)?.label ?? 'All methods'}
          onSelect={setMethodFilter}
        />
      </View>

      <View style={styles.summaryBar}>
        <View style={styles.summaryLeft}>
          <Text style={styles.summaryCount}>{filtered.length} transaction{filtered.length !== 1 ? 's' : ''}</Text>
          <Text style={styles.summaryTotal}>₱{filteredTotal.toFixed(2)}</Text>
        </View>
        <View style={styles.summaryActions}>
          {/* Import hidden for now (kept for easy restore). Export only.
          <TouchableOpacity style={styles.exportBtn} onPress={handleImport} disabled={importing}>
            <Text style={styles.exportBtnText}>
              <Ionicons name="arrow-down" size={F.xs} color={colors.textSecondary} /> {importing ? 'Importing…' : 'Import'}
            </Text>
          </TouchableOpacity>
          */}
          <TouchableOpacity style={styles.exportBtn} onPress={handleExport}>
            <Text style={styles.exportBtnText}>
              <Ionicons name="arrow-up" size={F.xs} color={colors.textSecondary} /> Export
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
          <Ionicons name="close" size={F.sm} color={colors.textSecondary} />
        </TouchableOpacity>
      )}

      <PullToRefresh onRefresh={loadTransactions}>
        {(scroll) => (
          <FlatList
            {...scroll}
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
        )}
      </PullToRefresh>

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
                <Text style={styles.sheetTitle}>
                  {isLocalTransaction(selected) ? `Transaction #${selected.id}` : 'Transaction'}
                </Text>
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
                      <Text style={[styles.summaryValue, { color: colors.pink }]}>{selected.customer_handle}</Text>
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
                  {canEdit && (
                    <TouchableOpacity style={styles.editBtn} onPress={openEdit}>
                      <Text style={styles.editBtnText}>Edit</Text>
                    </TouchableOpacity>
                  )}
                  {canVoid && (
                    <TouchableOpacity style={styles.voidBtn} onPress={handleVoid}>
                      <Text style={styles.voidBtnText}>Void</Text>
                    </TouchableOpacity>
                  )}
                  {canUnvoid && (
                    <TouchableOpacity style={styles.unvoidBtn} onPress={handleUnvoid}>
                      <Text style={styles.unvoidBtnText}>Unvoid</Text>
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
                placeholderTextColor={colors.textMuted}
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

      {/* Edit sale (online-only). Reconciles stock + total on Coop via the RPC. */}
      <Modal visible={!!editingTx} transparent animationType="slide" onRequestClose={() => setEditingTx(null)}>
        <View style={styles.editOverlay}>
          <View style={styles.editSheet}>
            <Text style={styles.editTitle}>Edit sale</Text>
            <ScrollView style={styles.editScroll} keyboardShouldPersistTaps="handled">
              <Text style={styles.editSectionLabel}>Payment method</Text>
              <View style={styles.methodRow}>
                {EDIT_METHODS.map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.methodPill, editMethod === m && styles.methodPillActive]}
                    onPress={() => setEditMethod(m)}
                  >
                    <Text style={[styles.methodPillText, editMethod === m && styles.methodPillTextActive]}>
                      {quickMethodMeta(m).label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.editSectionLabel}>Furbaby / IG handle</Text>
              <TextInput
                style={styles.editInput}
                placeholder="@username or name"
                placeholderTextColor={colors.textMuted}
                value={editHandle}
                onChangeText={setEditHandle}
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Text style={styles.editSectionLabel}>Items</Text>
              {editLines.map((l, i) => (
                <View key={`${l.productId}-${i}`} style={styles.editLineRow}>
                  <Text style={styles.editLineName} numberOfLines={2}>{l.name}</Text>
                  <TextInput
                    style={styles.editQtyInput}
                    keyboardType="number-pad"
                    value={l.qty}
                    onChangeText={(v) => setEditLine(i, { qty: v.replace(/[^0-9]/g, '') })}
                    accessibilityLabel={`Quantity for ${l.name}`}
                  />
                  <View style={styles.editPriceWrap}>
                    <Text style={styles.editPricePeso}>₱</Text>
                    <TextInput
                      style={styles.editPriceInput}
                      keyboardType="decimal-pad"
                      value={l.price}
                      onChangeText={(v) => setEditLine(i, { price: v.replace(/[^0-9.]/g, '') })}
                      accessibilityLabel={`Unit price for ${l.name}`}
                    />
                  </View>
                  <TouchableOpacity onPress={() => removeEditLine(i)} style={styles.editRemoveBtn} accessibilityLabel={`Remove ${l.name}`}>
                    <Ionicons name="close" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              ))}

              <TouchableOpacity style={styles.addItemBtn} onPress={() => setPickerOpen(true)}>
                <Ionicons name="add" size={16} color={colors.pink} />
                <Text style={styles.addItemText}>Add item</Text>
              </TouchableOpacity>

              {editError && <Text style={styles.editError}>{editError}</Text>}
            </ScrollView>

            <View style={styles.editFooter}>
              <Text style={styles.editTotalText}>Total ₱{editTotal().toFixed(2)}</Text>
              <View style={styles.editFooterBtns}>
                <TouchableOpacity style={styles.editCancelBtn} onPress={() => setEditingTx(null)} disabled={editSaving}>
                  <Text style={styles.editCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.editSaveBtn} onPress={handleSaveEdit} disabled={editSaving}>
                  <Text style={styles.editSaveText}>{editSaving ? 'Saving…' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        {/* Product picker for adding a line. */}
        <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
          <View style={styles.pickerOverlay}>
            <View style={styles.pickerSheet}>
              <Text style={styles.editTitle}>Add product</Text>
              <ScrollView style={styles.pickerScroll} keyboardShouldPersistTaps="handled">
                {catalog.filter((p) => p.sku && p.has_variants !== 1 && p.is_active === 1).map((p) => (
                  <TouchableOpacity key={p.id} style={styles.pickerItem} onPress={() => addEditProduct(p)}>
                    <Text style={styles.pickerItemName} numberOfLines={1}>{p.emoji ? `${p.emoji}  ` : ''}{p.name}</Text>
                    <Text style={styles.pickerItemPrice}>₱{(p.price ?? 0).toFixed(2)}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity style={styles.editCancelBtn} onPress={() => setPickerOpen(false)}>
                <Text style={styles.editCancelText}>Close</Text>
              </TouchableOpacity>
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

const makeStyles = (c: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },

  filterRow: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8,
  },

  ddWrap: { flex: 1 },
  ddTrigger: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 11, paddingHorizontal: 12, borderRadius: R.sm,
    backgroundColor: c.elevated, borderWidth: 1, borderColor: c.border,
  },
  ddTriggerText: { flex: 1, color: c.textPrimary, fontSize: F.sm, fontWeight: '700' },
  ddOverlay: { flex: 1 },
  ddMenu: {
    position: 'absolute',
    backgroundColor: c.surface,
    borderRadius: R.md, borderWidth: 1, borderColor: c.border,
    paddingVertical: 4,
    shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 14, shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  ddItem: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 11, paddingHorizontal: 12,
  },
  ddItemActive: { backgroundColor: c.pinkSubtle },
  ddItemText: { flex: 1, color: c.textSecondary, fontSize: F.sm, fontWeight: '600' },
  ddItemTextActive: { color: c.textPrimary, fontWeight: '700' },
  ddCheck: { marginLeft: 'auto' },

  summaryBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: c.borderDark,
  },
  summaryLeft: { gap: 1 },
  summaryCount: { color: c.textSecondary, fontSize: F.sm },
  summaryTotal: { color: c.pink, fontSize: F.sm, fontWeight: '700' },
  summaryActions: { flexDirection: 'row', gap: 8 },
  exportBtn: {
    backgroundColor: c.elevated,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: R.sm,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  exportBtnText: { color: c.textSecondary, fontSize: F.xs, fontWeight: '700' },

  importBanner: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: c.elevated,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: c.border,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  importBannerSuccess: { backgroundColor: c.greenSubtle, borderColor: c.greenDim },
  importBannerError: { backgroundColor: c.redSubtle, borderColor: c.redDim },
  importBannerContent: { flex: 1 },
  importBannerTitle: { color: c.textPrimary, fontSize: F.sm, fontWeight: '700' },
  importBannerMsg: { color: c.textSecondary, fontSize: F.xs, marginTop: 2 },

  list: { padding: 16, paddingTop: 10 },
  empty: { color: c.textMuted, textAlign: 'center', marginTop: 40, fontSize: F.md },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: c.surface,
    borderTopLeftRadius: R.xl,
    borderTopRightRadius: R.xl,
    borderTopWidth: 1,
    borderColor: c.borderDark,
    padding: 20,
    paddingBottom: 40,
  },
  sheetTitle: { color: c.textPrimary, fontSize: F.lg, fontWeight: '800', marginBottom: 4 },
  sheetMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  sheetTime: { color: c.textSecondary, fontSize: F.sm },
  sheetMethodBadge: {
    backgroundColor: c.elevated, borderRadius: R.sm,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: c.border,
  },
  sheetMethodText: { color: c.textSecondary, fontSize: F.xs, fontWeight: '700' },
  sheetBundleBadge: {
    backgroundColor: c.pinkSubtle, borderRadius: R.sm,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: c.pinkDim,
  },
  sheetBundleText: { color: c.pink, fontSize: F.xs, fontWeight: '700' },

  itemRow: {
    flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8,
  },
  itemName: { color: c.textPrimary, fontSize: F.md },
  itemPrice: { color: c.textPrimary, fontSize: F.md, fontWeight: '600' },

  divider: { height: 1, backgroundColor: c.borderDark, marginVertical: 12 },
  remoteNote: { color: c.textMuted, fontSize: F.sm, fontStyle: 'italic' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  summaryLabel: { color: c.textSecondary, fontSize: F.md },
  summaryValue: { color: c.textPrimary, fontSize: F.md, fontWeight: '700' },

  sheetBtns: { flexDirection: 'row', gap: 12, marginTop: 20 },
  closeBtn: {
    flex: 1, backgroundColor: c.elevated, borderRadius: R.sm,
    padding: 14, alignItems: 'center',
    borderWidth: 1, borderColor: c.border,
  },
  closeBtnText: { color: c.textSecondary, fontWeight: '700', fontSize: F.md },
  remarksBtn: {
    flex: 1, backgroundColor: c.elevated, borderRadius: R.sm,
    padding: 14, alignItems: 'center',
    borderWidth: 1, borderColor: c.border,
  },
  remarksBtnText: { color: c.textPrimary, fontWeight: '700', fontSize: F.sm },
  editBtn: {
    flex: 1, backgroundColor: c.elevated, borderRadius: R.sm,
    padding: 14, alignItems: 'center',
    borderWidth: 1, borderColor: c.pink,
  },
  editBtnText: { color: c.pink, fontWeight: '800', fontSize: F.md },
  voidBtn: {
    flex: 1, backgroundColor: c.red, borderRadius: R.sm,
    padding: 14, alignItems: 'center',
  },
  voidBtnText: { color: '#fff', fontWeight: '800', fontSize: F.md },
  unvoidBtn: {
    flex: 1, backgroundColor: c.elevated, borderRadius: R.sm,
    padding: 14, alignItems: 'center',
    borderWidth: 1, borderColor: c.green,
  },
  unvoidBtnText: { color: c.green, fontWeight: '800', fontSize: F.md },

  // Edit-sale modal
  editOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  editSheet: {
    backgroundColor: c.surface, borderTopLeftRadius: R.lg, borderTopRightRadius: R.lg,
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16,
    maxHeight: '88%', borderWidth: 1, borderColor: c.borderDark,
  },
  editTitle: { color: c.textPrimary, fontSize: F.lg, fontWeight: '800', marginBottom: 12 },
  editScroll: { flexGrow: 0 },
  editSectionLabel: { color: c.textMuted, fontSize: F.xs, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: 14, marginBottom: 8 },
  methodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  methodPill: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
    backgroundColor: c.elevated, borderWidth: 1, borderColor: c.border,
  },
  methodPillActive: { backgroundColor: c.pink, borderColor: c.pink },
  methodPillText: { color: c.textSecondary, fontSize: F.sm, fontWeight: '700' },
  methodPillTextActive: { color: '#fff' },
  editInput: {
    backgroundColor: c.elevated, borderRadius: R.sm, borderWidth: 1, borderColor: c.border,
    paddingVertical: 10, paddingHorizontal: 12, color: c.textPrimary, fontSize: F.md,
  },
  editLineRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  editLineName: { flex: 1, color: c.textPrimary, fontSize: F.sm, fontWeight: '600' },
  editQtyInput: {
    width: 48, textAlign: 'center', backgroundColor: c.elevated, borderRadius: R.sm,
    borderWidth: 1, borderColor: c.border, paddingVertical: 8, color: c.textPrimary, fontSize: F.md,
  },
  editPriceWrap: { flexDirection: 'row', alignItems: 'center', width: 84, backgroundColor: c.elevated, borderRadius: R.sm, borderWidth: 1, borderColor: c.border, paddingHorizontal: 8 },
  editPricePeso: { color: c.textMuted, fontSize: F.sm },
  editPriceInput: { flex: 1, textAlign: 'right', paddingVertical: 8, color: c.textPrimary, fontSize: F.md },
  editRemoveBtn: { padding: 4 },
  addItemBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, alignSelf: 'flex-start' },
  addItemText: { color: c.pink, fontSize: F.sm, fontWeight: '700' },
  editError: { color: c.red, fontSize: F.sm, marginTop: 12 },
  editFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, gap: 12 },
  editTotalText: { color: c.textPrimary, fontSize: F.md, fontWeight: '800' },
  editFooterBtns: { flexDirection: 'row', gap: 10 },
  editCancelBtn: {
    backgroundColor: c.elevated, borderRadius: R.sm, paddingVertical: 12, paddingHorizontal: 18,
    alignItems: 'center', borderWidth: 1, borderColor: c.border,
  },
  editCancelText: { color: c.textSecondary, fontWeight: '700', fontSize: F.md },
  editSaveBtn: { backgroundColor: c.pink, borderRadius: R.sm, paddingVertical: 12, paddingHorizontal: 24, alignItems: 'center' },
  editSaveText: { color: '#fff', fontWeight: '800', fontSize: F.md },

  // Product picker
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  pickerSheet: { backgroundColor: c.surface, borderRadius: R.lg, padding: 18, width: '100%', maxHeight: '70%', borderWidth: 1, borderColor: c.borderDark },
  pickerScroll: { marginBottom: 12 },
  pickerItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border },
  pickerItemName: { flex: 1, color: c.textPrimary, fontSize: F.md, marginRight: 10 },
  pickerItemPrice: { color: c.pink, fontSize: F.sm, fontWeight: '700' },

  remarksOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  remarksSheet: {
    backgroundColor: c.surface, borderRadius: R.lg,
    padding: 20, width: '100%',
    borderWidth: 1, borderColor: c.borderDark,
  },
  remarksTitle: { color: c.textPrimary, fontSize: F.lg, fontWeight: '800', marginBottom: 14 },
  remarksInput: {
    backgroundColor: c.elevated, borderRadius: R.sm,
    borderWidth: 1, borderColor: c.borderDark,
    padding: 12, color: c.textPrimary, fontSize: F.md,
    minHeight: 80, textAlignVertical: 'top',
    marginBottom: 16,
  },
  remarksBtnsRow: { flexDirection: 'row', gap: 10 },
  remarksCancelBtn: {
    flex: 1, backgroundColor: c.elevated, borderRadius: R.sm,
    padding: 13, alignItems: 'center',
    borderWidth: 1, borderColor: c.border,
  },
  remarksCancelText: { color: c.textSecondary, fontWeight: '700', fontSize: F.md },
  remarksSaveBtn: {
    flex: 2, backgroundColor: c.pink, borderRadius: R.sm,
    padding: 13, alignItems: 'center',
  },
  remarksSaveText: { color: '#fff', fontWeight: '800', fontSize: F.md },

  proofLabel: { color: c.textMuted, fontSize: F.xs, fontWeight: '700', letterSpacing: 1, marginBottom: 10 },
  proofRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  refBox: {
    backgroundColor: c.elevated, borderRadius: R.sm,
    padding: 10, flex: 1,
    borderWidth: 1, borderColor: c.borderDark,
  },
  refLabel: { color: c.textMuted, fontSize: F.xs, fontWeight: '600' },
  refValue: { color: c.textPrimary, fontSize: F.md, fontWeight: '700', marginTop: 2 },
  proofThumb: { width: 64, height: 64, borderRadius: R.sm, backgroundColor: c.elevated },

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
  photoHint: { color: c.textMuted, fontSize: F.sm, textAlign: 'center', paddingBottom: 40 },
});
