-- ZoomyPOS pos_* schema — Phase 1 (Coop integration)
-- Applied by hand (Coop convention, no migration tool). See COOP_INTEGRATION_PLAN.md.
-- Additive-only: introduces pos_* tables/view/RPCs/RLS. Never touches Coop's four
-- existing analytics tables (digest_archive, business_health, marketplace_price_changes,
-- marketplace_tokens), which stay deny-all to anon (RLS enabled, no policy).

-- =========================================================================
-- 1. Base tables
-- =========================================================================

create table public.pos_products (
  product_id    text primary key,
  status        text,
  active        boolean not null default true,
  name          text not null,
  product_line  text,                -- Coop's SKU-decode line code (FDR / JRK / MEAT)
  category      text,                -- POS display tab (Freeze Dried / Meaty Treats / Super Duo Bites / Tasty Treats) — authoritative for the POS
  subcategory   text,                -- POS secondary tab (Freeze-Dried only: Fish / Meats / Cat Grass · Yogurt / Super Food)
  emoji         text,                -- 1-3 emoji for the POS tile; Coop seeds it, POS keeps its own later edits
  protein       text,
  cut           text,
  size          numeric,
  unit          text,
  seq_no        text,
  barcode       text,
  is_bundle     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.pos_bundles (
  bundle_id       text primary key,   -- the POS's shared bundle_uuid
  name            text not null,
  price           numeric not null,
  active          boolean not null default true,
  bundle_type     text not null default 'fixed', -- 'fixed' | 'pick' (Buy Any N)
  pick_count      integer,            -- Buy Any N (pick bundles only)
  line_categories jsonb,              -- eligible POS lines (pick bundles only)
  emoji           text,               -- tile emoji (1-3); null = derive from lines
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.pos_bundle_items (
  id          bigint generated always as identity primary key,
  bundle_id   text not null references public.pos_bundles(bundle_id),
  product_id  text not null references public.pos_products(product_id),
  qty         integer not null
);
create index pos_bundle_items_bundle_id_idx on public.pos_bundle_items(bundle_id);

create table public.pos_prices (
  product_id  text primary key references public.pos_products(product_id),
  price       numeric not null,
  currency    text not null default 'PHP',
  updated_by  text,
  updated_at  timestamptz not null default now()
);

create table public.pos_price_changes (
  id          bigint generated always as identity primary key,
  product_id  text references public.pos_products(product_id),
  old_price   numeric,
  new_price   numeric,
  reason      text,
  changed_by  text,
  device_id   text,
  changed_at  timestamptz not null default now()
);
create index pos_price_changes_product_id_idx on public.pos_price_changes(product_id);

create table public.pos_inventory_lots (
  lot_id        uuid primary key default gen_random_uuid(),
  product_id    text not null references public.pos_products(product_id),
  lot_code      text,
  expires_on    date,
  qty_received  integer not null,
  qty_on_hand   integer not null,
  received_at   timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index pos_inventory_lots_fefo_idx on public.pos_inventory_lots(product_id, expires_on, received_at);

create table public.pos_orders (
  id             uuid primary key default gen_random_uuid(),
  client_uuid    text not null unique,
  device_id      text,
  cashier        text,
  subtotal       numeric not null,
  discount       numeric,
  total          numeric not null,
  oversold       boolean not null default false,
  payment_method text,               -- cash / gcash / card (etc.); how the sale was paid
  customer_handle text,              -- optional furbaby / IG handle, carried from the POS sale
  status         text not null default 'completed', -- completed / voided (void from any device)
  remarks        text,               -- free-text note; editable from any device
  voided_at      timestamptz,        -- when the sale was voided (audit)
  edited_at      timestamptz,        -- when the sale was last edited (null = never; audit)
  created_at     timestamptz not null default now(),
  synced_at      timestamptz not null default now()
);

create table public.pos_order_items (
  id          bigint generated always as identity primary key,
  order_id    uuid not null references public.pos_orders(id),
  product_id  text references public.pos_products(product_id),
  bundle_id   text references public.pos_bundles(bundle_id),
  -- Groups a bundle's header line and its ₱0 pick lines into one bundle instance
  -- on the order (a per-order counter, distinct from bundle_id so two of the same
  -- bundle stay separable). Null on plain individual items. Orthogonal to the
  -- product-XOR-bundle constraint below, so reporting (which keys on product_id /
  -- bundle_id) is unaffected. Added 2026-09-14 for bundle-aware editing.
  bundle_group text,
  qty         integer not null,
  unit_price  numeric not null,
  line_total  numeric not null,
  -- A line is a product line, a bundle header (linked to a pos_bundles row), or a
  -- custom-bundle premium line (both ids null, tied to a bundle_group) that carries
  -- an unlinked/ad-hoc bundle's price. The third shape was added 2026-09-14 so a
  -- bundle sale whose Coop bundle_id can't be resolved still records its price.
  constraint pos_order_items_one_of_product_or_bundle
    check (
      (product_id is not null and bundle_id is null)
      or (product_id is null and bundle_id is not null)
      or (product_id is null and bundle_id is null and bundle_group is not null)
    )
);
create index pos_order_items_order_id_idx on public.pos_order_items(order_id);

create table public.pos_stock_movements (
  id          bigint generated always as identity primary key,
  product_id  text not null references public.pos_products(product_id),
  lot_id      uuid references public.pos_inventory_lots(lot_id),
  order_id    uuid references public.pos_orders(id),
  delta       integer not null,
  reason      text not null,
  created_by  text,
  created_at  timestamptz not null default now()
);
create index pos_stock_movements_product_id_idx on public.pos_stock_movements(product_id);
create index pos_stock_movements_order_id_idx on public.pos_stock_movements(order_id);

create table public.pos_sync_log (
  id          bigint generated always as identity primary key,
  synced_at   timestamptz not null default now(),
  direction   text not null,
  entity      text not null,
  summary     jsonb,
  device_id   text
);

-- =========================================================================
-- 2. pos_inventory view — Σ qty_on_hand per product, every product appears
--    even with zero lots. security_invoker so the caller's RLS applies to
--    the underlying pos_inventory_lots (a view can otherwise leak past RLS).
-- =========================================================================

create view public.pos_inventory
with (security_invoker = true)
as
select
  p.product_id,
  coalesce(sum(l.qty_on_hand), 0) as stock,
  min(l.expires_on) filter (where l.qty_on_hand > 0) as next_expiry
from public.pos_products p
left join public.pos_inventory_lots l on l.product_id = p.product_id
group by p.product_id;

-- =========================================================================
-- 3. RPCs — SECURITY DEFINER, the only write paths. Clients get SELECT +
--    EXECUTE only (no direct INSERT/UPDATE/DELETE grants to anon anywhere).
-- =========================================================================

-- apply_pos_order: idempotent on client_uuid; inserts order + items, expands
-- bundles into component-product decrements, decrements inventory FEFO
-- across lots, logs one pos_stock_movements row per decrement. Accepts
-- oversells and flags them (oversold = true) — never rejects a sale.
create or replace function public.apply_pos_order(p_order jsonb, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_uuid       text := p_order->>'client_uuid';
  v_order_id          uuid;
  v_existing_id        uuid;
  v_existing_oversold  boolean;
  v_oversold          boolean := false;
  v_item              jsonb;
  v_product_id        text;
  v_bundle_id         text;
  v_bundle_group      text;
  v_qty               integer;
  v_unit_price        numeric;
  v_line_total        numeric;
  v_bundle_item       record;
  v_decrement         record;
  v_lot               record;
  v_remaining         integer;
  v_take              integer;
  v_overdraw_lot      uuid;
  v_decrements        jsonb := '{}'::jsonb;
begin
  -- Idempotency: a re-upload of an already-applied client_uuid is a no-op.
  select id, oversold into v_existing_id, v_existing_oversold
    from pos_orders where client_uuid = v_client_uuid;

  if v_existing_id is not null then
    return jsonb_build_object('order_id', v_existing_id, 'oversold', v_existing_oversold, 'idempotent', true);
  end if;

  v_order_id := gen_random_uuid();

  insert into pos_orders (id, client_uuid, device_id, cashier, customer_handle, subtotal, discount, total, oversold, payment_method, created_at)
  values (
    v_order_id,
    v_client_uuid,
    p_order->>'device_id',
    p_order->>'cashier',
    nullif(p_order->>'customer_handle', ''),
    (p_order->>'subtotal')::numeric,
    nullif(p_order->>'discount', '')::numeric,
    (p_order->>'total')::numeric,
    false,
    coalesce(nullif(p_order->>'payment_method', ''), 'cash'),
    coalesce((p_order->>'created_at')::timestamptz, now())
  );

  -- Insert line items; accumulate per-product decrement requirements
  -- (bundle lines expand into their component products).
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id   := v_item->>'product_id';
    v_bundle_id    := v_item->>'bundle_id';
    v_bundle_group := v_item->>'bundle_group';
    v_qty          := (v_item->>'qty')::integer;
    v_unit_price   := (v_item->>'unit_price')::numeric;
    v_line_total   := (v_item->>'line_total')::numeric;

    -- bundle_group ties a bundle's header + its ₱0 pick lines into one instance
    -- so the order stays editable under the bundle's rules (null on plain items).
    insert into pos_order_items (order_id, product_id, bundle_id, bundle_group, qty, unit_price, line_total)
    values (v_order_id, v_product_id, v_bundle_id, v_bundle_group, v_qty, v_unit_price, v_line_total);

    if v_product_id is not null then
      v_decrements := jsonb_set(
        v_decrements, array[v_product_id],
        to_jsonb(coalesce((v_decrements->>v_product_id)::integer, 0) + v_qty)
      );
    elsif v_bundle_id is not null then
      for v_bundle_item in
        select bi.product_id, bi.qty from pos_bundle_items bi where bi.bundle_id = v_bundle_id
      loop
        v_decrements := jsonb_set(
          v_decrements, array[v_bundle_item.product_id],
          to_jsonb(coalesce((v_decrements->>v_bundle_item.product_id)::integer, 0) + v_bundle_item.qty * v_qty)
        );
      end loop;
    end if;
  end loop;

  -- Decrement inventory FEFO per product, server-side and atomic.
  for v_decrement in
    select key as product_id, value::integer as qty from jsonb_each_text(v_decrements)
  loop
    v_remaining := v_decrement.qty;

    for v_lot in
      select lot_id, qty_on_hand
      from pos_inventory_lots
      where product_id = v_decrement.product_id and qty_on_hand > 0
      order by expires_on asc nulls last, received_at asc
      for update
    loop
      exit when v_remaining <= 0;
      v_take := least(v_lot.qty_on_hand, v_remaining);
      update pos_inventory_lots set qty_on_hand = qty_on_hand - v_take, updated_at = now()
        where lot_id = v_lot.lot_id;
      insert into pos_stock_movements (product_id, lot_id, order_id, delta, reason, created_by, created_at)
      values (v_decrement.product_id, v_lot.lot_id, v_order_id, -v_take, 'sale', p_order->>'cashier', now());
      v_remaining := v_remaining - v_take;
    end loop;

    if v_remaining > 0 then
      -- Oversell: not enough stock to cover the sale. Record it anyway and
      -- flag the order; draw the earliest lot negative if one exists for
      -- traceability, else log against no lot at all.
      v_oversold := true;

      select lot_id into v_overdraw_lot
        from pos_inventory_lots
        where product_id = v_decrement.product_id
        order by expires_on asc nulls last, received_at asc
        limit 1;

      if v_overdraw_lot is not null then
        update pos_inventory_lots set qty_on_hand = qty_on_hand - v_remaining, updated_at = now()
          where lot_id = v_overdraw_lot;
      end if;

      insert into pos_stock_movements (product_id, lot_id, order_id, delta, reason, created_by, created_at)
      values (v_decrement.product_id, v_overdraw_lot, v_order_id, -v_remaining, 'sale', p_order->>'cashier', now());
    end if;
  end loop;

  if v_oversold then
    update pos_orders set oversold = true where id = v_order_id;
  end if;

  return jsonb_build_object('order_id', v_order_id, 'oversold', v_oversold, 'idempotent', false);
end;
$$;

-- reprice_product: updates pos_prices + appends pos_price_changes in one txn.
create or replace function public.reprice_product(p_product_id text, p_new_price numeric, p_reason text, p_by text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_price numeric;
begin
  select price into v_old_price from pos_prices where product_id = p_product_id;

  if v_old_price is null then
    insert into pos_prices (product_id, price, updated_by, updated_at)
    values (p_product_id, p_new_price, p_by, now());
  else
    update pos_prices set price = p_new_price, updated_by = p_by, updated_at = now()
      where product_id = p_product_id;
  end if;

  insert into pos_price_changes (product_id, old_price, new_price, reason, changed_by, device_id, changed_at)
  values (p_product_id, v_old_price, p_new_price, p_reason, p_by, null, now());
end;
$$;

-- rename_product: edits the shared pos_products row (co-edited by POS + Coop).
create or replace function public.rename_product(p_product_id text, p_name text, p_by text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update pos_products set name = p_name, updated_at = now()
    where product_id = p_product_id;
end;
$$;

-- set_product_listing: the listed/unlisted toggle (POS "disable"; no delete).
create or replace function public.set_product_listing(p_product_id text, p_active boolean, p_by text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update pos_products set active = p_active, updated_at = now()
    where product_id = p_product_id;
end;
$$;

-- set_product_emoji: lets the POS push its own emoji choice up to Coop,
-- mirroring rename_product/reprice_product. Combined with the catalog pull
-- always overwriting a product's local emoji from Coop's value (when set),
-- this makes emoji fully convergent: whichever device (or Coop) edited it
-- most recently wins everywhere on the next sync.
create or replace function public.set_product_emoji(p_product_id text, p_emoji text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update pos_products set emoji = nullif(p_emoji, ''), updated_at = now()
    where product_id = p_product_id;
end;
$$;

-- receive_lot: new dated lot + a 'receipt' stock movement.
create or replace function public.receive_lot(p_product_id text, p_expires_on date, p_qty integer, p_lot_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot_id uuid := gen_random_uuid();
begin
  insert into pos_inventory_lots (lot_id, product_id, lot_code, expires_on, qty_received, qty_on_hand, received_at, updated_at)
  values (v_lot_id, p_product_id, p_lot_code, p_expires_on, p_qty, p_qty, now(), now());

  insert into pos_stock_movements (product_id, lot_id, order_id, delta, reason, created_by, created_at)
  values (p_product_id, v_lot_id, null, p_qty, 'receipt', null, now());

  return v_lot_id;
end;
$$;

-- recount_lot: office reconciliation; logs a 'recount' stock movement.
create or replace function public.recount_lot(p_lot_id uuid, p_new_qty integer, p_reason text, p_by text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product_id text;
  v_old_qty    integer;
  v_delta      integer;
begin
  select product_id, qty_on_hand into v_product_id, v_old_qty
    from pos_inventory_lots where lot_id = p_lot_id;

  if v_product_id is null then
    raise exception 'lot % not found', p_lot_id;
  end if;

  v_delta := p_new_qty - v_old_qty;

  update pos_inventory_lots set qty_on_hand = p_new_qty, updated_at = now()
    where lot_id = p_lot_id;

  insert into pos_stock_movements (product_id, lot_id, order_id, delta, reason, created_by, created_at)
  values (v_product_id, p_lot_id, null, v_delta, coalesce(p_reason, 'recount'), p_by, now());
end;
$$;

-- record_sync: appends pos_sync_log; feeds the POS "last synced" marker
-- and Coop's "recently synced" digest.
create or replace function public.record_sync(p_direction text, p_entity text, p_summary jsonb, p_device text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into pos_sync_log (synced_at, direction, entity, summary, device_id)
  values (now(), p_direction, p_entity, p_summary, p_device);
end;
$$;

-- set_product_stock: set a product's TOTAL on-hand to an absolute quantity,
-- reconciling the lot ledger. Increase tops up the newest lot (or opens an
-- undated 'adjust' lot if none); decrease draws down FEFO. Logs one 'recount'
-- movement carrying the signed delta. The dashboard's editable Stock field.
create or replace function public.set_product_stock(p_product_id text, p_new_qty integer, p_by text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current   integer;
  v_delta     integer;
  v_lot       record;
  v_remaining integer;
  v_take      integer;
  v_target    uuid;
begin
  if p_new_qty < 0 then
    raise exception 'stock cannot be negative';
  end if;

  select coalesce(sum(qty_on_hand), 0) into v_current
    from pos_inventory_lots where product_id = p_product_id;

  v_delta := p_new_qty - v_current;
  if v_delta = 0 then
    return;
  end if;

  if v_delta > 0 then
    select lot_id into v_target
      from pos_inventory_lots where product_id = p_product_id
      order by received_at desc limit 1;
    if v_target is null then
      v_target := gen_random_uuid();
      insert into pos_inventory_lots (lot_id, product_id, lot_code, expires_on, qty_received, qty_on_hand, received_at, updated_at)
      values (v_target, p_product_id, 'adjust', null, v_delta, v_delta, now(), now());
    else
      update pos_inventory_lots set qty_on_hand = qty_on_hand + v_delta, updated_at = now()
        where lot_id = v_target;
    end if;
  else
    v_remaining := -v_delta;
    for v_lot in
      select lot_id, qty_on_hand from pos_inventory_lots
      where product_id = p_product_id and qty_on_hand > 0
      order by expires_on asc nulls last, received_at asc
      for update
    loop
      exit when v_remaining <= 0;
      v_take := least(v_lot.qty_on_hand, v_remaining);
      update pos_inventory_lots set qty_on_hand = qty_on_hand - v_take, updated_at = now()
        where lot_id = v_lot.lot_id;
      v_remaining := v_remaining - v_take;
    end loop;
  end if;

  insert into pos_stock_movements (product_id, lot_id, order_id, delta, reason, created_by, created_at)
  values (p_product_id, null, null, v_delta, 'recount', p_by, now());
end;
$$;

-- Void a sale by its client_uuid, from any device, AND restock it. The restock
-- neutralizes the order's ENTIRE net inventory footprint (its 'sale' decrements
-- plus any later 'edit-reverse'/'edit-sale' movements from edit_pos_order), so
-- an edited-then-voided order still returns to exactly its pre-sale stock.
-- Backward-compatible: a never-edited order's net == its original sale.
-- Idempotent (re-voiding finds status='voided' -> 0 rows, so stock is never
-- restored twice). Reversible via unvoid_pos_order (below).
create or replace function public.void_pos_order(p_client_uuid text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_count integer;
begin
  -- Flip to voided only if not already voided; capture the order id so the
  -- restock below runs exactly once (a re-void finds status='voided' -> 0 rows).
  update pos_orders
     set status = 'voided',
         voided_at = coalesce(voided_at, now())
   where client_uuid = p_client_uuid
     and status <> 'voided'
   returning id into v_order_id;
  get diagnostics v_count = row_count;

  if v_count = 0 then
    return 0;
  end if;

  -- Restock: add back the net of every movement this order made per lot, so its
  -- effect on qty_on_hand becomes 0 (net is negative for an outstanding sale, so
  -- subtracting it adds stock back).
  update pos_inventory_lots l
     set qty_on_hand = l.qty_on_hand - agg.net,
         updated_at = now()
  from (
    select lot_id, sum(delta) as net
    from pos_stock_movements
    where order_id = v_order_id and lot_id is not null
    group by lot_id
    having sum(delta) <> 0
  ) agg
  where l.lot_id = agg.lot_id;

  -- Compensating audit rows: reverse the entire current net per (product, lot)
  -- group, INCLUDING lot_id-null oversell groups, so movements-by-product net to
  -- zero for a voided order regardless of prior void/unvoid history. Re-void is
  -- guarded by the status flip above (0 rows -> early return), so this never
  -- compounds. Only the lot-mutating UPDATE above filters lot_id; the audit does
  -- not.
  insert into pos_stock_movements (product_id, lot_id, order_id, delta, reason, created_by, created_at)
  select product_id, lot_id, v_order_id, -sum(delta), 'void', null, now()
  from pos_stock_movements
  where order_id = v_order_id
  group by product_id, lot_id
  having sum(delta) <> 0;

  return v_count;
end;
$$;

-- Edit a completed order in place (online-only from the clients). Bundle-aware:
-- p_entries is a list of individual items and bundle groups. It reverses the
-- order's entire net inventory footprint (restoring the exact lots it drew from),
-- then re-applies the new entry set FEFO, and updates the editable fields
-- (payment_method / customer_handle / remarks). Recomputes subtotal + total
-- server-side (created_at / discount preserved). State-based and thus convergent:
-- re-running with the same payload lands the same result, never double-counting.
-- Rejects a voided order.
--
-- p_entries element shapes:
--   {"kind":"item","product_id":SKU,"qty":N,"unit_price":P}
--   {"kind":"bundle","bundle_id":B,"price":P,"picks":[{"product_id":SKU,"qty":N}]}
-- A 'pick' bundle must supply exactly its pick_count picks, all from the bundle's
-- eligible line_categories (else the edit is rejected before anything mutates); a
-- 'fixed' bundle ignores picks and decrements its defined components. Each bundle
-- becomes a header line (bundle_id, price) plus ₱0 pick lines, all sharing one
-- bundle_group so the editor can reconstruct the group. Total = Σ item line totals
-- + Σ bundle prices.
--
-- NOTE: the parameter list changed (p_items -> p_entries) on 2026-09-14. A fresh
-- apply creates this cleanly; promoting over an older edit_pos_order requires a
-- `drop function edit_pos_order(text,jsonb,jsonb)` first (Postgres can't rename an
-- input parameter via create-or-replace).
create or replace function public.edit_pos_order(p_client_uuid text, p_patch jsonb, p_entries jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id     uuid;
  v_status       text;
  v_discount     numeric;
  v_oversold     boolean := false;
  v_entry        jsonb;
  v_kind         text;
  v_product_id   text;
  v_qty          integer;
  v_unit_price   numeric;
  v_line_total   numeric;
  v_bundle_id    text;
  v_bprice       numeric;
  v_btype        text;
  v_pick_count   integer;
  v_line_cats    jsonb;
  v_pick         jsonb;
  v_pick_sum     integer;
  v_pick_pid     text;
  v_pick_qty     integer;
  v_cat          text;
  v_group        integer := 0;
  v_grp          text;
  v_bi           record;
  v_decrement    record;
  v_lot          record;
  v_remaining    integer;
  v_take         integer;
  v_overdraw_lot uuid;
  v_decrements   jsonb := '{}'::jsonb;
  v_subtotal     numeric := 0;
  v_total        numeric;
  v_rows         integer;
begin
  -- Lock the order row up front so a concurrent void/edit is serialized (a void
  -- committing mid-edit could otherwise leave a voided order with a live total).
  select id, status, discount into v_order_id, v_status, v_discount
    from pos_orders where client_uuid = p_client_uuid
    for update;

  if v_order_id is null then
    return jsonb_build_object('ok', false, 'error', 'order not found');
  end if;
  if v_status = 'voided' then
    return jsonb_build_object('ok', false, 'error', 'cannot edit a voided order');
  end if;
  if coalesce(jsonb_array_length(p_entries), 0) = 0 then
    return jsonb_build_object('ok', false, 'error', 'an order needs at least one item');
  end if;

  -- 0. Validate every bundle entry FIRST, so an invalid edit rejects before any
  --    mutation (pick_count exactness + pick eligibility to line_categories).
  for v_entry in select * from jsonb_array_elements(p_entries) loop
    if (v_entry->>'kind') = 'bundle' then
      v_bundle_id := v_entry->>'bundle_id';
      -- Custom / unlinked bundle (no bundle_id): no rules to enforce.
      if v_bundle_id is null or v_bundle_id = '' then
        continue;
      end if;
      select bundle_type, pick_count, line_categories into v_btype, v_pick_count, v_line_cats
        from pos_bundles where bundle_id = v_bundle_id;
      if v_btype is null then
        return jsonb_build_object('ok', false, 'error', 'unknown bundle: ' || coalesce(v_bundle_id, ''));
      end if;
      if v_btype = 'pick' then
        v_pick_sum := 0;
        for v_pick in select * from jsonb_array_elements(coalesce(v_entry->'picks', '[]'::jsonb)) loop
          v_pick_sum := v_pick_sum + coalesce((v_pick->>'qty')::integer, 0);
          if v_line_cats is not null and jsonb_array_length(v_line_cats) > 0 then
            select category into v_cat from pos_products where product_id = v_pick->>'product_id';
            if v_cat is null or not (v_line_cats ? v_cat) then
              return jsonb_build_object('ok', false, 'error', 'a picked item is not eligible for this bundle');
            end if;
          end if;
        end loop;
        if v_pick_count is not null and v_pick_sum <> v_pick_count then
          return jsonb_build_object('ok', false, 'error', 'this bundle needs exactly ' || v_pick_count || ' items');
        end if;
      end if;
    end if;
  end loop;

  -- 1. Neutralize this order's entire inventory footprint (restore the lots).
  update pos_inventory_lots l
     set qty_on_hand = l.qty_on_hand - agg.net, updated_at = now()
  from (
    select lot_id, sum(delta) as net
    from pos_stock_movements
    where order_id = v_order_id and lot_id is not null
    group by lot_id
    having sum(delta) <> 0
  ) agg
  where l.lot_id = agg.lot_id;

  -- Audit rows for the reversal, INCLUDING lot_id-null oversell groups; exclude
  -- prior edit-reverse rows so re-edits don't compound the audit. Only the
  -- lot-mutating UPDATE above filters lot_id.
  insert into pos_stock_movements (product_id, lot_id, order_id, delta, reason, created_at)
  select product_id, lot_id, v_order_id, -sum(delta), 'edit-reverse', now()
  from pos_stock_movements
  where order_id = v_order_id and reason not in ('edit-reverse')
  group by product_id, lot_id
  having sum(delta) <> 0;

  -- 2. Replace line items from the entries; accumulate per-product decrements.
  delete from pos_order_items where order_id = v_order_id;
  for v_entry in select * from jsonb_array_elements(p_entries) loop
    v_kind := coalesce(v_entry->>'kind', 'item');
    if v_kind = 'item' then
      v_product_id := v_entry->>'product_id';
      v_qty        := (v_entry->>'qty')::integer;
      v_unit_price := coalesce((v_entry->>'unit_price')::numeric, 0);
      v_line_total := v_qty * v_unit_price;
      insert into pos_order_items (order_id, product_id, bundle_id, bundle_group, qty, unit_price, line_total)
      values (v_order_id, v_product_id, null, null, v_qty, v_unit_price, v_line_total);
      v_subtotal := v_subtotal + v_line_total;
      if v_product_id is not null then
        v_decrements := jsonb_set(v_decrements, array[v_product_id],
          to_jsonb(coalesce((v_decrements->>v_product_id)::integer, 0) + v_qty));
      end if;
    elsif v_kind = 'bundle' then
      v_bundle_id := v_entry->>'bundle_id';
      v_bprice    := coalesce((v_entry->>'price')::numeric, 0);
      v_group     := v_group + 1;
      v_grp       := v_group::text;
      if v_bundle_id is null or v_bundle_id = '' then
        -- Custom / unlinked bundle: a premium line (both ids null) carries the
        -- price; its picks are ₱0 product lines tagged to the group. No rules.
        insert into pos_order_items (order_id, product_id, bundle_id, bundle_group, qty, unit_price, line_total)
        values (v_order_id, null, null, v_grp, 1, v_bprice, v_bprice);
        v_subtotal := v_subtotal + v_bprice;
        for v_pick in select * from jsonb_array_elements(coalesce(v_entry->'picks', '[]'::jsonb)) loop
          v_pick_pid := v_pick->>'product_id';
          v_pick_qty := coalesce((v_pick->>'qty')::integer, 0);
          if v_pick_pid is not null and v_pick_qty > 0 then
            insert into pos_order_items (order_id, product_id, bundle_id, bundle_group, qty, unit_price, line_total)
            values (v_order_id, v_pick_pid, null, v_grp, v_pick_qty, 0, 0);
            v_decrements := jsonb_set(v_decrements, array[v_pick_pid],
              to_jsonb(coalesce((v_decrements->>v_pick_pid)::integer, 0) + v_pick_qty));
          end if;
        end loop;
      else
        select bundle_type into v_btype from pos_bundles where bundle_id = v_bundle_id;
        -- Header line: bundle identity + price (product_id null; tagged to the group).
        insert into pos_order_items (order_id, product_id, bundle_id, bundle_group, qty, unit_price, line_total)
        values (v_order_id, null, v_bundle_id, v_grp, 1, v_bprice, v_bprice);
        v_subtotal := v_subtotal + v_bprice;
        if v_btype = 'pick' then
          for v_pick in select * from jsonb_array_elements(coalesce(v_entry->'picks', '[]'::jsonb)) loop
            v_pick_pid := v_pick->>'product_id';
            v_pick_qty := coalesce((v_pick->>'qty')::integer, 0);
            if v_pick_pid is not null and v_pick_qty > 0 then
              -- Pick line: a ₱0 product line tagged to the bundle group (bundle_id
              -- null to satisfy the product-XOR-bundle constraint).
              insert into pos_order_items (order_id, product_id, bundle_id, bundle_group, qty, unit_price, line_total)
              values (v_order_id, v_pick_pid, null, v_grp, v_pick_qty, 0, 0);
              v_decrements := jsonb_set(v_decrements, array[v_pick_pid],
                to_jsonb(coalesce((v_decrements->>v_pick_pid)::integer, 0) + v_pick_qty));
            end if;
          end loop;
        else
          -- Fixed bundle: decrement its defined components (no separate pick lines).
          for v_bi in select product_id, qty from pos_bundle_items where bundle_id = v_bundle_id loop
            v_decrements := jsonb_set(v_decrements, array[v_bi.product_id],
              to_jsonb(coalesce((v_decrements->>v_bi.product_id)::integer, 0) + v_bi.qty));
          end loop;
        end if;
      end if;
    end if;
  end loop;

  -- 3. Apply the new decrements FEFO (mirrors apply_pos_order), reason 'edit-sale'.
  for v_decrement in
    select key as product_id, value::integer as qty from jsonb_each_text(v_decrements)
  loop
    v_remaining := v_decrement.qty;

    for v_lot in
      select lot_id, qty_on_hand
      from pos_inventory_lots
      where product_id = v_decrement.product_id and qty_on_hand > 0
      order by expires_on asc nulls last, received_at asc
      for update
    loop
      exit when v_remaining <= 0;
      v_take := least(v_lot.qty_on_hand, v_remaining);
      update pos_inventory_lots set qty_on_hand = qty_on_hand - v_take, updated_at = now()
        where lot_id = v_lot.lot_id;
      insert into pos_stock_movements (product_id, lot_id, order_id, delta, reason, created_at)
      values (v_decrement.product_id, v_lot.lot_id, v_order_id, -v_take, 'edit-sale', now());
      v_remaining := v_remaining - v_take;
    end loop;

    if v_remaining > 0 then
      v_oversold := true;
      select lot_id into v_overdraw_lot
        from pos_inventory_lots
        where product_id = v_decrement.product_id
        order by expires_on asc nulls last, received_at asc
        limit 1;
      if v_overdraw_lot is not null then
        update pos_inventory_lots set qty_on_hand = qty_on_hand - v_remaining, updated_at = now()
          where lot_id = v_overdraw_lot;
      end if;
      insert into pos_stock_movements (product_id, lot_id, order_id, delta, reason, created_at)
      values (v_decrement.product_id, v_overdraw_lot, v_order_id, -v_remaining, 'edit-sale', now());
    end if;
  end loop;

  -- 4. Update the editable order fields (created_at preserved). Floor the total
  --    at 0, and re-guard status <> 'voided' so a void that raced us can't be
  --    overwritten with a live total (row lock makes this deterministic).
  v_total := greatest(v_subtotal - coalesce(v_discount, 0), 0);
  update pos_orders set
    payment_method  = coalesce(nullif(p_patch->>'payment_method', ''), payment_method),
    customer_handle = case when p_patch ? 'customer_handle' then nullif(p_patch->>'customer_handle', '') else customer_handle end,
    remarks         = case when p_patch ? 'remarks' then nullif(p_patch->>'remarks', '') else remarks end,
    subtotal        = v_subtotal,
    total           = v_total,
    oversold        = v_oversold,
    edited_at       = now()
  where id = v_order_id and status <> 'voided';
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'error', 'order was voided during edit');
  end if;

  return jsonb_build_object('ok', true, 'order_id', v_order_id, 'oversold', v_oversold, 'total', v_total);
end;
$$;

-- Unvoid a voided order: restore it to 'completed' and re-apply its inventory
-- footprint FEFO from its existing line items. Inverse of void_pos_order.
-- State-based/convergent: it first neutralizes the order's entire current net
-- footprint (a cleanly voided order nets to 0 here), then re-decrements FEFO, so
-- re-running lands the same result. Oversell-safe (overdraws the earliest lot).
-- Rejects an order that isn't voided. Online-only from the clients.
create or replace function public.unvoid_pos_order(p_client_uuid text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id     uuid;
  v_status       text;
  v_oversold     boolean := false;
  v_decrement    record;
  v_lot          record;
  v_item         record;
  v_remaining    integer;
  v_take         integer;
  v_overdraw_lot uuid;
  v_decrements   jsonb := '{}'::jsonb;
  v_rows         integer;
begin
  -- Lock the order row so a concurrent void/edit is serialized.
  select id, status into v_order_id, v_status
    from pos_orders where client_uuid = p_client_uuid
    for update;

  if v_order_id is null then
    return jsonb_build_object('ok', false, 'error', 'order not found');
  end if;
  if v_status <> 'voided' then
    return jsonb_build_object('ok', false, 'error', 'order is not voided');
  end if;

  -- 1. Neutralize the order's entire current net footprint (restore lots). A
  --    cleanly voided order nets to 0 here; this defends against odd states.
  update pos_inventory_lots l
     set qty_on_hand = l.qty_on_hand - agg.net, updated_at = now()
  from (
    select lot_id, sum(delta) as net
    from pos_stock_movements
    where order_id = v_order_id and lot_id is not null
    group by lot_id
    having sum(delta) <> 0
  ) agg
  where l.lot_id = agg.lot_id;

  insert into pos_stock_movements (product_id, lot_id, order_id, delta, reason, created_at)
  select product_id, lot_id, v_order_id, -sum(delta), 'unvoid-reverse', now()
  from pos_stock_movements
  where order_id = v_order_id
  group by product_id, lot_id
  having sum(delta) <> 0;

  -- 2. Accumulate per-product decrements from the order's existing line items.
  for v_item in
    select product_id, sum(qty)::integer as qty
    from pos_order_items
    where order_id = v_order_id and product_id is not null
    group by product_id
  loop
    v_decrements := jsonb_set(v_decrements, array[v_item.product_id], to_jsonb(v_item.qty));
  end loop;

  -- 3. Re-apply the decrements FEFO (mirrors apply_pos_order), reason 'unvoid-sale'.
  for v_decrement in
    select key as product_id, value::integer as qty from jsonb_each_text(v_decrements)
  loop
    v_remaining := v_decrement.qty;

    for v_lot in
      select lot_id, qty_on_hand
      from pos_inventory_lots
      where product_id = v_decrement.product_id and qty_on_hand > 0
      order by expires_on asc nulls last, received_at asc
      for update
    loop
      exit when v_remaining <= 0;
      v_take := least(v_lot.qty_on_hand, v_remaining);
      update pos_inventory_lots set qty_on_hand = qty_on_hand - v_take, updated_at = now()
        where lot_id = v_lot.lot_id;
      insert into pos_stock_movements (product_id, lot_id, order_id, delta, reason, created_at)
      values (v_decrement.product_id, v_lot.lot_id, v_order_id, -v_take, 'unvoid-sale', now());
      v_remaining := v_remaining - v_take;
    end loop;

    if v_remaining > 0 then
      v_oversold := true;
      select lot_id into v_overdraw_lot
        from pos_inventory_lots
        where product_id = v_decrement.product_id
        order by expires_on asc nulls last, received_at asc
        limit 1;
      if v_overdraw_lot is not null then
        update pos_inventory_lots set qty_on_hand = qty_on_hand - v_remaining, updated_at = now()
          where lot_id = v_overdraw_lot;
      end if;
      insert into pos_stock_movements (product_id, lot_id, order_id, delta, reason, created_at)
      values (v_decrement.product_id, v_overdraw_lot, v_order_id, -v_remaining, 'unvoid-sale', now());
    end if;
  end loop;

  -- 4. Restore completed status; clear voided_at; refresh oversold. Re-guard
  --    status = 'voided' so a concurrent change can't be silently overwritten.
  update pos_orders set
    status = 'completed',
    voided_at = null,
    oversold = v_oversold
  where id = v_order_id and status = 'voided';
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'error', 'order changed during unvoid');
  end if;

  return jsonb_build_object('ok', true, 'order_id', v_order_id, 'oversold', v_oversold);
end;
$$;

-- Set (or clear, with null/empty) a sale's remarks by client_uuid, from any device.
create or replace function public.set_pos_order_remarks(p_client_uuid text, p_remarks text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update pos_orders
     set remarks = nullif(p_remarks, '')
   where client_uuid = p_client_uuid;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Upsert a bundle + replace its fixed items, keyed by the POS's bundle_uuid.
-- Lets bundles created on one POS device sync to the others (via Coop).
create or replace function public.apply_pos_bundle(p_bundle jsonb, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text := p_bundle->>'bundle_id';
begin
  if v_id is null or v_id = '' then
    raise exception 'bundle_id is required';
  end if;

  insert into pos_bundles (bundle_id, name, price, active, bundle_type, pick_count, line_categories, emoji, created_at, updated_at)
  values (
    v_id,
    coalesce(p_bundle->>'name', ''),
    coalesce((p_bundle->>'price')::numeric, 0),
    coalesce((p_bundle->>'active')::boolean, true),
    coalesce(nullif(p_bundle->>'bundle_type', ''), 'fixed'),
    nullif(p_bundle->>'pick_count', '')::integer,
    case when p_bundle ? 'line_categories' then p_bundle->'line_categories' else null end,
    nullif(p_bundle->>'emoji', ''),
    now(), now()
  )
  on conflict (bundle_id) do update set
    name = excluded.name,
    price = excluded.price,
    active = excluded.active,
    bundle_type = excluded.bundle_type,
    pick_count = excluded.pick_count,
    line_categories = excluded.line_categories,
    emoji = excluded.emoji,
    updated_at = now();

  delete from pos_bundle_items where bundle_id = v_id;
  insert into pos_bundle_items (bundle_id, product_id, qty)
  select v_id, (it->>'product_id'), coalesce((it->>'qty')::integer, 1)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as it
  where (it->>'product_id') is not null;
end;
$$;

-- Remove a bundle (and its items) by bundle_uuid.
create or replace function public.delete_pos_bundle(p_bundle_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from pos_bundle_items where bundle_id = p_bundle_id;
  delete from pos_bundles where bundle_id = p_bundle_id;
end;
$$;

-- =========================================================================
-- 4. Row Level Security — default deny; anon gets SELECT-only on catalog/
--    inventory/orders reads, plus EXECUTE on the RPCs. No anon INSERT/
--    UPDATE/DELETE policy exists anywhere — all writes flow through the
--    SECURITY DEFINER functions above.
-- =========================================================================

alter table public.pos_products        enable row level security;
alter table public.pos_prices          enable row level security;
alter table public.pos_price_changes   enable row level security;
alter table public.pos_inventory_lots  enable row level security;
alter table public.pos_stock_movements enable row level security;
alter table public.pos_orders          enable row level security;
alter table public.pos_order_items     enable row level security;
alter table public.pos_bundles         enable row level security;
alter table public.pos_bundle_items    enable row level security;
alter table public.pos_sync_log        enable row level security;

create policy pos_products_read     on public.pos_products     for select to anon using (true);
create policy pos_prices_read       on public.pos_prices       for select to anon using (true);
create policy pos_lots_read         on public.pos_inventory_lots for select to anon using (true);
create policy pos_orders_read       on public.pos_orders       for select to anon using (true);
create policy pos_items_read        on public.pos_order_items  for select to anon using (true);
create policy pos_bundles_read      on public.pos_bundles      for select to anon using (true);
create policy pos_bundle_items_read on public.pos_bundle_items for select to anon using (true);
-- pos_price_changes / pos_stock_movements / pos_sync_log: no anon SELECT
-- policy unless a screen needs it later.

grant execute on function public.apply_pos_order(jsonb, jsonb)               to anon;
grant execute on function public.reprice_product(text, numeric, text, text) to anon;
grant execute on function public.rename_product(text, text, text)           to anon;
grant execute on function public.set_product_listing(text, boolean, text)   to anon;
grant execute on function public.receive_lot(text, date, integer, text)     to anon;
grant execute on function public.recount_lot(uuid, integer, text, text)     to anon;
grant execute on function public.record_sync(text, text, jsonb, text)       to anon;
grant execute on function public.set_product_stock(text, integer, text)     to anon;
grant execute on function public.set_product_emoji(text, text)              to anon;
grant execute on function public.void_pos_order(text)                       to anon;
grant execute on function public.unvoid_pos_order(text)                     to anon;
grant execute on function public.edit_pos_order(text, jsonb, jsonb)         to anon;
grant execute on function public.set_pos_order_remarks(text, text)          to anon;
grant execute on function public.apply_pos_bundle(jsonb, jsonb)             to anon;
grant execute on function public.delete_pos_bundle(text)                    to anon;

-- =========================================================================
-- 5. Store settings (added 2026-09-11) — a tiny key/value store for owner-set
--    dashboard config. First key: daily_revenue_target (the gamified daily
--    sales goal on the Coop Offline Sales page). Additive; writes flow through
--    the SECURITY DEFINER RPC only, like every other pos_* write path.
-- =========================================================================

create table if not exists public.pos_settings (
  key        text primary key,
  value      jsonb not null,
  updated_by text,
  updated_at timestamptz not null default now()
);

-- Seed the daily revenue target (₱5,000 default). Idempotent — re-running the
-- schema never clobbers an owner-set value.
insert into public.pos_settings (key, value)
values ('daily_revenue_target', jsonb_build_object('amount', 5000))
on conflict (key) do nothing;

-- set_pos_daily_target: upsert the daily revenue goal in one call.
create or replace function public.set_pos_daily_target(p_amount numeric, p_by text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into pos_settings (key, value, updated_by, updated_at)
  values ('daily_revenue_target', jsonb_build_object('amount', p_amount), p_by, now())
  on conflict (key) do update
    set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
end;
$$;

alter table public.pos_settings enable row level security;
create policy pos_settings_read on public.pos_settings for select to anon using (true);
grant execute on function public.set_pos_daily_target(numeric, text) to anon;
