import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, F, R } from '../constants/theme';
import type { DetectionResult } from '../utils/scan-to-cart/classifier';
import type { ScanLabel } from '../utils/scan-to-cart/labels';

type Props = {
  results: DetectionResult[];
  capturedImageUri: string;
  onConfirm: (label: ScanLabel, quantity: number) => void;
  onScanAgain: () => void;
  onClose: () => void;
};

export function DetectionResultsSheet({ results, capturedImageUri, onConfirm, onScanAgain, onClose }: Props) {
  const top3 = results.slice(0, 3);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);

  function handleCardPress(i: number) {
    setSelectedIndex(i);
    setQuantity(1);
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>What did you scan?</Text>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={22} color={C.textMuted} />
        </TouchableOpacity>
      </View>

      <Image source={{ uri: capturedImageUri }} style={styles.preview} resizeMode="cover" />

      <ScrollView style={styles.cardList} contentContainerStyle={styles.cardListContent}>
        {top3.map((result, i) => {
          const isSelected = i === selectedIndex;
          return (
            <TouchableOpacity
              key={i}
              testID={`result-card-${i}`}
              accessibilityState={{ selected: isSelected }}
              style={[styles.card, isSelected && styles.cardSelected]}
              onPress={() => handleCardPress(i)}
            >
              <View style={styles.cardBody}>
                <Text style={[styles.cardLabel, isSelected && styles.cardLabelSelected]} numberOfLines={1}>
                  {result.label.displayName}
                </Text>
                <Text style={styles.cardConfidence}>{Math.round(result.confidence * 100)}%</Text>
              </View>
              {isSelected && (
                <View style={styles.confidenceBar}>
                  <View style={[styles.confidenceFill, { width: `${result.confidence * 100}%` as any }]} />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.qtyRow}>
        <Text style={styles.qtyLabel}>Quantity</Text>
        <View style={styles.qtyStepper}>
          <TouchableOpacity
            testID="qty-decrement"
            style={styles.qtyBtn}
            onPress={() => setQuantity((q) => Math.max(1, q - 1))}
          >
            <Ionicons name="remove" size={18} color={C.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.qtyValue}>{quantity}</Text>
          <TouchableOpacity
            testID="qty-increment"
            style={styles.qtyBtn}
            onPress={() => setQuantity((q) => q + 1)}
          >
            <Ionicons name="add" size={18} color={C.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.scanAgainBtn} onPress={onScanAgain}>
          <Text style={styles.scanAgainText}>Scan Again</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => onConfirm(top3[selectedIndex].label, quantity)}
        >
          <Text style={styles.addBtnText}>Add to Cart</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.surface,
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  title: { color: C.textPrimary, fontSize: F.lg, fontWeight: '800' },
  preview: {
    width: '100%',
    height: 180,
    borderRadius: R.md,
    marginBottom: 14,
    backgroundColor: C.elevated,
  },
  cardList: { flex: 1 },
  cardListContent: { gap: 8 },
  card: {
    backgroundColor: C.elevated,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: R.md,
    padding: 12,
  },
  cardSelected: { borderColor: C.pink, backgroundColor: C.pinkSubtle },
  cardBody: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardLabel: { color: C.textSecondary, fontSize: F.sm, fontWeight: '600', flex: 1, marginRight: 8 },
  cardLabelSelected: { color: C.textPrimary, fontWeight: '700' },
  cardConfidence: { color: C.textMuted, fontSize: F.xs, fontWeight: '700' },
  confidenceBar: {
    height: 3,
    backgroundColor: C.border,
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  confidenceFill: { height: 3, backgroundColor: C.pink, borderRadius: 2 },
  qtyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 4,
  },
  qtyLabel: { color: C.textSecondary, fontSize: F.md, fontWeight: '700' },
  qtyStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.elevated,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  qtyBtn: { paddingHorizontal: 16, paddingVertical: 10 },
  qtyValue: {
    color: C.textPrimary,
    fontSize: F.md,
    fontWeight: '800',
    minWidth: 32,
    textAlign: 'center',
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  scanAgainBtn: {
    flex: 1,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.sm,
    padding: 14,
    alignItems: 'center',
  },
  scanAgainText: { color: C.textSecondary, fontWeight: '700', fontSize: F.md },
  addBtn: { flex: 2, backgroundColor: C.pink, borderRadius: R.sm, padding: 14, alignItems: 'center' },
  addBtnText: { color: '#fff', fontWeight: '800', fontSize: F.md },
});
