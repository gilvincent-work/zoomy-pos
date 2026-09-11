# Changelog — ZoomyPOS

Notable changes to the POS app (`zoomy-pos`). The shared Coop dashboard has its
own changelog in `../zoomy-observability-dashboard/CHANGELOG.md`.

Conventions: work flows `feature → develop → staging` (never `main` without
sign-off); Conventional Commits; **no Claude co-author trailer**. POS schema
work is additive-only (`pos_*`) and developed against Staging Supabase
(`syxwixxzmytvhwhkwdvw`); the reviewed SQL is mirrored in `supabase/pos_schema.sql`.

Dates are local working dates (GMT+8). Newest first.

---

## 2026-09-11 — Fix: Transactions screen showed only local sales, not other devices' — `fix(sync)`

- Reported: the Transactions screen showed only this device's own sales, not
  the ones synced from other devices (Coop had them — verified 49 orders read
  back fine via the anon key, and the merge keeps all of them). Cause was a
  regression from the deletion-sync work: `loadTransactions` ran the
  local-row prune *between* painting the local list and painting the merged
  cross-device list, unguarded. On a heavily-tested device (many synced-local
  rows Coop no longer has, after repeated order purges) the prune's
  `DELETE ... IN (?, ?, …)` could exceed SQLite's bound-parameter limit and
  throw, aborting `loadTransactions` before the merge — stranding the view on
  local-only. This matched "worked before the offline changes, broke after".
- Fix: paint the **merged cross-device list first**, then run the prune as a
  best-effort, try/catch-guarded cleanup that can never block the display; and
  **chunk `deleteTransactionsByClientUuids`** (batches of 200) so a large prune
  can't hit the parameter limit in the first place. Cross-device history now
  always shows even if the prune fails.
- Verified against Staging with the live data: read returns all 49 orders and
  the merge keeps every one (incl. the ₱13,534 and ₱6,767 sales). 273 tests,
  `tsc`, and the web export all pass.

## 2026-09-11 — Push the IG handle to Coop; voids now restock — `feat(sync)`

- The furbaby / IG handle (`customer_handle`) captured at checkout was
  local-only and never reached Coop. It's now pushed with the sale:
  `SaleForPush`/`pushSale` carry it into `apply_pos_order` (new
  `pos_orders.customer_handle` column), the quick-pay handler passes it, and
  the outbox rebuild includes it so a retried sale keeps its handle. Coop's
  Offline Sales list now shows it (see the dashboard changelog). Forward-only —
  past synced sales have no handle.
- `void_pos_order` (Staging + mirrored in `supabase/pos_schema.sql`) was
  redefined to **restock** on void: it reverses the sale's FEFO inventory
  decrements and logs compensating movements, idempotently (a re-void never
  double-restocks). Since the POS's own void button calls the same RPC, POS
  voids now restore stock too (previously no void restored stock anywhere). The
  restored count reaches the POS on the next catalog pull, as usual.
- Schema changes applied + verified on **Staging only**; the prod schema apply
  is pending explicit approval. Tests/tsc/expo-export all green (272 tests).

## 2026-09-11 — Hide the PWA "Install" button for now — `chore(ui)`

- Enabling the sync marker (below) also surfaced the PWA one-tap **Install**
  affordance in the header. Hidden it behind a `SHOW_INSTALL_BUTTON` flag
  (default off) to keep the header minimal. Purely cosmetic: the app is still
  installable via the browser's own Install menu, and the `beforeinstallprompt`
  capture + `navigator.storage.persist()` request (the offline-durability
  machinery) are untouched. Flip the flag to bring the button back.

## 2026-09-11 — Offline outbox: unsynced sales/voids/remarks retry automatically — `feat(sync)`

- Reported: on flaky office wifi, some of the PO's sales pushed to Coop and some
  didn't, with no recovery — the failed ones just sat unsynced. Cause: `pushSale`
  was one-shot, fire-and-forget; a failed push showed a toast and never retried.
- Added a self-healing **outbox drain** (`utils/outbox.ts`). The "outbox" is not
  a new store — it's the local `transactions` rows that still owe Coop a write.
  A drain reads them oldest-first and, per row: pushes the sale if Coop doesn't
  have it, then (only once the sale is on Coop) pushes a pending **void** and/or
  **remarks** edit. Every push is keyed on the sale's `client_uuid` (Coop
  enforces it UNIQUE), so a retry — even one racing the sale's own inline push —
  is always a safe no-op, never a double-count.
- **Triggers:** app launch, the browser `online` event, a 30s background
  interval while open, and a manual tap on the sync marker. All no-op instantly
  when nothing is pending or when offline.
- **New sync-tracking columns** on `transactions`: `synced_at` already gated the
  sale; added `void_synced_at` and `remarks_synced_at`, each nulled the moment
  that edit is made locally and set once its Coop push confirms. `voidTransaction`
  / `updateTransactionRemarks` null theirs; the inline void/remarks writes in
  Admin and the Transactions screen now mark them synced on success, and the
  drain retries any left null. A one-time migration seeds `remarks_synced_at` for
  pre-existing rows so the first drain doesn't re-push the whole history's notes;
  `void_synced_at` is left null so any voided-but-never-synced sale heals once.
- **`SyncStatusBar` is now live** in the header (was commented out), fed a real
  "N pending" count from the outbox and tappable to sync now. Fixed `pushSale`'s
  `created_at` handling so a delayed retry records in Coop's history at **sale
  time**, not retry time (matters for the Offline Sales reporting dashboard).
- **Half-written-read safety:** the drain only considers pending rows older than
  5s (`getPendingSyncTransactions` recency floor), so it can never read a sale
  that's still mid-write (row inserted, its items not all inserted yet) and push
  it partially. `insertTransaction` is otherwise unchanged — a transaction wrap
  was considered and rejected: reads on the shared expo-sqlite connection see the
  transaction's own uncommitted rows, so it wouldn't isolate the drain and it
  introduced a double-tap corruption path.
- **Double-tap guard:** a pre-existing gap (a fast double-tap on Pay could book
  the cart twice, since the cart clears only after the awaited insert) is now
  closed with an in-flight ref on the confirm handler.
- **Deliberately unchanged (no happy-path impact):** a sale is still recorded
  locally instantly and shown the same way; the immediate "Not synced to Coop"
  toast still fires on inline failure (reworded to note it will auto-sync);
  catalog/product edits and CSV import are untouched. Offline-disabling of
  catalog edits remains a separate future item.
- Reviewed by a regression agent against the "pure enhancement, nothing lost or
  double-counted" bar; its findings (the transaction-wrap risk, a first-launch
  "N pending" void spike, a spinner flicker) are all folded into the above.
- 15 new tests (drain ordering/idempotency/single-flight, the rebuild helper,
  the recency floor, the new db functions + pending predicate). `tsc`, full
  suite (272), and the web export all pass; new symbols verified in the bundle.

## 2026-09-10 — Transactions screen now pulls deletions from Coop — `feat(sync)`

- Reported: after purging test orders from Coop prod (`pos_orders`), the POS
  Transactions screen kept showing them no matter how many times it was
  refreshed. Root cause: `fetchRemoteOrders()` only ever **added** rows to the
  local view (fills in sales made on other devices) — it never removed one,
  and the local `transactions` table itself was never touched by a remote
  fetch. This was deliberate for offline-first safety, just incomplete: there
  was no way for the POS to learn "Coop no longer has this."
- Added a safe deletion-sync path, gated so it can never destroy an unsynced
  local sale:
  1. New `transactions.synced_at` column, set only once `pushSale()` confirms
     the sale actually landed on Coop (`markTransactionSynced`, called from
     `app/index.tsx`'s post-push success branch). A sale that's still offline,
     or whose push hasn't resolved, is never marked and is therefore never a
     pruning candidate — no matter what Coop's list says.
  2. `fetchRemoteOrders()` now returns a discriminated result
     (`{ok: true, orders}` vs `{ok: false}`) instead of collapsing "genuinely
     zero orders" and "network/query error" into the same `[]`. That
     distinction is load-bearing: pruning must only run on a *confirmed*
     empty/populated result, never on a failed fetch.
  3. New pure `transactionsToPrune(local, remoteUuids)` (unit tested) picks
     out local rows that are synced + absent from a successful fetch;
     `deleteTransactionsByClientUuids` removes them (and their items)
     permanently, per PO decision (not a soft hide — Coop is the source of
     truth for whether a sale still exists).
- The Transactions screen's `loadTransactions` now: reads local → fetches
  remote → on a successful fetch, prunes anything confirmed-synced-but-gone,
  re-reads local, then merges for display same as before. A failed fetch
  changes nothing (existing offline-first fallback, untouched).
- 8 new tests (`transactionsToPrune` safety cases + the two new
  `db/transactions.ts` functions); full suite (257 tests), `tsc`, and the web
  export all verified; confirmed the three new functions are present in the
  built bundle.

## 2026-09-10 — Retire the phantom local-only "Beef Blueberry" product — `fix(seed)`

- Reported on the live event device: a "Beef Blueberry" tile showed
  permanently "No Stock" even though it doesn't exist anywhere in Coop.
  Root cause: an older one-time migration (`syncCatalogNamesOnce`) used to
  auto-create a local "Beef Blueberry" row on any device that didn't have
  it yet, entirely independent of Coop. It has no row in the Master Plan
  spreadsheet (no real price/stock), so it was deliberately excluded from
  the real prod `pos_*` seed — leaving that local row a phantom with no
  Coop match, stuck at the schema-default `stock = 0` forever, which the
  recent hard-block feature correctly (if confusingly) read as "confirmed
  empty."
- Removed Beef Blueberry from the starter seed catalog (`SEED_PRODUCTS`)
  and deleted the auto-create block in `syncCatalogNamesOnce`, so no new
  install ever gets it again.
- Added a new one-time migration, `deactivateRetiredSeedProductsOnce`,
  that deactivates (not deletes, to match the app's unlist-not-delete
  lifecycle and avoid any FK issue with past transaction rows) any
  leftover local Beef Blueberry row on already-seeded devices — including
  the live event device — on next launch.

## 2026-09-10 — `pos_*` promoted to Coop prod — `chore(prod)`

- Applied `supabase/pos_schema.sql` (10 tables, `pos_inventory` view, 13 RPCs,
  RLS) directly to Coop prod (`qkxbwzdxhwcbwgriwipi`), byte-identical to what
  was already live and verified on Staging. Additive-only — the 4 pre-existing
  Coop analytics tables (and their row counts) are untouched.
- Seeded **25 real products** from the Zoomy Master Plan spreadsheet's
  `Inventory` sheet (Offline Event Price + Stratpoint OFFLINE EVENT STOCK
  columns), replacing Staging's uniform 50-unit placeholder approach with real
  per-SKU counts: **3,969 total units**, matching the spreadsheet's own total.
  Excluded `Freeze-Dried Beef Blueberry` (no spreadsheet row) and 4 Staging
  test-only products.
- Seeded 2 real "pick" bundles: **Buy Any 4** (₱570, Freeze Dried + Meaty
  Treats) and **Buy Any 2** (₱550, Super Duo Bites + Tasty Treats).
- Full plan, verification steps, and rollback notes: see
  `../COOP_INTEGRATION_PLAN.md` → "✅ PROD MIGRATION COMPLETE (2026-09-10)".
- **Not done:** no code changes in this pass (backend/Supabase seeding only);
  prod Vercel env vars compiled and handed off for manual paste.

## 2026-09-10 (develop only — not yet promoted to staging)

### Removed the full Payment page; quick tap is now the only checkout flow — `feat(payment)`
- Deleted `app/modals/payment.tsx` and its route entirely, along with the
  Charge button's long-press that opened it (`onMorePayment` removed from
  `CartPanel`/`CartSheet`). Every Pay action is now a single quick tap — there
  are no more secondary long-press affordances anywhere in the checkout flow.
- The Furbaby / IG handle field (previously only reachable via that removed
  page) moved into the quick `ConfirmPaymentModal`, as an optional field
  between the price summary and the Cancel/Paid buttons. It's wired straight
  into `insertTransaction`'s existing `customerHandle` column, same as before.
- This intentionally drops the Payment page's other features (GCash/Maya QR
  full-screen display, reference number entry, receipt photo capture, cash
  tendered/change calculator) — the quick flow already recorded the sale
  under whichever method was selected via the payment method tabs, just
  without those extras. Settings' QR upload (Admin) is untouched, since it's
  independent of this page.

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
