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
    const asset = result.assets[0];
    const saved = await copyToDocumentDir(asset.uri, `receipt-${Date.now()}.jpg`);
    await saveToGallery(asset.uri);
    setProofPhotoUri(saved);
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
              <Text style={[styles.methodLabel, method === m.key && styles.methodLabelActive]}>{m.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </>
    );
  }

  // Digital Step 1: QR display / collect prompt
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
            placeholderTextColor="#666"
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

  // Cash flow (unchanged)
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {renderOrderSummary()}
        {renderMethodSelector()}

        <Text style={styles.sectionLabel}>CASH TENDERED</Text>
        <View style={styles.tenderedBox}>
          <Text style={styles.tenderedAmount}>₱{tendered.toFixed(2)}</Text>
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
            <Text style={styles.exactBtnText}>Exact</Text>
          </TouchableOpacity>
        </View>

        {tendered > 0 && (
          <View style={styles.changeBox}>
            <Text style={styles.changeLabel}>CHANGE</Text>
            <Text style={[styles.changeAmount, change < 0 && styles.changeNegative]}>
              ₱{Math.abs(change).toFixed(2)}
            </Text>
          </View>
        )}
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
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  scroll: { padding: 16 },
  title: { color: '#eee', fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
  sectionLabel: { color: '#aaa', fontSize: 11, fontWeight: 'bold', marginTop: 16, marginBottom: 8 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  itemName: { color: '#eee', fontSize: 14, flex: 1 },
  qtyControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn: { backgroundColor: '#0f3460', borderRadius: 6, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  qtyBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  qtyText: { color: '#eee', fontSize: 14, fontWeight: 'bold', minWidth: 20, textAlign: 'center' },
  itemTotal: { color: '#eee', fontSize: 14, minWidth: 70, textAlign: 'right' },
  divider: { height: 1, backgroundColor: '#0f3460', marginVertical: 10 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { color: '#aaa', fontSize: 14, fontWeight: 'bold' },
  totalAmount: { color: '#e94560', fontSize: 24, fontWeight: 'bold' },
  methodRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  methodBtn: { flex: 1, backgroundColor: '#16213e', borderRadius: 8, paddingVertical: 12, alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  methodBtnActive: { borderColor: '#e94560', backgroundColor: '#1a1a2e' },
  methodIcon: { fontSize: 24, marginBottom: 4 },
  methodLabel: { color: '#888', fontSize: 12, fontWeight: 'bold' },
  methodLabelActive: { color: '#e94560' },
  tenderedBox: { backgroundColor: '#16213e', borderRadius: 8, padding: 16, alignItems: 'center', marginBottom: 12 },
  tenderedAmount: { color: '#fff', fontSize: 28, fontWeight: 'bold' },
  denomGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  denomCell: { width: '30%' },
  actionRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  clearBtn: { flex: 1, backgroundColor: '#16213e', borderRadius: 6, padding: 12, alignItems: 'center' },
  clearBtnText: { color: '#aaa', fontWeight: 'bold' },
  exactBtn: { flex: 1, backgroundColor: '#0f3460', borderRadius: 6, padding: 12, alignItems: 'center' },
  exactBtnText: { color: '#eee', fontWeight: 'bold' },
  changeBox: { backgroundColor: '#0d7a3e', borderRadius: 8, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  changeLabel: { color: '#fff', fontWeight: 'bold' },
  changeAmount: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  changeNegative: { color: '#ffaaaa' },
  digitalBox: { backgroundColor: '#16213e', borderRadius: 8, padding: 24, alignItems: 'center', marginTop: 8 },
  digitalIcon: { fontSize: 36, marginBottom: 8 },
  digitalAmount: { color: '#fff', fontSize: 28, fontWeight: 'bold', marginBottom: 4 },
  digitalHint: { color: '#aaa', fontSize: 12, textAlign: 'center' },
  qrSection: { marginTop: 8 },
  qrBox: { backgroundColor: '#16213e', borderRadius: 8, padding: 20, alignItems: 'center' },
  qrPreview: { width: 160, height: 160, borderRadius: 8, marginBottom: 12 },
  qrAmount: { color: '#e94560', fontSize: 22, fontWeight: 'bold' },
  qrHint: { color: '#aaa', fontSize: 11, marginTop: 4 },
  fullScreenBtn: { backgroundColor: '#0f3460', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 6, marginTop: 12 },
  fullScreenBtnText: { color: '#eee', fontWeight: 'bold', fontSize: 13 },
  qrFullOverlay: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  qrFull: { width: '80%', height: '60%' },
  qrFullAmount: { color: '#1a1a2e', fontSize: 28, fontWeight: 'bold', marginTop: 16 },
  qrFullHint: { color: '#888', fontSize: 12, marginTop: 8 },
  proofSubtitle: { color: '#888', fontSize: 12, marginBottom: 8 },
  refInput: { backgroundColor: '#16213e', color: '#eee', borderRadius: 8, padding: 14, fontSize: 15, borderWidth: 1, borderColor: '#0f3460' },
  cameraBox: { backgroundColor: '#16213e', borderWidth: 2, borderStyle: 'dashed', borderColor: '#0f3460', borderRadius: 8, padding: 24, alignItems: 'center' },
  cameraIcon: { fontSize: 28, marginBottom: 4 },
  cameraText: { color: '#888', fontSize: 12 },
  proofPhotoBox: { backgroundColor: '#16213e', borderRadius: 8, padding: 12, alignItems: 'center' },
  proofPhotoPreview: { width: '100%', height: 200, borderRadius: 8, marginBottom: 8 },
  proofRetake: { backgroundColor: '#0f3460', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 6 },
  proofRetakeText: { color: '#eee', fontSize: 12, fontWeight: 'bold' },
  footer: { flexDirection: 'row', gap: 12, padding: 16, borderTopWidth: 1, borderTopColor: '#0f3460' },
  backBtn: { backgroundColor: '#16213e', borderRadius: 8, padding: 14, alignItems: 'center', paddingHorizontal: 18 },
  cancelBtn: { flex: 1, backgroundColor: '#16213e', borderRadius: 8, padding: 14, alignItems: 'center' },
  cancelBtnText: { color: '#aaa', fontWeight: 'bold', fontSize: 15 },
  confirmBtn: { flex: 2, backgroundColor: '#e94560', borderRadius: 8, padding: 14, alignItems: 'center' },
  confirmBtnDisabled: { backgroundColor: '#555' },
  confirmBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});
