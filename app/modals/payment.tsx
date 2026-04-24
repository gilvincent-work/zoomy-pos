import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, Image,
  StyleSheet, SafeAreaView, Alert, Modal,
} from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { DenominationButton } from '../../components/DenominationButton';
import { useCart } from '../../context/CartContext';
import { insertTransaction, PaymentMethod } from '../../db/transactions';
import { getGcashQrUri } from '../../db/settings';
import { copyToDocumentDir, saveToGallery } from '../../utils/photos';
import { C, F, R } from '../../constants/theme';

const DENOMINATIONS = [1, 5, 10, 20, 50, 100, 200, 500, 1000];

const PAYMENT_METHODS: { key: PaymentMethod; label: string; icon: string }[] = [
  { key: 'cash', label: 'Cash', icon: '💵' },
  { key: 'gcash', label: 'GCash', icon: '📱' },
  { key: 'bank_transfer', label: 'Bank', icon: '🏦' },
];

type DigitalStep = 'qr' | 'proof';

export default function PaymentModal() {
  const { items, total, clearCart, addItem, decrementItem } = useCart();
  const [tendered, setTendered] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [digitalStep, setDigitalStep] = useState<DigitalStep>('qr');
  const [qrUri, setQrUri] = useState<string | null>(null);
  const [qrFullScreen, setQrFullScreen] = useState(false);
  const [refNumber, setRefNumber] = useState('');
  const [proofPhotoUri, setProofPhotoUri] = useState<string | null>(null);
  const [customerHandle, setCustomerHandle] = useState('');

  const isCash = method === 'cash';
  const isDigital = !isCash;
  const change = tendered - total;
  const canConfirmCash = tendered >= total && items.length > 0;

  useEffect(() => {
    getGcashQrUri().then(setQrUri);
  }, []);

  function handleMethodChange(m: PaymentMethod) {
    setMethod(m);
    setDigitalStep('qr');
    setRefNumber('');
    setProofPhotoUri(null);
    if (m !== 'cash') setTendered(0);
  }

  async function handleTakePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera access is required to take receipt photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (result.canceled) return;
    try {
      const asset = result.assets[0];
      const saved = await copyToDocumentDir(asset.uri, `receipt-${Date.now()}.jpg`);
      await saveToGallery(asset.uri);
      setProofPhotoUri(saved);
    } catch {
      Alert.alert('Error', 'Failed to save photo. Please try again.');
    }
  }

  async function handleConfirm() {
    try {
      await insertTransaction({
        total,
        cashTendered: isCash ? tendered : total,
        change: isCash ? change : 0,
        paymentMethod: method,
        refNumber: refNumber.trim() || undefined,
        proofPhotoUri: proofPhotoUri || undefined,
        customerHandle: customerHandle.trim() || undefined,
        items: items.map((i) => ({
          productId: i.productId,
          productName: i.productName,
          price: i.price,
          quantity: i.quantity,
        })),
      });
      clearCart();
      router.dismiss();
    } catch {
      Alert.alert('Error', 'Failed to save transaction. Please try again.');
    }
  }

  function renderOrderSummary() {
    return (
      <>
        <Text style={styles.sectionLabel}>ORDER SUMMARY</Text>
        {items.map((item) => (
          <View key={item.productId} style={styles.itemRow}>
            <Text style={styles.itemName}>{item.productName}</Text>
            <View style={styles.qtyControls}>
              <TouchableOpacity style={styles.qtyBtn} onPress={() => decrementItem(item.productId)}>
                <Text style={styles.qtyBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.qtyText}>{item.quantity}</Text>
              <TouchableOpacity style={styles.qtyBtn} onPress={() => addItem({ id: item.productId, name: item.productName, price: item.price })}>
                <Text style={styles.qtyBtnText}>+</Text>
              </TouchableOpacity>
              <Text style={styles.itemTotal}>₱{(item.price * item.quantity).toFixed(2)}</Text>
            </View>
          </View>
        ))}
        <View style={styles.divider} />
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>TOTAL</Text>
          <Text style={styles.totalAmount}>₱{total.toFixed(2)}</Text>
        </View>
      </>
    );
  }

  function renderMethodSelector() {
    return (
      <>
        <Text style={styles.sectionLabel}>PAYMENT METHOD</Text>
        <View style={styles.methodRow}>
          {PAYMENT_METHODS.map((m) => (
            <TouchableOpacity
              key={m.key}
              style={[styles.methodBtn, method === m.key && styles.methodBtnActive]}
              onPress={() => handleMethodChange(m.key)}
            >
              <Text style={styles.methodIcon}>{m.icon}</Text>
              <Text style={[styles.methodLabel, method === m.key && styles.methodLabelActive]}>
                {m.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </>
    );
  }

  // Digital Step 1: QR display
  if (isDigital && digitalStep === 'qr') {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scroll}>
          {renderOrderSummary()}
          {renderMethodSelector()}

          {method === 'gcash' && qrUri ? (
            <View style={styles.qrSection}>
              <Text style={styles.sectionLabel}>SCAN TO PAY</Text>
              <View style={styles.qrBox}>
                <Image source={{ uri: qrUri }} style={styles.qrPreview} resizeMode="contain" />
                <Text style={styles.qrAmount}>₱{total.toFixed(2)}</Text>
                <Text style={styles.qrHint}>Show this to customer</Text>
                <TouchableOpacity style={styles.fullScreenBtn} onPress={() => setQrFullScreen(true)}>
                  <Text style={styles.fullScreenBtnText}>Full Screen</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : method === 'gcash' && !qrUri ? (
            <View style={styles.digitalBox}>
              <Text style={styles.digitalIcon}>📱</Text>
              <Text style={styles.digitalAmount}>₱{total.toFixed(2)}</Text>
              <Text style={styles.digitalHint}>No GCash QR uploaded. Go to ⚙️ Settings to add one.</Text>
            </View>
          ) : (
            <View style={styles.digitalBox}>
              <Text style={styles.digitalIcon}>🏦</Text>
              <Text style={styles.digitalAmount}>₱{total.toFixed(2)}</Text>
              <Text style={styles.digitalHint}>Collect via Bank Transfer</Text>
            </View>
          )}

          <Text style={[styles.sectionLabel, styles.sectionLabelHandle]}>
            FURBABY / IG HANDLE <Text style={styles.optionalTag}>optional</Text>
          </Text>
          <TextInput
            style={styles.handleInput}
            placeholder="@username or furbaby name"
            placeholderTextColor={C.textMuted}
            value={customerHandle}
            onChangeText={setCustomerHandle}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => router.dismiss()}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.confirmBtn, items.length === 0 && styles.confirmBtnDisabled]}
            disabled={items.length === 0}
            onPress={() => setDigitalStep('proof')}
          >
            <Text style={styles.confirmBtnText}>Customer Paid ✓</Text>
          </TouchableOpacity>
        </View>

        <Modal visible={qrFullScreen} animationType="fade" onRequestClose={() => setQrFullScreen(false)}>
          <TouchableOpacity style={styles.qrFullOverlay} onPress={() => setQrFullScreen(false)} activeOpacity={1}>
            {qrUri && <Image source={{ uri: qrUri }} style={styles.qrFull} resizeMode="contain" />}
            <Text style={styles.qrFullAmount}>₱{total.toFixed(2)}</Text>
            <Text style={styles.qrFullHint}>Tap anywhere to close</Text>
          </TouchableOpacity>
        </Modal>
      </SafeAreaView>
    );
  }

  // Digital Step 2: Proof capture
  if (isDigital && digitalStep === 'proof') {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.title}>Payment Proof</Text>
          <Text style={styles.proofSubtitle}>Add reference number, receipt photo, or both</Text>

          <Text style={styles.sectionLabel}>REFERENCE NUMBER</Text>
          <TextInput
            style={styles.refInput}
            placeholder="e.g. 1234 5678 9012"
            placeholderTextColor={C.textMuted}
            value={refNumber}
            onChangeText={setRefNumber}
            keyboardType="default"
          />

          <Text style={styles.sectionLabel}>RECEIPT PHOTO</Text>
          {proofPhotoUri ? (
            <View style={styles.proofPhotoBox}>
              <Image source={{ uri: proofPhotoUri }} style={styles.proofPhotoPreview} resizeMode="cover" />
              <TouchableOpacity style={styles.proofRetake} onPress={handleTakePhoto}>
                <Text style={styles.proofRetakeText}>📷 Retake</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.cameraBox} onPress={handleTakePhoto}>
              <Text style={styles.cameraIcon}>📷</Text>
              <Text style={styles.cameraText}>Tap to take photo</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.sectionLabel}>FURBABY / IG HANDLE <Text style={styles.optionalTag}>optional</Text></Text>
          <TextInput
            style={styles.handleInput}
            placeholder="@username or furbaby name"
            placeholderTextColor={C.textMuted}
            value={customerHandle}
            onChangeText={setCustomerHandle}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.backBtn} onPress={() => setDigitalStep('qr')}>
            <Text style={styles.cancelBtnText}>← Back</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={handleConfirm}>
            <Text style={styles.cancelBtnText}>Skip</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm}>
            <Text style={styles.confirmBtnText}>Confirm Sale</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Cash flow
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} scrollEnabled={false}>
        {renderOrderSummary()}
        {renderMethodSelector()}

        <Text style={styles.sectionLabel}>CASH TENDERED</Text>
        <View style={styles.tenderedBox}>
          <Text style={styles.tenderedLabel}>₱</Text>
          <Text style={styles.tenderedAmount}>{tendered.toFixed(2)}</Text>
        </View>

        <View style={styles.denomGrid}>
          {DENOMINATIONS.map((d) => (
            <View key={d} style={styles.denomCell}>
              <DenominationButton amount={d} onPress={(v) => setTendered((t) => t + v)} />
            </View>
          ))}
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.clearBtn} onPress={() => setTendered(0)}>
            <Text style={styles.clearBtnText}>Clear</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.exactBtn} onPress={() => setTendered(total)}>
            <Text style={styles.exactBtnText}>Exact  ₱{total.toFixed(2)}</Text>
          </TouchableOpacity>
        </View>

        {tendered > 0 && (
          <View style={[styles.changeBox, change < 0 && styles.changeBoxShort]}>
            <Text style={styles.changeLabel}>{change >= 0 ? 'CHANGE' : 'SHORT BY'}</Text>
            <Text style={styles.changeAmount}>₱{Math.abs(change).toFixed(2)}</Text>
          </View>
        )}

        <Text style={[styles.sectionLabel, styles.sectionLabelHandle]}>
          FURBABY / IG HANDLE <Text style={styles.optionalTag}>optional</Text>
        </Text>
        <TextInput
          style={styles.handleInput}
          placeholder="@username or furbaby name"
          placeholderTextColor={C.textMuted}
          value={customerHandle}
          onChangeText={setCustomerHandle}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.cancelBtn} onPress={() => router.dismiss()}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.confirmBtn, !canConfirmCash && styles.confirmBtnDisabled]}
          disabled={!canConfirmCash}
          onPress={handleConfirm}
        >
          <Text style={styles.confirmBtnText}>Confirm Sale</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scroll: { padding: 14, paddingBottom: 8 },

  title: { color: C.textPrimary, fontSize: F.xl, fontWeight: '800', marginBottom: 4 },
  proofSubtitle: { color: C.textSecondary, fontSize: F.md, marginBottom: 12 },

  sectionLabel: {
    color: C.textMuted,
    fontSize: F.xs,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 6,
  },
  sectionLabelHandle: { marginTop: 8 },
  optionalTag: { color: C.textMuted, fontSize: F.xs, fontWeight: '400', letterSpacing: 0, textTransform: 'none' },

  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: C.borderDark,
  },
  itemName: { color: C.textPrimary, fontSize: F.md, flex: 1, fontWeight: '500' },
  qtyControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn: {
    backgroundColor: C.elevated,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.border,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnText: { color: C.textPrimary, fontSize: F.md, fontWeight: '700' },
  qtyText: { color: C.textPrimary, fontSize: F.sm, fontWeight: '700', minWidth: 20, textAlign: 'center' },
  itemTotal: { color: C.textPrimary, fontSize: F.sm, minWidth: 72, textAlign: 'right', fontWeight: '600' },

  divider: { height: 1, backgroundColor: C.border, marginVertical: 8 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { color: C.textSecondary, fontSize: F.md, fontWeight: '700', letterSpacing: 0.5 },
  totalAmount: { color: C.pink, fontSize: F.xxl, fontWeight: '800' },

  methodRow: { flexDirection: 'row', gap: 8, marginBottom: 2 },
  methodBtn: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: R.sm,
    paddingVertical: 9,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: C.borderDark,
    gap: 2,
  },
  methodBtnActive: { borderColor: C.pink, backgroundColor: C.pinkSubtle },
  methodIcon: { fontSize: 20 },
  methodLabel: { color: C.textSecondary, fontSize: F.xs, fontWeight: '700' },
  methodLabelActive: { color: C.pink },

  tenderedBox: {
    backgroundColor: C.surface,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
    gap: 4,
  },
  tenderedLabel: { color: C.textSecondary, fontSize: F.lg, fontWeight: '700' },
  tenderedAmount: { color: C.textPrimary, fontSize: F.xxl, fontWeight: '800', flex: 1 },

  denomGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  denomCell: { width: '30%' },

  actionRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  clearBtn: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: C.border,
    padding: 11,
    alignItems: 'center',
  },
  clearBtnText: { color: C.textSecondary, fontWeight: '700', fontSize: F.sm },
  exactBtn: {
    flex: 2,
    backgroundColor: C.elevated,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: C.border,
    padding: 11,
    alignItems: 'center',
  },
  exactBtnText: { color: C.textPrimary, fontWeight: '700', fontSize: F.sm },

  changeBox: {
    backgroundColor: C.greenSubtle,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: C.green,
    padding: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  changeBoxShort: { backgroundColor: C.redSubtle, borderColor: C.red },
  changeLabel: { color: C.textPrimary, fontWeight: '700', fontSize: F.sm },
  changeAmount: { color: C.textPrimary, fontSize: F.xl, fontWeight: '800' },

  handleInput: {
    backgroundColor: C.surface,
    color: C.textPrimary,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: F.md,
  },

  digitalBox: {
    backgroundColor: C.surface,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border,
    padding: 28,
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  digitalIcon: { fontSize: 40 },
  digitalAmount: { color: C.textPrimary, fontSize: F.xxl, fontWeight: '800' },
  digitalHint: { color: C.textSecondary, fontSize: F.md, textAlign: 'center' },

  qrSection: { marginTop: 8 },
  qrBox: {
    backgroundColor: C.surface,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border,
    padding: 24,
    alignItems: 'center',
    gap: 10,
  },
  qrPreview: { width: 180, height: 180, borderRadius: R.sm, marginBottom: 4 },
  qrAmount: { color: C.pink, fontSize: F.xxl, fontWeight: '800' },
  qrHint: { color: C.textSecondary, fontSize: F.sm },
  fullScreenBtn: {
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: R.sm,
    marginTop: 4,
  },
  fullScreenBtnText: { color: C.textPrimary, fontWeight: '700', fontSize: F.md },

  qrFullOverlay: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  qrFull: { width: '80%', height: '60%' },
  qrFullAmount: { color: '#111', fontSize: F.xxl, fontWeight: '800', marginTop: 16 },
  qrFullHint: { color: '#888', fontSize: F.sm, marginTop: 8 },

  refInput: {
    backgroundColor: C.surface,
    color: C.textPrimary,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    fontSize: F.lg,
    fontWeight: '500',
  },
  cameraBox: {
    backgroundColor: C.surface,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: C.border,
    borderRadius: R.md,
    padding: 28,
    alignItems: 'center',
    gap: 8,
  },
  cameraIcon: { fontSize: 32 },
  cameraText: { color: C.textSecondary, fontSize: F.md },
  proofPhotoBox: { backgroundColor: C.surface, borderRadius: R.md, padding: 12, alignItems: 'center', gap: 10 },
  proofPhotoPreview: { width: '100%', height: 220, borderRadius: R.sm },
  proofRetake: {
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: R.sm,
  },
  proofRetakeText: { color: C.textPrimary, fontSize: F.md, fontWeight: '700' },

  footer: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: C.borderDark,
    backgroundColor: C.surface,
  },
  backBtn: {
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.sm,
    padding: 16,
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.sm,
    padding: 16,
    alignItems: 'center',
  },
  cancelBtnText: { color: C.textSecondary, fontWeight: '700', fontSize: F.md },
  confirmBtn: {
    flex: 2,
    backgroundColor: C.pink,
    borderRadius: R.sm,
    padding: 16,
    alignItems: 'center',
  },
  confirmBtnDisabled: { backgroundColor: C.elevated, borderWidth: 1, borderColor: C.border },
  confirmBtnText: { color: '#fff', fontWeight: '800', fontSize: F.lg },
});
