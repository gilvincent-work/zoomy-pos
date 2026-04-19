# GCash QR Code & Payment Proof Design

## Overview

Add GCash QR code display during payment and proof-of-payment capture (reference number and/or receipt photo) for digital payment methods (GCash, Bank Transfer). Proof is displayed in transaction history for validation.

## Payment Flow — Two-Step for Digital Methods

### Step 1: QR Code Display (GCash only)

When GCash is selected in the PaymentModal:
- Show the seller's GCash QR code inline with the total amount
- "Full Screen" button expands QR to a full-screen overlay (customer-facing, easy to scan)
- "Customer Paid" button advances to Step 2
- "Cancel" dismisses the modal

Bank Transfer skips this step — shows a text prompt ("Collect via Bank Transfer") with "Customer Paid" button.

### Step 2: Proof Capture

After "Customer Paid" is tapped:
- **Reference number:** Free text field for GCash/Bank ref number
- **Receipt photo:** Camera capture button — opens device camera
- **Skip button:** Proof is recommended but not mandatory
- **Confirm Sale:** Saves transaction with proof data

Either ref number, photo, or both can be provided. Skipping saves the transaction without proof.

## QR Code Management — Admin Settings

The GCash QR code is uploaded once and reused for all transactions:
- Accessed via the existing Admin modal (⚙️ icon) after PIN verification
- New "GCash QR Code" section below "Change PIN"
- Upload from photo library via `expo-image-picker`
- Image is copied to app's document directory for persistence
- Path stored in `settings` table as `gcash_qr_uri`
- Replace and Remove buttons when a QR is already set
- If no QR is set and GCash is selected during payment, show a prompt to upload one first

## Data Storage

### Schema changes — `transactions` table

Two new nullable columns:
- `ref_number TEXT` — GCash/Bank reference number
- `proof_photo_uri TEXT` — local file path to receipt photo in app document directory

Migration: `ALTER TABLE` with `.catch(() => {})` for existing databases (same pattern as `payment_method`).

### Settings table

- `gcash_qr_uri` — path to the saved GCash QR code image

### Photo storage

**Receipt photos:**
- Captured via `expo-image-picker` (camera mode)
- Saved to device gallery via `expo-media-library` (user's backup)
- Copied to app's document directory via `expo-file-system` (app access)
- Document directory path stored in `proof_photo_uri` column

**QR code image:**
- Picked from photo library via `expo-image-picker`
- Copied to app's document directory
- Path stored in `settings` table

## Transaction History — Proof Display

### Transaction row badges

- Digital payments with proof (ref number or photo): green **✓ Proof** badge
- Digital payments without proof: red **No Proof** badge
- Cash transactions: no proof badge shown

### Transaction detail sheet

- New "PAYMENT PROOF" section below the total summary
- Shows ref number as text if present
- Shows receipt photo as small thumbnail if present
- Tap thumbnail to view full-size photo in a modal overlay
- Only shown for GCash and Bank Transfer transactions

## New Dependencies

- `expo-image-picker` — camera capture + photo library picker
- `expo-media-library` — save receipt photos to device gallery
- `expo-file-system` — copy images to app document directory

## Files Changed

- `db/schema.ts` — add `ref_number` and `proof_photo_uri` columns + migration
- `db/transactions.ts` — update `Transaction` type, `insertTransaction`, `getAllTransactions`
- `db/settings.ts` — add `getGcashQrUri`, `setGcashQrUri` functions
- `app/modals/payment.tsx` — two-step flow for digital payments, QR display, proof capture
- `app/modals/admin.tsx` — add QR upload section after PIN verification
- `app/modals/transactions.tsx` — proof badges, proof section in detail sheet, photo viewer
- `components/TransactionRow.tsx` — proof badge display

## Out of Scope

- Generating QR codes dynamically (seller uploads their existing QR)
- Proof for cash transactions
- Cloud backup of receipt photos
- Multiple QR codes (one GCash QR per device)
