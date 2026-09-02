-- Keep the inventory catalog, patient usage, and billing ledger synchronized.
-- Selling price is the patient charge; unit cost is retained for margin analytics.

alter table public.inventory_items
  add column if not exists unit_cost numeric(12,2) not null default 0,
  add column if not exists selling_price numeric(12,2);

update public.inventory_items
set selling_price = unit_price
where selling_price is null;

alter table public.inventory_items
  alter column selling_price set default 0,
  alter column selling_price set not null;

alter table public.inventory_items
  add constraint inventory_items_unit_cost_check check (unit_cost >= 0),
  add constraint inventory_items_selling_price_check check (selling_price >= 0);

-- unit_price remains as a compatibility alias while callers migrate to the
-- clearer selling_price name.
create or replace function public.sync_inventory_item_legacy_unit_price()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.selling_price = 0 and new.unit_price <> 0 then
      new.selling_price := new.unit_price;
    else
      new.unit_price := new.selling_price;
    end if;
  elsif new.selling_price is distinct from old.selling_price then
    new.unit_price := new.selling_price;
  elsif new.unit_price is distinct from old.unit_price then
    new.selling_price := new.unit_price;
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_items_sync_legacy_unit_price on public.inventory_items;
create trigger inventory_items_sync_legacy_unit_price
  before insert or update of unit_price, selling_price on public.inventory_items
  for each row execute function public.sync_inventory_item_legacy_unit_price();

alter table public.inventory_usages
  add column if not exists unit_cost numeric(12,2) not null default 0
  check (unit_cost >= 0);

-- Historical usage rows are intentionally immutable. Their newly added cost
-- field remains 0 (unknown) rather than rewriting the clinical stock ledger.
-- New tags always capture the item cost at the time of use.

alter table public.billing_line_items
  add column if not exists unit_cost numeric(12,2) not null default 0
  check (unit_cost >= 0);

update public.billing_line_items line_item
set unit_cost = usage_row.unit_cost
from public.inventory_usages usage_row
where line_item.source_type = 'inventory_usage'
  and line_item.source_id = usage_row.id;

create unique index if not exists billing_line_items_event_source_unique
  on public.billing_line_items (billing_event_id, source_type, source_id)
  where source_id is not null;

create unique index if not exists billing_events_one_draft_per_encounter
  on public.billing_events (encounter_id)
  where encounter_id is not null and status = 'draft';

create or replace function public.sync_inventory_usage_to_billing(p_usage_id uuid)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare
  v_usage public.inventory_usages%rowtype;
  v_item public.inventory_items%rowtype;
  v_event_id uuid;
  v_payor public.payor_type;
begin
  select * into v_usage from public.inventory_usages where id = p_usage_id;
  if not found then
    raise exception 'Inventory usage not found.' using errcode = 'P0002';
  end if;
  if not (
    public.has_organization_permission(v_usage.organization_id, 'can_tag_inventory_usage')
    or public.has_organization_permission(v_usage.organization_id, 'can_manage_billing')
  ) then
    raise exception 'Inventory tagging or billing permission is required.' using errcode = '42501';
  end if;

  select * into v_item from public.inventory_items
  where id = v_usage.item_id and organization_id = v_usage.organization_id;

  perform pg_advisory_xact_lock(hashtextextended(v_usage.encounter_id::text || ':draft-bill', 0));

  -- Prefer the encounter's open bill. If billing was already finalized, create
  -- a supplemental draft so the new patient charge is never silently lost.
  select billing_event.id into v_event_id
  from public.billing_events billing_event
  where billing_event.encounter_id = v_usage.encounter_id
    and billing_event.organization_id = v_usage.organization_id
    and billing_event.status = 'draft'
  order by billing_event.created_at desc
  limit 1
  for update;

  if v_event_id is null then
    select organization.default_payor_type into v_payor
    from public.organizations organization
    where organization.id = v_usage.organization_id;

    insert into public.billing_events (
      organization_id, encounter_id, patient_id, payor_type, status, notes
    ) values (
      v_usage.organization_id, v_usage.encounter_id, v_usage.patient_id,
      coalesce(v_payor, 'self_pay'), 'draft',
      case when exists (
        select 1 from public.billing_events prior
        where prior.encounter_id = v_usage.encounter_id
          and prior.status = 'finalized'
      ) then 'Supplemental inventory charges' else null end
    ) returning id into v_event_id;
  end if;

  insert into public.billing_line_items (
    organization_id, billing_event_id, source_type, source_id, description,
    quantity, unit_price, unit_cost, currency
  ) values (
    v_usage.organization_id, v_event_id, 'inventory_usage', v_usage.id,
    v_item.name, v_usage.quantity, v_usage.unit_price, v_usage.unit_cost,
    v_usage.currency
  )
  on conflict (billing_event_id, source_type, source_id)
    where source_id is not null do nothing;

  return v_event_id;
end;
$$;

-- Backfill any historical patient usage that predates immediate synchronization.
insert into public.billing_events (
  organization_id, encounter_id, patient_id, payor_type, status, notes
)
select distinct on (usage_row.encounter_id)
  usage_row.organization_id, usage_row.encounter_id, usage_row.patient_id,
  organization.default_payor_type, 'draft', 'Backfilled inventory charges'
from public.inventory_usages usage_row
join public.organizations organization on organization.id = usage_row.organization_id
left join public.billing_line_items line_item
  on line_item.source_type = 'inventory_usage' and line_item.source_id = usage_row.id
where line_item.id is null
  and not exists (
    select 1 from public.billing_events draft
    where draft.encounter_id = usage_row.encounter_id and draft.status = 'draft'
  )
order by usage_row.encounter_id, usage_row.used_at
on conflict (encounter_id) where encounter_id is not null and status = 'draft' do nothing;

insert into public.billing_line_items (
  organization_id, billing_event_id, source_type, source_id, description,
  quantity, unit_price, unit_cost, currency
)
select usage_row.organization_id, draft.id, 'inventory_usage', usage_row.id,
  item.name, usage_row.quantity, usage_row.unit_price, usage_row.unit_cost,
  usage_row.currency
from public.inventory_usages usage_row
join public.inventory_items item on item.id = usage_row.item_id
join lateral (
  select billing_event.id from public.billing_events billing_event
  where billing_event.encounter_id = usage_row.encounter_id
    and billing_event.status = 'draft'
  order by billing_event.created_at desc limit 1
) draft on true
on conflict (billing_event_id, source_type, source_id)
  where source_id is not null do nothing;

create or replace function public.tag_inventory_usage(
  p_encounter_id uuid,
  p_stock_id uuid,
  p_quantity numeric,
  p_department_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_encounter public.encounters%rowtype;
  v_stock public.department_stock%rowtype;
  v_item public.inventory_items%rowtype;
  v_usage_id uuid;
  v_assigned_department_id uuid;
  v_department_id uuid;
begin
  select * into v_encounter from public.encounters where id = p_encounter_id;
  if not found or v_encounter.status <> 'in_progress' then
    raise exception 'An in-progress encounter is required.' using errcode = '22023';
  end if;
  if not public.has_organization_permission(v_encounter.organization_id, 'can_tag_inventory_usage') then
    raise exception 'Inventory usage tagging permission is required.' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Usage quantity must be positive.' using errcode = '22023';
  end if;

  select assignment.department_id into v_assigned_department_id
  from public.staff_department_assignments assignment
  join public.departments department
    on department.id = assignment.department_id
    and department.organization_id = assignment.organization_id
  where assignment.organization_id = v_encounter.organization_id
    and assignment.user_id = auth.uid()
    and department.active;

  if v_assigned_department_id is not null
    and p_department_id is not null
    and v_assigned_department_id is distinct from p_department_id then
    raise exception 'Your inventory tagging is assigned to a different department.' using errcode = '42501';
  end if;
  v_department_id := coalesce(v_assigned_department_id, p_department_id);

  select * into v_stock from public.department_stock
  where id = p_stock_id
    and organization_id = v_encounter.organization_id
    and (v_department_id is null or department_id = v_department_id);
  if not found then
    raise exception 'The selected department stock is not available for this clinic or department.' using errcode = '22023';
  end if;
  select * into v_item from public.inventory_items where id = v_stock.item_id and active;
  if not found then
    raise exception 'The inventory item is inactive.' using errcode = '22023';
  end if;

  update public.department_stock set quantity = quantity - p_quantity
  where id = v_stock.id and quantity >= p_quantity;
  if not found then
    raise exception 'Insufficient stock in the selected department.' using errcode = '22023';
  end if;

  insert into public.inventory_usages (
    organization_id, stock_id, item_id, department_id, encounter_id,
    patient_id, quantity, unit_price, unit_cost, currency, tagged_by
  ) values (
    v_encounter.organization_id, v_stock.id, v_item.id, v_stock.department_id,
    v_encounter.id, v_encounter.patient_id, p_quantity,
    v_item.selling_price, v_item.unit_cost, v_item.currency, auth.uid()
  ) returning id into v_usage_id;

  insert into public.inventory_stock_movements (
    organization_id, stock_id, item_id, department_id, movement_type,
    quantity_delta, reason, usage_id, recorded_by
  ) values (
    v_encounter.organization_id, v_stock.id, v_item.id, v_stock.department_id,
    'usage', -p_quantity, 'Encounter usage', v_usage_id, auth.uid()
  );

  perform public.sync_inventory_usage_to_billing(v_usage_id);
  return v_usage_id;
end;
$$;

create or replace function public.tag_inventory_usage(
  p_encounter_id uuid,
  p_stock_id uuid,
  p_quantity numeric
)
returns uuid
language plpgsql security definer set search_path = public, auth
as $$
begin
  return public.tag_inventory_usage(p_encounter_id, p_stock_id, p_quantity, null);
end;
$$;

-- Finalization always refreshes the encounter catalog first, so consultation,
-- inventory, and completed laboratory charges cannot be omitted from totals.
alter function public.finalize_billing_event(uuid)
  rename to finalize_billing_event_without_catalog_sync;

create function public.finalize_billing_event(p_billing_event_id uuid)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  v_event public.billing_events%rowtype;
begin
  select * into v_event from public.billing_events where id = p_billing_event_id;
  if not found then raise exception 'Billing event not found.' using errcode = 'P0002'; end if;
  if v_event.status <> 'draft' then raise exception 'Only draft billing events can be finalized.' using errcode = '22023'; end if;
  if not public.has_organization_permission(v_event.organization_id, 'can_manage_billing') then
    raise exception 'Billing management permission is required.' using errcode = '42501';
  end if;
  if v_event.encounter_id is not null then
    perform public.generate_billing_event(
      v_event.organization_id, v_event.encounter_id, v_event.payor_type
    );
  end if;
  return public.finalize_billing_event_without_catalog_sync(p_billing_event_id);
end;
$$;

revoke all on function public.finalize_billing_event_without_catalog_sync(uuid)
  from public, anon, authenticated;
revoke all on function public.finalize_billing_event(uuid) from public, anon, authenticated;
grant execute on function public.finalize_billing_event(uuid) to authenticated;

-- Rebuild or complete the draft bill idempotently. Auto-created inventory bills
-- therefore remain compatible with the billing workspace's Generate action.
create or replace function public.generate_billing_event(
  p_organization_id uuid,
  p_encounter_id uuid,
  p_payor_type_override public.payor_type default null
)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare
  v_encounter public.encounters%rowtype;
  v_org public.organizations%rowtype;
  v_event_id uuid;
  v_payor public.payor_type;
  v_service public.clinic_services%rowtype;
begin
  if not public.has_organization_permission(p_organization_id, 'can_manage_billing') then
    raise exception 'Billing management permission is required.' using errcode = '42501';
  end if;
  select * into v_encounter from public.encounters
  where id = p_encounter_id and organization_id = p_organization_id;
  if not found then raise exception 'Encounter not found in this organization.' using errcode = 'P0002'; end if;
  if v_encounter.status not in ('finished', 'in_progress') then
    raise exception 'Encounter must be finished or in progress to bill.' using errcode = '22023';
  end if;

  select * into v_org from public.organizations where id = p_organization_id;
  v_payor := coalesce(p_payor_type_override, v_org.default_payor_type);

  select billing_event.id into v_event_id
  from public.billing_events billing_event
  where billing_event.encounter_id = p_encounter_id
    and billing_event.organization_id = p_organization_id
    and billing_event.status = 'draft'
  order by billing_event.created_at desc limit 1 for update;

  if v_event_id is null then
    if exists (select 1 from public.billing_events where encounter_id = p_encounter_id and status = 'finalized') then
      raise exception 'This encounter is already finalized and has no open supplemental bill.' using errcode = '23505';
    end if;
    insert into public.billing_events (organization_id, encounter_id, patient_id, payor_type, status)
    values (p_organization_id, p_encounter_id, v_encounter.patient_id, v_payor, 'draft')
    returning id into v_event_id;
  elsif p_payor_type_override is not null then
    update public.billing_events set payor_type = v_payor where id = v_event_id;
  end if;

  if v_encounter.appointment_id is not null then
    select cs.* into v_service from public.clinic_services cs
    join public.appointments a on a.clinic_service_id = cs.id
    where a.id = v_encounter.appointment_id and cs.organization_id = p_organization_id;
    if found and v_service.base_price is not null then
      insert into public.billing_line_items (organization_id, billing_event_id, source_type, source_id, description, quantity, unit_price, currency)
      values (p_organization_id, v_event_id, 'clinic_service', v_service.id, v_service.name, 1, v_service.base_price, v_service.currency)
      on conflict (billing_event_id, source_type, source_id) where source_id is not null do nothing;
    end if;
  end if;

  insert into public.billing_line_items (organization_id, billing_event_id, source_type, source_id, description, quantity, unit_price, unit_cost, currency)
  select p_organization_id, v_event_id, 'inventory_usage', usage_row.id,
    item.name, usage_row.quantity, usage_row.unit_price, usage_row.unit_cost, usage_row.currency
  from public.inventory_usages usage_row
  join public.inventory_items item on item.id = usage_row.item_id
  where usage_row.encounter_id = p_encounter_id and usage_row.organization_id = p_organization_id
  on conflict (billing_event_id, source_type, source_id) where source_id is not null do nothing;

  insert into public.billing_line_items (organization_id, billing_event_id, source_type, source_id, description, quantity, unit_price, currency)
  select p_organization_id, v_event_id, 'laboratory_service', sr.id,
    coalesce(sr.code_display, sr.code), 1, coalesce(ls.lab_cost, 0), 'PHP'
  from public.service_requests sr
  left join public.laboratory_services ls on ls.organization_id = sr.organization_id and ls.code = sr.code
  where sr.encounter_id = p_encounter_id and sr.organization_id = p_organization_id
    and sr.category = 'laboratory' and sr.status = 'completed'
  on conflict (billing_event_id, source_type, source_id) where source_id is not null do nothing;

  return v_event_id;
end;
$$;

revoke all on function public.sync_inventory_usage_to_billing(uuid) from public, anon, authenticated;

comment on column public.inventory_items.unit_cost is 'Clinic acquisition cost per unit, used for inventory valuation and margin analytics.';
comment on column public.inventory_items.selling_price is 'Standard catalog price billed to patients and POS customers.';
comment on column public.inventory_usages.unit_cost is 'Immutable acquisition-cost snapshot at the time of patient usage.';
comment on column public.billing_line_items.unit_cost is 'Cost snapshot used for gross-margin analytics; zero for non-inventory services unless supplied.';
