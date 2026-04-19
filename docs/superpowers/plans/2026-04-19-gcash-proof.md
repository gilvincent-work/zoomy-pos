# GCash QR & Payment Proof Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add GCash QR code display during payment, proof-of-payment capture (ref number + receipt photo) for digital payments, and proof viewing in transaction history.

**Architecture:** Two-step payment flow for digital methods — Step 1 shows QR (GCash) or text prompt (Bank), Step 2 captures proof. QR image uploaded once via admin settings. Receipt photos saved to device gallery + app document directory. Proof data stored as nullable columns on transactions table.

**Tech Stack:** React Native, Expo SDK 51, `expo-image-picker`, `expo-media-library`, `expo-file-system`, `expo-sqlite`

---

## File Map

```
db/
  schema.ts                  # Add ref_number, proof_photo_uri columns + migration
  transactions.ts            # Update types, insertTransaction, getAllTransactions
  settings.ts                # Add getGcashQrUri, setGcashQrUri

utils/
  photos.ts                  # Helper: copy image to doc dir, save to gallery

app/modals/
  payment.tsx                # Two-step digital flow: QR display → proof capture
  admin.tsx                  # Add settings menu with QR upload after PIN verify
  transactions.tsx           # Proof badges, proof section in detail, photo viewer

components/
  TransactionRow.tsx         # Add proof badge for digital payments
```

---

## Task 1: Install dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install expo packages**

```bash
npx expo install expo-image-picker expo-media-library expo-file-system
```

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add expo-image-picker, expo-media-library, expo-file-system"
```

---

## Task 2: Schema migration + transaction DB updates

**Files:**
- Modify: `db/schema.ts`
- Modify: `db/transactions.ts`
- Modify: `__tests__/db/transactions.test.ts`

- [ ] **Step 1: Update `db/schema.ts` — add migration for new columns**

Add after the existing `payment_method` migration:

```typescript
  await db.runAsync(
    `ALTER TABLE transactions ADD COLUMN ref_number TEXT`
  ).catch(() => {});

  await db.runAsync(
    `ALTER TABLE transactions ADD COLUMN proof_photo_uri TEXT`
  ).catch(() => {});
```

- [ ] **Step 2: Update `Transaction` type in `db/transactions.ts`**

Add two new fields to the `Transaction` type:

```typescript
export type Transaction = {
  id: number;
  total: number;
  cash_tendered: number;
  change: number;
  payment_method: PaymentMethod;
  ref_number: string | null;
  proof_photo_uri: string | null;
  status: 'completed' | 'voided';
  created_at: string;
  items: TransactionItem[];
};
```

- [ ] **Step 3: Update `insertTransaction` to accept proof data**

Update the `insertTransaction` function signature and query:

```typescript
export async function insertTransaction(data: {
  total: number;
  cashTendered: number;
  change: number;
  paymentMethod: PaymentMethod;
  refNumber?: string;
  proofPhotoUri?: string;
  items: InsertItem[];
}): Promise<number> {
  const db = await getDatabase();

  const result = await db.runAsync(
    'INSERT INTO transactions (total, cash_tendered, change, payment_method, ref_number, proof_photo_uri, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [data.total, data.cashTendered, data.change, data.paymentMethod, data.refNumber ?? null, data.proofPhotoUri ?? null, 'completed', new Date().toISOString()]
  );

  const transactionId = result.lastInsertRowId;

  for (const item of data.items) {
    await db.runAsync(
      'INSERT INTO transaction_items (transaction_id, product_id, product_name, price, quantity) VALUES (?, ?, ?, ?, ?)',
      [transactionId, item.productId, item.productName, item.price, item.quantity]
    );
  }

  return transactionId;
}
```

- [ ] **Step 4: Update `getAllTransactions` query and mapping**

Update the Row type to include:

```typescript
    t_ref: string | null;
    t_proof: string | null;
```

Update the SELECT to include:

```sql
t.ref_number AS t_ref, t.proof_photo_uri AS t_proof,
```

Update the mapping inside the `if (!map.has(row.t_id))` block:

```typescript
        ref_number: row.t_ref ?? null,
        proof_photo_uri: row.t_proof ?? null,
```

- [ ] **Step 5: Update test in `__tests__/db/transactions.test.ts`**

Update the `insertTransaction` test call to include `paymentMethod`:

```typescript
    const id = await insertTransaction({
      total: 285,
      cashTendered: 300,
      change: 15,
      paymentMethod: 'cash',
      items,
    });

    expect(mockDb.runAsync).toHaveBeenNthCalledWith(
      1,
      'INSERT INTO transactions (total, cash_tendered, change, payment_method, ref_number, proof_photo_uri, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [285, 300, 15, 'cash', null, null, 'completed', expect.any(String)]
    );
```

- [ ] **Step 6: Run tests**

```bash
npx jest --no-coverage
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add db/schema.ts db/transactions.ts __tests__/db/transactions.test.ts
git commit -m "feat(db): add ref_number and proof_photo_uri to transactions"
```

---

## Task 3: Settings DB — GCash QR URI

**Files:**
- Modify: `db/settings.ts`
- Modify: `__tests__/db/settings.test.ts`

- [ ] **Step 1: Write failing test**

Add to `__tests__/db/settings.test.ts`:

```typescript
describe('getGcashQrUri', () => {
  it('queries settings for gcash_qr_uri', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ value: '/path/to/qr.jpg' });
    const result = await getGcashQrUri();
    expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
      'SELECT value FROM settings WHERE key = ?',
      ['gcash_qr_uri']
    );
    expect(result).toBe('/path/to/qr.jpg');
  });

  it('returns null when no QR is set', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce(null);
    const result = await getGcashQrUri();
    expect(result).toBeNull();
  });
});

describe('setGcashQrUri', () => {
  it('upserts gcash_qr_uri in settings', async () => {
    await setGcashQrUri('/path/to/qr.jpg');
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      ['gcash_qr_uri', '/path/to/qr.jpg']
    );
  });
});

describe('removeGcashQrUri', () => {
  it('deletes gcash_qr_uri from settings', async () => {
    await removeGcashQrUri();
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'DELETE FROM settings WHERE key = ?',
      ['gcash_qr_uri']
    );
  });
});
```

Update the import at the top:

```typescript
import { getAdminHash, setAdminHash, getGcashQrUri, setGcashQrUri, removeGcashQrUri } from '../../db/settings';
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/db/settings.test.ts --no-coverage
```

Expected: FAIL — `getGcashQrUri` is not exported.

- [ ] **Step 3: Implement in `db/settings.ts`**

Add after the existing functions:

```typescript
export async function getGcashQrUri(): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    ['gcash_qr_uri']
  );
  return row?.value ?? null;
}

export async function setGcashQrUri(uri: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    ['gcash_qr_uri', uri]
  );
}

export async function removeGcashQrUri(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'DELETE FROM settings WHERE key = ?',
    ['gcash_qr_uri']
  );
}
```

- [ ] **Step 4: Run tests**

```bash
npx jest __tests__/db/settings.test.ts --no-coverage
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add db/settings.ts __tests__/db/settings.test.ts
git commit -m "feat(settings): add GCash QR URI get/set/remove"
```

---

## Task 4: Photo utility helper

**Files:**
- Create: `utils/photos.ts`

- [ ] **Step 1: Create `utils/photos.ts`**

```typescript
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';

export async function copyToDocumentDir(sourceUri: string, filename: string): Promise<string> {
  const destUri = `${FileSystem.documentDirectory}${filename}`;
  await FileSystem.copyAsync({ from: sourceUri, to: destUri });
  return destUri;
}

export async function saveToGallery(uri: string): Promise<void> {
  const { status } = await MediaLibrary.requestPermissionsAsync();
  if (status === 'granted') {
    await MediaLibrary.saveToLibraryAsync(uri);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add utils/photos.ts
git commit -m "feat(utils): add photo copy and gallery save helpers"
```

---

## Task 5: Admin modal — QR code upload

**Files:**
- Modify: `app/modals/admin.tsx`

- [ ] **Step 1: Update admin modal to add `action: 'settings'` and QR management**

The admin modal currently supports `verify` → `new_pin` steps. Add a new action `'settings'` that shows a settings menu after PIN verification, and a `'manage_qr'` step for QR upload.

Replace the entire `app/modals/admin.tsx` with:

```typescript
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
```

- [ ] **Step 2: Update POSScreen to use `settings` action**

In `app/index.tsx`, change the ⚙️ button to use `action: 'settings'`:

```typescript
        <TouchableOpacity
          onPress={() => router.push({ pathname: '/modals/admin', params: { action: 'settings' } })}
          style={styles.headerBtn}
        >
```

- [ ] **Step 3: Verify on device**

Tap ⚙️ → enter PIN `0000` → settings screen shows "Change PIN" row and "GCash QR Code" section. Upload a QR image from photo library. Replace and Remove buttons work.

- [ ] **Step 4: Commit**

```bash
git add app/modals/admin.tsx app/index.tsx utils/photos.ts
git commit -m "feat(admin): add settings screen with GCash QR upload"
```

---

## Task 6: Payment modal — two-step digital flow

**Files:**
- Modify: `app/modals/payment.tsx`

- [ ] **Step 1: Replace `app/modals/payment.tsx` with two-step flow**

```typescript
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
  cancelBtn: { flex: 1, backgroundColor: '#16213e', borderRadius: 8, padding: 14, alignItems: 'center' },
  cancelBtnText: { color: '#aaa', fontWeight: 'bold', fontSize: 15 },
  confirmBtn: { flex: 2, backgroundColor: '#e94560', borderRadius: 8, padding: 14, alignItems: 'center' },
  confirmBtnDisabled: { backgroundColor: '#555' },
  confirmBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});
```

- [ ] **Step 2: Verify on device**

Test all three flows:
1. Cash: unchanged, denomination buttons work
2. GCash: shows QR → full screen → "Customer Paid" → proof screen → ref number + camera → confirm
3. Bank Transfer: shows text prompt → "Customer Paid" → proof screen → confirm

- [ ] **Step 3: Commit**

```bash
git add app/modals/payment.tsx
git commit -m "feat(payment): add two-step digital flow with QR display and proof capture"
```

---

## Task 7: Transaction history — proof badges + detail

**Files:**
- Modify: `components/TransactionRow.tsx`
- Modify: `app/modals/transactions.tsx`

- [ ] **Step 1: Update `components/TransactionRow.tsx` — add proof badge**

After the existing `methodBadge` view, add the proof badge:

```typescript
  const hasProof = !!transaction.ref_number || !!transaction.proof_photo_uri;
  const isDigital = transaction.payment_method !== 'cash';
```

Add inside the `topRow` view, after the method badge:

```typescript
          {isDigital && (
            <View style={[styles.proofBadge, hasProof ? styles.proofBadgeGreen : styles.proofBadgeRed]}>
              <Text style={styles.proofBadgeText}>{hasProof ? '✓ Proof' : 'No Proof'}</Text>
            </View>
          )}
```

Add new styles:

```typescript
  proofBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 },
  proofBadgeGreen: { backgroundColor: '#0d7a3e' },
  proofBadgeRed: { backgroundColor: '#e94560' },
  proofBadgeText: { color: '#fff', fontSize: 9, fontWeight: 'bold' },
```

- [ ] **Step 2: Update `app/modals/transactions.tsx` — proof section in detail sheet + photo viewer**

Add a `[photoView, setPhotoView]` state:

```typescript
  const [photoView, setPhotoView] = useState<string | null>(null);
```

Add after the existing summary rows in the detail sheet (after the Payment row), inside the `{selected && ...}` block:

```typescript
                {selected.payment_method !== 'cash' && (selected.ref_number || selected.proof_photo_uri) && (
                  <>
                    <View style={styles.divider} />
                    <Text style={styles.proofLabel}>PAYMENT PROOF</Text>
                    <View style={styles.proofRow}>
                      {selected.ref_number && (
                        <View style={styles.refBox}>
                          <Text style={styles.refLabel}>REF #</Text>
                          <Text style={styles.refValue}>{selected.ref_number}</Text>
                        </View>
                      )}
                      {selected.proof_photo_uri && (
                        <TouchableOpacity onPress={() => setPhotoView(selected.proof_photo_uri)}>
                          <Image source={{ uri: selected.proof_photo_uri }} style={styles.proofThumb} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </>
                )}
```

Add a photo viewer Modal after the detail sheet Modal:

```typescript
      <Modal visible={!!photoView} transparent animationType="fade" onRequestClose={() => setPhotoView(null)}>
        <TouchableOpacity style={styles.photoOverlay} onPress={() => setPhotoView(null)} activeOpacity={1}>
          {photoView && <Image source={{ uri: photoView }} style={styles.photoFull} resizeMode="contain" />}
          <Text style={styles.photoHint}>Tap to close</Text>
        </TouchableOpacity>
      </Modal>
```

Add the import for Image at the top:

```typescript
import { View, Text, FlatList, TouchableOpacity, StyleSheet, SafeAreaView, Modal, Image } from 'react-native';
```

Add new styles:

```typescript
  proofLabel: { color: '#aaa', fontSize: 10, fontWeight: 'bold', marginBottom: 8 },
  proofRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  refBox: { backgroundColor: '#1a1a2e', borderRadius: 6, padding: 8, flex: 1 },
  refLabel: { color: '#888', fontSize: 10 },
  refValue: { color: '#eee', fontSize: 13, fontWeight: 'bold', marginTop: 2 },
  proofThumb: { width: 60, height: 60, borderRadius: 6, backgroundColor: '#1a1a2e' },
  photoOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', alignItems: 'center', justifyContent: 'center' },
  photoFull: { width: '90%', height: '70%' },
  photoHint: { color: '#888', fontSize: 12, marginTop: 16 },
```

- [ ] **Step 3: Run full test suite**

```bash
npx jest --no-coverage
```

Expected: All tests pass.

- [ ] **Step 4: Verify on device**

1. Make a GCash sale with ref number + photo
2. Open transactions → see green "✓ Proof" badge
3. Tap the transaction → see ref number and photo thumbnail
4. Tap thumbnail → full-screen photo viewer
5. Make a GCash sale without proof → see red "No Proof" badge
6. Cash transactions → no proof badge

- [ ] **Step 5: Commit**

```bash
git add components/TransactionRow.tsx app/modals/transactions.tsx
git commit -m "feat(transactions): add proof badges, detail section, and photo viewer"
```

---

## Self-Review

**Spec coverage:**
- ✅ GCash QR upload in admin settings (Task 5)
- ✅ QR display inline + full-screen during payment (Task 6)
- ✅ Two-step flow for digital payments (Task 6)
- ✅ Proof capture: ref number + camera photo (Task 6)
- ✅ Skip option for proof (Task 6)
- ✅ Photo saved to gallery + app document dir (Task 4, 6)
- ✅ Bank Transfer text prompt instead of QR (Task 6)
- ✅ Proof badge on transaction rows (Task 7)
- ✅ Proof section in transaction detail (Task 7)
- ✅ Full-screen photo viewer (Task 7)
- ✅ No QR → prompt to upload (Task 6)
- ✅ DB columns: ref_number, proof_photo_uri (Task 2)
- ✅ Settings: gcash_qr_uri (Task 3)

**Placeholder scan:** No TBDs. All code provided. All commands exact.

**Type consistency:**
- `PaymentMethod` type used consistently across transactions.ts, payment.tsx
- `insertTransaction` signature matches Task 2 definition in Task 6 usage
- `getGcashQrUri`/`setGcashQrUri`/`removeGcashQrUri` match Task 3 definition in Task 5 usage
- `copyToDocumentDir`/`saveToGallery` match Task 4 definition in Task 5 and 6 usage
- `Transaction.ref_number`/`proof_photo_uri` match Task 2 definition in Task 7 usage
