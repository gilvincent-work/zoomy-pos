import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, Image,
  StyleSheet, SafeAreaView, Alert, Modal,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { DenominationButton } from '../../components/DenominationButton';
import { useCart } from '../../context/CartContext';
import { insertTransaction, PaymentMethod } from '../../db/transactions';
import { pushSale } from '../../utils/sales-sync';
import { getAllQrUris, QrUris, QrMethod, qrMethodLabel } from '../../db/settings';
import { copyToDocumentDir, saveToGallery } from '../../utils/photos';
import { Ionicons } from '@expo/vector-icons';
import { F, R, type Palette } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';

const DENOMINATIONS = [1, 5, 10, 20, 50, 100, 200, 500, 1000];

type DigitalStep = 'qr' | 'proof';

type ConfirmedSummary = {
  bundles: { name: string; price: number; items: { name: string; quantity: number }[] }[];
  items: { name: string; quantity: number; price: number; variantName?: string; productName: string }[];
  total: number;
  method: PaymentMethod;
  change: number;
  customerHandle: string;
  refNumber: string;
  isBundle: boolean;
  remarks: string;
};

export default function PaymentModal() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { items, bundles, total, clearCart, removeBundle, addItem, decrementItem } = useCart();
  const [tendered, setTendered] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [digitalStep, setDigitalStep] = useState<DigitalStep>('qr');
  const [qrUris, setQrUris] = useState<QrUris>({ gcash: null, maya: null, bpi: null });
  const [qrFullScreen, setQrFullScreen] = useState(false);
  const [refNumber, setRefNumber] = useState('');
  const [proofPhotoUri, setProofPhotoUri] = useState<string | null>(null);
  const [customerHandle, setCustomerHandle] = useState('');
  const [remarks, setRemarks] = useState('');
  const [confirmed, setConfirmed] = useState<ConfirmedSummary | null>(null);

  const isCash = method === 'cash';
  const isDigital = !isCash;
  const change = tendered - total;
  const hasCartContent = items.length > 0 || bundles.length > 0;

  const activeQrUri: string | null =
    (method === 'gcash' || method === 'maya' || method === 'bpi') ? (qrUris[method] ?? null) : null;

  const dynamicMethods: { key: PaymentMethod; label: string; iconName: keyof typeof Ionicons.glyphMap }[] = [
    { key: 'cash', label: 'Cash', iconName: 'cash-outline' },
    ...(['gcash', 'maya', 'bpi'] as QrMethod[])
      .filter((m) => qrUris[m] !== null)
      .map((m) => ({
        key: m as PaymentMethod,
        label: qrMethodLabel(m),
        iconName: 'phone-portrait-outline' as const,
      })),
    { key: 'bank_transfer', label: 'Bank', iconName: 'business-outline' },
  ];

  const canConfirmCash = tendered >= total && hasCartContent;

  useFocusEffect(
    useCallback(() => { getAllQrUris().then(setQrUris); }, [])
  );

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
      const isBundle = bundles.length > 0;

      const bundleInsertItems = bundles.flatMap((b) =>
        b.items.map((i) => ({
          productId: i.id,
          productName: i.name,
          price: 0,
          quantity: i.quantity,
          variantId: i.variantId,
          variantName: i.variantName,
        }))
      );
      const individualInsertItems = items.map((i) => ({
        productId: i.productId,
        productName: i.productName,
        price: i.price,
        quantity: i.quantity,
        variantId: i.variantId,
        variantName: i.variantName,
      }));
      const itemsForInsert = [...bundleInsertItems, ...individualInsertItems];

      const snapshot: ConfirmedSummary = {
        bundles: bundles.map((b) => ({
          name: b.name,
          price: b.price,
          items: b.items.map((i) => ({ name: i.name, quantity: i.quantity })),
        })),
        items: items.map((i) => ({
          name: i.variantName ? i.productName : i.productName,
          productName: i.productName,
          quantity: i.quantity,
          price: i.price,
          variantName: i.variantName,
        })),
        total,
        method,
        change: isCash ? change : 0,
        customerHandle: customerHandle.trim(),
        refNumber: refNumber.trim(),
        isBundle,
        remarks: remarks.trim(),
      };
      await insertTransaction({
        total,
        cashTendered: isCash ? tendered : total,
        change: isCash ? change : 0,
        paymentMethod: method,
        refNumber: refNumber.trim() || undefined,
        proofPhotoUri: proofPhotoUri || undefined,
        customerHandle: customerHandle.trim() || undefined,
        isBundle,
        remarks: remarks.trim() || undefined,
        items: itemsForInsert,
      });
      clearCart();
      setConfirmed(snapshot);
      // Write the sale up to Coop (online-only), in the background. The local
      // sale is already saved; warn only if the Coop sync fails.
      pushSale({ items: itemsForInsert, subtotal: total, discount: null, total }).then((res) => {
        if (!res.ok) {
          Alert.alert('Not synced to Coop', 'The sale was saved on this device but did not reach Coop. Check the connection.');
        }
      });
    } catch {
      Alert.alert('Error', 'Failed to save transaction. Please try again.');
    }
  }

  function renderConfirmationModal() {
    if (!confirmed) return null;
    const methodLabel = confirmed.method === 'gcash' ? 'GCash'
      : confirmed.method === 'maya' ? 'Maya'
      : confirmed.method === 'bpi' ? 'BPI'
      : confirmed.method === 'bank_transfer' ? 'Bank Transfer'
      : 'Cash';
    const isMixed = confirmed.bundles.length > 0 && confirmed.items.length > 0;
    return (
      <Modal visible animationType="fade" transparent onRequestClose={() => router.dismiss()}>
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmSheet}>
            <View style={styles.confirmCheck}>
              <Ionicons name="checkmark" size={30} color="#fff" />
            </View>
            <Text style={styles.confirmTitle}>Sale Recorded!</Text>
            <Text style={styles.confirmSub}>Transaction has been saved successfully.</Text>

            <View style={styles.confirmDivider} />

            {/* Bundle sections */}
            {confirmed.bundles.map((bundle, bi) => (
              <View key={bi} style={{ width: '100%' }}>
                {bi > 0 && <View style={[styles.confirmDivider, { marginVertical: 8 }]} />}
                <View style={styles.confirmBundleHeader}>
                  <Text style={styles.bundleTag}>Bundle</Text>
                  <Text style={styles.confirmItemPrice}>₱{bundle.price.toFixed(2)}</Text>
                </View>
                {bundle.items.map((item, ii) => (
                  <View key={ii} style={styles.confirmRow}>
                    <Text style={styles.confirmItemName}>{item.name} ×{item.quantity}</Text>
                  </View>
                ))}
              </View>
            ))}

            {/* Mixed divider */}
            {isMixed && (
              <View style={styles.confirmMixedDivider}>
                <View style={styles.confirmMixedLine} />
                <Text style={styles.confirmMixedLabel}>+ Individual</Text>
                <View style={styles.confirmMixedLine} />
              </View>
            )}

            {/* Individual items */}
            {confirmed.items.map((item, i) => (
              <View key={i} style={styles.confirmRow}>
                <Text style={styles.confirmItemName}>
                  {item.variantName
                    ? `${item.productName} — ${item.variantName} ×${item.quantity}`
                    : `${item.name} ×${item.quantity}`}
                </Text>
                {!confirmed.isBundle && (
                  <Text style={styles.confirmItemPrice}>₱{(item.price * item.quantity).toFixed(2)}</Text>
                )}
              </View>
            ))}

            <View style={styles.confirmDivider} />

            <View style={styles.confirmRow}>
              <Text style={styles.confirmMeta}>Total</Text>
              <Text style={styles.confirmTotal}>₱{confirmed.total.toFixed(2)}</Text>
            </View>
            <View style={styles.confirmRow}>
              <Text style={styles.confirmMeta}>Payment</Text>
              <Text style={styles.confirmMetaValue}>
                {methodLabel}{confirmed.refNumber ? ` · ${confirmed.refNumber}` : ''}
              </Text>
            </View>
            {confirmed.method === 'cash' && confirmed.change >= 0 && (
              <View style={styles.confirmRow}>
                <Text style={styles.confirmMeta}>Change</Text>
                <Text style={styles.confirmMetaValue}>₱{confirmed.change.toFixed(2)}</Text>
              </View>
            )}
            {confirmed.customerHandle ? (
              <View style={styles.confirmRow}>
                <Text style={styles.confirmMeta}>Furbaby / IG</Text>
                <Text style={[styles.confirmMetaValue, { color: colors.pink }]}>{confirmed.customerHandle}</Text>
              </View>
            ) : null}
            {confirmed.remarks ? (
              <View style={styles.confirmRow}>
                <Text style={styles.confirmMeta}>Remarks</Text>
                <Text style={[styles.confirmMetaValue, { flex: 1, textAlign: 'right' }]}>{confirmed.remarks}</Text>
              </View>
            ) : null}

            <TouchableOpacity style={styles.confirmDoneBtn} onPress={() => router.dismiss()}>
              <Text style={styles.confirmDoneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  function renderOrderSummary() {
    const isMixed = bundles.length > 0 && items.length > 0;

    return (
      <>
        <View style={styles.summaryHeader}>
          <Text style={[styles.sectionLabel, { marginTop: 0, marginBottom: 0 }]}>ORDER SUMMARY</Text>
        </View>

        {/* Each bundle as its own section with trash */}
        {bundles.map((bundle, idx) => (
          <View key={bundle.cartId}>
            {idx > 0 && <View style={[styles.divider, { marginVertical: 6 }]} />}
            <View style={styles.bundleSectionRow}>
              <Text style={styles.bundleTag}>Bundle</Text>
              <View style={styles.bundleSectionRight}>
                <Text style={styles.bundleSectionPrice}>₱{bundle.price.toFixed(2)}</Text>
                <TouchableOpacity
                  style={styles.trashBtn}
                  onPress={() => removeBundle(bundle.cartId)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="trash-outline" size={14} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>
            {bundle.items.map((item, idx) => (
              <View key={item.variantId ? `${item.id}-${item.variantId}` : `${item.id}-${idx}`} style={styles.itemRow}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.bundleQty}>×{item.quantity}</Text>
              </View>
            ))}
          </View>
        ))}

        {/* Divider between bundles and individual items */}
        {isMixed && (
          <View style={styles.mixedDivider}>
            <View style={styles.mixedDividerLine} />
            <Text style={styles.mixedDividerLabel}>+ Individual</Text>
            <View style={styles.mixedDividerLine} />
          </View>
        )}

        {/* Individual items — grouped by product */}
        {(() => {
          const groups: { productId: number; productName: string; items: typeof items }[] = [];
          for (const item of items) {
            const existing = groups.find((g) => g.productId === item.productId);
            if (existing) {
              existing.items.push(item);
            } else {
              groups.push({ productId: item.productId, productName: item.productName, items: [item] });
            }
          }
          return groups.map((group) => {
            const hasVariants = group.items.some((i) => i.variantId);
            if (hasVariants) {
              return (
                <View key={group.productId}>
                  <Text style={styles.groupName}>{group.productName}</Text>
                  {group.items.map((item) => (
                    <View key={`${item.productId}-${item.variantId}`} style={styles.variantItemRow}>
                      <Text style={styles.variantItemName}>{item.variantName}</Text>
                      <View style={styles.qtyControls}>
                        <TouchableOpacity style={styles.qtyBtn} onPress={() => decrementItem(item.productId, item.variantId)}>
                          <Text style={styles.qtyBtnText}>−</Text>
                        </TouchableOpacity>
                        <Text style={styles.qtyText}>{item.quantity}</Text>
                        <TouchableOpacity style={styles.qtyBtn} onPress={() => addItem({ id: item.productId, name: item.productName, price: item.price, variantId: item.variantId, variantName: item.variantName })}>
                          <Text style={styles.qtyBtnText}>+</Text>
                        </TouchableOpacity>
                        <Text style={styles.itemTotal}>₱{(item.price * item.quantity).toFixed(2)}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              );
            }
            const item = group.items[0];
            return (
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
            );
          });
        })()}

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
          {dynamicMethods.map((m) => (
            <TouchableOpacity
              key={m.key}
              style={[styles.methodBtn, method === m.key && styles.methodBtnActive]}
              onPress={() => handleMethodChange(m.key)}
            >
              <Ionicons name={m.iconName} size={20} color={method === m.key ? colors.pink : colors.textSecondary} />
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

          {method === 'bank_transfer' ? (
            <View style={styles.digitalBox}>
              <Ionicons name="business-outline" size={40} color={colors.textSecondary} />
              <Text style={styles.digitalAmount}>₱{total.toFixed(2)}</Text>
              <Text style={styles.digitalHint}>Collect via Bank Transfer</Text>
            </View>
          ) : activeQrUri ? (
            <View style={styles.qrSection}>
              <Text style={styles.sectionLabel}>SCAN TO PAY</Text>
              <View style={styles.qrBox}>
                <Image source={{ uri: activeQrUri }} style={styles.qrPreview} resizeMode="contain" />
                <Text style={styles.qrAmount}>₱{total.toFixed(2)}</Text>
                <Text style={styles.qrHint}>Show this to customer</Text>
                <TouchableOpacity style={styles.fullScreenBtn} onPress={() => setQrFullScreen(true)}>
                  <Text style={styles.fullScreenBtnText}>Full Screen</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.digitalBox}>
              <Ionicons name="phone-portrait-outline" size={40} color={colors.textSecondary} />
              <Text style={styles.digitalAmount}>₱{total.toFixed(2)}</Text>
              <Text style={styles.digitalHint}>No QR uploaded. Go to Settings to add one.</Text>
            </View>
          )}

          <Text style={[styles.sectionLabel, styles.sectionLabelHandle]}>
            FURBABY / IG HANDLE <Text style={styles.optionalTag}>optional</Text>
          </Text>
          <TextInput
            style={styles.handleInput}
            placeholder="@username or furbaby name"
            placeholderTextColor={colors.textMuted}
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
            style={[styles.confirmBtn, !hasCartContent && styles.confirmBtnDisabled]}
            disabled={!hasCartContent}
            onPress={() => setDigitalStep('proof')}
          >
            <Text style={styles.confirmBtnText}>Customer Paid <Ionicons name="checkmark" size={F.lg} color="#fff" /></Text>
          </TouchableOpacity>
        </View>

        <Modal visible={qrFullScreen} animationType="fade" onRequestClose={() => setQrFullScreen(false)}>
          <TouchableOpacity style={styles.qrFullOverlay} onPress={() => setQrFullScreen(false)} activeOpacity={1}>
            <View style={styles.qrFullImageWrap}>
              {activeQrUri && <Image source={{ uri: activeQrUri }} style={styles.qrFull} resizeMode="contain" />}
            </View>
            <View style={styles.qrFullFooter}>
              <Text style={styles.qrFullAmount}>₱{total.toFixed(2)}</Text>
              <Text style={styles.qrFullHint}>Tap anywhere to close</Text>
            </View>
          </TouchableOpacity>
        </Modal>
        {renderConfirmationModal()}
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
            placeholderTextColor={colors.textMuted}
            value={refNumber}
            onChangeText={setRefNumber}
            keyboardType="default"
          />

          <Text style={styles.sectionLabel}>RECEIPT PHOTO</Text>
          {proofPhotoUri ? (
            <View style={styles.proofPhotoBox}>
              <Image source={{ uri: proofPhotoUri }} style={styles.proofPhotoPreview} resizeMode="cover" />
              <TouchableOpacity style={styles.proofRetake} onPress={handleTakePhoto}>
                <Text style={styles.proofRetakeText}><Ionicons name="camera-outline" size={F.md} color={colors.textPrimary} /> Retake</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.cameraBox} onPress={handleTakePhoto}>
              <Ionicons name="camera-outline" size={32} color={colors.textSecondary} />
              <Text style={styles.cameraText}>Tap to take photo</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.sectionLabel}>FURBABY / IG HANDLE <Text style={styles.optionalTag}>optional</Text></Text>
          <TextInput
            style={styles.handleInput}
            placeholder="@username or furbaby name"
            placeholderTextColor={colors.textMuted}
            value={customerHandle}
            onChangeText={setCustomerHandle}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={[styles.sectionLabel, styles.sectionLabelHandle]}>REMARKS <Text style={styles.optionalTag}>optional</Text></Text>
          <TextInput
            style={[styles.handleInput, { minHeight: 44 }]}
            placeholder="e.g. free item given"
            placeholderTextColor={colors.textMuted}
            value={remarks}
            onChangeText={setRemarks}
            multiline
            autoCapitalize="sentences"
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
        {renderConfirmationModal()}
      </SafeAreaView>
    );
  }

  // Cash flow
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
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
          placeholderTextColor={colors.textMuted}
          value={customerHandle}
          onChangeText={setCustomerHandle}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={[styles.sectionLabel, styles.sectionLabelHandle]}>REMARKS <Text style={styles.optionalTag}>optional</Text></Text>
        <TextInput
          style={[styles.handleInput, { minHeight: 44 }]}
          placeholder="e.g. free item given"
          placeholderTextColor={colors.textMuted}
          value={remarks}
          onChangeText={setRemarks}
          multiline
          autoCapitalize="sentences"
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
      {renderConfirmationModal()}
    </SafeAreaView>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  scroll: { padding: 14, paddingBottom: 8 },

  title: { color: c.textPrimary, fontSize: F.xl, fontWeight: '800', marginBottom: 4 },
  proofSubtitle: { color: c.textSecondary, fontSize: F.md, marginBottom: 12 },

  sectionLabel: {
    color: c.textMuted,
    fontSize: F.xs,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 6,
  },
  sectionLabelHandle: { marginTop: 8 },
  optionalTag: { color: c.textMuted, fontSize: F.xs, fontWeight: '400', letterSpacing: 0, textTransform: 'none' },

  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 6,
  },
  bundleTag: {
    color: c.pink,
    fontSize: F.xs,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    backgroundColor: c.pinkSubtle,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: c.pinkDim,
  },

  groupName: {
    color: c.pink,
    fontSize: F.md,
    fontWeight: '700',
    paddingTop: 8,
    paddingBottom: 2,
  },
  variantItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
    paddingLeft: 16,
    borderBottomWidth: 1,
    borderBottomColor: c.borderDark,
  },
  variantItemName: {
    color: c.textPrimary,
    fontSize: F.md,
    flex: 1,
    fontWeight: '500',
  },

  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: c.borderDark,
  },
  itemName: { color: c.textPrimary, fontSize: F.md, flex: 1, fontWeight: '500' },
  qtyControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn: {
    backgroundColor: c.elevated,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: c.border,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnText: { color: c.textPrimary, fontSize: F.md, fontWeight: '700' },
  qtyText: { color: c.textPrimary, fontSize: F.sm, fontWeight: '700', minWidth: 20, textAlign: 'center' },
  itemTotal: { color: c.textPrimary, fontSize: F.sm, minWidth: 72, textAlign: 'right', fontWeight: '600' },
  bundleQty: { color: c.textSecondary, fontSize: F.sm, fontWeight: '700' },

  bundleSectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    marginTop: 4,
  },
  bundleSectionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bundleSectionPrice: {
    color: c.textSecondary,
    fontSize: F.md,
    fontWeight: '700',
  },
  trashBtn: {
    backgroundColor: c.redSubtle,
    borderWidth: 1,
    borderColor: c.redDim,
    borderRadius: R.sm,
    padding: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trashIcon: {},

  mixedDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 10,
    gap: 8,
  },
  mixedDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: c.borderDark,
  },
  mixedDividerLabel: {
    color: c.textMuted,
    fontSize: F.xs,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },

  divider: { height: 1, backgroundColor: c.border, marginVertical: 8 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { color: c.textSecondary, fontSize: F.md, fontWeight: '700', letterSpacing: 0.5 },
  totalAmount: { color: c.pink, fontSize: F.xxl, fontWeight: '800' },

  methodRow: { flexDirection: 'row', gap: 8, marginBottom: 2 },
  methodBtn: {
    flex: 1,
    backgroundColor: c.surface,
    borderRadius: R.sm,
    paddingVertical: 9,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: c.borderDark,
    gap: 2,
  },
  methodBtnActive: { borderColor: c.pink, backgroundColor: c.pinkSubtle },
  methodIcon: {},
  methodLabel: { color: c.textSecondary, fontSize: F.xs, fontWeight: '700' },
  methodLabelActive: { color: c.pink },

  tenderedBox: {
    backgroundColor: c.surface,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: c.border,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
    gap: 4,
  },
  tenderedLabel: { color: c.textSecondary, fontSize: F.lg, fontWeight: '700' },
  tenderedAmount: { color: c.textPrimary, fontSize: F.xxl, fontWeight: '800', flex: 1 },

  denomGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  denomCell: { width: '30%' },

  actionRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  clearBtn: {
    flex: 1,
    backgroundColor: c.redSubtle,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: c.redDim,
    padding: 11,
    alignItems: 'center',
  },
  clearBtnText: { color: c.red, fontWeight: '700', fontSize: F.sm },
  exactBtn: {
    flex: 2,
    backgroundColor: c.elevated,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: c.border,
    padding: 11,
    alignItems: 'center',
  },
  exactBtnText: { color: c.textPrimary, fontWeight: '700', fontSize: F.sm },

  changeBox: {
    backgroundColor: c.greenSubtle,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: c.green,
    padding: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  changeBoxShort: { backgroundColor: c.redSubtle, borderColor: c.red },
  changeLabel: { color: c.textPrimary, fontWeight: '700', fontSize: F.sm },
  changeAmount: { color: c.textPrimary, fontSize: F.xl, fontWeight: '800' },

  handleInput: {
    backgroundColor: c.surface,
    color: c.textPrimary,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: c.border,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: F.md,
  },

  digitalBox: {
    backgroundColor: c.surface,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: c.border,
    padding: 28,
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  digitalIcon: {},
  digitalAmount: { color: c.textPrimary, fontSize: F.xxl, fontWeight: '800' },
  digitalHint: { color: c.textSecondary, fontSize: F.md, textAlign: 'center' },

  qrSection: { marginTop: 8 },
  qrBox: {
    backgroundColor: c.surface,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: c.border,
    padding: 24,
    alignItems: 'center',
    gap: 10,
  },
  qrPreview: { width: 180, height: 180, borderRadius: R.sm, marginBottom: 4 },
  qrAmount: { color: c.pink, fontSize: F.xxl, fontWeight: '800' },
  qrHint: { color: c.textSecondary, fontSize: F.sm },
  fullScreenBtn: {
    backgroundColor: c.elevated,
    borderWidth: 1,
    borderColor: c.border,
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: R.sm,
    marginTop: 4,
  },
  fullScreenBtnText: { color: c.textPrimary, fontWeight: '700', fontSize: F.md },

  qrFullOverlay: { flex: 1, backgroundColor: '#fff' },
  qrFullImageWrap: { flex: 1, padding: 16, paddingTop: 48 },
  qrFull: { flex: 1, width: '100%' },
  qrFullFooter: { alignItems: 'center', paddingBottom: 40, paddingTop: 4, gap: 6 },
  qrFullAmount: { color: '#111', fontSize: F.xxl, fontWeight: '800' },
  qrFullHint: { color: '#888', fontSize: F.sm },

  refInput: {
    backgroundColor: c.surface,
    color: c.textPrimary,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: c.border,
    padding: 14,
    fontSize: F.lg,
    fontWeight: '500',
  },
  cameraBox: {
    backgroundColor: c.surface,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: c.border,
    borderRadius: R.md,
    padding: 28,
    alignItems: 'center',
    gap: 8,
  },
  cameraIcon: {},
  cameraText: { color: c.textSecondary, fontSize: F.md },
  proofPhotoBox: { backgroundColor: c.surface, borderRadius: R.md, padding: 12, alignItems: 'center', gap: 10 },
  proofPhotoPreview: { width: '100%', height: 220, borderRadius: R.sm },
  proofRetake: {
    backgroundColor: c.elevated,
    borderWidth: 1,
    borderColor: c.border,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: R.sm,
  },
  proofRetakeText: { color: c.textPrimary, fontSize: F.md, fontWeight: '700' },

  footer: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: c.borderDark,
    backgroundColor: c.surface,
  },
  backBtn: {
    backgroundColor: c.elevated,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: R.sm,
    padding: 16,
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: c.elevated,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: R.sm,
    padding: 16,
    alignItems: 'center',
  },
  cancelBtnText: { color: c.textSecondary, fontWeight: '700', fontSize: F.md },
  confirmBtn: {
    flex: 2,
    backgroundColor: c.green,
    borderRadius: R.sm,
    padding: 16,
    alignItems: 'center',
  },
  confirmBtnDisabled: { backgroundColor: c.elevated, borderWidth: 1, borderColor: c.border },
  confirmBtnText: { color: '#fff', fontWeight: '800', fontSize: F.lg },

  confirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  confirmSheet: {
    backgroundColor: c.surface,
    borderRadius: R.xl,
    borderWidth: 1,
    borderColor: c.borderDark,
    padding: 28,
    width: '100%',
    alignItems: 'center',
  },
  confirmCheck: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: c.pink,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  confirmCheckText: {},
  confirmTitle: { color: c.textPrimary, fontSize: F.xl, fontWeight: '800', marginBottom: 4 },
  confirmSub: { color: c.textSecondary, fontSize: F.sm, marginBottom: 18, textAlign: 'center' },
  confirmDivider: { height: 1, backgroundColor: c.borderDark, width: '100%', marginVertical: 12 },
  confirmBundleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 6,
  },
  confirmMixedDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginVertical: 10,
    gap: 8,
  },
  confirmMixedLine: { flex: 1, height: 1, backgroundColor: c.borderDark },
  confirmMixedLabel: {
    color: c.textMuted,
    fontSize: F.xs,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  confirmRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 6,
  },
  confirmItemName: { color: c.textPrimary, fontSize: F.md, flex: 1 },
  confirmItemPrice: { color: c.textPrimary, fontSize: F.md, fontWeight: '600' },
  confirmMeta: { color: c.textSecondary, fontSize: F.md },
  confirmMetaValue: { color: c.textPrimary, fontSize: F.md, fontWeight: '600', textAlign: 'right', flex: 1, marginLeft: 12 },
  confirmTotal: { color: c.pink, fontSize: F.xl, fontWeight: '800' },
  confirmDoneBtn: {
    backgroundColor: c.pink,
    borderRadius: R.sm,
    paddingVertical: 14,
    width: '100%',
    alignItems: 'center',
    marginTop: 20,
  },
  confirmDoneBtnText: { color: '#fff', fontWeight: '800', fontSize: F.lg },
});
