-- ============================================================================
-- Phase 1 — Multi-location inventory (Office + Event) + stock transfers
-- Additive-only. Staging first (syxwixxzmytvhwhkwdvw). Promote to prod later.
--
-- Design / no-regression contract:
--   * New location dimension on pos_inventory_lots + pos_stock_movements.
--   * ALL existing rows backfill to location='event' (the pool the POS sells
--     from today), so every existing read/RPC returns identical results while
--     Office is empty.
--   * Sale/void/edit/unvoid FEFO selects are scoped to location='event' so, once
--     Office holds stock, sales can never consume it. Office stock reaches the
--     floor only via transfer_stock() into 'event'.
--   * pos_inventory view is left UNCHANGED (global sum) for backward compat.
--     POS reads the new pos_inventory_event view instead.
--   * BoxMe is intentionally OUT OF SCOPE (API not ready). pos_locations is a
--     table, so 'boxme' is a future INSERT — no schema rework.
-- ============================================================================

-- 1. Locations reference table -----------------------------------------------
create table if not exists public.pos_locations (
  code       text primary key,
  name       text not null,
  kind       text not null default 'physical',   -- physical | virtual (boxme later)
  active     boolean not null default true,
  sort       integer not null default 0,
  created_at timestamptz not null default now()
);

insert into public.pos_locations (code, name, kind, sort) values
  ('office', 'Office',  'physical', 0),
  ('event',  'Event',   'physical', 1)
on conflict (code) do nothing;

alter table public.pos_locations enable row level security;
do $$ begin
  if not exists (select 1 from pg_policy where polname = 'pos_locations_read'
                 and polrelid = 'public.pos_locations'::regclass) then
    create policy pos_locations_read on public.pos_locations for select to anon using (true);
  end if;
end $$;
grant select on public.pos_locations to anon, authenticated, service_role;

-- 2. location column on lots + movements (backfill existing -> 'event') -------
alter table public.pos_inventory_lots
  add column if not exists location text not null default 'event'
    references public.pos_locations(code);

alter table public.pos_stock_movements
  add column if not exists location text not null default 'event'
    references public.pos_locations(code);

alter table public.pos_stock_movements
  add column if not exists transfer_id uuid;   -- links the paired transfer-out / transfer-in rows

create index if not exists pos_inventory_lots_product_location_idx
  on public.pos_inventory_lots (product_id, location);
create index if not exists pos_stock_movements_transfer_idx
  on public.pos_stock_movements (transfer_id) where transfer_id is not null;

-- 3. Location-aware views -----------------------------------------------------
-- Per-location on-hand (dashboard breakdown / transfer planning).
-- security_invoker so RLS on the underlying tables applies to the caller, matching
-- the pos_inventory view's secure-by-default pattern.
create or replace view public.pos_inventory_by_location with (security_invoker = on) as
  select p.product_id,
         loc.code as location,
         coalesce(sum(l.qty_on_hand) filter (where l.location = loc.code), 0)::bigint as stock,
         min(l.expires_on) filter (where l.location = loc.code and l.qty_on_hand > 0) as next_expiry
  from pos_products p
  cross join pos_locations loc
  left join pos_inventory_lots l on l.product_id = p.product_id
  group by p.product_id, loc.code;

-- Event-only on-hand — same shape as pos_inventory; this is what the POS sells.
create or replace view public.pos_inventory_event with (security_invoker = on) as
  select p.product_id,
         coalesce(sum(l.qty_on_hand), 0)::bigint as stock,
         min(l.expires_on) filter (where l.qty_on_hand > 0) as next_expiry
  from pos_products p
  left join pos_inventory_lots l
    on l.product_id = p.product_id and l.location = 'event'
  group by p.product_id;

grant select on public.pos_inventory_by_location to anon, authenticated, service_role;
grant select on public.pos_inventory_event      to anon, authenticated, service_role;

-- 4. Transfer RPC: move stock between locations (FEFO, atomic) ----------------
create or replace function public.transfer_stock(
  p_product_id text,
  p_qty        integer,
  p_from       text,
  p_to         text,
  p_by         text default null,
  p_note       text default null
) returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare
  v_transfer_id uuid := gen_random_uuid();
  v_remaining   integer;
  v_take        integer;
  v_lot         record;
  v_dest_lot    uuid;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'transfer qty must be positive';
  end if;
  if p_from is null or p_to is null or p_from = p_to then
    raise exception 'from and to locations are required and must differ';
  end if;
  if not exists (select 1 from pos_locations where code = p_from) then
    raise exception 'unknown source location %', p_from;
  end if;
  if not exists (select 1 from pos_locations where code = p_to) then
    raise exception 'unknown destination location %', p_to;
  end if;
  if not exists (select 1 from pos_products where product_id = p_product_id) then
    raise exception 'unknown product %', p_product_id;
  end if;

  v_remaining := p_qty;

  -- Draw down FEFO from source-location lots; move each chunk into the matching
  -- destination lot (same lot_code + expiry), opening one if none exists yet.
  for v_lot in
    select lot_id, lot_code, expires_on, qty_on_hand
    from pos_inventory_lots
    where product_id = p_product_id and location = p_from and qty_on_hand > 0
    order by expires_on asc nulls last, received_at asc
    for update
  loop
    exit when v_remaining <= 0;
    v_take := least(v_lot.qty_on_hand, v_remaining);

    update pos_inventory_lots set qty_on_hand = qty_on_hand - v_take, updated_at = now()
      where lot_id = v_lot.lot_id;

    select lot_id into v_dest_lot
      from pos_inventory_lots
      where product_id = p_product_id and location = p_to
        and coalesce(lot_code, '') = coalesce(v_lot.lot_code, '')
        and expires_on is not distinct from v_lot.expires_on
      limit 1;

    if v_dest_lot is null then
      v_dest_lot := gen_random_uuid();
      insert into pos_inventory_lots (lot_id, product_id, location, lot_code, expires_on, qty_received, qty_on_hand, received_at, updated_at)
      values (v_dest_lot, p_product_id, p_to, v_lot.lot_code, v_lot.expires_on, v_take, v_take, now(), now());
    else
      update pos_inventory_lots set qty_on_hand = qty_on_hand + v_take, updated_at = now()
        where lot_id = v_dest_lot;
    end if;

    insert into pos_stock_movements (product_id, lot_id, location, order_id, delta, reason, created_by, created_at, transfer_id)
    values (p_product_id, v_lot.lot_id, p_from, null, -v_take, 'transfer-out', p_by, now(), v_transfer_id);
    insert into pos_stock_movements (product_id, lot_id, location, order_id, delta, reason, created_by, created_at, transfer_id)
    values (p_product_id, v_dest_lot, p_to, null, v_take, 'transfer-in', p_by, now(), v_transfer_id);

    v_remaining := v_remaining - v_take;
  end loop;

  -- Unlike a sale, a transfer NEVER oversells: you cannot move stock you lack.
  if v_remaining > 0 then
    raise exception 'insufficient stock at % for %: short by %', p_from, p_product_id, v_remaining;
  end if;

  return jsonb_build_object('transfer_id', v_transfer_id, 'moved', p_qty);
end;
$function$;

grant execute on function public.transfer_stock(text, integer, text, text, text, text) to anon, authenticated, service_role;

-- 5. Location-scope the sale path (apply_pos_order) --------------------------
-- Only change vs live: FEFO + overdraw selects filtered to location='event',
-- and movement inserts stamped location='event'. Behavior identical while all
-- stock is 'event'; prevents sales from ever eating Office stock later.
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
      where product_id = v_decrement.product_id and location = 'event' and qty_on_hand > 0
      order by expires_on asc nulls last, received_at asc
      for update
    loop
      exit when v_remaining <= 0;
      v_take := least(v_lot.qty_on_hand, v_remaining);
      update pos_inventory_lots set qty_on_hand = qty_on_hand - v_take, updated_at = now()
        where lot_id = v_lot.lot_id;
      insert into pos_stock_movements (product_id, lot_id, location, order_id, delta, reason, created_by, created_at)
      values (v_decrement.product_id, v_lot.lot_id, 'event', v_order_id, -v_take, 'sale', p_order->>'cashier', now());
      v_remaining := v_remaining - v_take;
    end loop;

    if v_remaining > 0 then
      v_oversold := true;

      select lot_id into v_overdraw_lot
        from pos_inventory_lots
        where product_id = v_decrement.product_id and location = 'event'
        order by expires_on asc nulls last, received_at asc
        limit 1;

      if v_overdraw_lot is not null then
        update pos_inventory_lots set qty_on_hand = qty_on_hand - v_remaining, updated_at = now()
          where lot_id = v_overdraw_lot;
      end if;

      insert into pos_stock_movements (product_id, lot_id, location, order_id, delta, reason, created_by, created_at)
      values (v_decrement.product_id, v_overdraw_lot, 'event', v_order_id, -v_remaining, 'sale', p_order->>'cashier', now());
    end if;
  end loop;

  if v_oversold then
    update pos_orders set oversold = true where id = v_order_id;
  end if;

  return jsonb_build_object('order_id', v_order_id, 'oversold', v_oversold, 'idempotent', false);
end;
$function$;

-- 6. Location-scope void_pos_order ------------------------------------------
-- Restore path is lot_id-driven (location-agnostic, unchanged); compensating
-- rows now carry the source movement's location.
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

  insert into pos_stock_movements (product_id, lot_id, location, order_id, delta, reason, created_by, created_at)
  select product_id, lot_id, location, v_order_id, -sum(delta), 'void', null, now()
  from pos_stock_movements
  where order_id = v_order_id
  group by product_id, lot_id, location
  having sum(delta) <> 0;

  return v_count;
end;
$function$;

-- 7. Location-scope unvoid_pos_order ----------------------------------------
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

  insert into pos_stock_movements (product_id, lot_id, location, order_id, delta, reason, created_at)
  select product_id, lot_id, location, v_order_id, -sum(delta), 'unvoid-reverse', now()
  from pos_stock_movements
  where order_id = v_order_id
  group by product_id, lot_id, location
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
      where product_id = v_decrement.product_id and location = 'event' and qty_on_hand > 0
      order by expires_on asc nulls last, received_at asc
      for update
    loop
      exit when v_remaining <= 0;
      v_take := least(v_lot.qty_on_hand, v_remaining);
      update pos_inventory_lots set qty_on_hand = qty_on_hand - v_take, updated_at = now()
        where lot_id = v_lot.lot_id;
      insert into pos_stock_movements (product_id, lot_id, location, order_id, delta, reason, created_at)
      values (v_decrement.product_id, v_lot.lot_id, 'event', v_order_id, -v_take, 'unvoid-sale', now());
      v_remaining := v_remaining - v_take;
    end loop;

    if v_remaining > 0 then
      v_oversold := true;
      select lot_id into v_overdraw_lot
        from pos_inventory_lots
        where product_id = v_decrement.product_id and location = 'event'
        order by expires_on asc nulls last, received_at asc
        limit 1;
      if v_overdraw_lot is not null then
        update pos_inventory_lots set qty_on_hand = qty_on_hand - v_remaining, updated_at = now()
          where lot_id = v_overdraw_lot;
      end if;
      insert into pos_stock_movements (product_id, lot_id, location, order_id, delta, reason, created_at)
      values (v_decrement.product_id, v_overdraw_lot, 'event', v_order_id, -v_remaining, 'unvoid-sale', now());
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

-- 8. Location-scope edit_pos_order ------------------------------------------
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

  insert into pos_stock_movements (product_id, lot_id, location, order_id, delta, reason, created_at)
  select product_id, lot_id, location, v_order_id, -sum(delta), 'edit-reverse', now()
  from pos_stock_movements where order_id = v_order_id and reason not in ('edit-reverse')
  group by product_id, lot_id, location having sum(delta) <> 0;

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
      where product_id = v_decrement.product_id and location = 'event' and qty_on_hand > 0
      order by expires_on asc nulls last, received_at asc for update
    loop
      exit when v_remaining <= 0;
      v_take := least(v_lot.qty_on_hand, v_remaining);
      update pos_inventory_lots set qty_on_hand = qty_on_hand - v_take, updated_at = now() where lot_id = v_lot.lot_id;
      insert into pos_stock_movements (product_id, lot_id, location, order_id, delta, reason, created_at)
      values (v_decrement.product_id, v_lot.lot_id, 'event', v_order_id, -v_take, 'edit-sale', now());
      v_remaining := v_remaining - v_take;
    end loop;
    if v_remaining > 0 then
      v_oversold := true;
      select lot_id into v_overdraw_lot from pos_inventory_lots
        where product_id = v_decrement.product_id and location = 'event' order by expires_on asc nulls last, received_at asc limit 1;
      if v_overdraw_lot is not null then
        update pos_inventory_lots set qty_on_hand = qty_on_hand - v_remaining, updated_at = now() where lot_id = v_overdraw_lot;
      end if;
      insert into pos_stock_movements (product_id, lot_id, location, order_id, delta, reason, created_at)
      values (v_decrement.product_id, v_overdraw_lot, 'event', v_order_id, -v_remaining, 'edit-sale', now());
    end if;
  end loop;

  v_total := greatest(v_subtotal - coalesce(v_discount, 0), 0);
  update pos_orders set
    payment_method  = coalesce(nullif(p_patch->>'payment_method', ''), payment_method),
    customer_handle = case when p_patch ? 'customer_handle' then nullif(p_patch->>'customer_handle', '') else customer_handle end,
    remarks         = case when p_patch ? 'remarks' then nullif(p_patch->>'remarks', '') else remarks end,
    pet_type        = case when p_patch ? 'pet_type' then nullif(p_patch->>'pet_type', '') else pet_type end,
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

-- 9. Stock-intake RPCs gain an optional p_location (default 'event' = no
--    behavior change). Dashboard will pass 'office' for the new intake flow.
-- IMPORTANT: adding an optional param changes the signature, so `create or
-- replace` would leave the ORIGINAL 4-arg/2-arg functions in place as separate
-- overloads and PostgREST could no longer resolve name-only calls (PGRST203).
-- Drop the originals first so exactly one signature per name remains.
drop function if exists public.receive_lot(text, date, integer, text);
drop function if exists public.add_pos_stock(jsonb, text);

create or replace function public.receive_lot(p_product_id text, p_expires_on date, p_qty integer, p_lot_code text, p_location text default 'event')
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_lot_id uuid := gen_random_uuid();
begin
  if not exists (select 1 from pos_locations where code = p_location) then
    raise exception 'unknown location %', p_location;
  end if;

  insert into pos_inventory_lots (lot_id, product_id, location, lot_code, expires_on, qty_received, qty_on_hand, received_at, updated_at)
  values (v_lot_id, p_product_id, p_location, p_lot_code, p_expires_on, p_qty, p_qty, now(), now());

  insert into pos_stock_movements (product_id, lot_id, location, order_id, delta, reason, created_by, created_at)
  values (p_product_id, v_lot_id, p_location, null, p_qty, 'receipt', null, now());

  return v_lot_id;
end;
$function$;

create or replace function public.add_pos_stock(p_lines jsonb, p_by text, p_location text default 'event')
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
  if not exists (select 1 from pos_locations where code = p_location) then
    raise exception 'unknown location %', p_location;
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
    insert into pos_inventory_lots (lot_id, product_id, location, lot_code, expires_on, qty_received, qty_on_hand, received_at, updated_at)
    values (v_lot_id, v_sku, p_location, 'coop-add', null, v_qty, v_qty, now(), now());

    insert into pos_stock_movements (product_id, lot_id, location, order_id, delta, reason, created_by, created_at)
    values (v_sku, v_lot_id, p_location, null, v_qty, 'receipt', p_by, now());

    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'no lines to add';
  end if;
  return v_count;
end;
$function$;

grant execute on function public.receive_lot(text, date, integer, text, text)  to anon, authenticated, service_role;
grant execute on function public.add_pos_stock(jsonb, text, text)              to anon, authenticated, service_role;

-- 10. recount_lot / set_product_stock / void_last_stock_add: stamp movement
--     location from the lot; set_product_stock scoped to 'event' (sellable).
create or replace function public.recount_lot(p_lot_id uuid, p_new_qty integer, p_reason text, p_by text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_product_id text;
  v_old_qty    integer;
  v_delta      integer;
  v_location   text;
begin
  select product_id, qty_on_hand, location into v_product_id, v_old_qty, v_location
    from pos_inventory_lots where lot_id = p_lot_id;

  if v_product_id is null then
    raise exception 'lot % not found', p_lot_id;
  end if;

  v_delta := p_new_qty - v_old_qty;

  update pos_inventory_lots set qty_on_hand = p_new_qty, updated_at = now()
    where lot_id = p_lot_id;

  insert into pos_stock_movements (product_id, lot_id, location, order_id, delta, reason, created_by, created_at)
  values (v_product_id, p_lot_id, v_location, null, v_delta, coalesce(p_reason, 'recount'), p_by, now());
end;
$function$;

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

  -- Operates on the sellable (event) pool — the number the POS shows.
  select coalesce(sum(qty_on_hand), 0) into v_current
    from pos_inventory_lots where product_id = p_product_id and location = 'event';

  v_delta := p_new_qty - v_current;
  if v_delta = 0 then
    return;
  end if;

  if v_delta > 0 then
    select lot_id into v_target
      from pos_inventory_lots where product_id = p_product_id and location = 'event'
      order by received_at desc limit 1;
    if v_target is null then
      v_target := gen_random_uuid();
      insert into pos_inventory_lots (lot_id, product_id, location, lot_code, expires_on, qty_received, qty_on_hand, received_at, updated_at)
      values (v_target, p_product_id, 'event', 'adjust', null, v_delta, v_delta, now(), now());
    else
      update pos_inventory_lots set qty_on_hand = qty_on_hand + v_delta, updated_at = now()
        where lot_id = v_target;
    end if;
  else
    v_remaining := -v_delta;
    for v_lot in
      select lot_id, qty_on_hand from pos_inventory_lots
      where product_id = p_product_id and location = 'event' and qty_on_hand > 0
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

  insert into pos_stock_movements (product_id, lot_id, location, order_id, delta, reason, created_by, created_at)
  values (p_product_id, null, 'event', null, v_delta, 'recount', p_by, now());
end;
$function$;

create or replace function public.void_last_stock_add(p_product_id text, p_by text)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_mov      record;
  v_on_hand  integer;
  v_remove   integer;
  v_location text;
begin
  select m.id, m.lot_id, m.delta
    into v_mov
    from pos_stock_movements m
    where m.product_id = p_product_id and m.reason = 'receipt' and m.location = 'event'
    order by m.created_at desc
    limit 1;

  if v_mov.lot_id is null then
    return 0;
  end if;

  select qty_on_hand, location into v_on_hand, v_location
    from pos_inventory_lots where lot_id = v_mov.lot_id for update;
  v_remove := least(coalesce(v_on_hand, 0), v_mov.delta);
  if v_remove <= 0 then
    return 0;
  end if;

  update pos_inventory_lots set qty_on_hand = qty_on_hand - v_remove, updated_at = now()
    where lot_id = v_mov.lot_id;

  insert into pos_stock_movements (product_id, lot_id, location, order_id, delta, reason, created_by, created_at)
  values (p_product_id, v_mov.lot_id, v_location, null, -v_remove, 'add-void', p_by, now());

  return v_remove;
end;
$function$;

-- pos_fire_stock_alert (trigger) intentionally UNCHANGED — alert scoping to the
-- event pool is deferred (Phase 2 open item). While Office is empty it is a no-op
-- change; transfers move stock between locations without altering global on-hand.
