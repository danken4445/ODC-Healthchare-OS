-- PostgREST cannot expose overloaded RPCs reliably. The legacy three-argument
-- wrapper and the department-aware four-argument implementation share the
-- same public name, which makes REST calls fail with a 400/PGRST203 response.
-- Keep one canonical signature; callers pass NULL when no department context
-- is supplied.
drop function if exists public.tag_inventory_usage(uuid, uuid, numeric);

revoke all on function public.tag_inventory_usage(uuid, uuid, numeric, uuid)
  from public, anon;
grant execute on function public.tag_inventory_usage(uuid, uuid, numeric, uuid)
  to authenticated;

comment on function public.tag_inventory_usage(uuid, uuid, numeric, uuid) is
  'Atomically tags encounter inventory usage. Pass NULL for p_department_id when no explicit department context is selected.';

-- Materialize the draft bill id before selecting the row. Calling the creator
-- inside the SELECT predicate uses the statement snapshot, which cannot see
-- the row inserted by that function call; the resulting NULL event then fails
-- the billing tenant-integrity trigger.
create or replace function public.sync_inventory_usage_to_billing(p_usage_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_usage public.inventory_usages%rowtype;
  v_item public.inventory_items%rowtype;
  v_event public.billing_events%rowtype;
  v_event_id uuid;
  v_line_id uuid;
begin
  select * into v_usage
  from public.inventory_usages
  where id = p_usage_id;
  if not found then
    raise exception 'Inventory usage not found.' using errcode = 'P0002';
  end if;

  select * into v_item
  from public.inventory_items
  where id = v_usage.item_id
    and organization_id = v_usage.organization_id;

  v_event_id := public.ensure_encounter_draft_bill(v_usage.encounter_id);
  select * into v_event
  from public.billing_events
  where id = v_event_id;
  if not found or v_event.organization_id is distinct from v_usage.organization_id then
    raise exception 'Encounter billing event is missing or belongs to another organization.'
      using errcode = '23514';
  end if;

  insert into public.billing_line_items (
    organization_id, billing_event_id, source_type, source_id, description,
    quantity, unit_price, unit_cost, currency, billing_mode, payor_type,
    payment_status, tagged_by, tagged_at
  ) values (
    v_usage.organization_id, v_event.id, 'inventory_usage', v_usage.id, v_item.name,
    v_usage.quantity, v_usage.unit_price, v_usage.unit_cost, v_usage.currency,
    v_event.billing_mode, v_event.payor_type, 'unpaid', v_usage.tagged_by, v_usage.used_at
  ) on conflict (billing_event_id, source_type, source_id) where source_id is not null
  do update set description = excluded.description
  returning id into v_line_id;

  insert into public.inventory_usage_financial_ledger (
    organization_id, usage_id, billing_line_item_id, state, quantity,
    unbilled_qty, paid_qty, tagged_by, tagged_at
  ) values (
    v_usage.organization_id, v_usage.id, v_line_id, 'tagged', v_usage.quantity,
    v_usage.quantity, 0, v_usage.tagged_by, v_usage.used_at
  ) on conflict (usage_id) do nothing;
  return v_event.id;
end;
$$;

-- The hierarchy migration made category_id mandatory, but the older stock
-- adjustment and transfer RPCs still create department_stock rows without it.
-- Resolve the canonical department category in the integrity trigger so those
-- existing mutation paths remain compatible with the hierarchy contract.
create or replace function public.enforce_department_stock_category_integrity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.category_id is null then
    select category.id
      into new.category_id
    from public.inventory_categories category
    where category.organization_id = new.organization_id
      and category.department_id = new.department_id
      and category.name = 'Department stock'
      and category.active
    order by category.created_at
    limit 1;
  end if;

  if new.category_id is null or not exists (
    select 1
    from public.inventory_categories category
    where category.id = new.category_id
      and category.organization_id = new.organization_id
      and category.department_id = new.department_id
      and category.active
  ) then
    raise exception 'Inventory category must belong to the stock department and organization.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
