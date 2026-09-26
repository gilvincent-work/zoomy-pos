-- ============================================================================
-- Phase 2 — Free taste (opened-stock sampling). Additive. Staging first.
--
-- A free taste = you open sellable stock to let pets sample it. It is standalone
-- (no customer, no sale), deducts from the EVENT location like a sale, and is
-- logged distinctly (reason='free_taste') so sampling is separable from sales and
-- from shrinkage. Distinct from a spin-a-wheel free ITEM (a prize on an order).
--
-- Decisions: qty = sellable packs opened; oversell = allow + flag; undo via
-- void_free_taste; capture product + qty + note + who/device (no event/pet link);
-- long-press single + a dedicated multi-line batch (shared batch_id); offline-first
-- in the POS (mirrors the sale outbox, idempotent on client_uuid).
-- ============================================================================

-- 1. Link ledger rows back to their free taste (mirrors order_id for sales).
alter table public.pos_stock_movements
  add column if not exists free_taste_id uuid;

create index if not exists pos_stock_movements_free_taste_idx
  on public.pos_stock_movements (free_taste_id) where free_taste_id is not null;

-- 2. The free-taste entity.
create table if not exists public.pos_free_tastes (
  id          uuid primary key default gen_random_uuid(),
  client_uuid text unique,                                   -- idempotency for offline retries
  batch_id    uuid,                                          -- groups a multi-line dedicated-section entry
  product_id  text not null references public.pos_products(product_id),
  lot_id      uuid references public.pos_inventory_lots(lot_id),  -- first FEFO lot the deduction hit
  qty         integer not null check (qty > 0),              -- sellable packs opened
  location    text not null default 'event' references public.pos_locations(code),
  oversold    boolean not null default false,                -- opened against 0 on-hand
  note        text,
  created_by  text,
  device_id   text,
  opened_at   timestamptz not null default now(),            -- client-side open time
  created_at  timestamptz not null default now(),
  synced_at   timestamptz not null default now(),
  voided_at   timestamptz
);

create index if not exists pos_free_tastes_product_idx on public.pos_free_tastes (product_id);
create index if not exists pos_free_tastes_opened_idx  on public.pos_free_tastes (opened_at desc);
create index if not exists pos_free_tastes_batch_idx   on public.pos_free_tastes (batch_id) where batch_id is not null;

alter table public.pos_free_tastes enable row level security;
do $$ begin
  if not exists (select 1 from pg_policy where polname = 'pos_free_tastes_read'
                 and polrelid = 'public.pos_free_tastes'::regclass) then
    create policy pos_free_tastes_read on public.pos_free_tastes for select to anon using (true);
  end if;
end $$;
grant select on public.pos_free_tastes to anon, authenticated, service_role;

-- 3. Record a free taste: deduct FEFO from Event, log the ledger + the entity.
--    Idempotent on client_uuid; allow + flag oversell (mirrors apply_pos_order).
create or replace function public.record_free_taste(p jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_client_uuid text := nullif(p->>'client_uuid', '');
  v_product_id  text := p->>'product_id';
  v_qty         integer := (p->>'qty')::integer;
  v_id          uuid;
  v_existing_id uuid;
  v_existing_ov boolean;
  v_opened_at   timestamptz := coalesce((p->>'opened_at')::timestamptz, now());
  v_remaining   integer;
  v_take        integer;
  v_lot         record;
  v_first_lot   uuid;
  v_overdraw    uuid;
  v_oversold    boolean := false;
begin
  if v_client_uuid is not null then
    select id, oversold into v_existing_id, v_existing_ov
      from pos_free_tastes where client_uuid = v_client_uuid;
    if v_existing_id is not null then
      return jsonb_build_object('id', v_existing_id, 'oversold', v_existing_ov, 'idempotent', true);
    end if;
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
    insert into pos_stock_movements (product_id, lot_id, location, order_id, free_taste_id, delta, reason, created_by, created_at)
    values (v_product_id, v_lot.lot_id, 'event', null, v_id, -v_take, 'free_taste', p->>'created_by', v_opened_at);
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
    insert into pos_stock_movements (product_id, lot_id, location, order_id, free_taste_id, delta, reason, created_by, created_at)
    values (v_product_id, v_overdraw, 'event', null, v_id, -v_remaining, 'free_taste', p->>'created_by', v_opened_at);
  end if;

  insert into pos_free_tastes (id, client_uuid, batch_id, product_id, lot_id, qty, location, oversold, note, created_by, device_id, opened_at)
  values (
    v_id,
    v_client_uuid,
    nullif(p->>'batch_id', '')::uuid,
    v_product_id,
    v_first_lot,
    v_qty,
    'event',
    v_oversold,
    nullif(p->>'note', ''),
    p->>'created_by',
    p->>'device_id',
    v_opened_at
  );

  return jsonb_build_object('id', v_id, 'oversold', v_oversold, 'idempotent', false);
end;
$function$;

grant execute on function public.record_free_taste(jsonb) to anon, authenticated, service_role;

-- 4. Undo a free taste: restore the exact lots it hit, write reverse ledger rows,
--    mark it voided. Idempotent (a second call on an already-voided row is a no-op).
create or replace function public.void_free_taste(p_client_uuid text)
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
    from pos_free_tastes where client_uuid = p_client_uuid
    for update;

  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'free taste not found');
  end if;
  if v_voided is not null then
    return jsonb_build_object('ok', true, 'id', v_id, 'idempotent', true);
  end if;

  -- Restore lots by the net footprint of this free taste's movements.
  update pos_inventory_lots l
     set qty_on_hand = l.qty_on_hand - agg.net, updated_at = now()
  from (
    select lot_id, sum(delta) as net
    from pos_stock_movements
    where free_taste_id = v_id and lot_id is not null
    group by lot_id
    having sum(delta) <> 0
  ) agg
  where l.lot_id = agg.lot_id;

  insert into pos_stock_movements (product_id, lot_id, location, order_id, free_taste_id, delta, reason, created_at)
  select product_id, lot_id, location, null, v_id, -sum(delta), 'free_taste-reverse', now()
  from pos_stock_movements
  where free_taste_id = v_id
  group by product_id, lot_id, location
  having sum(delta) <> 0;

  update pos_free_tastes set voided_at = now() where id = v_id and voided_at is null;

  return jsonb_build_object('ok', true, 'id', v_id, 'idempotent', false);
end;
$function$;

grant execute on function public.void_free_taste(text) to anon, authenticated, service_role;
