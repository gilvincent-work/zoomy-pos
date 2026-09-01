# Option H — Split-View (Phone) with Category Filters — Implementation Plan

_Status: IMPLEMENTED (v1). All five phases built behind the `/option-h` route. Grounded in the current `zoomy-pos` codebase._

## Implementation summary (what shipped)

- **Data:** `products.category` / `products.subcategory` columns (additive migration); `getCategoriesWithSubcategories()` derives the tab tree.
- **Import:** `catalog.csv` header extended with `category,subcategory`; the legacy 8-column header is still accepted. Ready-to-fill template at `docs/catalog-template.csv`.
- **UI:** `components/CategoryTabs`, `SubcategoryFilter`, `CartPanel`, `CartSheet`; screen at `app/option-h.tsx` (route `/option-h`), reached via the grid icon in the main POS header. Orientation-aware: landscape pins the cart on the right, portrait uses a slide-up sheet.
- **Checkout:** one-tap instant cash writes a `transactions` row (cash, tendered = total, change = 0); long-press or the secondary link opens the full payment modal for GCash / change.
- **Logic utils:** `utils/catalog-filter.ts`, `utils/cart-transaction.ts`.
- **Tests:** 33 new tests (filter logic, dual-header parser, template validation, transaction item building, category tree, filter components, cart panel). Full suite green except a pre-existing date-sensitive `CalendarRangeModal` suite (fails identically on clean HEAD). Web bundle (`expo export --platform web`) compiles.

### Known follow-ups (intentionally deferred, YAGNI)

- In-app category/subcategory pickers in the product editor (`app/modals/products.tsx`). Locked decision is sheet-as-source-of-truth, so products added in-app land in "Uncategorized" until re-imported.
- Promote `/option-h` to the default screen once the team signs off on the A/B.

---


## 1. What we're building

A new order-screen experience ("Option H") on an ordinary phone:

- **Split-View that follows orientation**
  - **Landscape (Horizontal):** products (with category tabs) on the left, a **live "Current Sale" cart pinned on the right** with running total + charge button.
  - **Portrait (Vertical):** products full-width; the cart becomes a **slide-up bottom sheet** (peek bar shows item count + total; drag/tap to expand).
- **Category tabs** (horizontally scrollable): e.g. _Meaty Treats, Tasty Treats, Super Duo Bites, Freeze Dried, …_ — screen **opens on the first category**.
- **Subcategory filters** that appear only for categories that have them: selecting **Freeze Dried** reveals a second filter row (e.g. _Cat Grass / Yogurt_) and defaults to the first subcategory.
- **Quantity** via the mechanics we already validated: tap a tile to add / stack, on-tile `−`, and cart-line steppers. All backed by the **existing `CartContext`** (no cart rewrite).

## 2. Current architecture (what we reuse vs. change)

| Area | File | Reuse / Change |
|---|---|---|
| Cart state, add/decrement/total | `context/CartContext.tsx` | **Reuse as-is** |
| Product tile (image, badge, minus) | `components/ProductTile.tsx` | Reuse; minor prop for compact mode |
| Main POS screen | `app/index.tsx` | **Major change** → split-view + filters, or new route |
| Responsive columns | `hooks/useColumns.ts` | Extend: orientation-aware column counts |
| Product data + queries | `db/products.ts` | Add category/subcategory fields + filtered query |
| Schema + migration | `db/schema.ts` | **Add `category`, `subcategory` columns** (ALTER, backward-safe) |
| SKU/CSV import | `utils/products-csv-format.ts`, `db/catalog-import.ts` | Extend header with 2 optional columns |
| Product admin editor | `app/modals/products.tsx` | Add category/subcategory inputs |
| Payment | `app/modals/payment.tsx` | Reuse existing Charge → payment flow |
| Theme tokens | `constants/theme.ts` | Reuse (`C`, `F`, `R`) |

## 3. Data model changes (Phase 1)

Add two nullable columns to `products` (safe additive migration in `initSchema`, matching the existing `ALTER TABLE … .catch(() => {})` pattern):

```sql
ALTER TABLE products ADD COLUMN category TEXT;      -- e.g. "Meaty Treats"
ALTER TABLE products ADD COLUMN subcategory TEXT;   -- e.g. "Yogurt" (nullable)
```

- `Product` type + `getActiveProducts` / `upsertProduct` / `createProduct` / `updateProduct` updated to carry `category` / `subcategory`.
- New query helper `getCategoriesWithSubcategories()` deriving the tab structure from the products table (distinct category → distinct subcategories), so tabs are **data-driven** (adding a category = adding SKUs, no code change).
- Products with `category IS NULL` fall into an "Uncategorized"/"All" bucket so nothing disappears if the sheet omits a category.

## 4. The SKU sheet schema (what to put in your sheet)

Your sheet becomes the source of truth. Recommended columns (one row per sellable product; blank cells are fine):

| Column | Required | Example | Notes |
|---|---|---|---|
| `name` | ✅ | Beef Strips | Unique product name (import upserts by name) |
| `price` | ✅* | 95 | *Blank only if the product has variants |
| `category` | ✅ | Meaty Treats | Drives the top tab row |
| `subcategory` | ➖ | Yogurt | Leave blank for categories without sub-filters |
| `emoji` | ➖ | 🥩 | Optional; defaults to 🍬 (stands in until a photo is set) |
| `has_variants` | ➖ | 0 | 1 if the product has sized variants |
| `image_filename` | ➖ | beef-strips.jpg | Optional; matched during image import |

- Category **order** on the tab bar: **alphabetical** (locked). No extra ordering column needed in the sheet.
- Subcategory order within a category is also alphabetical — for Freeze Dried that makes **Cat Grass / Yogurt** the default first sub-filter, matching the mockup.
- Variants (sizes) and bundles keep using the existing `variant` / `bundle` row types; we're only appending category/subcategory to product rows.
- We'll export a ready-to-fill **`catalog-template.csv`** so your Google/Excel sheet maps 1:1, then export as CSV and import via the existing Products → Import flow.

### Concrete taxonomy (from the provided sheet)

`Freeze Dried` is the one category with subcategories (flexible model — other categories leave `subcategory` blank):

| category | subcategory | name (examples) |
|---|---|---|
| Freeze Dried | Fish | Salmon Cubes, Capelin |
| Freeze Dried | Meats | Lamb Liver, Duck Breast Cubes, Chicken Breast Cubes, Chicken Liver, Beef Liver |
| Freeze Dried | Cat Grass / Yogurt | Cat Grass Cubes, Cat Grass Sticks, Yogurt Cubes |
| Freeze Dried | Super Food | Duck Apple, Duck Pear, Chicken Cranberry, Chicken Pumpkin, Salmon Steak, Chicken and Egg |

Other categories seen in the mockup (Meaty Treats, Tasty Treats, Super Duo Bites, …) are top-level only — their product rows carry a `category` and a blank `subcategory`.

**Importer change:** extend `CATALOG_CSV_HEADER` with trailing `category,subcategory` and relax `parseCatalog`'s strict header check to accept **both** the legacy 8-column header and the new 10-column header (so old exports still import). `upsertCatalog` writes the two new fields.

## 5. Filtering logic (Phase 2)

- Screen state: `activeCategory`, `activeSubcategory`.
- On load: `activeCategory = categories[0]` (e.g. Meaty Treats); if it has subcategories, `activeSubcategory = subs[0]`.
- Visible products = products where `category === activeCategory` **and** (`no subcategory selected` OR `subcategory === activeSubcategory`).
- Components:
  - `components/CategoryTabs.tsx` — horizontal scroll pill row (reuses tab styling from the artifact; active pill = accent).
  - `components/SubcategoryFilter.tsx` — second pill row, rendered only when the active category has subcategories.
- Filtering is in-memory over the already-loaded product list (catalogs are small) — no per-tap DB round-trips.

## 6. Split-view layout + orientation (Phase 3)

- **Orientation detection:** `useWindowDimensions()` → `isLandscape = width > height`. Extend `useColumns` to return more columns in landscape-left-pane vs portrait.
- **Config:** relax `app.json` `orientation` from `"portrait"` to `"default"` (or lock landscape-capable only on this screen via `expo-screen-orientation` — added dependency; see Risks). The mockup's **Horizontal/Vertical toggle** ships as a manual override stored in component state (handy for demos and for users who keep the phone in a stand).
- **Landscape:** `flexDirection: row` → left `FlatList` pane (≈62%), right `CartPanel` pane (≈38%, pinned, independently scrollable), matching Option D's split but on phone widths.
- **Portrait:** products fill width; `CartPanel` hosted inside a lightweight **slide-up sheet** (`components/CartSheet.tsx`) built with RN `Animated` + a peek bar (no new gesture library — see Risks). Collapsed peek shows `N items · ₱total · Charge`; expanded shows full line list with steppers.
- **`components/CartPanel.tsx`** — single shared cart UI used by both orientations: line rows (thumb, name, `− qty +`, line total), subtotal, total, and the primary action button. Reads/writes `CartContext`, so it stays in sync with tiles automatically.

## 7. Integration & preservation (Phase 4)

- **Quantity:** tile press → `addItem`; on-tile `−` → `decrementItem`; cart-line steppers → `addItem`/`decrementItem`. (Existing variant flow via `VariantPickerModal` preserved for `has_variants` products.)
- **Charge / "Cash · Paid" (LOCKED: one-tap instant cash):** primary cart button records a cash sale in **one tap** — it still writes a `transactions` row (`payment_method='cash'`, `cash_tendered = total`, `change = 0`) so transaction history and reports stay intact; it just skips the interactive change/proof-photo step. To avoid losing GCash, a **secondary path** (long-press the button, or a small "More…" affordance) opens the full `/modals/payment` flow for GCash QR / change / receipt photo when needed.
- **Preserve existing entry points:** Scan (`/modals/scan`) and Bundle (`/modals/bundle`) remain reachable (moved into the header or the cart panel's action row). Bundle presets + bundles-in-cart continue to render in the cart panel.
- **Rollout:** build Option H behind the existing screen as a new route (e.g. `app/index-h.tsx` or a settings flag) so we can A/B it against today's screen, then promote to `app/index.tsx` once signed off.

## 8. Locked decisions

1. **Category source of truth:** the SKU sheet (`category` / `subcategory` columns). Tabs are data-driven from imported products.
2. **Subcategories:** flexible — only categories that have them show a sub-filter row. Freeze Dried has Fish / Meats / Cat Grass · Yogurt / Super Food (see §4).
3. **Checkout:** one-tap instant cash (records the transaction; GCash/change via a secondary path). See §7.
4. **Category & subcategory order:** alphabetical. No ordering column in the sheet.
5. **Orientation:** follow device rotation (landscape → side cart, portrait → bottom sheet), with a manual Horizontal/Vertical toggle as override.

## 9. Testing (Phase 5)

- Unit: `parseCatalog` with new header (legacy + extended), category/subcategory upsert, filtering selector logic, orientation → column mapping.
- Component: `CategoryTabs`, `SubcategoryFilter`, `CartPanel` steppers, `CartSheet` expand/collapse.
- Update existing tests: `ProductTile.test.tsx`, `CartContext.test.tsx`, `db/products.test.ts`, `import-csv-parser.test.ts` for new fields.
- Manual: landscape/portrait switch mid-sale (cart persists), empty category, category with no subcategory, uncategorized products, large catalog scroll.

## 10. Risks & mitigations

- **Portrait bottom sheet w/o a gesture lib:** app has no `reanimated`/`gesture-handler`/`@gorhom/bottom-sheet`. → Build a minimal `Animated`-based sheet (tap-to-expand + simple drag), or add `@gorhom/bottom-sheet` (heavier; pulls reanimated). Recommend the lightweight custom sheet for v1.
- **Enabling landscape globally** may affect other screens/modals. → Prefer per-screen orientation via `expo-screen-orientation`, or audit modals for landscape layout.
- **CSV header change** could break old imports. → Accept both header shapes; add a parser test for each.
- **Web/PWA parity:** split-view + sheet must degrade cleanly on `react-native-web` (already a target). → Verify in `expo start --web`.

## 11. File-by-file change list (for execution)

- `db/schema.ts` — 2 ALTER migrations.
- `db/products.ts` — types + `getActiveProducts`/upserts + `getCategoriesWithSubcategories()`.
- `utils/products-csv-format.ts` — extend header, dual-header parse, carry fields.
- `db/catalog-import.ts` — write category/subcategory.
- `hooks/useColumns.ts` — orientation-aware columns.
- `components/CategoryTabs.tsx` (new), `components/SubcategoryFilter.tsx` (new), `components/CartPanel.tsx` (new), `components/CartSheet.tsx` (new).
- `app/index.tsx` (or new `app/index-h.tsx`) — compose the split view.
- `app/modals/products.tsx` — category/subcategory inputs in the editor.
- `app.json` — orientation config (+ maybe `expo-screen-orientation`).
- Tests as per §9; `catalog-template.csv` for your sheet.

## 12. Rough effort

- Phase 1 (data + import): ~0.5 day
- Phase 2 (filters): ~0.5 day
- Phase 3 (split-view + orientation + sheet): ~1.5 days
- Phase 4 (integration): ~0.5 day
- Phase 5 (tests + polish + web check): ~0.5 day
- **Total ≈ 3.5 dev-days** (excludes final photography/emoji polish and real SKU data entry).
