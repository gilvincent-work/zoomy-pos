import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Alert,
  Image, ScrollView,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { sha256 } from '../../utils/hash';
import { getAdminHash, setAdminHash, getGcashQrUri, setGcashQrUri, removeGcashQrUri } from '../../db/settings';
import { copyToDocumentDir } from '../../utils/photos';

type Step = 'verify' | 'new_pin' | 'settings';

const PIN_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓'];

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
    if (key === '⌫') {
      setCurrentPin((p) => p.slice(0, -1));
      return;
    }
    if (key === '✓') {
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
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    const saved = await copyToDocumentDir(asset.uri, `gcash-qr-${Date.now()}.jpg`);
    await setGcashQrUri(saved);
    setQrUri(saved);
  }

  async function handleRemoveQr() {
    await removeGcashQrUri();
    setQrUri(null);
  }

  if (step === 'settings') {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.settingsScroll}>
          <Text style={styles.title}>⚙️ Admin Settings</Text>
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
                    <Text style={styles.qrBtnText}>📷 Replace</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.qrRemoveBtn} onPress={handleRemoveQr}>
                    <Text style={styles.qrBtnText}>🗑 Remove</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <TouchableOpacity style={styles.qrUploadArea} onPress={handlePickQr}>
                <Text style={styles.qrUploadIcon}>📱</Text>
                <Text style={styles.qrUploadText}>Tap to upload GCash QR</Text>
                <Text style={styles.qrUploadHint}>Pick from photo library</Text>
              </TouchableOpacity>
            )}
          </View>

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
        {step === 'verify' ? '🔐 Enter Admin PIN' : '🔐 Enter New PIN'}
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
            style={[styles.key, key === '✓' && styles.keyConfirm]}
            onPress={() => handleKey(key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.keyText, key === '✓' && styles.keyConfirmText]}>{key}</Text>
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
    flex: 1, backgroundColor: '#1a1a2e',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  title: { color: '#eee', fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { color: '#aaa', fontSize: 13, textAlign: 'center', marginBottom: 32 },
  dotsRow: { flexDirection: 'row', gap: 16, marginBottom: 40 },
  dot: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#e94560' },
  dotEmpty: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#0f3460' },
  keypad: { width: '80%', flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  key: {
    width: '29%', aspectRatio: 1.4,
    backgroundColor: '#16213e', borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  keyConfirm: { backgroundColor: '#e94560' },
  keyText: { color: '#eee', fontSize: 20, fontWeight: 'bold' },
  keyConfirmText: { color: '#fff' },
  cancelBtn: { marginTop: 32 },
  cancelText: { color: '#888', fontSize: 14 },
  settingsScroll: { padding: 20, alignItems: 'stretch' },
  settingsRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#16213e', borderRadius: 8, padding: 14, marginBottom: 10,
  },
  settingsRowTitle: { color: '#eee', fontSize: 14, fontWeight: 'bold' },
  settingsRowSub: { color: '#888', fontSize: 11, marginTop: 2 },
  settingsArrow: { color: '#888', fontSize: 18 },
  sectionLabel: { color: '#aaa', fontSize: 10, fontWeight: 'bold', marginTop: 20, marginBottom: 8 },
  qrBox: { backgroundColor: '#16213e', borderRadius: 8, padding: 20, alignItems: 'center' },
  qrImage: { width: 180, height: 180, borderRadius: 8, marginBottom: 12 },
  qrBtns: { flexDirection: 'row', gap: 8 },
  qrReplaceBtn: { backgroundColor: '#0f3460', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 6 },
  qrRemoveBtn: { backgroundColor: '#c0392b', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 6 },
  qrBtnText: { color: '#eee', fontSize: 12, fontWeight: 'bold' },
  qrUploadArea: { alignItems: 'center', padding: 20 },
  qrUploadIcon: { fontSize: 36, marginBottom: 8 },
  qrUploadText: { color: '#eee', fontSize: 14, fontWeight: 'bold' },
  qrUploadHint: { color: '#888', fontSize: 11, marginTop: 4 },
  settingsDone: {
    backgroundColor: '#e94560', borderRadius: 8, padding: 14,
    alignItems: 'center', marginTop: 24,
  },
  settingsDoneText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});
