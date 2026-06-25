# Export Flavor Column, Custom Date Range, Payment Method Refresh Bug — Design Spec

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Three independent fixes to the transactions/export flow:
1. Export CSV gets a dedicated, filterable Flavor column (currently flavor/variant is omitted entirely from export).
2. Transactions screen gets a custom date-range filter via a calendar picker, alongside the existing Today/Week/Month/All presets.
3. Fix the Payment screen not picking up newly-uploaded QR codes (e.g. Maya) without an app restart.

**Architecture:** No new dependencies. The calendar picker is built from plain RN primitives (works on native + web via react-native-web, matching the rest of the app). The export restructure (one CSV row per item instead of per transaction) requires a matching rewrite of the CSV importer so re-importing exported files still works.

---

## 1. Export: Flavor column (one row per item)

### Problem
`utils/export-csv.ts` / `utils/export-csv.web.ts` `formatItems()` collapses every item in a transaction into one cell (e.g. `"2 Mango Juice, 1 Jerky Treats"`), using only `product_name`. The variant/flavor (`variant_name`) is never included anywhere in the export. There is no way to filter or pivot by flavor in a spreadsheet.

### New CSV layout
One row per **item line**, not per transaction. Transaction-level fields repeat across every row that belongs to the same transaction.

```
#, Time, Item, Flavor, Qty, Item Total, Transaction Total, Payment Method, Furbaby/IG Handle, Proof Photo, Status
```

| Column | Source | Notes |
|---|---|---|
| `#` | transaction index (1-based, same on every row of a transaction) | for grouping/pivoting back into transactions |
| `Time` | `transaction.created_at` | repeated per row |
| `Item` | `transaction_item.product_name` | |
| `Flavor` | `transaction_item.variant_name` | blank if item has no variant |
| `Qty` | `transaction_item.quantity` | |
| `Item Total` | `price * quantity` | bundle sub-items show ₱0.00 (bundle items are stored with `price: 0`; unchanged behavior, just now visible per-row) |
| `Transaction Total` | `transaction.total` | repeated per row; replaces today's `Total Sales` column. Avoids double-counting risk if someone naively sums every row — the transaction-level number is constant per group, not additive |
| `Payment Method` | unchanged (`formatPaymentMethod`) | repeated per row |
| `Furbaby/IG Handle` | unchanged | repeated per row |
| `Proof Photo` | unchanged | repeated per row (same filename) |
| `Status` | unchanged | repeated per row |

A transaction with zero items in `transaction.items` (shouldn't happen in practice, but defensively) emits no rows — same as today where `formatItems` would produce an empty string.

### Shared formatting module
`export-csv.ts` and `export-csv.web.ts` currently duplicate `csvCell`, `formatTime`, `formatItems`, `formatPaymentMethod`, `proofFileName` verbatim. Extract these into a new `utils/export-csv-shared.ts`:
- `csvCell(value): string`
- `formatTime(isoString): string`
- `formatPaymentMethod(method, refNumber, isBundle): string`
- `proofFileName(transactionId): string`
- `buildItemRows(transactions: Transaction[]): string[][]` — the new row-expansion logic (transaction → one or more item rows), shared by both platforms. Takes the header-less cell arrays; platform files still own the header constant, the photo-zipping (FileSystem vs fetch/blob), and the final `Sharing.shareAsync` / `<a download>` step.

### Export label / filename
`handleExport()` in `transactions.tsx` derives a `label` from the active date filter for the export filename (e.g. `zoomy-sales-today-2026-06-25.zip`). Add a `custom` case (see §2) producing e.g. `zoomy-sales-2026-06-01_to_2026-06-15-2026-06-25.zip`.

---

## 2. Transactions: custom date-range calendar picker

### Problem
`DATE_FILTERS` in `app/modals/transactions.tsx` only offers four fixed presets (Today/Week/Month/All). There's no way to view an arbitrary range (e.g. "Jun 1–15").

### UI
Add a 5th filter button, `{ key: 'custom', label: 'Custom' }`, appended to `DATE_FILTERS`. Tapping it opens a new modal (`CalendarRangeModal`, defined inline in `transactions.tsx` or as a new `components/CalendarRangeModal.tsx` if it grows past ~150 lines) containing:
- Month header with `‹ Month Year ›` navigation (prev/next month arrows).
- A 7-column grid of day cells for the visible month (plain `View`/`Text`/`Pressable`, no library).
- Tap a day to set the range start. Tap a second day to set the range end (if the second tap is before the first, swap so start ≤ end). Tapping again after a range is set starts a new selection.
- Days within the selected range are highlighted; start/end days get a stronger highlight.
- Footer: "Clear" (resets selection) and "Apply" (closes modal, commits the range, sets `dateFilter = 'custom'`).

### State & filtering
```typescript
type DateFilter = 'today' | 'week' | 'month' | 'all' | 'custom';
const [customRange, setCustomRange] = useState<{ start: Date; end: Date } | null>(null);
```
`getFilterStart` (start-only) is replaced/extended by a `getFilterRange(filter, customRange): { start: Date | null; end: Date | null }` so `'custom'` can supply both bounds (end = end-of-day, `23:59:59.999`, so the end date is inclusive). The `filtered` memo's date check becomes:
```typescript
if (start) result = result.filter((t) => new Date(t.created_at) >= start);
if (end) result = result.filter((t) => new Date(t.created_at) <= end);
```
Today/Week/Month/All behave exactly as before (no `end` bound).

### Button label
The "Custom" filter button shows the literal label "Custom" until a range is applied, then shows the compact range (e.g. "Jun 1–15" same year, or "Jun 28–Jul 2" across months/years gets full dates). Tapping the button again while `dateFilter === 'custom'` reopens the picker pre-filled with the current range for adjustment.

---

## 3. CSV importer rewrite (required by §1)

### Problem
`utils/import-csv-parser.ts` assumes one CSV row = one transaction: it dedupes on `(total, created_at-minute)` and parses items out of a single combined "Qty. & Items" cell via regex. Switching the export to one row per item breaks this importer for any file exported under the new format. This is a required change, not optional — without it, the import feature regresses.

### New parsing approach
`processCSV` groups consecutive data rows by the `#` column (rows sharing the same `#` belong to one transaction — exported rows for one transaction are always contiguous) before processing:

```typescript
function groupRowsByTransaction(dataLines: string[]): string[][][] {
  // groups consecutive rows with the same `#` cell into one array
}
```

For each group:
- `Time`, `Transaction Total`, `Payment Method`, `Furbaby/IG Handle`, `Proof Photo`, `Status` are read from the **first row** of the group (identical across the group).
- `items` is built by reading `Item`, `Flavor`, `Qty`, `Item Total` from **every row** in the group:
  ```typescript
  { productName: string; variantName: string | null; quantity: number; price: number }[]
  ```
  `price` is derived as `Item Total / Qty` (falls back to `0` if `Qty` is `0` to avoid `NaN`/`Infinity`).
- Dedup check uses `Transaction Total` (not per-row `Item Total`) against `transactionExists(createdAtMinute, total)` — unchanged dedup semantics, just reading the renamed/repositioned column.

### `importTransaction` gains fidelity
Today, `importTransaction`'s `items` param is `{ productName, quantity }[]` and always inserts `price = 0, variant_id = null, variant_name = null` — flavor and price were already silently discarded on import, even before this change. Since the new export carries both, widen the type:
```typescript
items: { productName: string; variantName?: string | null; quantity: number; price?: number }[]
```
and insert `price ?? 0` / `variant_name ?? null` into `transaction_items`. This is a strict improvement (no existing behavior relies on price/variant being zeroed on import) and keeps flavor data intact through an export → import round trip.

### Backward compatibility with old exports
Out of scope: re-importing a ZIP exported by the *old* per-transaction format is not required to keep working, per product priorities — this app has no external users exchanging historical export files, and old exports remain readable as plain CSV/spreadsheets regardless. The importer targets the new format only.

---

## 4. Payment method picker refresh bug (Maya)

### Root cause
`app/modals/payment.tsx` loads QR codes once on mount:
```typescript
useEffect(() => { getAllQrUris().then(setQrUris); }, []);
```
Every other screen in the app (`transactions.tsx`, `products.tsx`, `bundle.tsx`, `index.tsx`) uses `useFocusEffect` instead, refetching each time the screen regains focus — because React Navigation keeps screens alive in the stack rather than unmounting them on back-navigation. If a Payment screen instance loaded before a QR was uploaded in Admin Settings stays alive in the stack, it never sees the new QR, so that method (e.g. Maya) stays missing from `dynamicMethods` until the app fully restarts.

### Fix
Replace the `useEffect` in `payment.tsx` with:
```typescript
useFocusEffect(
  useCallback(() => { getAllQrUris().then(setQrUris); }, [])
);
```
matching the existing pattern elsewhere, importing `useFocusEffect` from `expo-router` (consistent with `transactions.tsx`) and `useCallback` from `react`.

---

## 5. Files touched

| File | Change |
|---|---|
| `utils/export-csv-shared.ts` | **new** — shared formatting + row-expansion logic |
| `utils/export-csv.ts` | use shared module, emit one row per item |
| `utils/export-csv.web.ts` | use shared module, emit one row per item |
| `utils/import-csv-parser.ts` | group rows by `#`, parse Item/Flavor/Qty/Item Total per row, carry variant + price through |
| `db/transactions.ts` | widen `importTransaction`'s `items` param to accept `variantName`/`price`; insert them instead of hardcoded `null`/`0` |
| `app/modals/transactions.tsx` | add `custom` date filter, `CalendarRangeModal`, range-aware filtering, export label for custom range |
| `app/modals/payment.tsx` | swap `useEffect` → `useFocusEffect` for QR loading |
| `__tests__/utils/import-csv-parser.test.ts` | update existing tests for new row format; add grouping test cases |

---

## 6. Testing

- Unit tests for `import-csv-parser.ts`: single-item transaction (one row), multi-item transaction (grouped rows reconstructed correctly), bundle transaction (price 0 sub-items, `Transaction Total` preserved), variant/flavor round-trip, dedup still works off `Transaction Total`.
- Manual: export a mix of single-item, multi-item, and bundle transactions; confirm CSV opens cleanly in a spreadsheet with Flavor filterable; re-import the same ZIP and confirm `skipped` count matches (no duplicate insert) and re-imported items retain flavor.
- Manual: select a custom date range spanning a month boundary and confirm filtered count/total match expectations; export with a custom range and check the resulting filename.
- Manual: upload a Maya QR in Admin Settings while a Payment screen is still alive earlier in the navigation stack (open Payment, back out without confirming, go to Admin, upload Maya QR, return to Payment) — confirm Maya now appears without restarting the app.
