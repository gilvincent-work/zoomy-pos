import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity, SafeAreaView, StyleSheet,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { F, R, type Palette } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../components/Toast';
import { getActiveProducts, decrementStock, type Product } from '../../db/products';
import { insertFreeTaste, markFreeTasteSynced, type FreeTaste } from '../../db/free-tastes';
import { pushFreeTaste } from '../../utils/free-tastes-sync';
import { refreshPendingCount } from '../../utils/outbox';

/**
 * Free taste (opened-stock sampling). A cart-like multi-line form: add a pack
 * count per product, an optional shared note, then Submit records them all as one
 * batch. Every line is written to local SQLite first (durable, offline-first) and
 * deducts the local stock cache; the Coop push (record_free_taste) fires inline
 * best-effort and the outbox retries any that don't land. Standalone: no customer,
 * no sale. See db/free-tastes.ts and utils/free-tastes-sync.ts.
 */
export default function FreeTasteModal() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { showToast } = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [note, setNote] = useState('');
  // productId -> packs opened in this batch.
  const [qty, setQty] = useState<Record<number, number>>({});
  const [submitting, setSubmitting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getActiveProducts().then((rows) => {
        if (!cancelled) setProducts(rows);
      });
      return () => { cancelled = true; };
    }, [])
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, search]);

  const totalPacks = useMemo(
    () => Object.values(qty).reduce((sum, n) => sum + n, 0),
    [qty]
  );

  const inc = (id: number) => setQty((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
  const dec = (id: number) =>
    setQty((prev) => {
      const next = (prev[id] ?? 0) - 1;
      const copy = { ...prev };
      if (next <= 0) delete copy[id];
      else copy[id] = next;
      return copy;
    });

  async function submit() {
    if (submitting || totalPacks === 0) return;
    setSubmitting(true);
    const lines = products.filter((p) => (qty[p.id] ?? 0) > 0);
    const batchId = Crypto.randomUUID();
    const openedAt = new Date().toISOString();
    const sharedNote = note.trim() || null;

    // Build the durable rows first (one client_uuid each), then write + push.
    const rows: FreeTaste[] = lines.map((p) => ({
      client_uuid: Crypto.randomUUID(),
      batch_id: batchId,
      product_local_id: p.id,
      product_sku: p.sku,
      product_name: p.name,
      qty: qty[p.id],
      note: sharedNote,
      created_by: 'pos',
      device_id: 'pos',
      opened_at: openedAt,
      synced_at: null,
    }));

    try {
      for (const r of rows) {
        await insertFreeTaste({
          clientUuid: r.client_uuid,
          batchId: r.batch_id,
          productLocalId: r.product_local_id,
          productSku: r.product_sku,
          productName: r.product_name,
          qty: r.qty,
          note: r.note,
          createdBy: r.created_by,
          deviceId: r.device_id,
          openedAt: r.opened_at,
        });
      }
      // Reflect the opened packs on the local stock cache immediately (Coop
      // deducts its own the moment the push lands).
      await decrementStock(rows.map((r) => ({ productId: r.product_local_id!, quantity: r.qty })));
      await refreshPendingCount();

      showToast({
        variant: 'success',
        title: 'Free taste recorded',
        message: `${totalPacks} pack${totalPacks !== 1 ? 's' : ''} opened across ${rows.length} product${rows.length !== 1 ? 's' : ''}.`,
      });
      router.back();

      // Push to Coop in the background (best-effort). Mark each synced on success;
      // any that fail stay pending for the outbox drain. Warn once if oversold.
      Promise.all(rows.map((r) => pushFreeTaste(r))).then((results) => {
        results.forEach((res, i) => {
          if (res.ok) markFreeTasteSynced(rows[i].client_uuid).catch(() => {});
        });
        refreshPendingCount().catch(() => {});
        if (results.some((res) => res.ok && res.oversold)) {
          showToast({
            variant: 'error',
            title: 'Sampled past stock',
            message: 'Some packs went past the on-hand count. Restock in Coop when you can.',
          });
        }
      });
    } catch {
      showToast({ variant: 'error', title: 'Could not record', message: 'Please try again.' });
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={filtered}
        keyExtractor={(p) => String(p.id)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <Text style={styles.hint}>
              Open sellable stock for pets to sample. This deducts the event stock, no sale is made.
            </Text>
            <Text style={styles.fieldLabel}>Note <Text style={styles.optional}>optional, shared by all lines</Text></Text>
            <TextInput
              testID="free-taste-note"
              style={styles.textInput}
              placeholder="Opened for the Saturday crowd…"
              placeholderTextColor={colors.textMuted}
              value={note}
              onChangeText={setNote}
            />
            <TextInput
              testID="free-taste-search"
              style={[styles.textInput, styles.search]}
              placeholder="Search treats…"
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        }
        renderItem={({ item }) => {
          const count = qty[item.id] ?? 0;
          const active = count > 0;
          return (
            <View style={[styles.row, active && styles.rowActive]}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowName} numberOfLines={2}>
                  {item.emoji ? `${item.emoji}  ` : ''}{item.name}
                </Text>
                {!item.sku && <Text style={styles.rowMeta}>Not synced to Coop yet</Text>}
              </View>
              <View style={styles.stepper}>
                <TouchableOpacity
                  testID={`free-taste-minus-${item.id}`}
                  style={styles.stepBtn}
                  onPress={() => dec(item.id)}
                  disabled={count === 0}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text style={[styles.stepMinus, count === 0 && styles.stepDisabled]}>−</Text>
                </TouchableOpacity>
                <Text style={styles.stepQty}>{count}</Text>
                <TouchableOpacity
                  testID={`free-taste-plus-${item.id}`}
                  style={[styles.stepBtn, styles.stepPlus]}
                  onPress={() => inc(item.id)}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text style={styles.stepPlusText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>No treats match that search.</Text>}
      />

      <View style={styles.footer}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Packs opened</Text>
          <Text style={styles.totalValue}>{totalPacks}</Text>
        </View>
        <TouchableOpacity
          testID="free-taste-submit"
          style={[styles.primaryBtn, (totalPacks === 0 || submitting) && styles.primaryBtnDisabled]}
          onPress={submit}
          disabled={totalPacks === 0 || submitting}
          activeOpacity={0.85}
        >
          <Text style={[styles.primaryBtnText, (totalPacks === 0 || submitting) && styles.primaryBtnTextDisabled]}>
            {totalPacks === 0 ? 'Add a pack to record' : `Record ${totalPacks} pack${totalPacks !== 1 ? 's' : ''}`}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  listContent: { padding: 16, paddingBottom: 16, gap: 8 },
  headerBlock: { gap: 8, marginBottom: 4 },
  hint: { color: c.textMuted, fontSize: F.sm, lineHeight: 19, marginBottom: 4 },
  fieldLabel: { color: c.textSecondary, fontSize: F.sm, fontWeight: '700' },
  optional: { color: c.textMuted, fontSize: F.xs, fontWeight: '400' },
  textInput: {
    backgroundColor: c.surface, color: c.textPrimary, borderRadius: R.sm, borderWidth: 1,
    borderColor: c.border, paddingVertical: 11, paddingHorizontal: 14, fontSize: F.md,
  },
  search: { marginTop: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: c.surface,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: c.borderDark,
  },
  rowActive: { borderColor: c.pink, backgroundColor: c.pinkSubtle },
  rowInfo: { flex: 1, minWidth: 0, gap: 2 },
  rowName: { color: c.textPrimary, fontSize: F.md, fontWeight: '600', lineHeight: 19 },
  rowMeta: { color: c.textMuted, fontSize: F.xs },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 999,
    overflow: 'hidden',
  },
  stepBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  stepPlus: { backgroundColor: c.pink },
  stepMinus: { color: c.red, fontSize: 20, fontWeight: '800', lineHeight: 22 },
  stepDisabled: { color: c.textMuted },
  stepPlusText: { color: '#fff', fontSize: 20, fontWeight: '800', lineHeight: 22 },
  stepQty: { minWidth: 30, textAlign: 'center', color: c.textPrimary, fontSize: F.md, fontWeight: '800' },
  empty: { color: c.textMuted, textAlign: 'center', marginTop: 32, fontSize: F.md },
  footer: {
    borderTopWidth: 1,
    borderTopColor: c.borderDark,
    padding: 16,
    gap: 10,
    backgroundColor: c.surface,
  },
  totalRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  totalLabel: { color: c.textSecondary, fontSize: F.sm, fontWeight: '700' },
  totalValue: { color: c.textPrimary, fontSize: F.xxl, fontWeight: '800' },
  primaryBtn: { backgroundColor: c.pink, borderRadius: R.md, paddingVertical: 15, alignItems: 'center' },
  primaryBtnDisabled: { backgroundColor: c.elevated, borderWidth: 1, borderColor: c.border },
  primaryBtnText: { color: '#fff', fontSize: F.md, fontWeight: '800' },
  primaryBtnTextDisabled: { color: c.textMuted },
});
