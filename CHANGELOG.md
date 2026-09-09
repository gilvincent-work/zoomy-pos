# Changelog — ZoomyPOS

Notable changes to the POS app (`zoomy-pos`). The shared Coop dashboard has its
own changelog in `../zoomy-observability-dashboard/CHANGELOG.md`.

Conventions: work flows `feature → develop → staging` (never `main` without
sign-off); Conventional Commits; **no Claude co-author trailer**. POS schema
work is additive-only (`pos_*`) and developed against Staging Supabase
(`syxwixxzmytvhwhkwdvw`); the reviewed SQL is mirrored in `supabase/pos_schema.sql`.

Dates are local working dates (GMT+8). Newest first.

---

## 2026-09-09

### Void / Remarks any sale from any device — `feat(transactions)`
- Voiding and adding remarks now work on sales made on **another device**, not
  just the local one. Both write to Coop (by the shared `client_uuid`) so the
  change shows on every device; local sales also update locally.
- Merge overlays Coop's cross-device fields onto a matching local row: **void is
  monotonic** (voided on either side stays voided, never un-voided), and
  **remarks are Coop-authoritative** (an edit on another device wins, falling
  back to the local note when Coop has none).
- The void flow still goes through the Admin PIN gate; the "synced from another
  device — manage where rung up" read-only note is gone.
- Coop DB (Staging): added `status` / `remarks` / `voided_at` to `pos_orders`
  and `void_pos_order(client_uuid)` + `set_pos_order_remarks(client_uuid, text)`
  SECURITY DEFINER RPCs (granted to anon). Mirrored in `supabase/pos_schema.sql`;
  verified via anon round-trip. The Coop dashboard excludes voided sales from
  revenue and shows remarks (see the dashboard changelog).
- **Decisions:** void excludes voided from Coop revenue and shows struck-through;
  remarks visible on POS + the Coop dashboard.

### Hide the Import button on Transactions — `chore(transactions)`
- Hid the **Import** button on the Transactions screen, leaving **Export** only.
  The handler and state are kept (JSX commented out) for an easy restore.

### Admin PIN pad: landscape layout fix — `fix(admin)`
- The admin PIN screen (opened by the transaction **Void** flow) stacked
  header, dots, and keypad vertically. In a short landscape viewport that
  overflowed: the "Enter Admin PIN" header scrolled off the top and the keys
  ballooned. Landscape now lays the prompt and keypad **side by side** with a
  bounded keypad width so everything fits without scrolling. Portrait unchanged.
- **Decision:** kept the existing **Void** action (marks a sale voided, retains
  the record for audit, excludes it from totals). A hard "remove/delete
  transaction" was considered and **dropped** — void is the money-safe primitive.

### Transactions show all devices — `feat(transactions)`
- A sale rung up on one device didn't appear on another because the Transactions
  screen read only that device's local SQLite. It now **merges the local list
  with the sales pulled back from Coop** (`pos_orders`), so every device shows
  the same list regardless of platform.
  - Local rows stay the rich source (cash tendered, proof, remarks, void).
  - Other devices' sales render **read-only** (void/remarks hidden, with a
    "synced from another device" note). No device labels (per request).
- Added a shared `client_uuid` to each local sale (new column, sent as the
  `pos_orders` idempotency key) so a device's own synced sale isn't
  double-counted; legacy rows fall back to same-minute+total dedup.
- Remote read is best-effort, so the screen still works offline (local only).
- Fixed a latent bug: the full payment modal wasn't sending `payment_method`
  to Coop (only the quick Pay button did).
- Verified RLS allows `anon` `SELECT ... USING (true)` on `pos_orders` /
  `pos_order_items` via a real anon-key round-trip.

### Pull-to-refresh the product grid — `feat(catalog)`
- Pull down on the product/bundle grid to fetch Coop's latest catalog and
  re-read the local cache, so a Coop product edit shows without reloading the
  PWA. Toast reports the result (updated / up to date / couldn't reach Coop).
- **Decision:** custom `Animated` + `PanResponder` gesture, because
  `react-native-web`'s `RefreshControl` is a no-op. Captures only a downward
  drag at the top of the list (normal scroll and tile taps untouched), and
  suppresses the browser's own page-level pull-to-refresh while mounted.

## 2026-09-08

### Payment options — `feat(payments)`
- Added a segmented **Cash / GCash / Maya / Card** selector inside the cart Pay
  control (portrait peek bar + full cart panel), plus a **confirmation modal**
  gating the Pay action to avoid accidental clicks. Long-press still opens the
  full payment modal (ref # / proof).
- Limited the Transactions method filter to those four quick methods (dropped
  BPI/Bank chips; legacy rows still display correctly).
- **Decisions:** segmented control inside the Paid button; simple tap-to-record
  (no ref # on the quick flow); order is Cash | GCash | Maya | Card.

### Coop DB (Staging) — payment method persistence
- Added `payment_method text` to `pos_orders` and threaded it through the
  `apply_pos_order` RPC (`coalesce(..., 'cash')`). Mirrored into
  `supabase/pos_schema.sql`. Verified round-trip via the anon key. (Surfaced on
  the dashboard — see the dashboard changelog.)

### Boot reliability — `fix(boot)`
- Fixed a web PWA that hung on a spinner until repeated refreshes: the web
  SQLite (wa-sqlite / OPFS) exclusive-lock open rejected transiently on reload
  and the rejected promise was cached. `getDatabase()` now clears the cache on
  failure; bootstrap retries with backoff + timeout and shows a "Couldn't start
  / Retry" screen instead of an infinite spinner.
- **Decision (no code):** POS stays **single-instance-per-device** — deliberate
  for money-handling safety. Multi-device works (independent local stores that
  sync via Coop); only same-device multi-tab is prevented.

## 2026-09-07

### Catalog sync + product management — `feat(sync)` / `feat(pos)`
- Coop is authoritative for the POS category/subcategory (new
  `category`/`subcategory` columns on `pos_products`), fixing products landing
  in "Uncategorized" and the JRK Tasty-vs-Super-Duo ambiguity. Catalog pull now
  inserts new Coop products locally; added a `set_product_stock` RPC.
- Products page gains subcategory chips, a Bundles pill, simplified product
  edit, product-line pills, and fixed back navigation. New-product creation
  hidden in the POS (creation is Coop-only); transaction history shows live
  product names; Coop's product-line prefix is stripped from tile names.

---

_Earlier history predates this changelog; see the git log._
