import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Alert,
  Image, ScrollView,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import { sha256 } from '../../utils/hash';
import {
  getAdminHash, setAdminHash, getAllQrUris,
  setQrUri, removeQrUri, QrMethod, QrUris, qrMethodLabel,
} from '../../db/settings';
import { Ionicons } from '@expo/vector-icons';
import { C, F, R } from '../../constants/theme';
import { exportProductsArchive } from '../../utils/export-products-csv';
import { pickProductsZip } from '../../utils/import-products-csv';
import { parseCatalog, ParseError } from '../../utils/products-csv-format';
import { makeImageResolver } from '../../utils/import-images';
import { upsertCatalog, type ImportSummary } from '../../db/catalog-import';
import { useToast } from '../../components/Toast';

type Step = 'verify' | 'new_pin' | 'settings';

const PIN_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'backspace', '0', 'confirm'];

export default function AdminModal() {
  const { action, transactionId } = useLocalSearchParams<{
    action: 'void_transaction' | 'change_pin' | 'settings';
    transactionId?: string;
  }>();

  const [step, setStep] = useState<Step>('verify');
  const [pin, setPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [qrUris, setQrUris] = useState<QrUris>({ gcash: null, maya: null, bpi: null });
  const { showToast } = useToast();

  const currentPin = step === 'verify' ? pin : newPin;
  const setCurrentPin = step === 'verify' ? setPin : setNewPin;

  useEffect(() => {
    getAllQrUris().then(setQrUris);
  }, []);

  function handleKey(key: string) {
    if (key === 'backspace') {
      setCurrentPin((p) => p.slice(0, -1));
      return;
    }
    if (key === 'confirm') {
      handleSubmit();
      return;
    }
    if (currentPin.length < 6) {
      setCurrentPin((p) => p + key);
    }
  }

  async function handleSubmit() {
    if (step === 'verify') {
      const stored = await getAdminHash();
      const entered = await sha256(pin);
      if (entered !== stored) {
        Alert.alert('Wrong PIN', 'Incorrect PIN. Try again.');
        setPin('');
        return;
      }
      if (action === 'change_pin') {
        setPin('');
        setStep('new_pin');
        return;
      }
      if (action === 'settings') {
        setPin('');
        setStep('settings');
        return;
      }
      const { voidTransaction } = await import('../../db/transactions');
      await voidTransaction(Number(transactionId));
      router.dismiss();
      router.dismiss();
    } else if (step === 'new_pin') {
      if (newPin.length < 4) {
        Alert.alert('Too short', 'PIN must be at least 4 digits.');
        return;
      }
      const hash = await sha256(newPin);
      await setAdminHash(hash);
      Alert.alert('Success', 'PIN updated.');
      router.dismiss();
    }
  }

  async function handlePickQr(method: QrMethod) {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      base64: true,
    });
    if (result.canceled) return;
    const oldUri = qrUris[method];
    if (oldUri && !oldUri.startsWith('data:') && Platform.OS !== 'web') {
      const FileSystem = await import('expo-file-system/legacy');
      await FileSystem.deleteAsync(oldUri).catch(() => {});
    }
    const asset = result.assets[0];
    const dataUri = `data:image/jpeg;base64,${asset.base64}`;
    await setQrUri(method, dataUri);
    setQrUris((prev) => ({ ...prev, [method]: dataUri }));
  }

  function confirmAction(title: string, message: string, confirmLabel: string): Promise<boolean> {
    if (Platform.OS === 'web') {
      return Promise.resolve(window.confirm(`${title}\n\n${message}`));
    }
    return new Promise((resolve) => {
      Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, onPress: () => resolve(true) },
      ]);
    });
  }

  function formatImportSummary(s: ImportSummary): string {
    const imageLine = s.imagesMissing > 0
      ? `Images:   ${s.imagesRestored} restored, ${s.imagesMissing} missing`
      : `Images:   ${s.imagesRestored} restored`;
    return [
      `Products: +${s.productsInserted} new, ${s.productsUpdated} updated`,
      `Variants: +${s.variantsInserted} new, ${s.variantsUpdated} updated`,
      `Bundles:  +${s.bundlesInserted} new, ${s.bundlesUpdated} updated`,
      imageLine,
    ].join('\n');
  }

  async function handleExportCatalog() {
    try {
      await exportProductsArchive();
      showToast({ variant: 'success', title: 'Catalog exported' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      showToast({ variant: 'error', title: 'Export failed', message });
    }
  }

  async function handleImportCatalog() {
    try {
      const picked = await pickProductsZip();
      if (picked == null) return;
      const parsed = parseCatalog(picked.csvText);
      if (
        parsed.products.length === 0 &&
        parsed.variants.length === 0 &&
        parsed.bundles.length === 0
      ) {
        showToast({
          variant: 'error',
          title: 'Nothing to import',
          message: 'No products found in archive.',
        });
        return;
      }
      const productsWithImages = parsed.products.filter((p) => p.image_filename).length;
      const imageSuffix = productsWithImages > 0 ? ` (${productsWithImages} with images)` : '';
      const ok = await confirmAction(
        'Import Catalog',
        `Import ${parsed.products.length} products${imageSuffix}, ${parsed.variants.length} variants, ${parsed.bundles.length} bundles? Existing items with the same name will be updated.`,
        'Import'
      );
      if (!ok) return;
      const summary = await upsertCatalog(parsed, {
        resolveImage: makeImageResolver(picked.zip),
      });
      showToast({
        variant: 'success',
        title: 'Catalog imported',
        message: formatImportSummary(summary),
      });
    } catch (err) {
      const message =
        err instanceof ParseError
          ? err.message
          : err instanceof Error
          ? err.message
          : 'Unknown error';
      showToast({
        variant: 'error',
        title: 'Import failed',
        message: `${message}\nNo changes were made.`,
      });
    }
  }

  async function handleRemoveQr(method: QrMethod) {
    Alert.alert('Remove QR?', `This will remove your ${qrMethodLabel(method)} QR code.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          const oldUri = qrUris[method];
          if (oldUri && !oldUri.startsWith('data:') && Platform.OS !== 'web') {
            const FileSystem = await import('expo-file-system/legacy');
            await FileSystem.deleteAsync(oldUri).catch(() => {});
          }
          await removeQrUri(method);
          setQrUris((prev) => ({ ...prev, [method]: null }));
        },
      },
    ]);
  }

  if (step === 'settings') {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView style={styles.settingsScrollView} contentContainerStyle={styles.settingsScroll}>
          <Text style={styles.title}><Ionicons name="settings-outline" size={F.xl} color={C.textPrimary} /> Admin Settings</Text>
          <Text style={styles.subtitle}>Manage PIN and payment settings</Text>

          <TouchableOpacity
            style={styles.settingsRow}
            onPress={() => { setStep('new_pin'); }}
          >
            <View>
              <Text style={styles.settingsRowTitle}>Change PIN</Text>
              <Text style={styles.settingsRowSub}>Update admin password</Text>
            </View>
            <Text style={styles.settingsArrow}>→</Text>
          </TouchableOpacity>

          <Text style={styles.sectionLabel}>QR CODES</Text>

          {(['gcash', 'maya', 'bpi'] as QrMethod[]).map((method) => {
            const uri = qrUris[method];
            const label = qrMethodLabel(method);
            return (
              <View key={method} style={[styles.qrRow, !uri && styles.qrRowEmpty]}>
                <View style={styles.qrRowThumb}>
                  {uri
                    ? <Image source={{ uri }} style={styles.qrThumbImage} resizeMode="contain" />
                    : <Ionicons name="add" size={22} color={C.textMuted} />
                  }
                </View>
                <View style={styles.qrRowInfo}>
                  <Text style={[styles.qrRowLabel, !uri && styles.qrRowLabelMuted]}>{label}</Text>
                  <Text style={styles.qrRowStatus}>{uri ? 'QR uploaded ✓' : 'No QR uploaded'}</Text>
                </View>
                {uri ? (
                  <View style={styles.qrRowBtns}>
                    <TouchableOpacity style={styles.qrReplaceBtn} onPress={() => handlePickQr(method)}>
                      <Text style={styles.qrBtnText}>Replace</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.qrRemoveBtn} onPress={() => handleRemoveQr(method)}>
                      <Ionicons name="trash-outline" size={F.sm} color={C.textPrimary} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.qrUploadBtn} onPress={() => handlePickQr(method)}>
                    <Text style={styles.qrBtnText}>Upload</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}

          <Text style={styles.sectionLabel}>CATALOG BACKUP</Text>

          <TouchableOpacity style={styles.settingsRow} onPress={handleExportCatalog}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingsRowTitle}>
                <Ionicons name="download-outline" size={F.md} color={C.textPrimary} /> Export Catalog (ZIP)
              </Text>
              <Text style={styles.settingsRowSub}>Save products, variants, bundles, and images</Text>
            </View>
            <Text style={styles.settingsArrow}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingsRow} onPress={handleImportCatalog}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingsRowTitle}>
                <Ionicons name="cloud-upload-outline" size={F.md} color={C.textPrimary} /> Import Catalog (ZIP)
              </Text>
              <Text style={styles.settingsRowSub}>Restore from a previously exported archive</Text>
            </View>
            <Text style={styles.settingsArrow}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.back()} style={styles.settingsDone}>
            <Text style={styles.settingsDoneText}>Done</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const dots = currentPin.split('').map((_, i) => (
    <View key={i} style={styles.dot} />
  ));
  const empty = Array(Math.max(0, 4 - currentPin.length)).fill(null).map((_, i) => (
    <View key={`e${i}`} style={styles.dotEmpty} />
  ));

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>
        <Ionicons name="lock-closed-outline" size={F.xl} color={C.textPrimary} />{step === 'verify' ? ' Enter Admin PIN' : ' Enter New PIN'}
      </Text>
      <Text style={styles.subtitle}>
        {step === 'verify' && action === 'void_transaction'
          ? 'Required to void this transaction'
          : step === 'verify'
          ? 'Enter current PIN to continue'
          : 'Enter your new PIN (min 4 digits)'}
      </Text>

      <View style={styles.dotsRow}>{dots}{empty}</View>

      <View style={styles.keypad}>
        {PIN_KEYS.map((key) => (
          <TouchableOpacity
            key={key}
            style={[styles.key, key === 'confirm' && styles.keyConfirm]}
            onPress={() => handleKey(key)}
            activeOpacity={0.7}
          >
            {key === 'backspace' ? (
              <Ionicons name="backspace-outline" size={F.xl} color={C.textPrimary} />
            ) : key === 'confirm' ? (
              <Ionicons name="checkmark" size={F.xl} color="#fff" />
            ) : (
              <Text style={styles.keyText}>{key}</Text>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity onPress={() => router.dismiss()} style={styles.cancelBtn}>
        <Text style={styles.cancelText}>Cancel</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: C.bg,
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  title: { color: C.textPrimary, fontSize: F.xl, fontWeight: '800', marginBottom: 8 },
  subtitle: { color: C.textSecondary, fontSize: F.sm, textAlign: 'center', marginBottom: 32 },

  dotsRow: { flexDirection: 'row', gap: 16, marginBottom: 40 },
  dot: { width: 16, height: 16, borderRadius: 8, backgroundColor: C.pink },
  dotEmpty: { width: 16, height: 16, borderRadius: 8, backgroundColor: C.elevated, borderWidth: 1, borderColor: C.border },

  keypad: { width: '80%', flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  key: {
    width: '29%', aspectRatio: 1.4,
    backgroundColor: C.surface, borderRadius: R.sm,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.borderDark,
  },
  keyConfirm: { backgroundColor: C.pink, borderColor: C.pink },
  keyText: { color: C.textPrimary, fontSize: F.xl, fontWeight: '700' },
  keyConfirmText: { color: '#fff' },
  cancelBtn: { marginTop: 32 },
  cancelText: { color: C.textSecondary, fontSize: F.md },

  settingsScrollView: { flex: 1, alignSelf: 'stretch' },
  settingsScroll: { padding: 20, alignItems: 'stretch' },
  settingsRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: C.surface, borderRadius: R.md,
    padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: C.borderDark,
  },
  settingsRowTitle: { color: C.textPrimary, fontSize: F.md, fontWeight: '700' },
  settingsRowSub: { color: C.textSecondary, fontSize: F.sm, marginTop: 2 },
  settingsArrow: { color: C.textSecondary, fontSize: F.xl },
  sectionLabel: { color: C.textMuted, fontSize: F.xs, fontWeight: '700', letterSpacing: 1, marginTop: 20, marginBottom: 10 },

  qrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.borderDark,
    padding: 12,
    marginBottom: 8,
    gap: 12,
  },
  qrRowEmpty: { borderStyle: 'dashed' },
  qrRowThumb: {
    width: 48, height: 48,
    borderRadius: R.sm,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  qrThumbImage: { width: 48, height: 48 },
  qrRowInfo: { flex: 1 },
  qrRowLabel: { color: C.textPrimary, fontSize: F.md, fontWeight: '700' },
  qrRowLabelMuted: { color: C.textMuted },
  qrRowStatus: { color: C.textSecondary, fontSize: F.xs, marginTop: 2 },
  qrRowBtns: { flexDirection: 'row', gap: 6 },
  qrReplaceBtn: {
    backgroundColor: C.elevated,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: C.border,
  },
  qrRemoveBtn: {
    backgroundColor: C.red,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: R.sm,
  },
  qrUploadBtn: {
    backgroundColor: C.elevated,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: C.border,
  },
  qrBtnText: { color: C.textPrimary, fontSize: F.sm, fontWeight: '700' },

  settingsDone: {
    backgroundColor: C.pink, borderRadius: R.sm,
    padding: 15, alignItems: 'center', marginTop: 24,
  },
  settingsDoneText: { color: '#fff', fontWeight: '800', fontSize: F.md },
});
