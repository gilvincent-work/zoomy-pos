# zoomy-pos

A mobile-first point-of-sale app for small businesses, built with React Native and Expo. Runs on iOS, Android, and web (PWA).

## Features

### POS Screen

- Grid of active products and saved bundles
- Variant (flavor) picker per product
- Cart with per-item quantity controls
- Proceeds to checkout on tap

### Checkout & Payment

- Cash — denomination buttons, auto-calculates change
- GCash, Maya, BPI, Bank Transfer — full-screen QR code view, optional ref number
- Bundle pricing with custom bundle builder
- Proof photo capture and attach to transaction

### Transactions

- Full transaction history with items, totals, and payment method
- Filter by: Today · Week · Month · All · Custom date range (calendar picker)
- Filter by payment method
- Void transactions
- Export as ZIP (CSV + proof photos)
- Import from ZIP to restore or migrate data

### Product Catalog

- Add / edit / deactivate products and variants
- Emoji icon per product
- Export catalog to CSV; import from CSV (with product images)

### Admin

- PIN protection
- QR code upload per payment method (GCash, Maya, BPI, Bank Transfer)
- QR codes refresh automatically when returning to the payment screen

## Tech Stack

| Layer | Library |
| --- | --- |
| Framework | [Expo](https://expo.dev) (SDK 52+), Expo Router |
| Database | expo-sqlite (local SQLite, no server required) |
| File I/O | expo-file-system, expo-document-picker, expo-sharing |
| Compression | JSZip |
| Navigation | expo-router (file-based routing) |
| Icons | @expo/vector-icons (Ionicons) |

## Getting Started

```bash
npm install
npm start          # Expo dev server (scan QR with Expo Go)
npm run web        # Run in browser
npm run ios        # Run on iOS simulator
npm run android    # Run on Android emulator
```

## CSV Export / Import Format

Transactions are exported as a ZIP file containing:

- `transactions_<date>.csv` — one row per item (not per transaction)
- `proof_txn_<id>.jpg` — proof photos, if any

### Column layout

| # | Column | Example |
| --- | --- | --- |
| 1 | `#` | `1` (transaction number) |
| 2 | `Time` | `Apr 24, 2026 02:30 PM` |
| 3 | `Item` | `Iced Coffee` |
| 4 | `Flavor` | `Caramel` |
| 5 | `Qty` | `2` |
| 6 | `Item Total` | `₱160.00` |
| 7 | `Transaction Total` | `₱320.00` |
| 8 | `Payment Method` | `GCash (ref 12345)` |
| 9 | `Furbaby/IG Handle` | `@zoomy_pups` |
| 10 | `Proof Photo` | `proof_txn_42.jpg` |
| 11 | `Status` | *(blank = completed, `VOIDED` = voided)* |

Multi-item transactions repeat transaction-level fields (columns 1–2, 7–11) on each item row. The importer re-groups rows by the `#` column to reconstruct the original transaction.

> **Note:** Export and import should be performed on devices in the same timezone. The time format is locale-specific (`en-PH`) and must be parsed on a device that uses the same JS engine.

## Project Structure

```text
app/
  index.tsx              # POS screen (product grid + cart)
  modals/
    payment.tsx          # Checkout & payment methods
    transactions.tsx     # Transaction history, export, import
    products.tsx         # Product catalog management
    admin.tsx            # PIN, QR setup, settings
    bundle.tsx           # Bundle builder
components/
  CalendarRangeModal.tsx # Date range picker (From / To chips)
  ProductTile.tsx
  VariantPickerModal.tsx
  TransactionRow.tsx
db/
  schema.ts              # SQLite schema + migrations
  transactions.ts
  products.ts
  settings.ts
  saved-bundles.ts
utils/
  export-csv-shared.ts   # Shared row builder (one row per item)
  export-csv.ts          # Native export (FileSystem + Sharing)
  export-csv.web.ts      # Web export (Blob + <a download>)
  import-csv-parser.ts   # CSV → transaction groups → DB
  date-range.ts          # Date filter helpers + calendar grid
constants/
  theme.ts               # Colors (C), font sizes (F), radii (R)
```
