-- Patient tagging reserves stock. Physical inventory is deducted only after
-- the associated billing event has been finalized.

create table public.inventory_holds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  stock_id uuid not null,
  item_id uuid not null,
  department_id uuid not null,
  encounter_id uuid not null references public.encounters(id),
  patient_id uuid not null references public.patients(id),
  billing_event_id uuid references public.billing_events(id),
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  unit_cost numeric(12,2) not null check (unit_cost >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'held' check (status in ('held', 'dispensed', 'released')),
  held_by uuid not null references auth.users(id),
  held_at timestamptz not null default now(),
  dispensed_at timestamptz,
  foreign key (stock_id, organization_id) references public.department_stock(id, organization_id),
  foreign key (item_id, organization_id) references public.inventory_items(id, organization_id),
  foreign key (department_id, organization_id) references public.departments(id, organization_id)
);

create index inventory_holds_stock_status_idx on public.inventory_holds (stock_id, status);
create index inventory_holds_event_idx on public.inventory_holds (billing_event_id, status);

alter table public.inventory_holds enable row level security;
create policy inventory_holds_select on public.inventory_holds for select to authenticated using (
  public.has_organization_permission(organization_id, 'can_manage_inventory')
  or public.has_organization_permission(organization_id, 'can_tag_inventory_usage')
  or public.has_organization_permission(organization_id, 'can_view_billing')
);
revoke all on public.inventory_holds from authenticated;
grant select on public.inventory_holds to authenticated;

create or replace function public.sync_inventory_hold_to_billing(p_hold_id uuid)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare
  v_hold public.inventory_holds%rowtype;
  v_item public.inventory_items%rowtype;
  v_event_id uuid;
  v_payor public.payor_type;
begin
  select * into v_hold from public.inventory_holds where id = p_hold_id;
  if not found then raise exception 'Inventory hold not found.' using errcode = 'P0002'; end if;
  select * into v_item from public.inventory_items where id = v_hold.item_id;
  perform pg_advisory_xact_lock(hashtextextended(v_hold.encounter_id::text || ':draft-bill', 0));
  select id into v_event_id from public.billing_events
  where encounter_id = v_hold.encounter_id and organization_id = v_hold.organization_id and status = 'draft'
  order by created_at desc limit 1 for update;
  if v_event_id is null then
    select default_payor_type into v_payor from public.organizations where id = v_hold.organization_id;
    insert into public.billing_events (organization_id, encounter_id, patient_id, payor_type, status)
    values (v_hold.organization_id, v_hold.encounter_id, v_hold.patient_id, coalesce(v_payor, 'self_pay'), 'draft')
    returning id into v_event_id;
  end if;
  insert into public.billing_line_items (organization_id, billing_event_id, source_type, source_id, description, quantity, unit_price, unit_cost, currency)
  values (v_hold.organization_id, v_event_id, 'inventory_usage', v_hold.id, v_item.name, v_hold.quantity, v_hold.unit_price, v_hold.unit_cost, v_hold.currency)
  on conflict (billing_event_id, source_type, source_id) where source_id is not null do nothing;
  update public.inventory_holds set billing_event_id = v_event_id where id = v_hold.id;
  return v_event_id;
end;
$$;

create or replace function public.tag_inventory_usage(p_encounter_id uuid, p_stock_id uuid, p_quantity numeric, p_department_id uuid)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare
  v_encounter public.encounters%rowtype;
  v_stock public.department_stock%rowtype;
  v_item public.inventory_items%rowtype;
  v_assigned_department_id uuid;
  v_department_id uuid;
  v_held_quantity numeric;
  v_hold_id uuid;
begin
  select * into v_encounter from public.encounters where id = p_encounter_id;
  if not found or v_encounter.status <> 'in_progress' then raise exception 'An in-progress encounter is required.' using errcode = '22023'; end if;
  if not public.has_organization_permission(v_encounter.organization_id, 'can_tag_inventory_usage') then raise exception 'Inventory usage tagging permission is required.' using errcode = '42501'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Usage quantity must be positive.' using errcode = '22023'; end if;
  select assignment.department_id into v_assigned_department_id from public.staff_department_assignments assignment
  where assignment.organization_id = v_encounter.organization_id and assignment.user_id = auth.uid();
  if v_assigned_department_id is not null and p_department_id is not null and v_assigned_department_id is distinct from p_department_id then raise exception 'Your inventory tagging is assigned to a different department.' using errcode = '42501'; end if;
  v_department_id := coalesce(v_assigned_department_id, p_department_id);
  select * into v_stock from public.department_stock where id = p_stock_id and organization_id = v_encounter.organization_id and (v_department_id is null or department_id = v_department_id) for update;
  if not found then raise exception 'The selected department stock is not available for this clinic or department.' using errcode = '22023'; end if;
  select * into v_item from public.inventory_items where id = v_stock.item_id and active;
  if not found then raise exception 'The inventory item is inactive.' using errcode = '22023'; end if;
  select coalesce(sum(quantity), 0) into v_held_quantity from public.inventory_holds where stock_id = v_stock.id and status = 'held';
  if v_stock.quantity - v_held_quantity < p_quantity then raise exception 'Insufficient unreserved stock in the selected department.' using errcode = '22023'; end if;
  insert into public.inventory_holds (organization_id, stock_id, item_id, department_id, encounter_id, patient_id, quantity, unit_price, unit_cost, currency, held_by)
  values (v_encounter.organization_id, v_stock.id, v_item.id, v_stock.department_id, v_encounter.id, v_encounter.patient_id, p_quantity, v_item.selling_price, v_item.unit_cost, v_item.currency, auth.uid())
  returning id into v_hold_id;
  perform public.sync_inventory_hold_to_billing(v_hold_id);
  return v_hold_id;
end;
$$;

create or replace function public.tag_inventory_usage(p_encounter_id uuid, p_stock_id uuid, p_quantity numeric)
returns uuid language plpgsql security definer set search_path = public, auth as $$
begin return public.tag_inventory_usage(p_encounter_id, p_stock_id, p_quantity, null); end;
$$;

create or replace function public.confirm_inventory_holds_for_billing_event(p_billing_event_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_hold public.inventory_holds%rowtype; v_stock_id uuid;
begin
  for v_hold in select * from public.inventory_holds where billing_event_id = p_billing_event_id and status = 'held' order by held_at for update loop
    update public.department_stock set quantity = quantity - v_hold.quantity where id = v_hold.stock_id and quantity >= v_hold.quantity returning id into v_stock_id;
    if v_stock_id is null then raise exception 'Reserved stock is no longer available for billing confirmation.' using errcode = '22023'; end if;
    insert into public.inventory_usages (organization_id, stock_id, item_id, department_id, encounter_id, patient_id, quantity, unit_price, unit_cost, currency, tagged_by)
    values (v_hold.organization_id, v_hold.stock_id, v_hold.item_id, v_hold.department_id, v_hold.encounter_id, v_hold.patient_id, v_hold.quantity, v_hold.unit_price, v_hold.unit_cost, v_hold.currency, v_hold.held_by);
    insert into public.inventory_stock_movements (organization_id, stock_id, item_id, department_id, movement_type, quantity_delta, reason, recorded_by)
    values (v_hold.organization_id, v_hold.stock_id, v_hold.item_id, v_hold.department_id, 'usage', -v_hold.quantity, 'Billing-confirmed patient usage', v_hold.held_by);
    update public.inventory_holds set status = 'dispensed', dispensed_at = now() where id = v_hold.id;
  end loop;
end;
$$;

alter function public.finalize_billing_event(uuid) rename to finalize_billing_event_before_inventory_confirmation;
create function public.finalize_billing_event(p_billing_event_id uuid)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_result jsonb;
begin
  v_result := public.finalize_billing_event_before_inventory_confirmation(p_billing_event_id);
  perform public.confirm_inventory_holds_for_billing_event(p_billing_event_id);
  return v_result;
end;
$$;

revoke all on function public.sync_inventory_hold_to_billing(uuid), public.confirm_inventory_holds_for_billing_event(uuid), public.finalize_billing_event_before_inventory_confirmation(uuid) from public, anon, authenticated;
revoke all on function public.finalize_billing_event(uuid) from public, anon, authenticated;
grant execute on function public.tag_inventory_usage(uuid, uuid, numeric), public.tag_inventory_usage(uuid, uuid, numeric, uuid), public.finalize_billing_event(uuid) to authenticated;
