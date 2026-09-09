import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, TextInput,
  StyleSheet, SafeAreaView,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getCategoriesWithSubcategories, UNCATEGORIZED } from '../../db/products';
import {
  savePickBundle, updatePickBundle, getSavedBundleById, validatePickBundleInput,
} from '../../db/saved-bundles';
import { bundlePreviewText } from '../../utils/bundles';
import { useToast } from '../../components/Toast';
import { F, R, type Palette } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';

const MIN_ITEMS = 1;

export default function BundleModal() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const editingId = editId ? Number(editId) : null;
  const { showToast } = useToast();

  const [lines, setLines] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [pickCount, setPickCount] = useState(2);
  const [selectedLines, setSelectedLines] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getCategoriesWithSubcategories().then(async (groups) => {
        if (cancelled) return;
        const lineNames = groups.map((g) => g.category).filter((c) => c !== UNCATEGORIZED);
        setLines(lineNames);
        if (editingId != null && !loaded) {
          const bundle = await getSavedBundleById(editingId);
          if (bundle && !cancelled) {
            setName(bundle.name);
            setPrice(String(bundle.price));
            setPickCount(bundle.pick_count ?? 2);
            setSelectedLines(new Set(bundle.line_categories ?? []));
          }
        }
        setLoaded(true);
      });
      return () => { cancelled = true; };
    }, [editingId, loaded])
  );

  const selectedList = lines.filter((l) => selectedLines.has(l));
  const parsedPrice = parseFloat(price);
  const previewPrice = Number.isFinite(parsedPrice) ? parsedPrice : 0;

  function toggleLine(line: string) {
    setSelectedLines((prev) => {
      const next = new Set(prev);
      if (next.has(line)) next.delete(line);
      else next.add(line);
      return next;
    });
  }

  async function handleSave() {
    const input = {
      name: name.trim(),
      price: parsedPrice,
      pickCount,
      lineCategories: selectedList,
    };
    const error = validatePickBundleInput(input);
    if (error) {
      showToast({ variant: 'error', title: 'Check the bundle', message: error });
      return;
    }
    try {
      const bundleId = editingId != null ? (await updatePickBundle(editingId, input), editingId) : await savePickBundle(input);
      // Share it to Coop so other POS devices see it (best-effort, online-only).
      const saved = await getSavedBundleById(bundleId);
      if (saved) { const { pushBundle } = await import('../../utils/bundles-sync'); pushBundle(saved); }
      showToast({
        variant: 'success',
        title: editingId != null ? 'Bundle updated' : 'Bundle saved',
        message: `${input.name} · any ${pickCount} for ₱${previewPrice.toFixed(2)}`,
      });
      router.dismiss();
    } catch {
      showToast({ variant: 'error', title: 'Could not save the bundle', message: 'Please try again.' });
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.field}>
          <Text style={styles.label}>Bundle name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Buy Any 4"
            placeholderTextColor={colors.textMuted}
            returnKeyType="done"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Price</Text>
          <View style={styles.priceBox}>
            <Text style={styles.currencySign}>₱</Text>
            <TextInput
              style={styles.priceInput}
              value={price}
              onChangeText={setPrice}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              returnKeyType="done"
            />
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Amount of items</Text>
          <View style={styles.sizeRow}>
            <Text style={styles.sizeText}>Buy any <Text style={styles.sizeNum}>{pickCount}</Text> flavors</Text>
            <View style={styles.stepper}>
              <TouchableOpacity
                style={[styles.stepBtn, pickCount <= MIN_ITEMS && styles.stepBtnDim]}
                onPress={() => setPickCount((n) => Math.max(MIN_ITEMS, n - 1))}
                disabled={pickCount <= MIN_ITEMS}
                accessibilityLabel="Fewer items"
              >
                <Text style={[styles.stepIcon, pickCount <= MIN_ITEMS && styles.stepIconDim]}>−</Text>
              </TouchableOpacity>
              <Text style={styles.qty}>{pickCount}</Text>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => setPickCount((n) => n + 1)}
                accessibilityLabel="More items"
              >
                <Text style={styles.stepIcon}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Product lines</Text>
          {lines.length === 0 ? (
            <Text style={styles.empty}>No product lines yet. Add products with categories first.</Text>
          ) : (
            lines.map((line) => {
              const on = selectedLines.has(line);
              return (
                <TouchableOpacity
                  key={line}
                  style={[styles.lineRow, on && styles.lineRowOn]}
                  onPress={() => toggleLine(line)}
                  activeOpacity={0.7}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                >
                  <Text style={styles.lineName}>{line}</Text>
                  <View style={[styles.check, on && styles.checkOn]}>
                    {on && <Ionicons name="checkmark" size={16} color="#fff" />}
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        <Text style={styles.preview}>
          {bundlePreviewText(pickCount, selectedList, previewPrice)}
        </Text>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.cancelBtn} onPress={() => router.dismiss()}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveText}>{editingId != null ? 'Update bundle' : 'Save bundle'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  body: { padding: 16, gap: 18, paddingBottom: 28 },

  field: { gap: 8 },
  label: {
    color: c.textMuted,
    fontSize: F.xs,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: R.sm,
    paddingVertical: 12,
    paddingHorizontal: 14,
    color: c.textPrimary,
    fontSize: F.md,
    fontWeight: '600',
  },

  priceBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.surface,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  currencySign: { color: c.textSecondary, fontSize: F.xxl, fontWeight: '700', marginRight: 8 },
  priceInput: { flex: 1, color: c.textPrimary, fontSize: F.xxl, fontWeight: '800' },

  sizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: c.surface,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: c.border,
    paddingVertical: 10,
    paddingLeft: 16,
    paddingRight: 10,
  },
  sizeText: { color: c.textPrimary, fontSize: F.md, fontWeight: '700' },
  sizeNum: { color: c.pink, fontWeight: '800' },

  stepper: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: R.sm,
    backgroundColor: c.elevated,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnDim: { borderColor: c.borderDark },
  stepIcon: { color: c.textPrimary, fontSize: F.lg, fontWeight: '700', lineHeight: 20 },
  stepIconDim: { color: c.textMuted },
  qty: {
    width: 36,
    textAlign: 'center',
    color: c.pink,
    fontSize: F.md,
    fontWeight: '800',
  },

  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: 14,
    backgroundColor: c.surface,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: c.border,
  },
  lineRowOn: { borderColor: c.pink, backgroundColor: c.pinkSubtle },
  lineName: { color: c.textPrimary, fontSize: F.md, fontWeight: '700' },
  check: {
    width: 26,
    height: 26,
    borderRadius: R.sm,
    borderWidth: 1.5,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: c.pink, borderColor: c.pink },

  preview: {
    color: c.textSecondary,
    fontSize: F.sm,
    fontWeight: '600',
    lineHeight: 20,
    backgroundColor: c.pinkSubtle,
    borderWidth: 1,
    borderColor: c.pinkDim,
    borderRadius: R.md,
    padding: 14,
  },
  empty: { color: c.textMuted, fontSize: F.sm, paddingVertical: 8 },

  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: c.borderDark,
    backgroundColor: c.surface,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: c.elevated,
    borderWidth: 1,
    borderColor: c.border,
    paddingVertical: 16,
    borderRadius: R.sm,
    alignItems: 'center',
  },
  cancelText: { color: c.textSecondary, fontSize: F.md, fontWeight: '700' },
  saveBtn: {
    flex: 2,
    backgroundColor: c.green,
    paddingVertical: 16,
    borderRadius: R.sm,
    alignItems: 'center',
  },
  saveText: { color: '#fff', fontSize: F.lg, fontWeight: '800' },
});
