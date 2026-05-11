# Import Transactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Import button to the transactions tab that parses a previously-exported zoomy ZIP file (CSV + proof photos) and inserts the transactions into the local SQLite database.

**Architecture:** New shared `utils/import-csv-parser.ts` contains all parsing logic (pure functions + `processCSV`). Platform entry points `utils/import-csv.ts` (native) and `utils/import-csv.web.ts` (web) handle file picking and delegate to the parser. Two new DB functions (`importTransaction`, `transactionExists`) are added to `db/transactions.ts`. The Import button is placed next to Export in the summary bar of `app/modals/transactions.tsx`.

**Tech Stack:** JSZip (already installed), expo-document-picker (native only, to install), expo-file-system (native, already installed), React Native file input (web)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `db/transactions.ts` | Modify | Add `importTransaction` and `transactionExists` |
| `utils/import-csv-parser.ts` | Create | Pure CSV parsing helpers + `processCSV` (shared by both platforms) |
| `utils/import-csv.ts` | Create | Native entry: DocumentPicker → FileSystem → `processCSV` |
| `utils/import-csv.web.ts` | Create | Web entry: hidden file input → `processCSV` |
| `app/modals/transactions.tsx` | Modify | Add Import button, handler, loading state |
| `__tests__/db/transactions.test.ts` | Modify | Add tests for `importTransaction` and `transactionExists` |
| `__tests__/utils/import-csv-parser.test.ts` | Create | Tests for parsing helpers and `processCSV` |

> **Note on pattern deviation:** The existing export utilities (`export-csv.ts` / `export-csv.web.ts`) duplicate helper functions across both files. For import, the shared logic is substantially larger, so a shared `import-csv-parser.ts` module is introduced instead of duplicating code.

---

## Task 1: DB functions — `importTransaction` and `transactionExists`

**Files:**
- Modify: `db/transactions.ts`
- Modify: `__tests__/db/transactions.test.ts`

**Context:** The existing `insertTransaction` hardcodes `created_at = new Date().toISOString()` and `status = 'completed'`. Imports need explicit values for both. `transactionExists` is a dedup check using minute-precision timestamp matching.

- [ ] **Step 1: Write failing tests for `importTransaction`**

Open `__tests__/db/transactions.test.ts` and add after the existing `describe('getAllTransactions', ...)` block:

```typescript
import {
  insertTransaction,
  voidTransaction,
  getAllTransactions,
  importTransaction,
  transactionExists,
} from '../../db/transactions';
import { mockDb } from '../../__mocks__/expo-sqlite';
```

(Update the import at the top of the file — add `importTransaction` and `transactionExists` to the existing import.)

Then add at the bottom of the file:

```typescript
describe('importTransaction', () => {
  it('inserts with provided createdAt and status', async () => {
    mockDb.runAsync
      .mockResolvedValueOnce({ lastInsertRowId: 42, changes: 1 })
      .mockResolvedValue({ lastInsertRowId: 99, changes: 1 });

    const id = await importTransaction({
      total: 140,
      cashTendered: 140,
      change: 0,
      paymentMethod: 'gcash',
      status: 'completed',
      createdAt: '2026-04-24T07:36:00.000Z',
      items: [{ productName: 'jerky treats', quantity: 1 }],
    });

    expect(mockDb.runAsync).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT INTO transactions'),
      expect.arrayContaining([140, 140, 0, 'gcash', '2026-04-24T07:36:00.000Z', 'completed'])
    );
    expect(id).toBe(42);
  });

  it('inserts items with product_id=0 and price=0', async () => {
    mockDb.runAsync
      .mockResolvedValueOnce({ lastInsertRowId: 42, changes: 1 })
      .mockResolvedValue({ lastInsertRowId: 99, changes: 1 });

    await importTransaction({
      total: 140,
      cashTendered: 140,
      change: 0,
      paymentMethod: 'gcash',
      status: 'completed',
      createdAt: '2026-04-24T07:36:00.000Z',
      items: [{ productName: 'jerky treats', quantity: 1 }],
    });

    expect(mockDb.runAsync).toHaveBeenNthCalledWith(
      2,
      'INSERT INTO transaction_items (transaction_id, product_id, product_name, price, quantity, variant_id, variant_name) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [42, 0, 'jerky treats', 0, 1, null, null]
    );
  });

  it('stores voided status correctly', async () => {
    mockDb.runAsync.mockResolvedValue({ lastInsertRowId: 1, changes: 1 });

    await importTransaction({
      total: 140,
      cashTendered: 140,
      change: 0,
      paymentMethod: 'cash',
      status: 'voided',
      createdAt: '2026-04-24T07:36:00.000Z',
      items: [],
    });

    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO transactions'),
      expect.arrayContaining(['voided'])
    );
  });
});

describe('transactionExists', () => {
  it('returns true when a matching transaction exists', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ id: 5 });
    const exists = await transactionExists('2026-04-24T07:36', 140);
    expect(exists).toBe(true);
    expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
      expect.stringContaining('substr(created_at, 1, 16)'),
      [140, '2026-04-24T07:36']
    );
  });

  it('returns false when no matching transaction exists', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce(null);
    const exists = await transactionExists('2026-04-24T07:36', 140);
    expect(exists).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest __tests__/db/transactions.test.ts --no-coverage
```

Expected: FAIL — `importTransaction` and `transactionExists` are not exported yet.

- [ ] **Step 3: Implement `importTransaction` and `transactionExists` in `db/transactions.ts`**

Add after the `insertTransaction` function (after line 70):

```typescript
export async function importTransaction(data: {
  total: number;
  cashTendered: number;
  change: number;
  paymentMethod: PaymentMethod;
  refNumber?: string;
  proofPhotoUri?: string;
  customerHandle?: string;
  isBundle?: boolean;
  status: 'completed' | 'voided';
  createdAt: string;
  items: { productName: string; quantity: number }[];
}): Promise<number> {
  const db = await getDatabase();

  const result = await db.runAsync(
    'INSERT INTO transactions (total, cash_tendered, change, payment_method, ref_number, proof_photo_uri, customer_handle, is_bundle, status, created_at, remarks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [data.total, data.cashTendered, data.change, data.paymentMethod, data.refNumber ?? null, data.proofPhotoUri ?? null, data.customerHandle ?? null, data.isBundle ? 1 : 0, data.status, data.createdAt, null]
  );

  const transactionId = result.lastInsertRowId;

  for (const item of data.items) {
    await db.runAsync(
      'INSERT INTO transaction_items (transaction_id, product_id, product_name, price, quantity, variant_id, variant_name) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [transactionId, 0, item.productName, 0, item.quantity, null, null]
    );
  }

  return transactionId;
}

export async function transactionExists(createdAtMinute: string, total: number): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM transactions WHERE total = ? AND substr(created_at, 1, 16) = ?',
    [total, createdAtMinute]
  );
  return row !== null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest __tests__/db/transactions.test.ts --no-coverage
```

Expected: All tests PASS (existing + 5 new).

- [ ] **Step 5: Commit**

```bash
git add db/transactions.ts __tests__/db/transactions.test.ts
git commit -m "feat(db): add importTransaction and transactionExists"
```

---

## Task 2: Shared CSV parser — `utils/import-csv-parser.ts`

**Files:**
- Create: `utils/import-csv-parser.ts`
- Create: `__tests__/utils/import-csv-parser.test.ts`

**Context:** This file holds all the parsing logic shared between the web and native import utilities. It is exported for testability. `processCSV` is the main function: it takes a CSV string and a JSZip instance, and returns import counts.

The ZIP export format (from `utils/export-csv.ts`) is:
- CSV header: `#,Time,Qty. & Items,Total Sales,Payment Method,Furbaby/IG Handle,Proof Photo,Status`
- Example row: `1,"Apr 24, 2026 03:36 PM",1 jerky treats,₱140.00,GCash,,proof_txn_1.jpg,`

- [ ] **Step 1: Write failing tests**

Create `__tests__/utils/import-csv-parser.test.ts`:

```typescript
import { parseCSVRow, parseItems, parsePaymentMethod, processCSV } from '../../utils/import-csv-parser';

jest.mock('../../db/transactions', () => ({
  importTransaction: jest.fn().mockResolvedValue(1),
  transactionExists: jest.fn().mockResolvedValue(false),
}));

import { importTransaction, transactionExists } from '../../db/transactions';
const mockImport = importTransaction as jest.Mock;
const mockExists = transactionExists as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('parseCSVRow', () => {
  it('splits a simple row by commas', () => {
    expect(parseCSVRow('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('handles quoted fields containing commas', () => {
    expect(parseCSVRow('"Apr 24, 2026 03:36 PM",140')).toEqual([
      'Apr 24, 2026 03:36 PM',
      '140',
    ]);
  });

  it('handles escaped double quotes inside quoted fields', () => {
    expect(parseCSVRow('"say ""hi""",b')).toEqual(['say "hi"', 'b']);
  });

  it('handles trailing empty cell', () => {
    expect(parseCSVRow('a,b,')).toEqual(['a', 'b', '']);
  });
});

describe('parseItems', () => {
  it('parses a single item', () => {
    expect(parseItems('1 jerky treats')).toEqual([
      { quantity: 1, productName: 'jerky treats' },
    ]);
  });

  it('parses multiple items', () => {
    expect(parseItems('2 dog food, 1 cat toy')).toEqual([
      { quantity: 2, productName: 'dog food' },
      { quantity: 1, productName: 'cat toy' },
    ]);
  });

  it('handles product names with numbers', () => {
    expect(parseItems('1 2kg dog food')).toEqual([
      { quantity: 1, productName: '2kg dog food' },
    ]);
  });
});

describe('parsePaymentMethod', () => {
  it('maps GCash label to gcash', () => {
    expect(parsePaymentMethod('GCash')).toMatchObject({ paymentMethod: 'gcash', refNumber: null, isBundle: false });
  });

  it('extracts ref number from parentheses', () => {
    expect(parsePaymentMethod('GCash (ref123)')).toMatchObject({ paymentMethod: 'gcash', refNumber: 'ref123' });
  });

  it('detects Bundle suffix', () => {
    expect(parsePaymentMethod('GCash · Bundle')).toMatchObject({ isBundle: true });
  });

  it('handles ref number and bundle together', () => {
    expect(parsePaymentMethod('Maya (abc) · Bundle')).toMatchObject({
      paymentMethod: 'maya',
      refNumber: 'abc',
      isBundle: true,
    });
  });

  it('maps Bank Transfer label', () => {
    expect(parsePaymentMethod('Bank Transfer')).toMatchObject({ paymentMethod: 'bank_transfer' });
  });

  it('maps Cash label', () => {
    expect(parsePaymentMethod('Cash')).toMatchObject({ paymentMethod: 'cash' });
  });
});

describe('processCSV', () => {
  const mockZip = {
    file: jest.fn().mockReturnValue({
      async: jest.fn().mockResolvedValue('base64photodata'),
    }),
  };

  const sampleCSV = [
    '#,Time,Qty. & Items,Total Sales,Payment Method,Furbaby/IG Handle,Proof Photo,Status',
    '1,"Apr 24, 2026 03:36 PM",1 jerky treats,₱140.00,GCash,,proof_txn_1.jpg,',
  ].join('\n');

  it('imports one transaction and returns correct counts', async () => {
    const result = await processCSV(sampleCSV, mockZip as any);
    expect(result).toEqual({ imported: 1, skipped: 0, failed: 0, photosMissing: 0 });
    expect(mockImport).toHaveBeenCalledTimes(1);
  });

  it('skips duplicate transactions', async () => {
    mockExists.mockResolvedValueOnce(true);
    const result = await processCSV(sampleCSV, mockZip as any);
    expect(result).toEqual({ imported: 0, skipped: 1, failed: 0, photosMissing: 0 });
    expect(mockImport).not.toHaveBeenCalled();
  });

  it('counts photosMissing when photo file not in ZIP', async () => {
    const zipWithoutPhoto = { file: jest.fn().mockReturnValue(null) };
    const result = await processCSV(sampleCSV, zipWithoutPhoto as any);
    expect(result.imported).toBe(1);
    expect(result.photosMissing).toBe(1);
    expect(mockImport).toHaveBeenCalledWith(
      expect.objectContaining({ proofPhotoUri: undefined })
    );
  });

  it('imports voided transactions correctly', async () => {
    const voidedCSV = [
      '#,Time,Qty. & Items,Total Sales,Payment Method,Furbaby/IG Handle,Proof Photo,Status',
      '1,"Apr 24, 2026 03:36 PM",1 jerky treats,₱140.00,Cash,,,VOIDED',
    ].join('\n');
    await processCSV(voidedCSV, mockZip as any);
    expect(mockImport).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'voided' })
    );
  });

  it('counts failed for unparseable rows', async () => {
    const badCSV = [
      '#,Time,Qty. & Items,Total Sales,Payment Method,Furbaby/IG Handle,Proof Photo,Status',
      'not,enough,cells',
    ].join('\n');
    const result = await processCSV(badCSV, mockZip as any);
    expect(result).toMatchObject({ imported: 0, failed: 1 });
  });

  it('throws when transactions.csv header is missing', async () => {
    await expect(processCSV('', mockZip as any)).rejects.toThrow('Invalid CSV');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest __tests__/utils/import-csv-parser.test.ts --no-coverage
```

Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Create `utils/import-csv-parser.ts`**

```typescript
import JSZip from 'jszip';
import type { PaymentMethod } from '../db/transactions';
import { importTransaction, transactionExists } from '../db/transactions';

export type ImportResult = {
  imported: number;
  skipped: number;
  failed: number;
  photosMissing: number;
};

export function parseCSVRow(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}

export function parseItems(itemsStr: string): { productName: string; quantity: number }[] {
  const results: { productName: string; quantity: number }[] = [];
  const regex = /(\d+)\s+(.+?)(?=,\s+\d+|$)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(itemsStr)) !== null) {
    results.push({ quantity: parseInt(match[1], 10), productName: match[2].trim() });
  }
  return results;
}

export function parsePaymentMethod(methodStr: string): {
  paymentMethod: PaymentMethod;
  refNumber: string | null;
  isBundle: boolean;
} {
  const isBundle = methodStr.includes(' · Bundle');
  const withoutBundle = methodStr.replace(' · Bundle', '').trim();
  const refMatch = withoutBundle.match(/\((.+?)\)/);
  const refNumber = refMatch ? refMatch[1] : null;
  const label = withoutBundle.replace(/\s*\(.+?\)/, '').trim();

  const methodMap: Record<string, PaymentMethod> = {
    GCash: 'gcash',
    Maya: 'maya',
    BPI: 'bpi',
    'Bank Transfer': 'bank_transfer',
    Cash: 'cash',
  };

  return { paymentMethod: methodMap[label] ?? 'cash', refNumber, isBundle };
}

export async function processCSV(csvText: string, zip: JSZip): Promise<ImportResult> {
  const lines = csvText.split('\n').filter((l) => l.trim());
  const [header, ...dataLines] = lines;

  if (!header || !header.includes('Time')) throw new Error('Invalid CSV format.');

  let imported = 0, skipped = 0, failed = 0, photosMissing = 0;

  for (const line of dataLines) {
    try {
      const cells = parseCSVRow(line);
      if (cells.length < 8) { failed++; continue; }

      const [, timeStr, itemsStr, totalStr, methodStr, handleStr, photoFilename, statusStr] = cells;

      const total = parseFloat(totalStr.replace('₱', ''));
      if (isNaN(total)) { failed++; continue; }

      const createdAt = new Date(timeStr).toISOString();
      const createdAtMinute = createdAt.slice(0, 16);

      if (await transactionExists(createdAtMinute, total)) { skipped++; continue; }

      const items = parseItems(itemsStr);
      const { paymentMethod, refNumber, isBundle } = parsePaymentMethod(methodStr);
      const customerHandle = handleStr.trim() || null;
      const status: 'completed' | 'voided' = statusStr.trim() === 'VOIDED' ? 'voided' : 'completed';

      let proofPhotoUri: string | undefined;
      if (photoFilename.trim()) {
        const photoFile = zip.file(photoFilename.trim());
        if (photoFile) {
          const base64 = await photoFile.async('base64');
          proofPhotoUri = `data:image/jpeg;base64,${base64}`;
        } else {
          photosMissing++;
        }
      }

      await importTransaction({
        total,
        cashTendered: total,
        change: 0,
        paymentMethod,
        refNumber: refNumber ?? undefined,
        proofPhotoUri,
        customerHandle: customerHandle ?? undefined,
        isBundle,
        status,
        createdAt,
        items,
      });

      imported++;
    } catch {
      failed++;
    }
  }

  return { imported, skipped, failed, photosMissing };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest __tests__/utils/import-csv-parser.test.ts --no-coverage
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add utils/import-csv-parser.ts __tests__/utils/import-csv-parser.test.ts
git commit -m "feat(import): add shared CSV parser and tests"
```

---

## Task 3: Web import entry point — `utils/import-csv.web.ts`

**Files:**
- Create: `utils/import-csv.web.ts`

**Context:** Web platform entry point. Creates a hidden `<input type="file">` to let the user pick a ZIP, reads it as ArrayBuffer, passes to JSZip, then calls `processCSV`. Returns early with zeros if user cancels. No tests needed here — the platform-specific file picking glue is not unit-testable; the logic under test is in `import-csv-parser.ts`.

- [ ] **Step 1: Create `utils/import-csv.web.ts`**

```typescript
import JSZip from 'jszip';
import { processCSV, ImportResult } from './import-csv-parser';

export async function importTransactionsZip(): Promise<ImportResult> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip';
    input.style.display = 'none';
    document.body.appendChild(input);

    const cleanup = () => {
      if (input.parentNode) document.body.removeChild(input);
    };

    // Detect cancel: window refocuses after picker closes with no selection
    const onWindowFocus = () => {
      setTimeout(() => {
        if (!input.files || input.files.length === 0) {
          cleanup();
          window.removeEventListener('focus', onWindowFocus);
          resolve({ imported: 0, skipped: 0, failed: 0, photosMissing: 0 });
        }
      }, 500);
    };
    window.addEventListener('focus', onWindowFocus);

    input.onchange = async () => {
      window.removeEventListener('focus', onWindowFocus);
      const file = input.files?.[0];
      cleanup();
      if (!file) {
        resolve({ imported: 0, skipped: 0, failed: 0, photosMissing: 0 });
        return;
      }
      try {
        const arrayBuffer = await file.arrayBuffer();
        const zip = await JSZip.loadAsync(arrayBuffer);
        const csvFile = zip.file('transactions.csv');
        if (!csvFile) throw new Error('transactions.csv not found in this file.');
        const csvText = await csvFile.async('string');
        resolve(await processCSV(csvText, zip));
      } catch (err) {
        reject(err);
      }
    };

    input.click();
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add utils/import-csv.web.ts
git commit -m "feat(import): add web import entry point"
```

---

## Task 4: Native import entry point — `utils/import-csv.ts`

**Files:**
- Create: `utils/import-csv.ts`

**Context:** Native platform entry point. Requires `expo-document-picker` (not yet installed). Uses DocumentPicker to let the user pick a ZIP, reads it as base64 via FileSystem, passes to JSZip, then calls `processCSV`.

- [ ] **Step 1: Install `expo-document-picker`**

```bash
npx expo install expo-document-picker
```

Expected: Package installed, `package.json` updated.

- [ ] **Step 2: Create `utils/import-csv.ts`**

```typescript
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import JSZip from 'jszip';
import { processCSV, ImportResult } from './import-csv-parser';

export async function importTransactionsZip(): Promise<ImportResult> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/zip',
    copyToCacheDirectory: true,
  });

  if (result.canceled) {
    return { imported: 0, skipped: 0, failed: 0, photosMissing: 0 };
  }

  const asset = result.assets[0];
  const base64 = await FileSystem.readAsStringAsync(asset.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const zip = await JSZip.loadAsync(base64, { base64: true });

  const csvFile = zip.file('transactions.csv');
  if (!csvFile) throw new Error('transactions.csv not found in this file.');

  const csvText = await csvFile.async('string');
  return processCSV(csvText, zip);
}
```

- [ ] **Step 3: Commit**

```bash
git add utils/import-csv.ts package.json package-lock.json
git commit -m "feat(import): add native import entry point"
```

---

## Task 5: Import button in `app/modals/transactions.tsx`

**Files:**
- Modify: `app/modals/transactions.tsx`

**Context:** The Import button goes next to the Export button in the `summaryBar`. Both buttons are wrapped in a new `summaryActions` view. A loading state (`importing`) disables the button and shows "Importing…" while the import runs. After completion, the transaction list is refreshed and an Alert is shown.

The current summaryBar layout (lines 208–216):
```tsx
<View style={styles.summaryBar}>
  <View style={styles.summaryLeft}>
    <Text style={styles.summaryCount}>...</Text>
    <Text style={styles.summaryTotal}>...</Text>
  </View>
  <TouchableOpacity style={styles.exportBtn} onPress={handleExport}>
    <Text style={styles.exportBtnText}>↑ Export</Text>
  </TouchableOpacity>
</View>
```

- [ ] **Step 1: Add `importTransactionsZip` import**

At the top of `app/modals/transactions.tsx`, add after the `exportTransactionsZip` import line:

```typescript
import { importTransactionsZip } from '../../utils/import-csv';
```

So the imports block becomes:
```typescript
import { exportTransactionsZip } from '../../utils/export-csv';
import { importTransactionsZip } from '../../utils/import-csv';
```

- [ ] **Step 2: Add `importing` state and `handleImport` function**

First, add the state declaration with the other `useState` calls near the top of `TransactionsScreen` (around line 112, where `selected`, `remarksInput`, etc. are declared):

```typescript
const [importing, setImporting] = useState(false);
```

Then, add the handler function inside the component after the `handleExport` function (around line 150):

```typescript
async function handleImport() {
  setImporting(true);
  try {
    const { imported, skipped, failed, photosMissing } = await importTransactionsZip();

    if (imported === 0 && skipped === 0 && failed === 0) {
      // User cancelled picker — do nothing
      return;
    }

    const all = await getAllTransactions();
    setTransactions(all);

    const parts: string[] = [];
    if (imported > 0) parts.push(`${imported} transaction${imported !== 1 ? 's' : ''} imported`);
    if (skipped > 0) parts.push(`${skipped} duplicate${skipped !== 1 ? 's' : ''} skipped`);
    if (failed > 0) parts.push(`${failed} row${failed !== 1 ? 's' : ''} failed`);
    if (photosMissing > 0) parts.push(`${photosMissing} photo${photosMissing !== 1 ? 's' : ''} missing`);

    if (imported === 0 && skipped > 0) {
      Alert.alert('Nothing new', 'All transactions already exist.');
    } else {
      Alert.alert('Import complete', parts.join(', ') + '.');
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Could not import file. Please try again.';
    Alert.alert('Import failed', message);
  } finally {
    setImporting(false);
  }
}
```

- [ ] **Step 3: Update `summaryBar` JSX to add the Import button**

Replace the existing summaryBar block:
```tsx
<View style={styles.summaryBar}>
  <View style={styles.summaryLeft}>
    <Text style={styles.summaryCount}>{filtered.length} transaction{filtered.length !== 1 ? 's' : ''}</Text>
    <Text style={styles.summaryTotal}>₱{filteredTotal.toFixed(2)}</Text>
  </View>
  <TouchableOpacity style={styles.exportBtn} onPress={handleExport}>
    <Text style={styles.exportBtnText}><Ionicons name="arrow-up" size={F.xs} color={C.textSecondary} /> Export</Text>
  </TouchableOpacity>
</View>
```

With:
```tsx
<View style={styles.summaryBar}>
  <View style={styles.summaryLeft}>
    <Text style={styles.summaryCount}>{filtered.length} transaction{filtered.length !== 1 ? 's' : ''}</Text>
    <Text style={styles.summaryTotal}>₱{filteredTotal.toFixed(2)}</Text>
  </View>
  <View style={styles.summaryActions}>
    <TouchableOpacity style={styles.exportBtn} onPress={handleImport} disabled={importing}>
      <Text style={styles.exportBtnText}>
        <Ionicons name="arrow-down" size={F.xs} color={C.textSecondary} /> {importing ? 'Importing…' : 'Import'}
      </Text>
    </TouchableOpacity>
    <TouchableOpacity style={styles.exportBtn} onPress={handleExport}>
      <Text style={styles.exportBtnText}>
        <Ionicons name="arrow-up" size={F.xs} color={C.textSecondary} /> Export
      </Text>
    </TouchableOpacity>
  </View>
</View>
```

- [ ] **Step 4: Add `summaryActions` style**

In the `StyleSheet.create({...})` block, add after `summaryTotal`:

```typescript
summaryActions: { flexDirection: 'row', gap: 8 },
```

- [ ] **Step 5: Run the full test suite**

```bash
npx jest --no-coverage
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add app/modals/transactions.tsx
git commit -m "feat(transactions): add Import button alongside Export"
```

---

## Task 6: Final integration check

**Files:** none (manual verification)

- [ ] **Step 1: Start the dev server**

```bash
npx expo start --web
```

- [ ] **Step 2: Verify Import button appears**

Open the app in a browser. Navigate to the Transactions tab. Confirm the Import button appears to the left of Export in the summary bar.

- [ ] **Step 3: Test with the sample export file**

The sample ZIP is at `/Users/gilvincent.amante/Desktop/zoomy-pos/zoomy-sales-today-2026-04-24/`. To test, first compress it:

```bash
cd /Users/gilvincent.amante/Desktop/zoomy-pos/zoomy-sales-today-2026-04-24 && zip -r /tmp/test-import.zip transactions.csv proof_txn_1.jpg
```

Click Import, select `/tmp/test-import.zip`. Expected Alert: "1 transaction imported."

- [ ] **Step 4: Test deduplication**

Click Import again with the same file. Expected Alert: "Nothing new — All transactions already exist."

- [ ] **Step 5: Commit if any fixes were needed, then push**

```bash
git push origin feat/import-transaction
```
