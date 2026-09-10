# Changelog — ZoomyPOS

Notable changes to the POS app (`zoomy-pos`). The shared Coop dashboard has its
own changelog in `../zoomy-observability-dashboard/CHANGELOG.md`.

Conventions: work flows `feature → develop → staging` (never `main` without
sign-off); Conventional Commits; **no Claude co-author trailer**. POS schema
work is additive-only (`pos_*`) and developed against Staging Supabase
(`syxwixxzmytvhwhkwdvw`); the reviewed SQL is mirrored in `supabase/pos_schema.sql`.

Dates are local working dates (GMT+8). Newest first.

---

## 2026-09-10 (develop only — not yet promoted to staging)

### Out-of-stock tiles are greyed out, and overselling is now blocked — `feat(stock)`
- Per PO direction, this replaces the "warn but still allow" approach shipped
  earlier today: a depleted product's tile is now dimmed (in addition to
  keeping the "No Stock" tag for context), and the in-cart "Oversold" tag is
  removed entirely because overselling itself is no longer possible.
- Added a stock ceiling check (`canIncrementItem` in `app/index.tsx`, mirrored
  in `app/modals/payment.tsx`) at every place a cashier can add one more unit:
  tapping a tile, the cart panel's "+" stepper, and the full payment modal's
  "+" stepper. Once cart quantity reaches the cached stock, the control stops
  adding and (for the tile) shows a toast explaining why.
- The check only applies once a product has actually synced with Coop at
  least once (`sku` is set). An unsynced product's `stock` column defaults to
  `0` at the schema level (new products, catalog CSV import, dev seed) — that
  default doesn't mean "confirmed empty," so those rows stay unrestricted
  until a real catalog pull gives them a trustworthy stock value.
- Variant products remain entirely out of scope, as before: stock isn't
  tracked per variant, so neither the grey-out nor the block applies to them.
- Bundles are also out of scope for the hard block (no per-bundle stock
  tracking exists yet) — a known gap, not something this change addresses.

### Fix: local stock cache went stale immediately after a sale — `fix(stock)`
- Reported scenario: sell 5 (last stock), sell 1 more (oversold), tap Paid, then
  ring up 5 again — the tile still showed "Last stock" even though the real
  count was already 0/negative. Cause: a **local** sale never touched the
  **local** stock cache — only the periodic catalog pull did, and that pull
  hadn't run yet. Coop's own stock was already correct in real time (its
  `apply_pos_order` RPC decrements inventory atomically on every sale); the POS
  just wasn't reflecting that for its own just-completed sale.
- Considered querying Coop live per tile instead, but that would add a network
  round-trip to every render of a bazaar-speed, offline-first UI — the wrong
  tradeoff. Instead, `decrementStock` now updates the local cache immediately
  after a sale commits (either payment path), so the very next tap sees the
  correct count without any network call; the next catalog pull still
  reconciles fully against Coop (and corrects for sales made on *other*
  devices, which this local decrement can't know about).
- Added a **persistent "No Stock" tag** at the top of a tile whenever the
  cached stock is already ≤ 0 and nothing is in the cart yet — distinct from
  the existing bottom Last-stock/Oversold banner, which only shows once
  something's actually been tapped. The tile stays fully tappable either way;
  this is a heads-up for the cashier (and a future signal to restock in Coop),
  not a block.

### Product name/price/emoji/listing edits now sync across devices — `feat(sync)`
- POS-side product edits (name, price, emoji, and the list/unlist toggle) were
  local-only — a change on one device never reached Coop or any other device.
  Each edit now pushes to Coop (best-effort, fire-and-forget) via
  `rename_product` / `reprice_product` / `set_product_listing` (the same RPCs
  Coop's own dashboard uses) and a new `set_product_emoji` RPC. Only fires for
  products that already have a `sku` (i.e. have been through at least one sync).
- **Emoji now fully converges** across devices: the catalog pull always applies
  Coop's current emoji (when set), so whichever device — or the Coop dashboard —
  edited it most recently wins everywhere on the next sync. This replaces the
  earlier "POS keeps its own edit forever" rule; a device's emoji choice can now
  be overwritten by a later edit made elsewhere. Coop DB: new `set_product_emoji`
  RPC (granted anon), mirrored in `supabase/pos_schema.sql`; verified via anon
  round-trip alongside `rename_product`/`reprice_product`.

### Fix: web build crashed on load ("getEnabledPaymentMethods is not a function") — `fix(settings)`
- `db/settings.web.ts` is a platform override Metro prefers over `db/settings.ts`
  for web builds; the new payment-config functions (`getEnabledPaymentMethods`,
  `setEnabledPaymentMethods`, `getConfirmOnPay`, `setConfirmOnPay`) were only
  added to `settings.ts`, so the web build kept calling the old file and threw
  on launch. Mirrored the same functions into `settings.web.ts` (identical
  logic — no FileSystem involved, so no real web-specific behavior needed).
  Scanned the repo for every other `.web.ts` override; none of this session's
  other edited files have one, so this was an isolated miss.

### Bundles default tab (and first position) — `feat(pos)`
- The product grid now opens on the **Bundles** pill instead of the first
  product line whenever an active "Buy Any N" deal exists (falls back to the
  first line when there are none). Applies only when computing the default —
  a cashier's manual tab choice is still respected across catalog reloads.
- The **Bundles pill is also first in the tab row** (was last), so it reads as
  the featured tab, not an afterthought.

### Payment options: QRPH + configurable methods — `feat(payments)`
- Added **QRPH** as a payment method (a single generic QR tap, distinct from
  GCash/Maya) alongside the existing methods. Old GCash/Maya/Card/BPI records
  are untouched and still filter/display correctly — this only changes what's
  offered going forward.
- **New Settings screen** (there was previously no way to reach the existing
  PIN-gated admin settings at all — no icon led to it). Added a gear icon to
  the main header; Settings now includes a **Payment Options** page where you
  choose which methods appear on the cart Pay control (master list: Cash,
  QRPH, GCash, Maya, Card — at least one always stays enabled) and whether
  tapping Pay opens the confirm-before-recording modal. Default enabled set:
  **Cash + QRPH**. `db/settings.ts` persists both; `PaymentMethodTabs` now
  takes the enabled set as a prop instead of hard-coding all four/five.

### Edit Product: pinned Save + "Update Product" label — `fix(products)`
- Buttons now live in a footer pinned outside the ScrollView (mirroring the
  bundle builder), so Save is always visible regardless of how tall the emoji
  grid gets. Renamed the button to **"Update Product"** / **"Update Bundle"**.

### In-app confirm modal for delete — `fix(products)`
- Replaced the browser-native `window.confirm` / `Alert.alert` for deleting a
  product or bundle with a themed in-app `ConfirmModal`, consistent with the
  rest of the POS. Scoped to delete only; the Remove-QR and Import-Catalog
  confirms are unchanged for now.

### Chopsticks + ice cube added to the emoji palette — `feat(products)`
- Added 🥢 and 🧊 to the shared curated set (`constants/emoji.ts`), available
  for both products and bundles.

### Low-stock / oversold tile warning — `feat(pos)` / `feat(sync)`
- The catalog pull now also reads Coop's live stock (`pos_inventory`) into a
  new local `products.stock` column — Coop-authoritative, always overwritten
  on sync (unlike emoji, there's no "POS keeps its own" concept for a number
  that changes constantly). Verified anon can read the view directly.
- A product tile shows a **non-blocking warning** once the quantity already in
  the cart reaches or passes what's on hand: **"Last stock"** when the cart
  quantity exactly equals stock, **"Oversold"** when it exceeds it (including
  an already-negative stock from a prior oversell). The sale still goes
  through either way — it's a heads-up, not a block. Scoped to non-variant
  products (stock isn't tracked per variant); shows nothing until something is
  actually in the cart, so an untouched 0-stock tile doesn't falsely read
  "Last stock".

## 2026-09-09 (develop only — not yet promoted to staging)

### Fix: editing/toggling a product no longer wipes its category — `fix(products)`
- Saving a product edit (even just the emoji) or toggling its listing dropped it
  into Uncategorized: the save omitted category/subcategory and `updateProduct`
  wrote them unconditionally, nulling the tab. Fixed the call sites to preserve
  them, and hardened `updateProduct` so category/subcategory/image_uri now
  COALESCE-preserve when omitted (like emoji) — no future caller can wipe them.
  A catalog pull also restores an affected row from Coop's category.

### Fix: Edit Product form is scrollable — `fix(products)`
- The taller emoji palette pushed Display Name / Price / Save below the fold and
  the form couldn't scroll, so Save was unreachable. Made the edit form body a
  ScrollView (with bottom padding) so all fields and the Save button are always
  reachable. The bundle builder already scrolled with a pinned footer.

### Bundles sync across devices + editable bundle emoji — `feat(bundles)`
- Bundles were local-only, so a bundle created on one device was invisible to
  others. They now sync through Coop like products: each bundle gets a shared
  `bundle_uuid`, the POS pushes on create/edit/toggle/delete
  (`apply_pos_bundle` / `delete_pos_bundle` RPCs), and the catalog pull mirrors
  Coop's bundle set into every device (`reconcileRemoteBundles`). Coop is the
  shared source; legacy local bundles with no uuid are left untouched.
- **Bundle emoji is now editable** — a tap-only palette (up to 3) is built into
  the **Add/Edit Bundle screen** (set it while creating the bundle), and also on
  each bundle row in the Products page. The tile shows the custom emoji when set,
  else falls back to the line-derived emojis.
- Added 🍐 pear to the emoji palette.
- Coop DB (Staging): `pos_bundles` gained `bundle_type` / `pick_count` /
  `line_categories` / `emoji`, plus the two RPCs (granted anon). Mirrored in
  `supabase/pos_schema.sql`; verified via anon round-trip.

## 2026-09-09

### Align POS tile emojis with Coop — `fix(products)`
- The POS seed emojis had drifted from Coop's (e.g. Chicken 🍗 vs 🐔, Cat Grass
  🌱 vs 🌿, and Coop's richer accented set like Chicken Carrot 🐔🥕). Updated the
  seed to match Coop exactly and added a one-time boot migration
  (`syncCatalogEmojiOnce`) so existing installs adopt the aligned emojis. This is
  a deliberate one-shot override; the ongoing catalog pull still never overwrites
  emoji, so later POS emoji edits stick. (Coop `pos_products.emoji` was backfilled
  on Staging to the same values.)

### Emoji picker is tap-only (no typing) — `fix(products)`
- The emoji field required typing an emoji, which is awkward and impossible on a
  desktop keyboard. Replaced it with a **tap-only palette**: a selected preview
  with a backspace, and a grid of curated treat emojis you tap to add (up to 3).
  No text entry. Shared the curated set + helpers in `constants/emoji.ts`.

### Product emoji: up to 3, Coop-seeded + POS-editable — `feat(products)` / `feat(sync)`
- A tile emoji can now be **1 to 3 emoji** (like the bundle tiles), not just one.
  The POS edit field clamps to 3 (grapheme-aware) and the quick-picks append.
- **Coop now seeds the emoji.** `pos_products` gained an `emoji` column; the
  catalog pull carries it and uses it when **inserting** a new product. An
  existing product keeps its **local** emoji, so a POS emoji edit survives later
  syncs (per the agreed "Coop sets, POS can override" rule — unlike name/price/
  category which stay Coop-authoritative). Verified end-to-end via anon read.
- The product list still shows the emoji before the name; editing still works.

### Products page: emoji in list, editable emoji, pull-to-refresh — `feat(products)`
- The product list now shows each product's **emoji before its name**, so items
  are easier to tell apart at a glance (matches the POS tiles).
- **Editing a product can now change its emoji.** The edit form has an emoji
  field plus a one-tap quick-pick row of common treat emojis (freeform input
  covers anything else). Emoji stays **local-only** by design — `updateProduct`
  writes it via `emoji = COALESCE(?, emoji)`, so callers that only edit
  name/price/listing leave it untouched.
- **Pull-to-refresh** on the Products list (reuses the shared gesture) to re-read
  the local catalog after a Coop sync.

### Transactions: pull-to-refresh + modal nav fixes — `feat(transactions)` / `fix(nav)`
- **Pull-to-refresh** on the Transactions list (reuses the product-grid gesture):
  pull down to re-pull Coop + re-read local, so another device's sale/void shows
  without leaving the screen.
- **Back button gone after reload** (`fix(nav)`): reloading the PWA directly on a
  modal route (e.g. `/modals/transactions`) opened it with no screen beneath, so
  the header back button vanished. Anchored the stack to `index`
  (`unstable_settings.anchor`), so Back always returns to the POS. Fixes every
  modal, not just Transactions.
- **Void returned to the home screen** (`fix(nav)`): the void flow dismissed twice
  (popping the PIN modal *and* Transactions). It now dismisses once, returning to
  the Transactions screen, which reloads on focus and shows the sale voided.

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
