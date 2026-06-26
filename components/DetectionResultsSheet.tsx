import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Image, StyleSheet, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, F, R } from '../constants/theme';
import type { DetectedProduct } from '../utils/scan-to-cart/detector';
import type { ScanLabel } from '../utils/scan-to-cart/labels';

// One color per bounding box — cycles if there are more than 8 detections
const BOX_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A',
  '#98D8C8', '#DDA0DD', '#F0E68C', '#90EE90',
];

type Props = {
  results: DetectedProduct[];
  capturedImageUri: string;
  onConfirm: (items: Array<{ label: ScanLabel; quantity: number }>) => void;
  onScanAgain: () => void;
  onClose: () => void;
};

export function DetectionResultsSheet({
  results, capturedImageUri, onConfirm, onScanAgain, onClose,
}: Props) {
  // quantities[i] = 0 means the item is removed from the order
  const [quantities, setQuantities] = useState<Record<number, number>>(
    () => Object.fromEntries(results.map((_, i) => [i, 1])),
  );

  function updateQty(i: number, delta: number) {
    setQuantities(prev => ({ ...prev, [i]: Math.max(0, (prev[i] ?? 1) + delta) }));
  }

  function handleConfirmPress() {
    const items = results
      .map((det, i) => ({ label: det.label, quantity: quantities[i] ?? 1 }))
      .filter(item => item.quantity > 0);
    if (items.length > 0) onConfirm(items);
  }

  const activeCount = Object.values(quantities).filter(q => q > 0).length;

  return (
    <View style={styles.container}>

      {/* ── Header ────────────────────────────────────────────── */}
      <View style={styles.headerRow}>
        <Text style={styles.title}>What did you scan?</Text>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={22} color={C.textMuted} />
        </TouchableOpacity>
      </View>

      {/* ── Image + bounding box overlay ─────────────────────── */}
      {/* aspectRatio:1 keeps the container square to match the 640×640 capture canvas.
          Bounding boxes use % values so they scale with the container — no onLayout needed. */}
      <View style={styles.imageContainer}>
        <Image source={{ uri: capturedImageUri }} style={styles.previewImage} resizeMode="cover" />

        {results.map((det, i) => {
          const color   = BOX_COLORS[i % BOX_COLORS.length];
          const removed = (quantities[i] ?? 1) === 0;
          return (
            <View
              key={i}
              pointerEvents="none"
              style={[
                styles.bbox,
                {
                  left:   `${det.bbox.x * 100}%` as unknown as number,
                  top:    `${det.bbox.y * 100}%` as unknown as number,
                  width:  `${det.bbox.w * 100}%` as unknown as number,
                  height: `${det.bbox.h * 100}%` as unknown as number,
                  borderColor: color,
                  opacity: removed ? 0.25 : 1,
                },
              ]}
            >
              <View style={[styles.bboxLabel, { backgroundColor: color }]}>
                <Text style={styles.bboxLabelText}>{i + 1}</Text>
              </View>
            </View>
          );
        })}
      </View>

      {/* ── Product cards ─────────────────────────────────────── */}
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {results.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No products detected</Text>
            <Text style={styles.emptySubtext}>
              Try scanning again with better lighting and all products flat in frame.
            </Text>
          </View>
        ) : (
          results.map((det, i) => {
            const color   = BOX_COLORS[i % BOX_COLORS.length];
            const qty     = quantities[i] ?? 1;
            const removed = qty === 0;
            return (
              <View key={i} style={[styles.card, removed && styles.cardRemoved]}>
                <View style={[styles.colorDot, { backgroundColor: color }]} />

                <View style={styles.cardContent}>
                  <Text
                    style={[styles.cardLabel, removed && styles.cardLabelRemoved]}
                    numberOfLines={1}
                  >
                    {det.label.displayName}
                  </Text>
                  <Text style={styles.cardConfidence}>
                    {Math.round(det.confidence * 100)}% confidence
                  </Text>
                </View>

                {removed ? (
                  <TouchableOpacity onPress={() => updateQty(i, 1)} style={styles.undoBtn}>
                    <Text style={styles.undoText}>Undo</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.cardActions}>
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => updateQty(i, -1)}>
                      <Ionicons name="remove" size={15} color={C.textPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.qtyValue}>{qty}</Text>
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => updateQty(i, 1)}>
                      <Ionicons name="add" size={15} color={C.textPrimary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.removeBtn}
                      onPress={() => updateQty(i, -qty)}
                    >
                      <Ionicons name="close-circle-outline" size={18} color={C.textMuted} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* ── Action bar ───────────────────────────────────────── */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.scanAgainBtn} onPress={onScanAgain}>
          <Text style={styles.scanAgainText}>Scan Again</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.addBtn, activeCount === 0 && styles.addBtnDisabled]}
          onPress={handleConfirmPress}
          disabled={activeCount === 0}
        >
          <Text style={styles.addBtnText}>
            {activeCount > 0 ? `Add ${activeCount} to Cart` : 'Add to Cart'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.surface },

  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10,
  },
  title: { color: C.textPrimary, fontSize: F.lg, fontWeight: '800' },

  imageContainer: {
    width: '100%',
    aspectRatio: 1,           // square — matches 640×640 capture
    backgroundColor: C.elevated,
    position: 'relative',
    overflow: 'hidden',
  },
  previewImage: { width: '100%', height: '100%' },

  bbox: {
    position: 'absolute',
    borderWidth: 2.5,
    borderRadius: 4,
  },
  bboxLabel: {
    position: 'absolute',
    top: 0,
    left: 0,
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  bboxLabelText: { color: '#fff', fontSize: 10, fontWeight: '800' },

  list: { flex: 1 },
  listContent: { padding: 12, gap: 8 },

  emptyState: { alignItems: 'center', paddingVertical: 32, gap: 6 },
  emptyText: { color: C.textSecondary, fontSize: F.md, fontWeight: '700' },
  emptySubtext: { color: C.textMuted, fontSize: F.sm, textAlign: 'center', lineHeight: 18 },

  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.elevated,
    borderWidth: 1, borderColor: C.border,
    borderRadius: R.md,
    paddingHorizontal: 12, paddingVertical: 10,
    gap: 10,
  },
  cardRemoved: { opacity: 0.45 },
  colorDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  cardContent: { flex: 1 },
  cardLabel: { color: C.textPrimary, fontSize: F.sm, fontWeight: '700' },
  cardLabelRemoved: { color: C.textMuted, textDecorationLine: 'line-through' },
  cardConfidence: { color: C.textMuted, fontSize: F.xs, marginTop: 1 },

  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  qtyBtn: {
    backgroundColor: C.bg, borderRadius: R.sm - 4,
    borderWidth: 1, borderColor: C.border, padding: 5,
  },
  qtyValue: {
    color: C.textPrimary, fontSize: F.sm, fontWeight: '800',
    minWidth: 22, textAlign: 'center',
  },
  removeBtn:  { marginLeft: 2, padding: 2 },
  undoBtn:    { paddingHorizontal: 10, paddingVertical: 6 },
  undoText:   { color: C.pink, fontSize: F.sm, fontWeight: '700' },

  actions: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: C.border,
  },
  scanAgainBtn: {
    flex: 1, backgroundColor: C.elevated,
    borderWidth: 1, borderColor: C.border,
    borderRadius: R.sm, padding: 14, alignItems: 'center',
  },
  scanAgainText: { color: C.textSecondary, fontWeight: '700', fontSize: F.md },
  addBtn: {
    flex: 2, backgroundColor: C.pink,
    borderRadius: R.sm, padding: 14, alignItems: 'center',
  },
  addBtnDisabled: { backgroundColor: C.border },
  addBtnText: { color: '#fff', fontWeight: '800', fontSize: F.md },
});
