-- ============================================================================
-- Feature #6 — Free item (spin-a-wheel prize). Additive. Staging first.
--
-- A spin-a-wheel winner gets a real product free. Unlike a free taste (standalone
-- sampling), a prize is attached to a transaction/customer. It is a giveaway, so it
-- deducts the EVENT pool with a distinct reason='free_item' ledger row (separable
-- from sales). Recorded from the POS cart (mark a line Free) or backfilled on Coop
-- against a past order.
--
-- The prize stock movement carries order_id = NULL (linked to the order only via
-- pos_order_prizes.order_id), so voiding / editing the order never touches the
-- giveaway stock — a prize is physically given regardless, and is undone only via
-- void_order_prize. This keeps the existing order RPCs completely untouched.
-- ============================================================================

-- 1. Link ledger rows back to their prize.
alter table public.pos_stock_movements
  add column if not exists prize_id uuid;

create index if not exists pos_stock_movements_prize_idx
  on public.pos_stock_movements (prize_id) where prize_id is not null;

-- 2. The prize entity, attached to an order.
create table if not exists public.pos_order_prizes (
  id          uuid primary key default gen_random_uuid(),
  client_uuid text unique,                                     -- idempotency (offline / double-submit)
  order_id    uuid not null references public.pos_orders(id) on delete cascade,
  product_id  text not null references public.pos_products(product_id),
  lot_id      uuid references public.pos_inventory_lots(lot_id),
  qty         integer not null check (qty > 0),
  location    text not null default 'event' references public.pos_locations(code),
  oversold    boolean not null default false,
  note        text,
  created_by  text,
  device_id   text,
  won_at      timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  voided_at   timestamptz
);

create index if not exists pos_order_prizes_order_idx   on public.pos_order_prizes (order_id);
create index if not exists pos_order_prizes_product_idx on public.pos_order_prizes (product_id);
create index if not exists pos_order_prizes_won_idx     on public.pos_order_prizes (won_at desc);

alter table public.pos_order_prizes enable row level security;
do $$ begin
  if not exists (select 1 from pg_policy where polname = 'pos_order_prizes_read'
                 and polrelid = 'public.pos_order_prizes'::regclass) then
    create policy pos_order_prizes_read on public.pos_order_prizes for select to anon using (true);
  end if;
end $$;
grant select on public.pos_order_prizes to anon, authenticated, service_role;

-- 3. Attach a prize to an order: deduct Event FEFO, log reason='free_item' (order_id
--    NULL on the movement), record the entity. Resolves the order by its client_uuid
--    so both the POS (after the order syncs) and Coop backfill use one path.
create or replace function public.add_order_prize(p jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_client_uuid text := nullif(p->>'client_uuid', '');
  v_order_cuuid text := nullif(p->>'order_client_uuid', '');
  v_order_id    uuid;
  v_product_id  text := p->>'product_id';
  v_qty         integer := (p->>'qty')::integer;
  v_id          uuid;
  v_existing_id uuid;
  v_existing_ov boolean;
  v_won_at      timestamptz := coalesce((p->>'won_at')::timestamptz, now());
  v_remaining   integer;
  v_take        integer;
  v_lot         record;
  v_first_lot   uuid;
  v_overdraw    uuid;
  v_oversold    boolean := false;
begin
  if v_client_uuid is not null then
    select id, oversold into v_existing_id, v_existing_ov
      from pos_order_prizes where client_uuid = v_client_uuid;
    if v_existing_id is not null then
      return jsonb_build_object('id', v_existing_id, 'oversold', v_existing_ov, 'idempotent', true);
    end if;
  end if;

  -- Resolve the order (by client_uuid, or a direct order_id fallback).
  if v_order_cuuid is not null then
    select id into v_order_id from pos_orders where client_uuid = v_order_cuuid;
  elsif nullif(p->>'order_id', '') is not null then
    v_order_id := (p->>'order_id')::uuid;
  end if;
  if v_order_id is null or not exists (select 1 from pos_orders where id = v_order_id) then
    raise exception 'order not found (order_client_uuid=%)', v_order_cuuid;
  end if;

  if v_product_id is null or not exists (select 1 from pos_products where product_id = v_product_id) then
    raise exception 'unknown product %', v_product_id;
  end if;
  if v_qty is null or v_qty <= 0 then
    raise exception 'qty must be a positive integer';
  end if;

  v_id := gen_random_uuid();
  v_remaining := v_qty;

  for v_lot in
    select lot_id, qty_on_hand
    from pos_inventory_lots
    where product_id = v_product_id and location = 'event' and qty_on_hand > 0
    order by expires_on asc nulls last, received_at asc
    for update
  loop
    exit when v_remaining <= 0;
    v_take := least(v_lot.qty_on_hand, v_remaining);
    update pos_inventory_lots set qty_on_hand = qty_on_hand - v_take, updated_at = now()
      where lot_id = v_lot.lot_id;
    insert into pos_stock_movements (product_id, lot_id, location, order_id, prize_id, delta, reason, created_by, created_at)
    values (v_product_id, v_lot.lot_id, 'event', null, v_id, -v_take, 'free_item', p->>'created_by', v_won_at);
    v_first_lot := coalesce(v_first_lot, v_lot.lot_id);
    v_remaining := v_remaining - v_take;
  end loop;

  if v_remaining > 0 then
    v_oversold := true;
    select lot_id into v_overdraw
      from pos_inventory_lots
      where product_id = v_product_id and location = 'event'
      order by expires_on asc nulls last, received_at asc
      limit 1;
    if v_overdraw is not null then
      update pos_inventory_lots set qty_on_hand = qty_on_hand - v_remaining, updated_at = now()
        where lot_id = v_overdraw;
      v_first_lot := coalesce(v_first_lot, v_overdraw);
    end if;
    insert into pos_stock_movements (product_id, lot_id, location, order_id, prize_id, delta, reason, created_by, created_at)
    values (v_product_id, v_overdraw, 'event', null, v_id, -v_remaining, 'free_item', p->>'created_by', v_won_at);
  end if;

  insert into pos_order_prizes (id, client_uuid, order_id, product_id, lot_id, qty, location, oversold, note, created_by, device_id, won_at)
  values (
    v_id,
    v_client_uuid,
    v_order_id,
    v_product_id,
    v_first_lot,
    v_qty,
    'event',
    v_oversold,
    nullif(p->>'note', ''),
    p->>'created_by',
    p->>'device_id',
    v_won_at
  );

  return jsonb_build_object('id', v_id, 'order_id', v_order_id, 'oversold', v_oversold, 'idempotent', false);
end;
$function$;

grant execute on function public.add_order_prize(jsonb) to anon, authenticated, service_role;

-- 4. Undo a prize: restore the exact lots, write reverse ledger rows, mark voided.
create or replace function public.void_order_prize(p_client_uuid text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_id     uuid;
  v_voided timestamptz;
begin
  select id, voided_at into v_id, v_voided
    from pos_order_prizes where client_uuid = p_client_uuid
    for update;

  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'prize not found');
  end if;
  if v_voided is not null then
    return jsonb_build_object('ok', true, 'id', v_id, 'idempotent', true);
  end if;

  update pos_inventory_lots l
     set qty_on_hand = l.qty_on_hand - agg.net, updated_at = now()
  from (
    select lot_id, sum(delta) as net
    from pos_stock_movements
    where prize_id = v_id and lot_id is not null
    group by lot_id
    having sum(delta) <> 0
  ) agg
  where l.lot_id = agg.lot_id;

  insert into pos_stock_movements (product_id, lot_id, location, order_id, prize_id, delta, reason, created_at)
  select product_id, lot_id, location, null, v_id, -sum(delta), 'free_item-reverse', now()
  from pos_stock_movements
  where prize_id = v_id
  group by product_id, lot_id, location
  having sum(delta) <> 0;

  update pos_order_prizes set voided_at = now() where id = v_id and voided_at is null;

  return jsonb_build_object('ok', true, 'id', v_id, 'idempotent', false);
end;
$function$;

grant execute on function public.void_order_prize(text) to anon, authenticated, service_role;
