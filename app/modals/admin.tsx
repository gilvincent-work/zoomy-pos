import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Alert,
  Image, ScrollView,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import { sha256 } from '../../utils/hash';
import { getAdminHash, setAdminHash, getGcashQrUri, setGcashQrUri, removeGcashQrUri } from '../../db/settings';
import { Ionicons } from '@expo/vector-icons';
import { C, F, R } from '../../constants/theme';
import { exportProductsCsv } from '../../utils/export-products-csv';
import { pickProductsCsv } from '../../utils/import-products-csv';
import { parseCatalog, ParseError } from '../../utils/products-csv-format';
import { upsertCatalog, type ImportSummary } from '../../db/catalog-import';

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
  const [qrUri, setQrUri] = useState<string | null>(null);

  const currentPin = step === 'verify' ? pin : newPin;
  const setCurrentPin = step === 'verify' ? setPin : setNewPin;

  useEffect(() => {
    getGcashQrUri().then(setQrUri);
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

  async function handlePickQr() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      base64: true,
    });
    if (result.canceled) return;
    if (qrUri && !qrUri.startsWith('data:') && Platform.OS !== 'web') {
      const FileSystem = await import('expo-file-system/legacy');
      await FileSystem.deleteAsync(qrUri).catch(() => {});
    }
    const asset = result.assets[0];
    const dataUri = `data:image/jpeg;base64,${asset.base64}`;
    await setGcashQrUri(dataUri);
    setQrUri(dataUri);
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
    return [
      `Products: +${s.productsInserted} new, ${s.productsUpdated} updated`,
      `Variants: +${s.variantsInserted} new, ${s.variantsUpdated} updated`,
      `Bundles:  +${s.bundlesInserted} new, ${s.bundlesUpdated} updated`,
    ].join('\n');
  }

  async function handleExportCatalog() {
    try {
      await exportProductsCsv();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert('Export failed', message);
    }
  }

  async function handleImportCatalog() {
    try {
      const text = await pickProductsCsv();
      if (text == null) return;
      const parsed = parseCatalog(text);
      if (
        parsed.products.length === 0 &&
        parsed.variants.length === 0 &&
        parsed.bundles.length === 0
      ) {
        Alert.alert('Nothing to import', 'No products found in file.');
        return;
      }
      const ok = await confirmAction(
        'Import Catalog',
        `Import ${parsed.products.length} products, ${parsed.variants.length} variants, ${parsed.bundles.length} bundles? Existing items with the same name will be updated.`,
        'Import'
      );
      if (!ok) return;
      const summary = await upsertCatalog(parsed);
      Alert.alert('Import complete', formatImportSummary(summary));
    } catch (err) {
      const message =
        err instanceof ParseError
          ? err.message
          : err instanceof Error
          ? err.message
          : 'Unknown error';
      Alert.alert('Import failed', `${message}\n\nNo changes were made.`);
    }
  }

  async function handleRemoveQr() {
    Alert.alert('Remove QR?', 'This will remove your GCash QR code.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          if (qrUri && !qrUri.startsWith('data:') && Platform.OS !== 'web') {
            const FileSystem = await import('expo-file-system/legacy');
            await FileSystem.deleteAsync(qrUri).catch(() => {});
          }
          await removeGcashQrUri();
          setQrUri(null);
        },
      },
    ]);
  }

  if (step === 'settings') {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.settingsScroll}>
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

          <Text style={styles.sectionLabel}>GCASH QR CODE</Text>

          <View style={styles.qrBox}>
            {qrUri ? (
              <>
                <Image source={{ uri: qrUri }} style={styles.qrImage} resizeMode="contain" />
                <View style={styles.qrBtns}>
                  <TouchableOpacity style={styles.qrReplaceBtn} onPress={handlePickQr}>
                    <Text style={styles.qrBtnText}><Ionicons name="camera-outline" size={F.sm} color={C.textPrimary} /> Replace</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.qrRemoveBtn} onPress={handleRemoveQr}>
                    <Text style={styles.qrBtnText}><Ionicons name="trash-outline" size={F.sm} color={C.textPrimary} /> Remove</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <TouchableOpacity style={styles.qrUploadArea} onPress={handlePickQr}>
                <Ionicons name="phone-portrait-outline" size={40} color={C.textSecondary} style={{ marginBottom: 10 }} />
                <Text style={styles.qrUploadText}>Tap to upload GCash QR</Text>
                <Text style={styles.qrUploadHint}>Pick from photo library</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.sectionLabel}>CATALOG BACKUP</Text>

          <TouchableOpacity style={styles.settingsRow} onPress={handleExportCatalog}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingsRowTitle}>
                <Ionicons name="download-outline" size={F.md} color={C.textPrimary} /> Export Catalog to CSV
              </Text>
              <Text style={styles.settingsRowSub}>Save products, variants, and bundles to a file</Text>
            </View>
            <Text style={styles.settingsArrow}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingsRow} onPress={handleImportCatalog}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingsRowTitle}>
                <Ionicons name="cloud-upload-outline" size={F.md} color={C.textPrimary} /> Import Catalog from CSV
              </Text>
              <Text style={styles.settingsRowSub}>Restore from a previously exported file</Text>
            </View>
            <Text style={styles.settingsArrow}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.dismiss()} style={styles.settingsDone}>
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

  qrBox: {
    backgroundColor: C.surface, borderRadius: R.md,
    padding: 20, alignItems: 'center',
    borderWidth: 1, borderColor: C.borderDark,
  },
  qrImage: { width: 180, height: 180, borderRadius: R.sm, marginBottom: 12 },
  qrBtns: { flexDirection: 'row', gap: 8 },
  qrReplaceBtn: {
    backgroundColor: C.elevated, paddingVertical: 10, paddingHorizontal: 16, borderRadius: R.sm,
    borderWidth: 1, borderColor: C.border,
  },
  qrRemoveBtn: { backgroundColor: C.red, paddingVertical: 10, paddingHorizontal: 16, borderRadius: R.sm },
  qrBtnText: { color: C.textPrimary, fontSize: F.sm, fontWeight: '700' },
  qrUploadArea: { alignItems: 'center', padding: 20 },
  qrUploadIcon: {},
  qrUploadText: { color: C.textPrimary, fontSize: F.md, fontWeight: '700' },
  qrUploadHint: { color: C.textSecondary, fontSize: F.sm, marginTop: 4 },

  settingsDone: {
    backgroundColor: C.pink, borderRadius: R.sm,
    padding: 15, alignItems: 'center', marginTop: 24,
  },
  settingsDoneText: { color: '#fff', fontWeight: '800', fontSize: F.md },
});
