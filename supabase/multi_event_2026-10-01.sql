-- Multi-event (same-day / overlapping events) — 2026-10-01
--
-- Applied to Staging (syxwixxzmytvhwhkwdvw) as three migrations. Additive-only;
-- no table/column changes (pos_orders.event_id already exists). Idempotent
-- (CREATE OR REPLACE). Promote to Coop PROD (qkxbwzdxhwcbwgriwipi) in one pass
-- after sign-off. See CHANGELOG.md (POS) and the dashboard CHANGELOG.
--
-- What changes:
--   1. upsert_pos_event: remove the no-overlap guard (overlap now allowed).
--   2. attribute_untagged_orders_to_event: only back-tag on days covered by
--      EXACTLY ONE event (ambiguous days stay untagged; the POS stamps explicitly).
--   3. set_pos_order_event: NEW — dashboard reassign of a sale's event (service_role).

-- ── 1. Drop the overlap guard ──────────────────────────────────────────────
create or replace function public.upsert_pos_event(p_event jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid := nullif(p_event->>'event_id', '')::uuid;
  v_start date := nullif(p_event->>'starts_on', '')::date;
  v_end   date := nullif(p_event->>'ends_on', '')::date;
begin
  if v_id is null then
    v_id := gen_random_uuid();
  end if;

  -- Overlap guard removed 2026-10-01 (multi-event): overlapping / same-day events
  -- are allowed. The POS cashier declares which event a sale belongs to.

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
$$;

-- ── 2. Ambiguity-safe back-tagging ─────────────────────────────────────────
create or replace function public.attribute_untagged_orders_to_event(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
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
    return 0;  -- event has no dates; nothing to attribute
  end if;

  with updated as (
    update pos_orders o
       set event_id = p_event_id
     where o.event_id is null
       and (o.created_at at time zone 'Asia/Manila')::date between v_from and v_to
       -- only when THIS is the sole dated event covering the order's day. Closed
       -- events still count toward ambiguity here (a day stays historically
       -- ambiguous even if one of its events later closed), unlike the POS's live
       -- "pickable" rule which hides closed events from the cashier.
       and (
         select count(*)
           from pos_events e2
          where coalesce(e2.starts_on, e2.ends_on) is not null
            and coalesce(e2.starts_on, e2.ends_on) <= (o.created_at at time zone 'Asia/Manila')::date
            and (o.created_at at time zone 'Asia/Manila')::date <= coalesce(e2.ends_on, e2.starts_on)
       ) = 1
    returning 1
  )
  select count(*) into v_count from updated;

  return v_count;
end;
$$;

-- ── 3. Reassign a sale's event (dashboard) ─────────────────────────────────
create or replace function public.set_pos_order_event(p_order_id uuid, p_event_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_event_id is not null
     and not exists (select 1 from pos_events where event_id = p_event_id) then
    raise exception 'unknown event_id: %', p_event_id using errcode = 'foreign_key_violation';
  end if;

  update pos_orders
     set event_id = p_event_id
   where id = p_order_id
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.set_pos_order_event(uuid, uuid) from public;
grant execute on function public.set_pos_order_event(uuid, uuid) to service_role;

-- ── 4. edit_pos_order carries event_id (POS edit-sale reassign syncs to Coop) ──
-- Added 2026-10-01. The POS edit-sale sheet can now move a sale to another event;
-- it goes through the existing anon edit path (edit_pos_order), so event_id must be
-- an accepted p_patch key. Only the final UPDATE changed vs the prior definition
-- (the new event_id line); the rest is reproduced verbatim so this file is
-- self-contained. See pos_schema.sql for the canonical copy.
CREATE OR REPLACE FUNCTION public.edit_pos_order(p_client_uuid text, p_patch jsonb, p_entries jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    event_id        = case when p_patch ? 'event_id' then nullif(p_patch->>'event_id', '')::uuid else event_id end,
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
