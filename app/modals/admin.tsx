import React, { useState, useEffect , useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Alert,
  Image, ScrollView, useWindowDimensions,
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
import { F, R, type Palette } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';
import { exportProductsArchive } from '../../utils/export-products-csv';
import { pickProductsZip } from '../../utils/import-products-csv';
import { parseCatalog, ParseError } from '../../utils/products-csv-format';
import { makeImageResolver } from '../../utils/import-images';
import { upsertCatalog, type ImportSummary } from '../../db/catalog-import';
import { useToast } from '../../components/Toast';

type Step = 'verify' | 'new_pin' | 'settings';

const PIN_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'backspace', '0', 'confirm'];

export default function AdminModal() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const { action, transactionId, clientUuid } = useLocalSearchParams<{
    action: 'void_transaction' | 'change_pin' | 'settings';
    transactionId?: string;
    clientUuid?: string;
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
      // Void locally if the sale lives on this device (positive id), and on Coop
      // (by client_uuid) so every device sees the void. voidTransaction nulls
      // void_synced_at; if the inline Coop void fails (offline, or the sale
      // hasn't reached Coop yet), the outbox drain retries it later.
      const localId = Number(transactionId);
      if (Number.isFinite(localId) && localId > 0) {
        const { voidTransaction } = await import('../../db/transactions');
        await voidTransaction(localId);
      }
      if (clientUuid) {
        const { voidRemoteOrder } = await import('../../utils/orders-remote');
        const { markVoidSynced } = await import('../../db/transactions');
        if (await voidRemoteOrder(clientUuid)) await markVoidSynced(clientUuid);
      }
      const { refreshPendingCount } = await import('../../utils/outbox');
      await refreshPendingCount();
      // Dismiss only the admin PIN modal, returning to the Transactions screen
      // (which reloads on focus and shows the sale now voided).
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
          <Text style={styles.title}><Ionicons name="settings-outline" size={F.xl} color={colors.textPrimary} /> Admin Settings</Text>
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

          <TouchableOpacity
            style={styles.settingsRow}
            onPress={() => router.push('/modals/payment-settings')}
          >
            <View>
              <Text style={styles.settingsRowTitle}>Payment Options</Text>
              <Text style={styles.settingsRowSub}>Choose accepted methods and the Pay confirm step</Text>
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
                    : <Ionicons name="add" size={22} color={colors.textMuted} />
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
                      <Ionicons name="trash-outline" size={F.sm} color={colors.textPrimary} />
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
                <Ionicons name="download-outline" size={F.md} color={colors.textPrimary} /> Export Catalog (ZIP)
              </Text>
              <Text style={styles.settingsRowSub}>Save products, variants, bundles, and images</Text>
            </View>
            <Text style={styles.settingsArrow}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingsRow} onPress={handleImportCatalog}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingsRowTitle}>
                <Ionicons name="cloud-upload-outline" size={F.md} color={colors.textPrimary} /> Import Catalog (ZIP)
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

  const prompt = (
    <View style={styles.promptBlock}>
      <Text style={styles.title}>
        <Ionicons name="lock-closed-outline" size={F.xl} color={colors.textPrimary} />{step === 'verify' ? ' Enter Admin PIN' : ' Enter New PIN'}
      </Text>
      <Text style={styles.subtitle}>
        {step === 'verify' && action === 'void_transaction'
          ? 'Required to void this transaction'
          : step === 'verify'
          ? 'Enter current PIN to continue'
          : 'Enter your new PIN (min 4 digits)'}
      </Text>
      <View style={styles.dotsRow}>{dots}{empty}</View>
    </View>
  );

  const keypad = (
    <View style={[styles.keypad, isLandscape && styles.keypadLandscape]}>
      {PIN_KEYS.map((key) => (
        <TouchableOpacity
          key={key}
          style={[styles.key, key === 'confirm' && styles.keyConfirm]}
          onPress={() => handleKey(key)}
          activeOpacity={0.7}
        >
          {key === 'backspace' ? (
            <Ionicons name="backspace-outline" size={F.xl} color={colors.textPrimary} />
          ) : key === 'confirm' ? (
            <Ionicons name="checkmark" size={F.xl} color="#fff" />
          ) : (
            <Text style={styles.keyText}>{key}</Text>
          )}
        </TouchableOpacity>
      ))}
    </View>
  );

  const cancel = (
    <TouchableOpacity onPress={() => router.dismiss()} style={styles.cancelBtn}>
      <Text style={styles.cancelText}>Cancel</Text>
    </TouchableOpacity>
  );

  // Portrait stacks prompt over keypad. Landscape is short, so the vertical
  // stack overflows and the header scrolls off — split into two columns
  // (prompt left, keypad right) so everything fits without scrolling.
  return (
    <SafeAreaView style={styles.container}>
      {isLandscape ? (
        <View style={styles.landscapeBody}>
          <View style={styles.landscapeLeft}>
            {prompt}
            {cancel}
          </View>
          {keypad}
        </View>
      ) : (
        <>
          {prompt}
          {keypad}
          {cancel}
        </>
      )}
    </SafeAreaView>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  container: {
    flex: 1, backgroundColor: c.bg,
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  title: { color: c.textPrimary, fontSize: F.xl, fontWeight: '800', marginBottom: 8 },
  subtitle: { color: c.textSecondary, fontSize: F.sm, textAlign: 'center', marginBottom: 32 },

  // Landscape is short: lay the prompt and keypad side by side so the header
  // stays on screen and the keys don't balloon to fill the vertical space.
  landscapeBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 48,
  },
  landscapeLeft: { alignItems: 'center', justifyContent: 'center' },
  promptBlock: { alignItems: 'center' },

  dotsRow: { flexDirection: 'row', gap: 16, marginBottom: 40 },
  dot: { width: 16, height: 16, borderRadius: 8, backgroundColor: c.pink },
  dotEmpty: { width: 16, height: 16, borderRadius: 8, backgroundColor: c.elevated, borderWidth: 1, borderColor: c.border },

  keypad: { width: '80%', maxWidth: 360, flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  keypadLandscape: { width: 300, maxWidth: 300 },
  key: {
    width: '29%', aspectRatio: 1.4,
    backgroundColor: c.surface, borderRadius: R.sm,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: c.borderDark,
  },
  keyConfirm: { backgroundColor: c.pink, borderColor: c.pink },
  keyText: { color: c.textPrimary, fontSize: F.xl, fontWeight: '700' },
  keyConfirmText: { color: '#fff' },
  cancelBtn: { marginTop: 32 },
  cancelText: { color: c.textSecondary, fontSize: F.md },

  settingsScrollView: { flex: 1, alignSelf: 'stretch' },
  settingsScroll: { padding: 20, alignItems: 'stretch' },
  settingsRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: c.surface, borderRadius: R.md,
    padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: c.borderDark,
  },
  settingsRowTitle: { color: c.textPrimary, fontSize: F.md, fontWeight: '700' },
  settingsRowSub: { color: c.textSecondary, fontSize: F.sm, marginTop: 2 },
  settingsArrow: { color: c.textSecondary, fontSize: F.xl },
  sectionLabel: { color: c.textMuted, fontSize: F.xs, fontWeight: '700', letterSpacing: 1, marginTop: 20, marginBottom: 10 },

  qrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.surface,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: c.borderDark,
    padding: 12,
    marginBottom: 8,
    gap: 12,
  },
  qrRowEmpty: { borderStyle: 'dashed' },
  qrRowThumb: {
    width: 48, height: 48,
    borderRadius: R.sm,
    backgroundColor: c.elevated,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  qrThumbImage: { width: 48, height: 48 },
  qrRowInfo: { flex: 1 },
  qrRowLabel: { color: c.textPrimary, fontSize: F.md, fontWeight: '700' },
  qrRowLabelMuted: { color: c.textMuted },
  qrRowStatus: { color: c.textSecondary, fontSize: F.xs, marginTop: 2 },
  qrRowBtns: { flexDirection: 'row', gap: 6 },
  qrReplaceBtn: {
    backgroundColor: c.elevated,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: c.border,
  },
  qrRemoveBtn: {
    backgroundColor: c.red,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: R.sm,
  },
  qrUploadBtn: {
    backgroundColor: c.elevated,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: c.border,
  },
  qrBtnText: { color: c.textPrimary, fontSize: F.sm, fontWeight: '700' },

  settingsDone: {
    backgroundColor: c.pink, borderRadius: R.sm,
    padding: 15, alignItems: 'center', marginTop: 24,
  },
  settingsDoneText: { color: '#fff', fontWeight: '800', fontSize: F.md },
});
