-- ============================================================================
-- POS prod promotion — Staging (syxwixxzmytvhwhkwdvw) → Coop prod (qkxbwzdxhwcbwgriwipi)
-- Date: 2026-09-17   |   Author: reviewed package, apply via MCP in one controlled pass
--
-- SCOPE: schema + code parity only. NO product/stock/lot/order/movement DATA is
-- copied. Prod's live data stays exactly as-is. Everything here is ADDITIVE:
-- 4 new tables, 4 new columns, 11 new functions, 3 replaced functions (drifted),
-- 1 trigger, RLS/policies/grants, config seeds, ledger backfill.
--
-- Built from a live staging↔prod object diff (prod's migration ledger is empty and
-- staging carries untracked objects), NOT from replaying tracked migrations.
--
-- PREFLIGHT (do BEFORE running):
--   1. Confirm target project is qkxbwzdxhwcbwgriwipi (Coop PROD).
--   2. Snapshot: pg_dump --schema-only of prod public schema.
--   3. Fill the two placeholders below:  <<PROD_ANON_KEY>>
--   4. Deploy the stock-alert edge function + set its secrets (see companion notes)
--      BEFORE creating the trigger in Section 5.
--
-- Sections 2–7 are transactional DDL and can run as one BEGIN/COMMIT.
-- Section 1 (extension + ALTER DATABASE) is run first, on its own.
-- ============================================================================


-- ============================================================================
-- SECTION 1 — Extension + environment config  (run first, outside the main txn)
-- ============================================================================
create extension if not exists pg_net;

-- Environment-aware alert target: the SAME pos_fire_stock_alert() body runs on both
-- envs and reads its endpoint + (public) anon key from a pos_settings row
-- (key = 'stock_alert_endpoint'), seeded per environment in Section 6. The anon key
-- is NOT a secret (it ships in browsers, guarded by RLS); the JWT-verified edge
-- function does its real work with its own service-role env.
-- (ALTER DATABASE SET was the first choice, but the MCP role is not superuser on
-- Supabase — "permission denied to set parameter" — so config lives in data instead:
-- always fresh, no connection-cycle lag, no superuser needed.)


-- ============================================================================
-- SECTION 2 — New tables + indexes + RLS + policies
-- ============================================================================

-- 2.1 pos_events — one row per bazaar; opening/closing cash lives here.
create table if not exists public.pos_events (
  event_id     uuid primary key default gen_random_uuid(),
  name         text not null,
  venue        text,
  city         text,
  organizer    text,
  starts_on    date,
  ends_on      date,
  opening_cash numeric,
  cash_note    text,
  closing_cash numeric,
  status       text not null default 'active',   -- active | closed
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists pos_events_dates_idx on public.pos_events(starts_on, ends_on);
alter table public.pos_events enable row level security;
drop policy if exists pos_events_read on public.pos_events;
create policy pos_events_read on public.pos_events for select to anon using (true);

-- 2.2 pos_settings — key/value config (forecast, targets, next-event plan).
--     (Absent on prod; predates the ledger on staging.) anon may read.
create table if not exists public.pos_settings (
  key        text primary key,
  value      jsonb not null,
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table public.pos_settings enable row level security;
drop policy if exists pos_settings_read on public.pos_settings;
create policy pos_settings_read on public.pos_settings for select to anon using (true);

-- 2.3 pos_stock_alert_log — low-stock email dedupe ledger. Service-role only.
create table if not exists public.pos_stock_alert_log (
  id            bigint generated always as identity primary key,
  product_id    text not null references public.pos_products(product_id),
  level_at_fire text not null,          -- 'low' | 'out'
  stock_at_fire integer not null,
  fired_at      timestamptz not null default now(),
  resolved_at   timestamptz
);
-- One OPEN alert per product = atomic dedup for the immediate path.
create unique index if not exists pos_stock_alert_log_open_idx
  on public.pos_stock_alert_log (product_id) where resolved_at is null;
alter table public.pos_stock_alert_log enable row level security;
-- No policy: service-role (edge function) only.

-- 2.4 pos_dashboard_users — Coop sign-ins, so alerts can reach real users.
--     Service-role only; self-populates on Google sign-in.
create table if not exists public.pos_dashboard_users (
  email      text primary key,
  first_seen timestamptz not null default now(),
  last_seen  timestamptz not null default now()
);
alter table public.pos_dashboard_users enable row level security;
-- No policy: service-role only.


-- ============================================================================
-- SECTION 3 — New columns on existing tables (all nullable → no table rewrite)
-- ============================================================================
alter table public.pos_orders
  add column if not exists event_id  uuid references public.pos_events(event_id),
  add column if not exists pet_type  text,        -- 'dog' | 'cat' | 'both' | null
  add column if not exists edited_at timestamptz; -- set by edit_pos_order
create index if not exists pos_orders_event_id_idx on public.pos_orders(event_id);

-- Required by the replaced apply_pos_order / edit_pos_order (bundle grouping).
alter table public.pos_order_items
  add column if not exists bundle_group text;


-- ============================================================================
-- SECTION 4 — Functions (11 new + 3 replaced). Bodies are staging's current
-- authoritative definitions, except pos_fire_stock_alert which is the new
-- ENVIRONMENT-AWARE version (reads Section 1 settings; no hardcoded ref).
-- ============================================================================

-- 4.0 pos_fire_stock_alert — ENV-AWARE (hand-authored; supersedes staging's hardcoded body).
-- Reads its endpoint + (public) anon key from the pos_settings row
-- 'stock_alert_endpoint' (seeded per environment in Section 6). No hardcoded ref,
-- so the identical body runs on staging and prod. Safe no-op if unconfigured.
create or replace function public.pos_fire_stock_alert()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cfg jsonb;
  v_url text;
  v_key text;
begin
  if new.product_id is null then return new; end if;
  select value into v_cfg from pos_settings where key = 'stock_alert_endpoint';
  v_url := v_cfg->>'url';
  v_key := v_cfg->>'anon_key';
  if v_url is null or v_key is null then return new; end if;     -- not configured → safe no-op
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type','application/json',
                                  'Authorization', 'Bearer ' || v_key),
    body    := jsonb_build_object('product_id', new.product_id)
  );
  return new;
exception when others then
  return new;  -- alerting must NEVER break or slow a sale
end;
$function$;

-- 4.1 apply_pos_order — REPLACED (drifted): now persists event_id, pet_type, bundle_group.
create or replace function public.apply_pos_order(p_order jsonb, p_items jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
  select id, oversold into v_existing_id, v_existing_oversold
    from pos_orders where client_uuid = v_client_uuid;

  if v_existing_id is not null then
    return jsonb_build_object('order_id', v_existing_id, 'oversold', v_existing_oversold, 'idempotent', true);
  end if;

  v_order_id := gen_random_uuid();

  insert into pos_orders (id, client_uuid, device_id, cashier, customer_handle, subtotal, discount, total, oversold, payment_method, event_id, pet_type, created_at)
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
    nullif(p_order->>'event_id', '')::uuid,
    nullif(p_order->>'pet_type', ''),
    coalesce((p_order->>'created_at')::timestamptz, now())
  );

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id   := v_item->>'product_id';
    v_bundle_id    := v_item->>'bundle_id';
    v_bundle_group := v_item->>'bundle_group';
    v_qty          := (v_item->>'qty')::integer;
    v_unit_price   := (v_item->>'unit_price')::numeric;
    v_line_total   := (v_item->>'line_total')::numeric;

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
$function$;

-- 4.2 set_product_stock — REPLACED (drifted): FEFO recount adjust + movement row.
create or replace function public.set_product_stock(p_product_id text, p_new_qty integer, p_by text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
$function$;

-- 4.3 void_pos_order — REPLACED (drifted): compensating audit rows net to zero.
create or replace function public.void_pos_order(p_client_uuid text)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_order_id uuid;
  v_count integer;
begin
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

  insert into pos_stock_movements (product_id, lot_id, order_id, delta, reason, created_by, created_at)
  select product_id, lot_id, v_order_id, -sum(delta), 'void', null, now()
  from pos_stock_movements
  where order_id = v_order_id
  group by product_id, lot_id
  having sum(delta) <> 0;

  return v_count;
end;
$function$;

-- 4.4 upsert_pos_event — NEW: create/edit event, overlap guard, carries closing_cash.
create or replace function public.upsert_pos_event(p_event jsonb)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_id    uuid := nullif(p_event->>'event_id', '')::uuid;
  v_start date := nullif(p_event->>'starts_on', '')::date;
  v_end   date := nullif(p_event->>'ends_on', '')::date;
  v_from  date;
  v_to    date;
  v_conflict text;
begin
  if v_id is null then
    v_id := gen_random_uuid();
  end if;

  if (p_event ? 'starts_on' or p_event ? 'ends_on') and (v_start is not null or v_end is not null) then
    v_from := coalesce(v_start, v_end);
    v_to   := coalesce(v_end, v_start);
    select e.name into v_conflict
      from pos_events e
     where e.event_id <> v_id
       and coalesce(e.starts_on, e.ends_on) is not null
       and coalesce(e.starts_on, e.ends_on) <= v_to
       and v_from <= coalesce(e.ends_on, e.starts_on)
     limit 1;
    if v_conflict is not null then
      raise exception 'event dates overlap an existing event: %', v_conflict
        using errcode = 'check_violation';
    end if;
  end if;

  insert into pos_events (event_id, name, venue, city, organizer, starts_on, ends_on,
                          opening_cash, closing_cash, cash_note, status, created_by, created_at, updated_at)
  values (
    v_id,
    coalesce(p_event->>'name', ''),
    p_event->>'venue',
    p_event->>'city',
    p_event->>'organizer',
    v_start,
    v_end,
    nullif(p_event->>'opening_cash', '')::numeric,
    nullif(p_event->>'closing_cash', '')::numeric,
    p_event->>'cash_note',
    coalesce(nullif(p_event->>'status', ''), 'active'),
    p_event->>'created_by',
    now(), now()
  )
  on conflict (event_id) do update set
    name         = case when p_event ? 'name'         then coalesce(excluded.name, pos_events.name) else pos_events.name end,
    venue        = case when p_event ? 'venue'        then excluded.venue        else pos_events.venue end,
    city         = case when p_event ? 'city'         then excluded.city         else pos_events.city end,
    organizer    = case when p_event ? 'organizer'    then excluded.organizer    else pos_events.organizer end,
    starts_on    = case when p_event ? 'starts_on'    then excluded.starts_on    else pos_events.starts_on end,
    ends_on      = case when p_event ? 'ends_on'      then excluded.ends_on      else pos_events.ends_on end,
    opening_cash = case when p_event ? 'opening_cash' then excluded.opening_cash else pos_events.opening_cash end,
    closing_cash = case when p_event ? 'closing_cash' then excluded.closing_cash else pos_events.closing_cash end,
    cash_note    = case when p_event ? 'cash_note'    then excluded.cash_note    else pos_events.cash_note end,
    status       = case when p_event ? 'status'       then excluded.status       else pos_events.status end,
    updated_at   = now();

  return v_id;
end;
$function$;

-- 4.5 close_pos_event — NEW.
create or replace function public.close_pos_event(p_event_id uuid, p_closing_cash numeric)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  update pos_events
     set status = 'closed',
         closing_cash = coalesce(p_closing_cash, closing_cash),
         updated_at = now()
   where event_id = p_event_id;
end;
$function$;

-- 4.6 attribute_untagged_orders_to_event — NEW (Manila-date back-fill of event_id).
create or replace function public.attribute_untagged_orders_to_event(p_event_id uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_from date;
  v_to   date;
  v_count integer;
begin
  select coalesce(starts_on, ends_on), coalesce(ends_on, starts_on)
    into v_from, v_to
    from pos_events
   where event_id = p_event_id;

  if v_from is null or v_to is null then
    return 0;
  end if;

  with updated as (
    update pos_orders o
       set event_id = p_event_id
     where o.event_id is null
       and (o.created_at at time zone 'Asia/Manila')::date between v_from and v_to
    returning 1
  )
  select count(*) into v_count from updated;

  return v_count;
end;
$function$;

-- 4.7 add_pos_stock — NEW (Coop batch intake, all-or-nothing).
create or replace function public.add_pos_stock(p_lines jsonb, p_by text)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_line   jsonb;
  v_sku    text;
  v_qty    integer;
  v_lot_id uuid;
  v_count  integer := 0;
begin
  if jsonb_typeof(p_lines) is distinct from 'array' then
    raise exception 'lines must be a json array';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_sku := v_line->>'sku';
    v_qty := (v_line->>'qty')::integer;

    if v_sku is null or v_qty is null or v_qty <= 0 then
      raise exception 'each line needs a product and a positive quantity';
    end if;
    if not exists (select 1 from pos_products where product_id = v_sku) then
      raise exception 'unknown product %', v_sku;
    end if;

    v_lot_id := gen_random_uuid();
    insert into pos_inventory_lots (lot_id, product_id, lot_code, expires_on, qty_received, qty_on_hand, received_at, updated_at)
    values (v_lot_id, v_sku, 'coop-add', null, v_qty, v_qty, now(), now());

    insert into pos_stock_movements (product_id, lot_id, order_id, delta, reason, created_by, created_at)
    values (v_sku, v_lot_id, null, v_qty, 'receipt', p_by, now());

    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'no lines to add';
  end if;
  return v_count;
end;
$function$;

-- 4.8 void_last_stock_add — NEW (undo the most recent receipt).
create or replace function public.void_last_stock_add(p_product_id text, p_by text)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_mov     record;
  v_on_hand integer;
  v_remove  integer;
begin
  select m.id, m.lot_id, m.delta
    into v_mov
    from pos_stock_movements m
    where m.product_id = p_product_id and m.reason = 'receipt'
    order by m.created_at desc
    limit 1;

  if v_mov.lot_id is null then
    return 0;
  end if;

  select qty_on_hand into v_on_hand from pos_inventory_lots where lot_id = v_mov.lot_id for update;
  v_remove := least(coalesce(v_on_hand, 0), v_mov.delta);
  if v_remove <= 0 then
    return 0;
  end if;

  update pos_inventory_lots set qty_on_hand = qty_on_hand - v_remove, updated_at = now()
    where lot_id = v_mov.lot_id;

  insert into pos_stock_movements (product_id, lot_id, order_id, delta, reason, created_by, created_at)
  values (p_product_id, v_mov.lot_id, null, -v_remove, 'add-void', p_by, now());

  return v_remove;
end;
$function$;

-- 4.9 set_pos_stock_config — NEW (forecast tuning upsert).
create or replace function public.set_pos_stock_config(p_config jsonb, p_by text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if jsonb_typeof(p_config) is distinct from 'object' then
    raise exception 'config must be a json object';
  end if;
  insert into pos_settings (key, value, updated_by, updated_at)
  values ('stock_forecast_config', p_config, p_by, now())
  on conflict (key) do update
    set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
end;
$function$;

-- 4.10 set_pos_next_event_plan — NEW (surge plan upsert).
create or replace function public.set_pos_next_event_plan(p_plan jsonb, p_by text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if jsonb_typeof(p_plan) is distinct from 'object' then
    raise exception 'plan must be a json object';
  end if;
  insert into pos_settings (key, value, updated_by, updated_at)
  values ('next_event_plan', p_plan, p_by, now())
  on conflict (key) do update
    set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
end;
$function$;

-- 4.11 set_pos_daily_target — NEW (daily revenue target upsert).
create or replace function public.set_pos_daily_target(p_amount numeric, p_by text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  insert into pos_settings (key, value, updated_by, updated_at)
  values ('daily_revenue_target', jsonb_build_object('amount', p_amount), p_by, now())
  on conflict (key) do update
    set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
end;
$function$;

-- 4.12 edit_pos_order — NEW (reverse-then-reapply order edit; sets edited_at).
create or replace function public.edit_pos_order(p_client_uuid text, p_patch jsonb, p_entries jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
  select id, status, discount into v_order_id, v_status, v_discount
    from pos_orders where client_uuid = p_client_uuid for update;
  if v_order_id is null then return jsonb_build_object('ok', false, 'error', 'order not found'); end if;
  if v_status = 'voided' then return jsonb_build_object('ok', false, 'error', 'cannot edit a voided order'); end if;
  if coalesce(jsonb_array_length(p_entries), 0) = 0 then
    return jsonb_build_object('ok', false, 'error', 'an order needs at least one item');
  end if;

  for v_entry in select * from jsonb_array_elements(p_entries) loop
    if (v_entry->>'kind') = 'bundle' then
      v_bundle_id := v_entry->>'bundle_id';
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

  update pos_inventory_lots l set qty_on_hand = l.qty_on_hand - agg.net, updated_at = now()
  from (select lot_id, sum(delta) net from pos_stock_movements
        where order_id = v_order_id and lot_id is not null group by lot_id having sum(delta) <> 0) agg
  where l.lot_id = agg.lot_id;

  insert into pos_stock_movements (product_id, lot_id, order_id, delta, reason, created_at)
  select product_id, lot_id, v_order_id, -sum(delta), 'edit-reverse', now()
  from pos_stock_movements where order_id = v_order_id and reason not in ('edit-reverse')
  group by product_id, lot_id having sum(delta) <> 0;

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
        insert into pos_order_items (order_id, product_id, bundle_id, bundle_group, qty, unit_price, line_total)
        values (v_order_id, null, v_bundle_id, v_grp, 1, v_bprice, v_bprice);
        v_subtotal := v_subtotal + v_bprice;
        if v_btype = 'pick' then
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
          for v_bi in select product_id, qty from pos_bundle_items where bundle_id = v_bundle_id loop
            v_decrements := jsonb_set(v_decrements, array[v_bi.product_id],
              to_jsonb(coalesce((v_decrements->>v_bi.product_id)::integer, 0) + v_bi.qty));
          end loop;
        end if;
      end if;
    end if;
  end loop;

  for v_decrement in select key as product_id, value::integer as qty from jsonb_each_text(v_decrements) loop
    v_remaining := v_decrement.qty;
    for v_lot in
      select lot_id, qty_on_hand from pos_inventory_lots
      where product_id = v_decrement.product_id and qty_on_hand > 0
      order by expires_on asc nulls last, received_at asc for update
    loop
      exit when v_remaining <= 0;
      v_take := least(v_lot.qty_on_hand, v_remaining);
      update pos_inventory_lots set qty_on_hand = qty_on_hand - v_take, updated_at = now() where lot_id = v_lot.lot_id;
      insert into pos_stock_movements (product_id, lot_id, order_id, delta, reason, created_at)
      values (v_decrement.product_id, v_lot.lot_id, v_order_id, -v_take, 'edit-sale', now());
      v_remaining := v_remaining - v_take;
    end loop;
    if v_remaining > 0 then
      v_oversold := true;
      select lot_id into v_overdraw_lot from pos_inventory_lots
        where product_id = v_decrement.product_id order by expires_on asc nulls last, received_at asc limit 1;
      if v_overdraw_lot is not null then
        update pos_inventory_lots set qty_on_hand = qty_on_hand - v_remaining, updated_at = now() where lot_id = v_overdraw_lot;
      end if;
      insert into pos_stock_movements (product_id, lot_id, order_id, delta, reason, created_at)
      values (v_decrement.product_id, v_overdraw_lot, v_order_id, -v_remaining, 'edit-sale', now());
    end if;
  end loop;

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
  if v_rows = 0 then return jsonb_build_object('ok', false, 'error', 'order was voided during edit'); end if;

  return jsonb_build_object('ok', true, 'order_id', v_order_id, 'oversold', v_oversold, 'total', v_total);
end;
$function$;

-- 4.13 unvoid_pos_order — NEW (reverse a void; re-apply FEFO).
create or replace function public.unvoid_pos_order(p_client_uuid text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
  select id, status into v_order_id, v_status
    from pos_orders where client_uuid = p_client_uuid
    for update;

  if v_order_id is null then
    return jsonb_build_object('ok', false, 'error', 'order not found');
  end if;
  if v_status <> 'voided' then
    return jsonb_build_object('ok', false, 'error', 'order is not voided');
  end if;

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

  for v_item in
    select product_id, sum(qty)::integer as qty
    from pos_order_items
    where order_id = v_order_id and product_id is not null
    group by product_id
  loop
    v_decrements := jsonb_set(v_decrements, array[v_item.product_id], to_jsonb(v_item.qty));
  end loop;

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
$function$;


-- ============================================================================
-- SECTION 5 — Trigger (create LAST, after the edge function is deployed + live)
-- ============================================================================
drop trigger if exists pos_stock_movements_alert_ai on public.pos_stock_movements;
create trigger pos_stock_movements_alert_ai
after insert on public.pos_stock_movements
for each row execute function public.pos_fire_stock_alert();


-- ============================================================================
-- SECTION 6 — Config seeds (idempotent). daily_revenue_target: CONFIRM value.
-- ============================================================================
insert into public.pos_settings (key, value)
values ('stock_forecast_config', jsonb_build_object(
  'threshold', 10,
  'threshold_overrides', '{}'::jsonb,
  'target_cover_events', 6,
  'lead_time_days', 3,
  'early_warning_events', 3,
  'velocity_mode', 'event_aware',
  'event_days', jsonb_build_array(5, 6, 0)
))
on conflict (key) do nothing;

insert into public.pos_settings (key, value)
values ('next_event_plan', jsonb_build_object(
  'event_this_weekend', true,
  'multiplier', 1,
  'by_category', '{}'::jsonb,
  'by_product', '{}'::jsonb
))
on conflict (key) do nothing;

-- Coop prod daily revenue target (confirmed 2026-09-17): ₱13,500.
insert into public.pos_settings (key, value, updated_by)
values ('daily_revenue_target', jsonb_build_object('amount', 13500), 'promotion-seed')
on conflict (key) do nothing;

-- Env-aware alert endpoint read by pos_fire_stock_alert() (Section 4.0). Prod values.
-- anon_key is the PUBLIC anon key (guarded by RLS; ships in the POS app already).
insert into public.pos_settings (key, value, updated_by)
values ('stock_alert_endpoint', jsonb_build_object(
  'url', 'https://qkxbwzdxhwcbwgriwipi.supabase.co/functions/v1/stock-alert',
  'anon_key', '<<PROD_ANON_KEY>>'
), 'promotion-seed')
on conflict (key) do nothing;


-- ============================================================================
-- SECTION 7 — Grants (mirror staging: anon/authenticated/service_role EXECUTE)
-- ============================================================================
grant execute on function public.pos_fire_stock_alert()                              to anon, authenticated, service_role;
grant execute on function public.apply_pos_order(jsonb, jsonb)                       to anon, authenticated, service_role;
grant execute on function public.set_product_stock(text, integer, text)             to anon, authenticated, service_role;
grant execute on function public.void_pos_order(text)                               to anon, authenticated, service_role;
grant execute on function public.upsert_pos_event(jsonb)                            to anon, authenticated, service_role;
grant execute on function public.close_pos_event(uuid, numeric)                     to anon, authenticated, service_role;
grant execute on function public.attribute_untagged_orders_to_event(uuid)           to anon, authenticated, service_role;
grant execute on function public.add_pos_stock(jsonb, text)                         to anon, authenticated, service_role;
grant execute on function public.void_last_stock_add(text, text)                    to anon, authenticated, service_role;
grant execute on function public.set_pos_stock_config(jsonb, text)                  to anon, authenticated, service_role;
grant execute on function public.set_pos_next_event_plan(jsonb, text)               to anon, authenticated, service_role;
grant execute on function public.set_pos_daily_target(numeric, text)                to anon, authenticated, service_role;
grant execute on function public.edit_pos_order(text, jsonb, jsonb)                 to anon, authenticated, service_role;
grant execute on function public.unvoid_pos_order(text)                             to anon, authenticated, service_role;


-- ============================================================================
-- SECTION 8 — Migration ledger backfill (metadata only; makes future diffs clean)
-- Records the 4 pre-existing baseline versions + the 10 promoted here.
-- ============================================================================
insert into supabase_migrations.schema_migrations (version, name, statements) values
  ('20260909020512','pos_orders_void_and_remarks',        array['-- pre-existing on prod; recorded by 2026-09-17 promotion']),
  ('20260909075208','pos_products_emoji',                 array['-- pre-existing on prod; recorded by 2026-09-17 promotion']),
  ('20260909121651','pos_bundles_sync',                   array['-- pre-existing on prod; recorded by 2026-09-17 promotion']),
  ('20260909225416','set_product_emoji_rpc',              array['-- pre-existing on prod; recorded by 2026-09-17 promotion']),
  ('20260915073959','pos_events_cash_pet_tag',            array['-- applied via 2026-09-17 consolidated prod promotion']),
  ('20260915074025','apply_pos_order_event_pet',          array['-- applied via 2026-09-17 consolidated prod promotion']),
  ('20260915080703','upsert_pos_event_block_overlap',     array['-- applied via 2026-09-17 consolidated prod promotion']),
  ('20260916013036','pos_stock_forecast_settings',        array['-- applied via 2026-09-17 consolidated prod promotion']),
  ('20260916014207','pos_add_stock_and_void',             array['-- applied via 2026-09-17 consolidated prod promotion']),
  ('20260916051907','pos_stock_alert_log',                array['-- applied via 2026-09-17 consolidated prod promotion']),
  ('20260916055029','pos_dashboard_users',                array['-- applied via 2026-09-17 consolidated prod promotion']),
  ('20260916072410','pos_stock_alert_trigger',            array['-- applied via 2026-09-17 consolidated prod promotion']),
  ('20260916180040','attribute_untagged_orders_to_event', array['-- applied via 2026-09-17 consolidated prod promotion']),
  ('20260916185642','upsert_pos_event_carry_closing_cash',array['-- applied via 2026-09-17 consolidated prod promotion'])
on conflict (version) do nothing;

-- ============================================================================
-- END. Post-apply: run security advisors on prod; smoke-test each feature.
-- NOTE: this file omits untracked objects that already MATCH prod (pos_inventory
-- view, pos_products.emoji) and untracked functions that were NOT promoted here
-- because they already exist identically on prod.
-- ============================================================================
