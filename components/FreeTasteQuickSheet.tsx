import { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import * as Crypto from 'expo-crypto';
import { F, R, type Palette } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { useToast } from './Toast';
import { decrementStock, type Product } from '../db/products';
import { insertFreeTaste, markFreeTasteSynced, type FreeTaste } from '../db/free-tastes';
import { pushFreeTaste } from '../utils/free-tastes-sync';
import { refreshPendingCount } from '../utils/outbox';

/**
 * Single-product free-taste quick sheet, opened by long-pressing a product tile.
 * Same offline-first path as the multi-line Free Taste modal: write the durable
 * local row first, deduct the local stock cache, then push to Coop best-effort
 * (record_free_taste) with the outbox as the retry. Standalone: no batch, no sale.
 */
export function FreeTasteQuickSheet({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { showToast } = useToast();
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (product) {
      setQty(1);
      setNote('');
      setSubmitting(false);
    }
  }, [product]);

  if (!product) return null;
  const p = product;

  async function submit() {
    if (submitting || qty <= 0) return;
    setSubmitting(true);
    const row: FreeTaste = {
      client_uuid: Crypto.randomUUID(),
      batch_id: null,
      product_local_id: p.id,
      product_sku: p.sku,
      product_name: p.name,
      qty,
      note: note.trim() || null,
      created_by: 'pos',
      device_id: 'pos',
      opened_at: new Date().toISOString(),
      synced_at: null,
    };
    try {
      await insertFreeTaste({
        clientUuid: row.client_uuid,
        batchId: null,
        productLocalId: row.product_local_id,
        productSku: row.product_sku,
        productName: row.product_name,
        qty: row.qty,
        note: row.note,
        createdBy: row.created_by,
        deviceId: row.device_id,
        openedAt: row.opened_at,
      });
      await decrementStock([{ productId: p.id, quantity: qty }]);
      await refreshPendingCount();
      showToast({
        variant: 'success',
        title: 'Free taste recorded',
        message: `${qty} pack${qty !== 1 ? 's' : ''} of ${p.name} opened.`,
      });
      onClose();
      // Push to Coop in the background; the outbox retries a miss. Warn if oversold.
      pushFreeTaste(row).then((res) => {
        if (res.ok) markFreeTasteSynced(row.client_uuid).catch(() => {});
        refreshPendingCount().catch(() => {});
        if (res.ok && res.oversold) {
          showToast({
            variant: 'error',
            title: 'Sampled past stock',
            message: 'That went past the on-hand count. Restock in Coop when you can.',
          });
        }
      });
    } catch {
      showToast({ variant: 'error', title: 'Could not record', message: 'Please try again.' });
      setSubmitting(false);
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.sheet} onPress={() => {}}>
          <Text style={s.title}>Free taste</Text>
          <Text style={s.product} numberOfLines={2}>{p.emoji ? `${p.emoji}  ` : ''}{p.name}</Text>
          <Text style={s.hint}>Opens sellable stock for pets to sample. Deducts event stock, no sale is made.</Text>
          {!p.sku && <Text style={s.warn}>Not synced to Coop yet. It will sync once the catalog lands.</Text>}

          <View style={s.qtyRow}>
            <Text style={s.qtyLabel}>Packs opened</Text>
            <View style={s.stepper}>
              <TouchableOpacity style={s.stepBtn} onPress={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Text style={[s.stepMinus, qty <= 1 && s.stepDisabled]}>−</Text>
              </TouchableOpacity>
              <Text style={s.stepQty}>{qty}</Text>
              <TouchableOpacity style={[s.stepBtn, s.stepPlus]} onPress={() => setQty((q) => q + 1)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Text style={s.stepPlusText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TextInput
            style={s.input}
            placeholder="Note (optional)"
            placeholderTextColor={colors.textMuted}
            value={note}
            onChangeText={setNote}
          />

          <View style={s.actions}>
            <TouchableOpacity style={s.cancelBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={s.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.primaryBtn, submitting && s.primaryDisabled]} onPress={submit} disabled={submitting} activeOpacity={0.85}>
              <Text style={s.primaryText}>{submitting ? 'Recording…' : `Log free taste`}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
    sheet: {
      backgroundColor: c.surface,
      borderRadius: R.lg,
      borderWidth: 1,
      borderColor: c.borderDark,
      padding: 20,
      gap: 10,
    },
    title: { color: c.textMuted, fontSize: F.xs, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
    product: { color: c.textPrimary, fontSize: F.lg, fontWeight: '800', lineHeight: 22 },
    hint: { color: c.textMuted, fontSize: F.sm, lineHeight: 19 },
    warn: { color: c.textMuted, fontSize: F.xs },
    qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
    qtyLabel: { color: c.textSecondary, fontSize: F.sm, fontWeight: '700' },
    stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: c.border, borderRadius: 999, overflow: 'hidden' },
    stepBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    stepPlus: { backgroundColor: c.pink },
    stepMinus: { color: c.red, fontSize: 20, fontWeight: '800', lineHeight: 22 },
    stepDisabled: { color: c.textMuted },
    stepPlusText: { color: '#fff', fontSize: 20, fontWeight: '800', lineHeight: 22 },
    stepQty: { minWidth: 34, textAlign: 'center', color: c.textPrimary, fontSize: F.md, fontWeight: '800' },
    input: {
      backgroundColor: c.bg, color: c.textPrimary, borderRadius: R.sm, borderWidth: 1,
      borderColor: c.border, paddingVertical: 11, paddingHorizontal: 14, fontSize: F.md,
    },
    actions: { flexDirection: 'row', gap: 10, marginTop: 6 },
    cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: R.md, borderWidth: 1, borderColor: c.border, alignItems: 'center' },
    cancelText: { color: c.textSecondary, fontSize: F.md, fontWeight: '700' },
    primaryBtn: { flex: 2, paddingVertical: 13, borderRadius: R.md, backgroundColor: c.pink, alignItems: 'center' },
    primaryDisabled: { opacity: 0.6 },
    primaryText: { color: '#fff', fontSize: F.md, fontWeight: '800' },
  });
