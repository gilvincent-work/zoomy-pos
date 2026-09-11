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
  created_at     timestamptz not null default now(),
  synced_at      timestamptz not null default now()
);

create table public.pos_order_items (
  id          bigint generated always as identity primary key,
  order_id    uuid not null references public.pos_orders(id),
  product_id  text references public.pos_products(product_id),
  bundle_id   text references public.pos_bundles(bundle_id),
  qty         integer not null,
  unit_price  numeric not null,
  line_total  numeric not null,
  constraint pos_order_items_one_of_product_or_bundle
    check ((product_id is not null and bundle_id is null) or (product_id is null and bundle_id is not null))
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
    v_product_id := v_item->>'product_id';
    v_bundle_id  := v_item->>'bundle_id';
    v_qty        := (v_item->>'qty')::integer;
    v_unit_price := (v_item->>'unit_price')::numeric;
    v_line_total := (v_item->>'line_total')::numeric;

    insert into pos_order_items (order_id, product_id, bundle_id, qty, unit_price, line_total)
    values (v_order_id, v_product_id, v_bundle_id, v_qty, v_unit_price, v_line_total);

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

-- Void a sale by its client_uuid, from any device, AND restock it: the sold
-- quantities are added back to the lots they were drawn from. Idempotent
-- (re-voiding a voided order is a no-op, so stock is never restored twice).
-- Returns rows affected so the caller knows if the order was found. Voids are
-- monotonic — there is no un-void.
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

  -- Add each sold qty back to the lot it was drawn from (grouped so multiple
  -- lines on one lot sum). total_delta is negative (a 'sale' decrement), so
  -- subtracting it adds the stock back. Movements with no lot (pure oversell)
  -- restore nothing to a lot but are still logged reversed below.
  update pos_inventory_lots l
     set qty_on_hand = l.qty_on_hand - agg.total_delta,
         updated_at = now()
  from (
    select lot_id, sum(delta) as total_delta
    from pos_stock_movements
    where order_id = v_order_id and reason = 'sale' and lot_id is not null
    group by lot_id
  ) agg
  where l.lot_id = agg.lot_id;

  -- Compensating audit rows: one reversed movement per original sale decrement.
  insert into pos_stock_movements (product_id, lot_id, order_id, delta, reason, created_by, created_at)
  select product_id, lot_id, order_id, -delta, 'void', null, now()
  from pos_stock_movements
  where order_id = v_order_id and reason = 'sale';

  return v_count;
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
grant execute on function public.set_pos_order_remarks(text, text)          to anon;
grant execute on function public.apply_pos_bundle(jsonb, jsonb)             to anon;
grant execute on function public.delete_pos_bundle(text)                    to anon;
