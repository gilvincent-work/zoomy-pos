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
