# POS prod promotion runbook — 2026-09-17

**Target:** Coop **prod** `qkxbwzdxhwcbwgriwipi` (writable via MCP, one controlled pass).
**Source of truth:** Staging `syxwixxzmytvhwhkwdvw`.
**Nature:** additive schema + code only. **No product/stock/order/transaction data is copied** — prod's live data is untouched.

Companion file: [`prod_promotion_2026-09-17.sql`](./prod_promotion_2026-09-17.sql)

---

## What ships (delta, verified against live prod)

| Kind | Items |
|---|---|
| Extension | `pg_net` |
| Tables (4) | `pos_events`, `pos_settings`, `pos_stock_alert_log`, `pos_dashboard_users` |
| Columns (4) | `pos_orders.event_id`, `pos_orders.pet_type`, `pos_orders.edited_at`, `pos_order_items.bundle_group` |
| New fns (11) | `upsert_pos_event`, `close_pos_event`, `attribute_untagged_orders_to_event`, `add_pos_stock`, `void_last_stock_add`, `set_pos_stock_config`, `set_pos_next_event_plan`, `set_pos_daily_target`, `edit_pos_order`, `unvoid_pos_order`, `pos_fire_stock_alert` |
| Replaced fns (3, drifted) | `apply_pos_order` (writes event_id/pet_type/bundle_group), `set_product_stock`, `void_pos_order` |
| Trigger (1) | `pos_stock_movements_alert_ai` AFTER INSERT |
| Edge fn (1) | `stock-alert` |
| Seeds | `stock_forecast_config`, `next_event_plan`, `daily_revenue_target` = **₱13,500** |

**Confirmed identical on prod → deliberately NOT touched:** `pos_inventory` view (md5 match), `pos_products.emoji`, and 10 shared functions whose bodies match staging byte-for-byte.

**`pos_fire_stock_alert` is env-aware** — identical body on both DBs, reads its target from per-database settings (Section 1). No hardcoded project ref. This removes the old "rewrite the URL before applying" risk.

---

## Fill before running

1. `<<PROD_ANON_KEY>>` (×1 in Section 1 of the .sql) — Coop prod anon/publishable key.
2. `daily_revenue_target` value in Section 6 (staging = ₱7,000 — confirm real Coop target, or drop the row and set later from the dashboard).

---

## Apply order

### Step 0 — Preflight
- Confirm MCP target = `qkxbwzdxhwcbwgriwipi`.
- `pg_dump --schema-only` snapshot of prod `public` (rollback safety).

### Step 1 — Extension + env config (Section 1)
- `create extension pg_net;`
- Two `alter database postgres set app.stock_alert_* …` statements.
- Run these first, **on their own** (not inside the big DDL transaction).
- Note: `ALTER DATABASE … SET` takes effect on **new** connections; existing pooled PostgREST connections pick it up after they cycle. The alert fn no-ops safely until then.

### Step 2 — Deploy the `stock-alert` edge function (BEFORE the trigger)
Source: `zoomy-pos/supabase/functions/stock-alert/index.ts` (already in repo; env-driven, no code change needed).

Set these **function secrets/env on prod** — `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected by the platform; the rest are ours:

| Var | Value on prod | Notes |
|---|---|---|
| `RESEND_API_KEY` | reuse the **same key/account as staging** | set it as a **prod Edge Function secret** at deploy — never in the repo or this SQL. (Supabase secrets can't be read back via MCP, so the value must be pasted at deploy time.) |
| `INVENTORY_URL` | `https://coop-brand-os.vercel.app/inventory?channel=offline` | ⚠ code default points at the **staging** dashboard — must override |
| `EMAIL_FROM` | confirm (`coop-alerts@hello.lanceamiel.site` is the current default) | verify the sending domain is right for prod |
| `EMAIL_TO` | optional | fallback recipients; real recipients come from `pos_dashboard_users` |

Smoke-test: invoke the deployed fn with `{"product_id":"<a real prod SKU>"}` and confirm a sane JSON result (`noop`/`not-sent`/`sent`).

### Step 3 — Schema DDL (Sections 2–7)
Apply as one transaction. Order inside the file is dependency-safe: tables → columns (FKs to `pos_events`) → functions → **trigger last** → seeds → grants.

### Step 4 — Ledger backfill (Section 8)
Metadata only. Makes the next promotion a clean `list_migrations` diff.

### Step 5 — App deploys
- **Coop dashboard** `main` → prod Vercel — **co-worker owns this project**; confirm its `SUPABASE_URL_ARCHIVE` already points at `qkxbwzdxhwcbwgriwipi`.
- **POS prod** Expo build → Coop prod anon key (events chip, opening cash, pet tag, add-stock, order edit/void).

### Step 6 — Verify
- Run prod **security advisors** (`get_advisors security`) — expect no new "RLS disabled" / exposed-PII findings (`pos_stock_alert_log` + `pos_dashboard_users` are RLS-on, no-policy = service-role only by design).
- Smoke-test each feature end-to-end on prod.

---

## Existing prod sales data is NOT touched (audited)

The apply-time statements were scanned. Against **existing** rows, the script runs
only:
- `ALTER TABLE … ADD COLUMN IF NOT EXISTS` — all four columns are **nullable with no
  default**, so Postgres does a metadata-only add (no table rewrite, no row changes).
  Existing orders simply get `NULL` in the new columns.
- `CREATE INDEX pos_orders_event_id_idx` — a read-only build, no data mutation.
- The FK `pos_orders.event_id → pos_events` validates only non-NULL values; every
  existing order is NULL, so validation is trivial and changes nothing.

Every `update`/`delete`/`insert into pos_orders|pos_order_items|pos_stock_movements`
in the file lives **inside a `CREATE OR REPLACE FUNCTION` body** — those are function
*definitions*, executed only when the app/dashboard later calls them (normal
runtime), never while applying this script. There is **no** `TRUNCATE`, no `DROP
TABLE`, no `DELETE`/`UPDATE` at the top level, and no data copy from staging.

The trigger fires only on **future** `pos_stock_movements` inserts (AFTER INSERT);
it reads stock and posts to the alert log / edge fn — it never modifies sale rows.

## Risk notes
- **Zero downtime** — all DDL additive; nullable columns + exception-safe trigger on live `pos_orders`/`pos_stock_movements` carry no lock/rewrite risk.
- **No alert spam at cutover** — `pos_dashboard_users` starts empty, so no emails fire until Coop users sign in; and the fn no-ops without `RESEND_API_KEY`.
- **`apply_pos_order` is the highest-blast-radius change** (core order write path). Signature is unchanged `(jsonb, jsonb)`; the only behavior delta is persisting `event_id`/`pet_type`/`bundle_group`. All referenced tables/columns exist on prod after Sections 2–3.
- **Ledger caveat** — untracked objects (e.g. `pos_settings`, `edit_pos_order`) never had version rows on either DB; the backfill covers the 14 tracked versions only. Future diffs should still spot-check objects, not trust the ledger blindly.
