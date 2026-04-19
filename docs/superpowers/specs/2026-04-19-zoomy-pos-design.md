# ZoomyPOS — Design Spec
**Date:** 2026-04-19  
**Project:** Offline POS for ZoomyTreats event booths  
**Stack:** React Native · Expo · SQLite (expo-sqlite)

---

## Overview

A simple offline-first mobile POS app for ZoomyTreats staff to use at events. Staff sell a small menu (under 10 items), accept cash, and manage transactions — all without internet. The app lives on a phone and never needs a backend.

---

## Architecture

**Pattern:** Single root screen + modals. The POS tile grid is always the visible home screen. All secondary functions (payment, products, transactions, admin) open as full-screen modals and close back to POS.

**Navigation:** Expo Router (file-based). Root is `POSScreen`. Modals are presented via `router.push` with modal presentation style.

**State:** React Context + `useReducer` for cart state. SQLite for all persistence via `expo-sqlite`.

---

## Screens & Modals

### POSScreen (root)
- 3-column tile grid of active products
- Each tile shows emoji + name
- Tap tile → adds 1 to cart, red badge count appears on tile
- Long-press tile → removes **all quantity** of that item from cart (no password required — order not yet paid)
- Header icons: Products (📦), Transactions (🧾), Settings (⚙️)
- Bottom bar: running total + **Charge** button
- Charge button opens PaymentModal

### PaymentModal
- Shows order summary (items, quantities, line totals)
- Total amount prominently displayed
- Denomination buttons: ₱1 · ₱5 · ₱10 · ₱20 · ₱50 · ₱100 · ₱200 · ₱500 · ₱1000
- Each tap adds that amount to cash tendered
- **Exact** button sets cash tendered = total
- Clear button resets cash tendered
- Change calculated live (cash tendered − total)
- **Confirm** button enabled only when cash tendered ≥ total
- On confirm: transaction written to SQLite, cart clears, modal closes

### ProductsModal
- List of all products (active and inactive)
- Toggle to show/hide a product on the POS tile grid (is_active)
- **+ New Product** button → inline form: name, price (numeric), emoji picker
- Tap existing product to edit name/price/emoji
- No delete — only deactivate (preserves transaction history integrity)

### TransactionsModal
- Chronological list of all transactions with timestamp, items, total, status
- Status: `completed` or `voided`
- Tap a completed transaction → shows detail + **Void Transaction** button
- Void triggers AdminModal for password verification
- On confirmed void: transaction status updated to `voided` in SQLite

### AdminModal
- Full-screen password prompt (numeric PIN)
- Used as a gate before voiding completed transactions
- Also accessible from a settings icon for changing the admin PIN
- PIN stored as SHA-256 hash in the `settings` table
- Default PIN on first launch: `0000` (user prompted to change)

---

## Data Model (SQLite)

### `products`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | |
| name | TEXT NOT NULL | |
| price | REAL NOT NULL | |
| emoji | TEXT | default '🍬' |
| is_active | INTEGER | 1 = shown on POS, 0 = hidden |
| created_at | TEXT | ISO 8601 timestamp |

### `transactions`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | |
| total | REAL NOT NULL | |
| cash_tendered | REAL NOT NULL | |
| change | REAL NOT NULL | |
| status | TEXT | 'completed' or 'voided' |
| created_at | TEXT | ISO 8601 timestamp |

### `transaction_items`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | |
| transaction_id | INTEGER FK | |
| product_id | INTEGER FK | nullable (future-proofing; products are deactivated not deleted) |
| product_name | TEXT NOT NULL | snapshot at time of sale |
| price | REAL NOT NULL | snapshot at time of sale |
| quantity | INTEGER NOT NULL | |

### `settings`
| Column | Type | Notes |
|---|---|---|
| key | TEXT PK | |
| value | TEXT NOT NULL | |

Seed row: `('admin_password_hash', sha256('0000'))`

---

## Key Flows

**Selling:**
1. Staff taps product tiles — badge count increases per tap
2. Long-press tile removes all quantity of that item from cart
3. Tap **Charge** → PaymentModal opens
4. Staff taps denomination buttons until cash tendered ≥ total
5. Change displayed — tap **Confirm**
6. Transaction + items written to SQLite; cart resets

**Voiding during an active order:**
- Long-press the tile → item removed from cart
- No password required (transaction not yet recorded)

**Voiding a completed transaction:**
1. Open TransactionsModal
2. Tap the transaction → detail view
3. Tap **Void Transaction**
4. AdminModal prompts for PIN
5. On correct PIN → `status` updated to `'voided'` in SQLite
6. Transaction remains in history (never deleted)

**Product creation:**
1. Open ProductsModal → tap **+ New Product**
2. Enter name, price, choose emoji
3. Save → `is_active = 1` → tile appears on POS grid immediately

---

## File Structure

```
app/
  index.tsx               # POSScreen (root)
  modals/
    payment.tsx           # PaymentModal
    products.tsx          # ProductsModal
    transactions.tsx      # TransactionsModal
    admin.tsx             # AdminModal (PIN gate)

components/
  ProductTile.tsx         # Tile with badge count
  DenominationButton.tsx  # Single peso denomination button
  TransactionRow.tsx      # Row in transaction list

db/
  schema.ts               # CREATE TABLE statements + seed
  products.ts             # CRUD for products
  transactions.ts         # Insert transaction + items, void
  settings.ts             # Get/set admin PIN hash

context/
  CartContext.tsx          # Cart state via useReducer

utils/
  hash.ts                 # SHA-256 PIN hashing
```

---

## Out of Scope (this version)
- Network sync / cloud backup
- Receipt printing
- Multiple staff accounts / roles
- Discounts or promo codes
- Sales reports / analytics
- Inventory / stock tracking
