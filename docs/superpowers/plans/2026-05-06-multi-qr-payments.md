# Multi-QR Payment Methods Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single GCash QR code with three fixed payment methods (GCash, Maya, BPI), each with its own uploadable QR code that appears as a button in the payment flow.

**Architecture:** Three new settings keys (`qr_gcash`, `qr_maya`, `qr_bpi`) replace the old `gcash_qr_uri` key; a schema migration copies existing data. The payment modal dynamically builds its method buttons from whichever QR codes have been uploaded. The admin settings screen gets a 3-row list to manage all three QRs.

**Tech Stack:** React Native / Expo, expo-sqlite (SQLite settings table), expo-image-picker, TypeScript

---

## File Structure

- **Modify** `db/transactions.ts` — add `'maya' | 'bpi'` to `PaymentMethod`, remove `'bank_transfer'`
- **Modify** `db/settings.ts` — replace old QR functions with `getQrUri`, `setQrUri`, `removeQrUri`, `getAllQrUris`; export `QrMethod`, `QrUris`, `qrMethodLabel`
- **Modify** `db/settings.web.ts` — same new API without FileSystem
- **Modify** `db/schema.ts` — add migration: copy `gcash_qr_uri` → `qr_gcash`
- **Modify** `__tests__/db/settings.test.ts` — update to new API
- **Modify** `components/TransactionRow.tsx` — update method label for maya/bpi
- **Modify** `utils/export-csv.ts` — update `formatPaymentMethod` for maya/bpi
- **Modify** `utils/export-csv.web.ts` — same
- **Modify** `app/modals/transactions.tsx` — update filter chips and `getMethodDisplayName`
- **Modify** `app/modals/admin.tsx` — replace single QR section with 3-row list
- **Modify** `app/modals/payment.tsx` — dynamic payment buttons, multi-QR display

---

### Task 1: Data layer — new QR settings API + PaymentMethod type

**Files:**
- Modify: `db/transactions.ts:14`
- Modify: `db/settings.ts`
- Modify: `db/settings.web.ts`
- Modify: `db/schema.ts`

- [ ] **Step 1: Update `PaymentMethod` type in `db/transactions.ts`**

Change line 14 from:
```ts
export type PaymentMethod = 'cash' | 'gcash' | 'bank_transfer';
```
to:
```ts
export type PaymentMethod = 'cash' | 'gcash' | 'maya' | 'bpi';
```

- [ ] **Step 2: Replace QR functions in `db/settings.ts`**

Replace everything after `setAdminHash` (lines 21–62) with:

```ts
export type QrMethod = 'gcash' | 'maya' | 'bpi';
export type QrUris = Record<QrMethod, string | null>;

export function qrMethodLabel(method: QrMethod): string {
  if (method === 'gcash') return 'GCash';
  if (method === 'maya') return 'Maya';
  return 'BPI';
}

export async function getQrUri(method: QrMethod): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    [`qr_${method}`]
  );
  if (!row?.value) return null;
  if (row.value.startsWith('data:')) return row.value;

  let filename = row.value;
  if (filename.includes('/')) filename = filename.split('/').pop()!;

  try {
    const fullUri = `${FileSystem.documentDirectory}${filename}`;
    const info = await FileSystem.getInfoAsync(fullUri);
    if (!info.exists) return null;
    return fullUri;
  } catch {
    return null;
  }
}

export async function setQrUri(method: QrMethod, uri: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    [`qr_${method}`, uri]
  );
}

export async function removeQrUri(method: QrMethod): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'DELETE FROM settings WHERE key = ?',
    [`qr_${method}`]
  );
}

export async function getAllQrUris(): Promise<QrUris> {
  const [gcash, maya, bpi] = await Promise.all([
    getQrUri('gcash'),
    getQrUri('maya'),
    getQrUri('bpi'),
  ]);
  return { gcash, maya, bpi };
}
```

The full `db/settings.ts` should now be:
```ts
import * as FileSystem from 'expo-file-system/legacy';
import { getDatabase } from './database';

export async function getAdminHash(): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    ['admin_password_hash']
  );
  return row?.value ?? null;
}

export async function setAdminHash(hash: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    ['admin_password_hash', hash]
  );
}

export type QrMethod = 'gcash' | 'maya' | 'bpi';
export type QrUris = Record<QrMethod, string | null>;

export function qrMethodLabel(method: QrMethod): string {
  if (method === 'gcash') return 'GCash';
  if (method === 'maya') return 'Maya';
  return 'BPI';
}

export async function getQrUri(method: QrMethod): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    [`qr_${method}`]
  );
  if (!row?.value) return null;
  if (row.value.startsWith('data:')) return row.value;

  let filename = row.value;
  if (filename.includes('/')) filename = filename.split('/').pop()!;

  try {
    const fullUri = `${FileSystem.documentDirectory}${filename}`;
    const info = await FileSystem.getInfoAsync(fullUri);
    if (!info.exists) return null;
    return fullUri;
  } catch {
    return null;
  }
}

export async function setQrUri(method: QrMethod, uri: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    [`qr_${method}`, uri]
  );
}

export async function removeQrUri(method: QrMethod): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'DELETE FROM settings WHERE key = ?',
    [`qr_${method}`]
  );
}

export async function getAllQrUris(): Promise<QrUris> {
  const [gcash, maya, bpi] = await Promise.all([
    getQrUri('gcash'),
    getQrUri('maya'),
    getQrUri('bpi'),
  ]);
  return { gcash, maya, bpi };
}
```

- [ ] **Step 3: Replace QR functions in `db/settings.web.ts`**

Full file content:
```ts
import { getDatabase } from './database';

export async function getAdminHash(): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    ['admin_password_hash']
  );
  return row?.value ?? null;
}

export async function setAdminHash(hash: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    ['admin_password_hash', hash]
  );
}

export type QrMethod = 'gcash' | 'maya' | 'bpi';
export type QrUris = Record<QrMethod, string | null>;

export function qrMethodLabel(method: QrMethod): string {
  if (method === 'gcash') return 'GCash';
  if (method === 'maya') return 'Maya';
  return 'BPI';
}

export async function getQrUri(method: QrMethod): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    [`qr_${method}`]
  );
  return row?.value ?? null;
}

export async function setQrUri(method: QrMethod, uri: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    [`qr_${method}`, uri]
  );
}

export async function removeQrUri(method: QrMethod): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'DELETE FROM settings WHERE key = ?',
    [`qr_${method}`]
  );
}

export async function getAllQrUris(): Promise<QrUris> {
  const [gcash, maya, bpi] = await Promise.all([
    getQrUri('gcash'),
    getQrUri('maya'),
    getQrUri('bpi'),
  ]);
  return { gcash, maya, bpi };
}
```

- [ ] **Step 4: Add schema migration in `db/schema.ts`**

At the very end of `initSchema()`, after all existing `ALTER TABLE` and `INSERT OR IGNORE` statements, add:

```ts
  // Migrate legacy single GCash QR to new per-method key
  await db.runAsync(
    `INSERT OR IGNORE INTO settings (key, value)
     SELECT 'qr_gcash', value FROM settings WHERE key = 'gcash_qr_uri'`
  ).catch(() => {});
```

- [ ] **Step 5: Commit**

```bash
git add db/transactions.ts db/settings.ts db/settings.web.ts db/schema.ts
git commit -m "feat(qr): add multi-QR data layer (QrMethod, getQrUri, setQrUri, removeQrUri, getAllQrUris)"
```

---

### Task 2: Update settings tests

**Files:**
- Modify: `__tests__/db/settings.test.ts`

- [ ] **Step 1: Write the updated test file**

Replace the entire file contents with:

```ts
import { getAdminHash, setAdminHash, getQrUri, setQrUri, removeQrUri, getAllQrUris } from '../../db/settings';
import { mockDb } from '../../__mocks__/expo-sqlite';
import { getInfoAsync } from 'expo-file-system/legacy';

const mockGetInfoAsync = getInfoAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
  mockGetInfoAsync.mockResolvedValue({ exists: true });
});

describe('getAdminHash', () => {
  it('queries settings for admin_password_hash', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ value: 'abc123' });
    const result = await getAdminHash();
    expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
      'SELECT value FROM settings WHERE key = ?',
      ['admin_password_hash']
    );
    expect(result).toBe('abc123');
  });

  it('returns null when no row found', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce(null);
    const result = await getAdminHash();
    expect(result).toBeNull();
  });
});

describe('setAdminHash', () => {
  it('upserts admin_password_hash in settings', async () => {
    await setAdminHash('newhash');
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      ['admin_password_hash', 'newhash']
    );
  });
});

describe('getQrUri', () => {
  it('resolves filename to full URI', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ value: 'qr.jpg' });
    const result = await getQrUri('gcash');
    expect(result).toBe('file:///mock/documents/qr.jpg');
  });

  it('resolves legacy absolute path to filename-based URI', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ value: '/old/path/to/qr.jpg' });
    const result = await getQrUri('gcash');
    expect(result).toBe('file:///mock/documents/qr.jpg');
  });

  it('returns data URI directly', async () => {
    const dataUri = 'data:image/jpeg;base64,/9j/4AAQSkZJ';
    mockDb.getFirstAsync.mockResolvedValueOnce({ value: dataUri });
    const result = await getQrUri('gcash');
    expect(result).toBe(dataUri);
  });

  it('returns null when file does not exist', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ value: 'missing.jpg' });
    mockGetInfoAsync.mockResolvedValueOnce({ exists: false });
    const result = await getQrUri('gcash');
    expect(result).toBeNull();
  });

  it('returns null when no QR is set', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce(null);
    const result = await getQrUri('gcash');
    expect(result).toBeNull();
  });

  it('queries correct key for maya', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce(null);
    await getQrUri('maya');
    expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
      'SELECT value FROM settings WHERE key = ?',
      ['qr_maya']
    );
  });

  it('queries correct key for bpi', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce(null);
    await getQrUri('bpi');
    expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
      'SELECT value FROM settings WHERE key = ?',
      ['qr_bpi']
    );
  });
});

describe('setQrUri', () => {
  it('stores under qr_gcash key', async () => {
    const dataUri = 'data:image/jpeg;base64,/9j/4AAQ';
    await setQrUri('gcash', dataUri);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      ['qr_gcash', dataUri]
    );
  });

  it('stores under qr_bpi key', async () => {
    await setQrUri('bpi', 'data:image/jpeg;base64,abc');
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      ['qr_bpi', 'data:image/jpeg;base64,abc']
    );
  });
});

describe('removeQrUri', () => {
  it('deletes qr_gcash from settings', async () => {
    await removeQrUri('gcash');
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'DELETE FROM settings WHERE key = ?',
      ['qr_gcash']
    );
  });

  it('deletes qr_maya from settings', async () => {
    await removeQrUri('maya');
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'DELETE FROM settings WHERE key = ?',
      ['qr_maya']
    );
  });
});

describe('getAllQrUris', () => {
  it('returns all three QR URIs', async () => {
    mockDb.getFirstAsync
      .mockResolvedValueOnce({ value: 'data:image/jpeg;base64,gcash' })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ value: 'data:image/jpeg;base64,bpi' });
    const result = await getAllQrUris();
    expect(result).toEqual({
      gcash: 'data:image/jpeg;base64,gcash',
      maya: null,
      bpi: 'data:image/jpeg;base64,bpi',
    });
  });

  it('returns all nulls when no QRs uploaded', async () => {
    mockDb.getFirstAsync.mockResolvedValue(null);
    const result = await getAllQrUris();
    expect(result).toEqual({ gcash: null, maya: null, bpi: null });
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx jest __tests__/db/settings.test.ts --no-coverage
```

Expected: all tests PASS

- [ ] **Step 3: Commit**

```bash
git add __tests__/db/settings.test.ts
git commit -m "test(settings): update tests for new multi-QR API"
```

---

### Task 3: Update supporting files

**Files:**
- Modify: `components/TransactionRow.tsx:13-15`
- Modify: `utils/export-csv.ts:28`
- Modify: `utils/export-csv.web.ts:26`
- Modify: `app/modals/transactions.tsx:49-56`

- [ ] **Step 1: Update `TransactionRow.tsx` method label**

Replace lines 13–15:
```ts
  const methodLabel = transaction.payment_method === 'gcash' ? 'GCash'
    : transaction.payment_method === 'bank_transfer' ? 'Bank'
    : 'Cash';
```
with:
```ts
  const methodLabel = transaction.payment_method === 'gcash' ? 'GCash'
    : transaction.payment_method === 'maya' ? 'Maya'
    : transaction.payment_method === 'bpi' ? 'BPI'
    : 'Cash';
```

- [ ] **Step 2: Update `utils/export-csv.ts` label**

Replace line 28:
```ts
  const label = method === 'gcash' ? 'GCash' : method === 'bank_transfer' ? 'Bank Transfer' : 'Cash';
```
with:
```ts
  const label = method === 'gcash' ? 'GCash' : method === 'maya' ? 'Maya' : method === 'bpi' ? 'BPI' : 'Cash';
```

- [ ] **Step 3: Update `utils/export-csv.web.ts` label**

Replace line 26:
```ts
  const label = method === 'gcash' ? 'GCash' : method === 'bank_transfer' ? 'Bank Transfer' : 'Cash';
```
with:
```ts
  const label = method === 'gcash' ? 'GCash' : method === 'maya' ? 'Maya' : method === 'bpi' ? 'BPI' : 'Cash';
```

- [ ] **Step 4: Update `app/modals/transactions.tsx` filter chips and display name**

Replace the `METHOD_FILTERS` constant (lines 46–51):
```ts
const METHOD_FILTERS: { key: MethodFilter; label: string; iconName?: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'all', label: 'All' },
  { key: 'cash', label: 'Cash', iconName: 'cash-outline' },
  { key: 'gcash', label: 'GCash', iconName: 'phone-portrait-outline' },
  { key: 'bank_transfer', label: 'Bank', iconName: 'business-outline' },
];
```
with:
```ts
const METHOD_FILTERS: { key: MethodFilter; label: string; iconName?: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'all', label: 'All' },
  { key: 'cash', label: 'Cash', iconName: 'cash-outline' },
  { key: 'gcash', label: 'GCash', iconName: 'phone-portrait-outline' },
  { key: 'maya', label: 'Maya', iconName: 'phone-portrait-outline' },
  { key: 'bpi', label: 'BPI', iconName: 'business-outline' },
];
```

Replace `getMethodDisplayName` (lines 53–58):
```ts
function getMethodDisplayName(method: PaymentMethod): string {
  switch (method) {
    case 'gcash': return 'GCash';
    case 'bank_transfer': return 'Bank Transfer';
    default: return 'Cash';
  }
}
```
with:
```ts
function getMethodDisplayName(method: PaymentMethod): string {
  switch (method) {
    case 'gcash': return 'GCash';
    case 'maya': return 'Maya';
    case 'bpi': return 'BPI';
    default: return 'Cash';
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add components/TransactionRow.tsx utils/export-csv.ts utils/export-csv.web.ts app/modals/transactions.tsx
git commit -m "feat(qr): update payment method labels for maya/bpi across history and export"
```

---

### Task 4: Update admin modal

**Files:**
- Modify: `app/modals/admin.tsx`

- [ ] **Step 1: Update imports at top of `app/modals/admin.tsx`**

Replace lines 1–14:
```ts
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
import { copyToDocumentDir } from '../../utils/photos';
import { Ionicons } from '@expo/vector-icons';
import { C, F, R } from '../../constants/theme';
```
with:
```ts
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
```

Note: `setQrUri` and `setQrUris` are different names — `setQrUri` is the imported db function, `setQrUris` is the local state setter. No alias needed.

- [ ] **Step 2: Replace state and useEffect in `AdminModal`**

Replace the state declarations and `useEffect` (lines 28–35):
```ts
  const [qrUri, setQrUri] = useState<string | null>(null);

  const currentPin = step === 'verify' ? pin : newPin;
  const setCurrentPin = step === 'verify' ? setPin : setNewPin;

  useEffect(() => {
    getGcashQrUri().then(setQrUri);
  }, []);
```
with:
```ts
  const [qrUris, setQrUris] = useState<QrUris>({ gcash: null, maya: null, bpi: null });

  const currentPin = step === 'verify' ? pin : newPin;
  const setCurrentPin = step === 'verify' ? setPin : setNewPin;

  useEffect(() => {
    getAllQrUris().then(setQrUris);
  }, []);
```

- [ ] **Step 3: Replace `handlePickQr` and `handleRemoveQr`**

Replace `handlePickQr` (lines 85–100) and `handleRemoveQr` (lines 102–116) with:
```ts
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
```

(`setQrUri` = imported db function, `setQrUris` = local state setter — different names, no conflict.)

- [ ] **Step 4: Replace the QR section in the settings render**

The `if (step === 'settings')` block currently has a "GCASH QR CODE" section (lines 136–158). Replace those lines with:

```tsx
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
```

- [ ] **Step 5: Add new styles to `StyleSheet.create` in `admin.tsx`**

Add the following styles to the `StyleSheet.create({...})` block, replacing the old `qrBox`, `qrImage`, `qrBtns`, `qrReplaceBtn`, `qrRemoveBtn`, `qrBtnText`, `qrUploadArea`, `qrUploadIcon`, `qrUploadText`, `qrUploadHint` styles with:

```ts
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
```

- [ ] **Step 6: Commit**

```bash
git add app/modals/admin.tsx
git commit -m "feat(admin): replace single GCash QR with 3-row multi-QR management (GCash, Maya, BPI)"
```

---

### Task 5: Update payment modal

**Files:**
- Modify: `app/modals/payment.tsx`

- [ ] **Step 1: Update imports in `payment.tsx`**

Replace line 11:
```ts
import { getGcashQrUri } from '../../db/settings';
```
with:
```ts
import { getAllQrUris, QrUris, QrMethod, qrMethodLabel } from '../../db/settings';
```

- [ ] **Step 2: Remove the static `PAYMENT_METHODS` constant (lines 18–22)**

Delete:
```ts
const PAYMENT_METHODS: { key: PaymentMethod; label: string; iconName: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'cash', label: 'Cash', iconName: 'cash-outline' },
  { key: 'gcash', label: 'GCash', iconName: 'phone-portrait-outline' },
  { key: 'bank_transfer', label: 'Bank', iconName: 'business-outline' },
];
```

- [ ] **Step 3: Replace `qrUri` state and `useEffect` inside `PaymentModal`**

Replace line 42:
```ts
  const [qrUri, setQrUri] = useState<string | null>(null);
```
with:
```ts
  const [qrUris, setQrUris] = useState<QrUris>({ gcash: null, maya: null, bpi: null });
```

Replace lines 55–57:
```ts
  useEffect(() => {
    getGcashQrUri().then(setQrUri);
  }, []);
```
with:
```ts
  useEffect(() => {
    getAllQrUris().then(setQrUris);
  }, []);
```

- [ ] **Step 4: Add derived values inside `PaymentModal` (after the existing derived values on lines 49–53)**

After the line `const hasCartContent = items.length > 0 || bundles.length > 0;`, add:

```ts
  const activeQrUri: string | null = method !== 'cash' ? (qrUris[method as QrMethod] ?? null) : null;

  const dynamicMethods: { key: PaymentMethod; label: string; iconName: keyof typeof Ionicons.glyphMap }[] = [
    { key: 'cash', label: 'Cash', iconName: 'cash-outline' },
    ...(['gcash', 'maya', 'bpi'] as QrMethod[])
      .filter((m) => qrUris[m] !== null)
      .map((m) => ({
        key: m as PaymentMethod,
        label: qrMethodLabel(m),
        iconName: 'phone-portrait-outline' as const,
      })),
  ];
```

- [ ] **Step 5: Update `renderMethodSelector` to use `dynamicMethods`**

Replace lines 345–365:
```ts
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
              <Ionicons name={m.iconName} size={20} color={method === m.key ? C.pink : C.textSecondary} />
              <Text style={[styles.methodLabel, method === m.key && styles.methodLabelActive]}>
                {m.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </>
    );
  }
```
with:
```ts
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
              <Ionicons name={m.iconName} size={20} color={method === m.key ? C.pink : C.textSecondary} />
              <Text style={[styles.methodLabel, method === m.key && styles.methodLabelActive]}>
                {m.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </>
    );
  }
```

- [ ] **Step 6: Update QR display section in `isDigital && digitalStep === 'qr'` branch**

Replace lines 375–399 (the QR display section inside the digital step 1 render):
```tsx
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
              <Ionicons name="phone-portrait-outline" size={40} color={C.textSecondary} />
              <Text style={styles.digitalAmount}>₱{total.toFixed(2)}</Text>
              <Text style={styles.digitalHint}>No GCash QR uploaded. Go to <Ionicons name="settings-outline" size={F.md} color={C.textSecondary} /> Settings to add one.</Text>
            </View>
          ) : (
            <View style={styles.digitalBox}>
              <Ionicons name="business-outline" size={40} color={C.textSecondary} />
              <Text style={styles.digitalAmount}>₱{total.toFixed(2)}</Text>
              <Text style={styles.digitalHint}>Collect via Bank Transfer</Text>
            </View>
          )}
```
with:
```tsx
          {activeQrUri ? (
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
              <Ionicons name="phone-portrait-outline" size={40} color={C.textSecondary} />
              <Text style={styles.digitalAmount}>₱{total.toFixed(2)}</Text>
              <Text style={styles.digitalHint}>No QR uploaded. Go to Settings to add one.</Text>
            </View>
          )}
```

- [ ] **Step 7: Update full-screen modal to use `activeQrUri`**

Replace lines 428–434:
```tsx
        <Modal visible={qrFullScreen} animationType="fade" onRequestClose={() => setQrFullScreen(false)}>
          <TouchableOpacity style={styles.qrFullOverlay} onPress={() => setQrFullScreen(false)} activeOpacity={1}>
            {qrUri && <Image source={{ uri: qrUri }} style={styles.qrFull} resizeMode="contain" />}
            <Text style={styles.qrFullAmount}>₱{total.toFixed(2)}</Text>
            <Text style={styles.qrFullHint}>Tap anywhere to close</Text>
          </TouchableOpacity>
        </Modal>
```
with:
```tsx
        <Modal visible={qrFullScreen} animationType="fade" onRequestClose={() => setQrFullScreen(false)}>
          <TouchableOpacity style={styles.qrFullOverlay} onPress={() => setQrFullScreen(false)} activeOpacity={1}>
            {activeQrUri && <Image source={{ uri: activeQrUri }} style={styles.qrFull} resizeMode="contain" />}
            <Text style={styles.qrFullAmount}>₱{total.toFixed(2)}</Text>
            <Text style={styles.qrFullHint}>Tap anywhere to close</Text>
          </TouchableOpacity>
        </Modal>
```

- [ ] **Step 8: Update confirmation modal method label**

Replace lines 149–151:
```ts
    const methodLabel = confirmed.method === 'gcash' ? 'GCash'
      : confirmed.method === 'bank_transfer' ? 'Bank Transfer'
      : 'Cash';
```
with:
```ts
    const methodLabel = confirmed.method === 'gcash' ? 'GCash'
      : confirmed.method === 'maya' ? 'Maya'
      : confirmed.method === 'bpi' ? 'BPI'
      : 'Cash';
```

- [ ] **Step 9: Commit**

```bash
git add app/modals/payment.tsx
git commit -m "feat(payment): dynamic multi-QR payment buttons (GCash, Maya, BPI) with full-screen support"
```

---

### Task 6: Verify build

- [ ] **Step 1: Run the test suite**

```bash
npx jest --no-coverage
```

Expected: all tests PASS

- [ ] **Step 2: Build the web PWA**

```bash
npm run build:web
```

Expected output ends with: `PWA patch applied: manifest + SW generated`
No TypeScript errors in the output.

- [ ] **Step 3: Commit and push**

```bash
git push origin deploy/pwa
```
