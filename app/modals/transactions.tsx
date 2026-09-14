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
import { fetchRemoteOrders, setRemoteOrderRemarks, editRemoteOrder, fetchRemoteOrderEntries } from '../../utils/orders-remote';
import type { EditEntry } from '../../utils/order-entries';
import { getSavedBundles, type SavedBundle } from '../../db/saved-bundles';
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
// Editable draft entries: an individual item, or a bundle group (editable price,
// plus picks for a "Buy Any N" bundle). Prices/qtys are strings while editing.
type DraftPick = { product_id: string; qty: string };
type DraftEntry =
  | { kind: 'item'; product_id: string; name: string; qty: string; price: string }
  | { kind: 'bundle'; bundle_id: string; name: string; price: string; picks: DraftPick[] };
// Where the product picker writes its selection.
type PickerTarget =
  | { kind: 'add-item' }
  | { kind: 'set-item'; idx: number }
  | { kind: 'add-pick'; idx: number }
  | { kind: 'set-pick'; idx: number; pickIdx: number };

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
  const [editEntries, setEditEntries] = useState<DraftEntry[]>([]);
  const [bundleDefs, setBundleDefs] = useState<SavedBundle[]>([]);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editOpening, setEditOpening] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
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
    isLocalTransaction(selected) &&
    catalog.length > 0 &&
    isSupabaseConfigured();

  // Product lookups by Coop SKU (names/prices/local id for the mirror + picker).
  const prodBySku = useMemo(() => {
    const m = new Map<string, Product>();
    for (const p of catalog) if (p.sku) m.set(p.sku, p);
    return m;
  }, [catalog]);
  const bundleDefById = useMemo(() => {
    const m = new Map<string, SavedBundle>();
    for (const d of bundleDefs) if (d.bundle_uuid) m.set(d.bundle_uuid, d);
    return m;
  }, [bundleDefs]);

  // Editing is online-only, so seed the draft from Coop's authoritative lines
  // (they carry the bundle grouping the flat local copy lacks). Bundle rules come
  // from local saved_bundles (keyed by the shared bundle_uuid).
  async function openEdit() {
    if (!selected || !selected.client_uuid) return;
    setEditError(null);
    setEditOpening(true);
    setEditMethod((EDIT_METHODS.includes(selected.payment_method) ? selected.payment_method : 'cash'));
    setEditHandle(selected.customer_handle ?? '');
    const [defs, remote] = await Promise.all([
      getSavedBundles().catch(() => [] as SavedBundle[]),
      fetchRemoteOrderEntries(selected.client_uuid),
    ]);
    setBundleDefs(defs);
    const defByUuid = new Map(defs.filter((d) => d.bundle_uuid).map((d) => [d.bundle_uuid as string, d]));
    const skuName = new Map(catalog.filter((p) => p.sku).map((p) => [p.sku as string, p.name]));
    let entries: EditEntry[];
    if (remote.ok) {
      entries = remote.entries;
    } else {
      // Fallback: seed loose items from the local copy (no bundle grouping).
      entries = selected.items
        .map((it): EditEntry | null => {
          const prod = (it.product_id != null && catalog.find((p) => p.id === it.product_id)) || catalog.find((p) => p.name === it.product_name);
          return prod && prod.sku ? { kind: 'item', product_id: prod.sku, qty: it.quantity, unit_price: it.price } : null;
        })
        .filter((e): e is EditEntry => e != null);
    }
    setEditEntries(entries.map((e): DraftEntry =>
      e.kind === 'item'
        ? { kind: 'item', product_id: e.product_id, name: skuName.get(e.product_id) ?? e.product_id, qty: String(e.qty), price: String(e.unit_price) }
        : { kind: 'bundle', bundle_id: e.bundle_id, name: defByUuid.get(e.bundle_id)?.name ?? 'Bundle', price: String(e.price), picks: e.picks.map((p) => ({ product_id: p.product_id, qty: String(p.qty) })) },
    ));
    setEditOpening(false);
    setEditingTx(selected);
  }

  const entryAmount = (e: DraftEntry) => e.kind === 'item' ? (Number(e.qty) || 0) * (Number(e.price) || 0) : Number(e.price) || 0;
  function editTotal(): number { return editEntries.reduce((s, e) => s + entryAmount(e), 0); }
  const picksTotal = (picks: DraftPick[]) => picks.reduce((s, p) => s + (Number(p.qty) || 0), 0);
  // A "pick" bundle must have exactly its pick_count picks, each with a product.
  function bundleProblem(e: Extract<DraftEntry, { kind: 'bundle' }>): string | null {
    const def = bundleDefById.get(e.bundle_id);
    if (!def || def.bundle_type !== 'pick' || def.pick_count == null) return null;
    if (e.picks.some((p) => !p.product_id)) return 'choose a product for every pick';
    const n = picksTotal(e.picks);
    if (n !== def.pick_count) return `needs exactly ${def.pick_count} (has ${n})`;
    return null;
  }
  const editCanSave = editEntries.length > 0 && editEntries.every((e) => e.kind === 'item' ? (!!e.product_id && Number(e.qty) > 0) : !bundleProblem(e));

  const patchEntry = (i: number, next: DraftEntry) => setEditEntries((es) => es.map((e, idx) => (idx === i ? next : e)));
  const removeEntry = (i: number) => setEditEntries((es) => es.filter((_, idx) => idx !== i));
  function addBundleDef(def: SavedBundle) {
    if (!def.bundle_uuid) return;
    const picks = def.bundle_type === 'pick' && def.pick_count
      ? Array.from({ length: def.pick_count }, () => ({ product_id: '', qty: '1' }))
      : [];
    setEditEntries((es) => [...es, { kind: 'bundle', bundle_id: def.bundle_uuid!, name: def.name, price: String(def.price), picks }]);
  }

  // Product picker resolves against its target (add/replace an item, or a bundle pick).
  function pickProduct(p: Product) {
    if (!p.sku || !pickerTarget) { setPickerTarget(null); return; }
    const t = pickerTarget;
    setEditEntries((es) => es.map((e, idx) => {
      if (t.kind === 'set-item' && idx === t.idx && e.kind === 'item') return { ...e, product_id: p.sku!, name: p.name, price: String(p.price ?? 0) };
      if ((t.kind === 'set-pick' || t.kind === 'add-pick') && idx === t.idx && e.kind === 'bundle') {
        if (t.kind === 'add-pick') return { ...e, picks: [...e.picks, { product_id: p.sku!, qty: '1' }] };
        return { ...e, picks: e.picks.map((pk, j) => (j === t.pickIdx ? { ...pk, product_id: p.sku! } : pk)) };
      }
      return e;
    }));
    if (t.kind === 'add-item') setEditEntries((es) => [...es, { kind: 'item', product_id: p.sku!, name: p.name, qty: '1', price: String(p.price ?? 0) }]);
    setPickerTarget(null);
  }

  // Catalog options for the open picker; a bundle-pick target restricts to the
  // bundle's eligible categories.
  const pickerOptions = useMemo(() => {
    const base = catalog.filter((p) => p.sku && p.has_variants !== 1 && p.is_active === 1);
    const t = pickerTarget;
    if (t && (t.kind === 'set-pick' || t.kind === 'add-pick')) {
      const e = editEntries[t.idx];
      const def = e && e.kind === 'bundle' ? bundleDefById.get(e.bundle_id) : undefined;
      const cats = def?.line_categories;
      if (cats && cats.length > 0) return base.filter((p) => p.category != null && cats.includes(p.category));
    }
    return base;
  }, [catalog, pickerTarget, editEntries, bundleDefById]);

  async function handleSaveEdit() {
    if (!editingTx || !editingTx.client_uuid) return;
    if (!editCanSave) { setEditError('Check the items and bundle picks.'); return; }
    setEditSaving(true);
    setEditError(null);
    const payload: EditEntry[] = editEntries.map((e) =>
      e.kind === 'item'
        ? { kind: 'item', product_id: e.product_id, qty: Number(e.qty) || 0, unit_price: Number(e.price) || 0 }
        : { kind: 'bundle', bundle_id: e.bundle_id, price: Number(e.price) || 0, picks: e.picks.map((p) => ({ product_id: p.product_id, qty: Number(p.qty) || 0 })) },
    );
    const res = await editRemoteOrder(editingTx.client_uuid, { payment_method: editMethod, customer_handle: editHandle.trim() }, payload);
    setEditSaving(false);
    if (!res.ok) { setEditError(res.error ?? 'Edit failed.'); return; }

    // Best-effort local mirror: flatten to lines (bundle picks at ₱0, the bundle
    // price as its own line). loadTransactions re-fetches Coop's authoritative copy.
    if (isLocalTransaction(editingTx)) {
      const localItems: { productId: number; productName: string; price: number; quantity: number }[] = [];
      for (const e of editEntries) {
        if (e.kind === 'item') {
          const prod = prodBySku.get(e.product_id);
          if (prod) localItems.push({ productId: prod.id, productName: prod.name, price: Number(e.price) || 0, quantity: Number(e.qty) || 0 });
        } else {
          for (const pk of e.picks) {
            const prod = prodBySku.get(pk.product_id);
            if (prod) localItems.push({ productId: prod.id, productName: prod.name, price: 0, quantity: Number(pk.qty) || 0 });
          }
        }
      }
      await replaceLocalTransactionContents(
        editingTx.id,
        { paymentMethod: editMethod, customerHandle: editHandle.trim() || null, total: editTotal() },
        localItems,
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

              <Text style={styles.editSectionLabel}>Items &amp; bundles</Text>
              {editEntries.map((e, i) => e.kind === 'item' ? (
                <View key={`i-${i}`} style={styles.editLineRow}>
                  <TouchableOpacity style={styles.editLineNamePick} onPress={() => setPickerTarget({ kind: 'set-item', idx: i })}>
                    <Text style={styles.editLineName} numberOfLines={2}>{e.name || 'Select product…'}</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={styles.editQtyInput} keyboardType="number-pad" value={e.qty}
                    onChangeText={(v) => patchEntry(i, { ...e, qty: v.replace(/[^0-9]/g, '') })}
                    accessibilityLabel={`Quantity for ${e.name}`}
                  />
                  <View style={styles.editPriceWrap}>
                    <Text style={styles.editPricePeso}>₱</Text>
                    <TextInput
                      style={styles.editPriceInput} keyboardType="decimal-pad" value={e.price}
                      onChangeText={(v) => patchEntry(i, { ...e, price: v.replace(/[^0-9.]/g, '') })}
                      accessibilityLabel={`Unit price for ${e.name}`}
                    />
                  </View>
                  <Text style={styles.editLineSubtotal} numberOfLines={1}>₱{entryAmount(e).toFixed(2)}</Text>
                  <TouchableOpacity onPress={() => removeEntry(i)} style={styles.editRemoveBtn} accessibilityLabel={`Remove ${e.name}`}>
                    <Ionicons name="close" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              ) : (
                <View key={`b-${i}`} style={styles.bundleCard}>
                  <View style={styles.bundleCardHead}>
                    <View style={styles.bundleBadge}><Text style={styles.bundleBadgeText}>BUNDLE</Text></View>
                    <Text style={styles.bundleName} numberOfLines={1}>{e.name}</Text>
                    <View style={styles.editPriceWrap}>
                      <Text style={styles.editPricePeso}>₱</Text>
                      <TextInput
                        style={styles.editPriceInput} keyboardType="decimal-pad" value={e.price}
                        onChangeText={(v) => patchEntry(i, { ...e, price: v.replace(/[^0-9.]/g, '') })}
                        accessibilityLabel="Bundle price"
                      />
                    </View>
                    <TouchableOpacity onPress={() => removeEntry(i)} style={styles.editRemoveBtn} accessibilityLabel="Remove bundle">
                      <Ionicons name="close" size={16} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                  {bundleDefById.get(e.bundle_id)?.bundle_type === 'pick' ? (
                    <>
                      <View style={styles.bundlePicksHead}>
                        <Text style={styles.bundlePicksLabel}>Picks</Text>
                        <Text style={[styles.bundlePicksCount, bundleProblem(e) ? styles.bundlePicksBad : styles.bundlePicksOk]}>
                          {picksTotal(e.picks)} / {bundleDefById.get(e.bundle_id)?.pick_count ?? '—'}
                        </Text>
                      </View>
                      {e.picks.map((pk, j) => {
                        const pn = prodBySku.get(pk.product_id)?.name ?? '';
                        return (
                          <View key={`p-${j}`} style={styles.bundlePickRow}>
                            <TouchableOpacity style={styles.editLineNamePick} onPress={() => setPickerTarget({ kind: 'set-pick', idx: i, pickIdx: j })}>
                              <Text style={styles.editLineName} numberOfLines={1}>{pn || 'Select pick…'}</Text>
                            </TouchableOpacity>
                            <TextInput
                              style={styles.editQtyInput} keyboardType="number-pad" value={pk.qty}
                              onChangeText={(v) => patchEntry(i, { ...e, picks: e.picks.map((x, k) => k === j ? { ...x, qty: v.replace(/[^0-9]/g, '') } : x) })}
                              accessibilityLabel="Pick quantity"
                            />
                            <TouchableOpacity onPress={() => patchEntry(i, { ...e, picks: e.picks.filter((_, k) => k !== j) })} style={styles.editRemoveBtn} accessibilityLabel="Remove pick">
                              <Ionicons name="close" size={15} color={colors.textMuted} />
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                      <TouchableOpacity style={styles.addPickBtn} onPress={() => setPickerTarget({ kind: 'add-pick', idx: i })}>
                        <Ionicons name="add" size={14} color={colors.pink} />
                        <Text style={styles.addPickText}>Add pick</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <Text style={styles.bundleFixedNote} numberOfLines={2}>
                      {(bundleDefById.get(e.bundle_id)?.items ?? []).map((it) => `${it.name} ×${it.quantity}`).join(', ') || 'Fixed bundle'}
                    </Text>
                  )}
                  {bundleProblem(e) && <Text style={styles.bundleProblem}>This bundle {bundleProblem(e)}.</Text>}
                </View>
              ))}

              <View style={styles.addRow}>
                <TouchableOpacity style={styles.addItemBtn} onPress={() => setPickerTarget({ kind: 'add-item' })}>
                  <Ionicons name="add" size={16} color={colors.pink} />
                  <Text style={styles.addItemText}>Add item</Text>
                </TouchableOpacity>
                {bundleDefs.filter((d) => d.bundle_uuid).map((d) => (
                  <TouchableOpacity key={d.id} style={styles.addBundleBtn} onPress={() => addBundleDef(d)}>
                    <Ionicons name="add" size={14} color={colors.pink} />
                    <Text style={styles.addItemText} numberOfLines={1}>{d.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {editError && <Text style={styles.editError}>{editError}</Text>}
            </ScrollView>

            <View style={styles.editFooter}>
              <Text style={styles.editTotalText}>Total ₱{editTotal().toFixed(2)}</Text>
              <View style={styles.editFooterBtns}>
                <TouchableOpacity style={styles.editCancelBtn} onPress={() => setEditingTx(null)} disabled={editSaving}>
                  <Text style={styles.editCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.editSaveBtn, (!editCanSave || editSaving) && styles.editSaveBtnDisabled]} onPress={handleSaveEdit} disabled={editSaving || !editCanSave}>
                  <Text style={styles.editSaveText}>{editSaving ? 'Saving…' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        {/* Product picker: adds/replaces an item, or a bundle pick (restricted to
            the bundle's eligible categories). */}
        <Modal visible={pickerTarget != null} transparent animationType="fade" onRequestClose={() => setPickerTarget(null)}>
          <View style={styles.pickerOverlay}>
            <View style={styles.pickerSheet}>
              <Text style={styles.editTitle}>
                {pickerTarget && (pickerTarget.kind === 'set-pick' || pickerTarget.kind === 'add-pick') ? 'Choose a pick' : 'Choose a product'}
              </Text>
              <ScrollView style={styles.pickerScroll} keyboardShouldPersistTaps="handled">
                {pickerOptions.map((p) => (
                  <TouchableOpacity key={p.id} style={styles.pickerItem} onPress={() => pickProduct(p)}>
                    <Text style={styles.pickerItemName} numberOfLines={1}>{p.emoji ? `${p.emoji}  ` : ''}{p.name}</Text>
                    <Text style={styles.pickerItemPrice}>₱{(p.price ?? 0).toFixed(2)}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity style={styles.editCancelBtn} onPress={() => setPickerTarget(null)}>
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
  editLineSubtotal: { width: 72, textAlign: 'right', color: c.textMuted, fontSize: F.sm, fontWeight: '700' },
  editLineNamePick: { flex: 1, paddingVertical: 6, paddingHorizontal: 8, backgroundColor: c.elevated, borderRadius: R.sm, borderWidth: 1, borderColor: c.border },
  editRemoveBtn: { padding: 4 },
  addRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 8 },
  addItemBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  addBundleBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, maxWidth: 160, paddingVertical: 4, paddingHorizontal: 8, borderRadius: R.sm, borderWidth: 1, borderColor: c.pink },
  addItemText: { color: c.pink, fontSize: F.sm, fontWeight: '700' },
  // Bundle group card
  bundleCard: { borderWidth: 1, borderColor: c.border, borderRadius: R.sm, padding: 10, marginBottom: 8, backgroundColor: c.elevated },
  bundleCardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bundleBadge: { backgroundColor: c.pink + '26', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  bundleBadgeText: { color: c.pink, fontSize: 10, fontWeight: '800' },
  bundleName: { flex: 1, color: c.textPrimary, fontSize: F.sm, fontWeight: '700' },
  bundlePicksHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 2 },
  bundlePicksLabel: { color: c.textMuted, fontSize: F.xs, fontWeight: '600' },
  bundlePicksCount: { fontSize: F.xs, fontWeight: '800' },
  bundlePicksOk: { color: c.green },
  bundlePicksBad: { color: c.red },
  bundlePickRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  addPickBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start', marginTop: 8 },
  addPickText: { color: c.pink, fontSize: F.xs, fontWeight: '700' },
  bundleFixedNote: { color: c.textMuted, fontSize: F.xs, marginTop: 6 },
  bundleProblem: { color: c.red, fontSize: F.xs, marginTop: 6 },
  editSaveBtnDisabled: { opacity: 0.5 },
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
