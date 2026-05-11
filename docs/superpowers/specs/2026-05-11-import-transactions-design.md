# Import Transactions Feature — Design Spec

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to import a previously exported zoomy ZIP file (CSV + proof photos) back into the transaction history, preserving all data including proof images.

**Architecture:** Client-side ZIP parsing using JSZip (already a dependency). Platform-specific file picking via hidden `<input type="file">` on web and `expo-document-picker` on native. New `importTransaction` DB function handles inserts with preserved timestamps and status.

**Tech Stack:** JSZip, expo-document-picker (native), React Native file input (web), expo-sqlite

---

## 1. Architecture

### New Files
- `utils/import-csv.ts` — native implementation using `expo-document-picker` + `expo-file-system` to pick and read the ZIP, then JSZip to parse it
- `utils/import-csv.web.ts` — web implementation using a hidden `<input type="file" accept=".zip">` element, `FileReader` to read as ArrayBuffer, then JSZip to parse it

Both files export a single function:
```typescript
export async function importTransactionsZip(): Promise<{ imported: number; skipped: number; failed: number; photosMissing: number }>
```

### Modified Files
- `db/transactions.ts` — add two new functions:
  - `importTransaction(data)` — inserts a transaction with explicit `created_at` and `status`
  - `transactionExists(createdAtMinute: string, total: number): Promise<boolean>` — dedup check
- `app/modals/transactions.tsx` — add Import button next to Export, import handler, loading state

---

## 2. Data Parsing

### CSV Column Mapping

| CSV Column | Example Value | Parsed To |
|---|---|---|
| `#` | `1` | ignored (row index only) |
| `Time` | `Apr 24, 2026 03:36 PM` | `created_at` — parsed via `new Date(value)` → `.toISOString()` |
| `Qty. & Items` | `1 jerky treats, 2 dog food` | `items[]` — regex: match all `(\d+)\s+(.+?)(?=,\s+\d+|$)` |
| `Total Sales` | `₱140.00` | `total` — strip `₱`, `parseFloat` |
| `Payment Method` | `GCash (ref123) · Bundle` | `paymentMethod` + optional `refNumber` + `isBundle` flag |
| `Furbaby/IG Handle` | `@zoomypets` | `customerHandle` (nullable) |
| `Proof Photo` | `proof_txn_1.jpg` | filename → read from ZIP → `data:image/jpeg;base64,...` |
| `Status` | `VOIDED` | `status: 'voided'`; empty string → `'completed'` |

### Payment Method Parsing
- Strip optional ` · Bundle` suffix → set `isBundle = true`
- Strip optional ` (ref_number)` → extract `refNumber`
- Map remaining label: `GCash` → `gcash`, `Maya` → `maya`, `BPI` → `bpi`, `Bank Transfer` → `bank_transfer`, `Cash` → `cash`

### Fields Not Present in CSV (defaults for imported records)
- `cash_tendered` → set to `total` (as if exact payment)
- `change` → set to `0`
- `product_id` → set to `0` (no product linkage; display-only)
- `unit_price` → set to `0`

### Proof Photo Handling
- If `Proof Photo` cell is non-empty, attempt to read that filename from the ZIP
- If found: encode as `data:image/jpeg;base64,<base64>` and store as `proof_photo_uri`
- If not found or unreadable: set `proof_photo_uri` to `null`, increment `photosMissing` count

---

## 3. Deduplication

Before inserting each row, run:
```sql
SELECT id FROM transactions 
WHERE total = ? AND substr(created_at, 1, 16) = ?
```

- `total` — parsed float from the CSV row
- `substr(created_at, 1, 16)` — extracts minute-precision prefix (e.g. `2026-04-24T07:36`) from the stored ISO string
- The second `?` is the same slice from the parsed CSV timestamp converted to ISO

If any row is returned → skip this CSV row, increment `skipped` count.

---

## 4. New DB Functions

### `importTransaction`
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
}): Promise<number>
```
Inserts into `transactions` with the provided `created_at` and `status` (unlike `insertTransaction` which always uses `datetime('now')` and `'completed'`). Inserts items into `transaction_items` with `product_id = 0` and `unit_price = 0`.

### `transactionExists`
```typescript
export async function transactionExists(
  createdAtMinute: string,  // e.g. "2026-04-24T07:36"
  total: number
): Promise<boolean>
```
Returns `true` if a transaction matching that minute-precision timestamp and total already exists.

---

## 5. UI & UX

### Import Button
Placed beside the existing Export button in the summary bar of the transactions tab. Matches the secondary/ghost style of the Export button. Label: `↓ Import`.

### User Flow
1. Tap **Import** → platform file picker opens, filtered to `.zip` files
2. File selected → button changes to **"Importing…"** and is disabled
3. Import completes → `Alert` with result summary:
   - `"5 transactions imported."` (no duplicates/failures)
   - `"5 transactions imported, 1 duplicate skipped."`
   - `"5 transactions imported, 1 duplicate skipped, 1 photo missing."`
   - `"All transactions already exist — nothing imported."` (all duplicates)
4. Transaction list reloads automatically

### Error Cases
| Condition | Message |
|---|---|
| ZIP has no `transactions.csv` | `"Import failed: transactions.csv not found in this file."` |
| File is not a valid ZIP | `"Import failed: could not read this file as a ZIP."` |
| User cancels file picker | Silent — nothing happens |
| Individual row parse failure | Skip row silently, increment `failed` count, report in summary |

---

## 6. Platform Notes

**Web (`import-csv.web.ts`):**
- Create hidden `<input type="file" accept=".zip">`, append to body, click programmatically
- Read selected file as `ArrayBuffer` via `FileReader`
- Pass to JSZip: `await JSZip.loadAsync(arrayBuffer)`
- Read proof photos: `await zip.file(filename)?.async('base64')`

**Native (`import-csv.ts`):**
- `await DocumentPicker.getDocumentAsync({ type: 'application/zip' })`
- Read file as base64: `await FileSystem.readAsStringAsync(uri, { encoding: Base64 })`
- Pass to JSZip: `await JSZip.loadAsync(base64, { base64: true })`
- Read proof photos: `await zip.file(filename)?.async('base64')`
