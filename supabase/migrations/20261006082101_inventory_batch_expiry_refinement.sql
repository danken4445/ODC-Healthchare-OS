-- ============================================================================
-- Migration: inventory_batch_expiry_refinement
-- Full support for batch/lot numbers, different expiry dates, FEFO allocations,
-- atomic multi-batch receiving, stock transfers, adjustments/disposals, and POS integration.
-- ============================================================================

-- 1. Pharmacy POS Settings
create table if not exists public.inventory_pos_settings (
  organization_id uuid primary key references public.organizations(id),
  pharmacy_department_id uuid references public.departments(id),
  updated_at timestamptz not null default now()
);

alter table public.inventory_pos_settings enable row level security;

drop policy if exists inventory_pos_settings_select on public.inventory_pos_settings;
create policy inventory_pos_settings_select on public.inventory_pos_settings
  for select to authenticated
  using (
    public.has_organization_permission(organization_id, 'can_view_inventory')
    or public.has_organization_permission(organization_id, 'can_manage_inventory')
    or public.has_organization_permission(organization_id, 'can_manage_pos')
  );

revoke all on public.inventory_pos_settings from anon, authenticated;
grant select on public.inventory_pos_settings to authenticated;

-- 2. Save Inventory Expiry and POS Settings RPC
create or replace function public.save_inventory_expiry_settings(
  p_organization_id uuid,
  p_near_expiry_days integer default 90,
  p_pharmacy_department_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if not public.has_organization_permission(p_organization_id, 'can_manage_inventory') then
    raise exception 'Inventory management permission is required.' using errcode = '42501';
  end if;

  if p_near_expiry_days is not null and (p_near_expiry_days < 1 or p_near_expiry_days > 3650) then
    raise exception 'Near expiry days must be between 1 and 3650.' using errcode = '22023';
  end if;

  if p_pharmacy_department_id is not null and not exists (
    select 1 from public.departments
    where id = p_pharmacy_department_id
      and organization_id = p_organization_id
      and active
  ) then
    raise exception 'Pharmacy department must be active and belong to this clinic.' using errcode = '22023';
  end if;

  insert into public.inventory_expiry_settings (organization_id, near_expiry_days, updated_at)
  values (p_organization_id, coalesce(p_near_expiry_days, 90), now())
  on conflict (organization_id)
  do update set
    near_expiry_days = excluded.near_expiry_days,
    updated_at = now();

  if p_pharmacy_department_id is not null then
    insert into public.inventory_pos_settings (organization_id, pharmacy_department_id, updated_at)
    values (p_organization_id, p_pharmacy_department_id, now())
    on conflict (organization_id)
    do update set
      pharmacy_department_id = excluded.pharmacy_department_id,
      updated_at = now();
  end if;
end;
$$;

revoke all on function public.save_inventory_expiry_settings(uuid, integer, uuid) from public, anon;
grant execute on function public.save_inventory_expiry_settings(uuid, integer, uuid) to authenticated;

-- 3. Refined View: inventory_batch_statuses
drop view if exists public.inventory_batch_statuses cascade;
create view public.inventory_batch_statuses with (security_invoker = true) as
select
  b.id,
  b.organization_id,
  b.stock_id,
  b.item_id,
  b.department_id,
  b.lot_number,
  b.expiry_date,
  b.quantity,
  b.received_at,
  b.legacy_unassigned_expiry,
  b.created_at,
  b.updated_at,
  i.name as item_name,
  i.sku as item_sku,
  i.unit_of_measure,
  i.is_perishable,
  d.name as department_name,
  case
    when b.expiry_date is null then 'legacy_unassigned'
    when b.expiry_date < public.inventory_manila_today() then 'expired'
    when b.expiry_date <= public.inventory_manila_today() + coalesce(i.near_expiry_days_override, s.near_expiry_days, 90) then 'near_expiry'
    else 'ok'
  end as expiry_status,
  case
    when b.expiry_date is null or b.expiry_date >= public.inventory_manila_today() then b.quantity
    else 0
  end as usable_quantity,
  case
    when b.expiry_date is not null then (b.expiry_date - public.inventory_manila_today())
    else null
  end as days_until_expiry
from public.inventory_batches b
join public.inventory_items i on i.id = b.item_id
join public.departments d on d.id = b.department_id
left join public.inventory_expiry_settings s on s.organization_id = b.organization_id;

grant select on public.inventory_batch_statuses to authenticated;

-- 4. Internal FEFO Allocator Helper
create or replace function public.allocate_perishable_stock_fefo(
  p_stock_id uuid,
  p_quantity numeric,
  p_allow_expired boolean default false
)
returns table (
  allocated_batch_id uuid,
  allocated_lot_number text,
  allocated_expiry_date date,
  allocated_quantity numeric
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_remaining numeric := p_quantity;
  v_batch record;
  v_take numeric;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Requested allocation quantity must be positive.' using errcode = '22023';
  end if;

  if not p_allow_expired then
    -- Normal dispensing/tagging/sale/transfer: Skip expired, dated unexpired first, legacy last
    for v_batch in
      select b.id, b.lot_number, b.expiry_date, b.quantity
      from public.inventory_batches b
      where b.stock_id = p_stock_id
        and b.quantity > 0
        and (b.expiry_date >= public.inventory_manila_today() or b.legacy_unassigned_expiry)
      order by
        b.legacy_unassigned_expiry asc,
        b.expiry_date asc nulls last,
        b.received_at asc,
        b.id asc
      for update of b
    loop
      exit when v_remaining <= 0;
      v_take := least(v_batch.quantity, v_remaining);
      update public.inventory_batches as ib
      set quantity = ib.quantity - v_take, updated_at = now()
      where ib.id = v_batch.id;

      allocated_batch_id := v_batch.id;
      allocated_lot_number := v_batch.lot_number;
      allocated_expiry_date := v_batch.expiry_date;
      allocated_quantity := v_take;
      return next;

      v_remaining := v_remaining - v_take;
    end loop;

    if v_remaining > 0 then
      raise exception 'Insufficient usable stock; expired batches cannot be tagged.' using errcode = '22023';
    end if;
  else
    -- Expired disposal write-off: allocate only expired batches in earliest-expiry order
    for v_batch in
      select b.id, b.lot_number, b.expiry_date, b.quantity
      from public.inventory_batches b
      where b.stock_id = p_stock_id
        and b.quantity > 0
        and b.expiry_date is not null
        and b.expiry_date < public.inventory_manila_today()
      order by
        b.expiry_date asc,
        b.received_at asc,
        b.id asc
      for update of b
    loop
      exit when v_remaining <= 0;
      v_take := least(v_batch.quantity, v_remaining);
      update public.inventory_batches as ib
      set quantity = ib.quantity - v_take, updated_at = now()
      where ib.id = v_batch.id;

      allocated_batch_id := v_batch.id;
      allocated_lot_number := v_batch.lot_number;
      allocated_expiry_date := v_batch.expiry_date;
      allocated_quantity := v_take;
      return next;

      v_remaining := v_remaining - v_take;
    end loop;

    if v_remaining > 0 then
      raise exception 'Insufficient expired stock for disposal.' using errcode = '22023';
    end if;
  end if;
end;
$$;

revoke all on function public.allocate_perishable_stock_fefo(uuid, numeric, boolean) from public, anon, authenticated;

-- 5. Receive Inventory Stock RPC (Multi-batch intake for perishable, single intake for standard)
create or replace function public.receive_inventory_stock(
  p_item_id uuid,
  p_department_id uuid,
  p_batches jsonb,
  p_reason text,
  p_movement_type text default 'receipt'
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_organization_id uuid;
  v_is_perishable boolean;
  v_stock_id uuid;
  v_total_qty numeric := 0;
  v_elem jsonb;
  v_qty numeric;
  v_expiry date;
  v_lot text;
  v_batch_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select item.organization_id, item.is_perishable
  into v_organization_id, v_is_perishable
  from public.inventory_items item
  where item.id = p_item_id and item.active;

  if v_organization_id is null or not exists (
    select 1 from public.departments department
    where department.id = p_department_id
      and department.organization_id = v_organization_id
      and department.active
  ) then
    raise exception 'An active item and department in the same clinic are required.' using errcode = '22023';
  end if;

  if not public.has_organization_permission(v_organization_id, 'can_manage_inventory') then
    raise exception 'Inventory management permission is required.' using errcode = '42501';
  end if;

  if p_movement_type not in ('opening', 'receipt', 'adjustment')
    or length(coalesce(btrim(p_reason), '')) < 2 then
    raise exception 'A valid movement type and reason are required.' using errcode = '22023';
  end if;

  if p_batches is null or jsonb_typeof(p_batches) <> 'array' or jsonb_array_length(p_batches) = 0 then
    raise exception 'At least one stock batch or quantity entry is required.' using errcode = '22023';
  end if;

  -- Ensure department_stock row exists
  insert into public.department_stock (organization_id, item_id, department_id, quantity)
  values (v_organization_id, p_item_id, p_department_id, 0)
  on conflict (organization_id, item_id, department_id) do nothing
  returning id into v_stock_id;

  if v_stock_id is null then
    select id into v_stock_id
    from public.department_stock
    where organization_id = v_organization_id
      and item_id = p_item_id
      and department_id = p_department_id
    for update;
  end if;

  if v_is_perishable then
    -- Validate and process each perishable batch line
    for v_elem in select value from jsonb_array_elements(p_batches) loop
      v_qty := (v_elem ->> 'quantity')::numeric;
      if v_qty is null or v_qty <= 0 then
        raise exception 'Each batch must have a positive quantity.' using errcode = '22023';
      end if;

      if (v_elem ->> 'expiry_date') is null or (v_elem ->> 'expiry_date') = '' then
        raise exception 'Perishable stock intake requires an expiry date for each batch.' using errcode = '22023';
      end if;

      begin
        v_expiry := (v_elem ->> 'expiry_date')::date;
      exception when others then
        raise exception 'Invalid expiry date format. Expected YYYY-MM-DD.' using errcode = '22023';
      end;

      if v_expiry < public.inventory_manila_today() then
        raise exception 'Cannot receive already-expired stock.' using errcode = '22023';
      end if;

      v_lot := nullif(btrim(v_elem ->> 'lot_number'), '');
      v_total_qty := v_total_qty + v_qty;

      -- Insert or increment batch
      insert into public.inventory_batches (
        organization_id, stock_id, item_id, department_id,
        lot_number, expiry_date, quantity, legacy_unassigned_expiry, received_at
      ) values (
        v_organization_id, v_stock_id, p_item_id, p_department_id,
        v_lot, v_expiry, v_qty, false, now()
      )
      on conflict (stock_id, expiry_date, coalesce(lot_number, ''))
      do update set
        quantity = public.inventory_batches.quantity + excluded.quantity,
        updated_at = now()
      returning id into v_batch_id;

      -- Record movement linked to batch
      insert into public.inventory_stock_movements (
        organization_id, stock_id, item_id, department_id, batch_id,
        movement_type, quantity_delta, reason, recorded_by
      ) values (
        v_organization_id, v_stock_id, p_item_id, p_department_id, v_batch_id,
        p_movement_type, v_qty, btrim(p_reason), auth.uid()
      );
    end loop;

    -- Update aggregate stock
    update public.department_stock
    set quantity = quantity + v_total_qty
    where id = v_stock_id;

  else
    -- Non-perishable intake
    for v_elem in select value from jsonb_array_elements(p_batches) loop
      v_qty := (v_elem ->> 'quantity')::numeric;
      if v_qty is null or v_qty <= 0 then
        raise exception 'Quantity must be positive.' using errcode = '22023';
      end if;
      v_total_qty := v_total_qty + v_qty;
    end loop;

    update public.department_stock
    set quantity = quantity + v_total_qty
    where id = v_stock_id;

    insert into public.inventory_stock_movements (
      organization_id, stock_id, item_id, department_id,
      movement_type, quantity_delta, reason, recorded_by
    ) values (
      v_organization_id, v_stock_id, p_item_id, p_department_id,
      p_movement_type, v_total_qty, btrim(p_reason), auth.uid()
    );
  end if;

  return v_stock_id;
end;
$$;

revoke all on function public.receive_inventory_stock(uuid, uuid, jsonb, text, text) from public, anon;
grant execute on function public.receive_inventory_stock(uuid, uuid, jsonb, text, text) to authenticated;

-- 6. Updated adjust_department_stock with FEFO for perishable items
create or replace function public.adjust_department_stock(
  p_item_id uuid,
  p_department_id uuid,
  p_quantity_delta numeric,
  p_reason text,
  p_movement_type text default 'adjustment'
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_organization_id uuid;
  v_is_perishable boolean;
  v_stock_id uuid;
  v_alloc record;
  v_is_disposal boolean;
begin
  select item.organization_id, item.is_perishable
  into v_organization_id, v_is_perishable
  from public.inventory_items item
  where item.id = p_item_id and item.active;

  if v_organization_id is null or not exists (
    select 1 from public.departments department
    where department.id = p_department_id
      and department.organization_id = v_organization_id
      and department.active
  ) then
    raise exception 'An active item and department in the same clinic are required.' using errcode = '22023';
  end if;

  if not public.has_organization_permission(v_organization_id, 'can_manage_inventory') then
    raise exception 'Inventory management permission is required.' using errcode = '42501';
  end if;

  if p_quantity_delta is null or p_quantity_delta = 0
    or p_movement_type not in ('opening', 'receipt', 'adjustment', 'disposal')
    or length(coalesce(btrim(p_reason), '')) < 2 then
    raise exception 'A non-zero quantity, valid movement type, and reason are required.' using errcode = '22023';
  end if;

  insert into public.department_stock (organization_id, item_id, department_id, quantity)
  values (v_organization_id, p_item_id, p_department_id, 0)
  on conflict (organization_id, item_id, department_id) do nothing
  returning id into v_stock_id;

  if v_stock_id is null then
    select id into v_stock_id from public.department_stock
    where organization_id = v_organization_id and item_id = p_item_id and department_id = p_department_id
    for update;
  end if;

  if not v_is_perishable then
    -- Non-perishable standard flow
    update public.department_stock
    set quantity = quantity + p_quantity_delta
    where id = v_stock_id
      and quantity + p_quantity_delta >= 0;

    if not found then
      raise exception 'The adjustment would make stock negative.' using errcode = '22023';
    end if;

    insert into public.inventory_stock_movements (
      organization_id, stock_id, item_id, department_id,
      movement_type, quantity_delta, reason, recorded_by
    ) values (
      v_organization_id, v_stock_id, p_item_id, p_department_id,
      p_movement_type, p_quantity_delta, btrim(p_reason), auth.uid()
    );
  else
    -- Perishable flow
    if p_quantity_delta > 0 then
      -- Positive adjustment for perishable creates/updates legacy or default unassigned batch
      insert into public.inventory_batches (
        organization_id, stock_id, item_id, department_id,
        quantity, legacy_unassigned_expiry
      ) values (
        v_organization_id, v_stock_id, p_item_id, p_department_id,
        p_quantity_delta, true
      )
      on conflict (stock_id, expiry_date, coalesce(lot_number, ''))
      do update set
        quantity = public.inventory_batches.quantity + excluded.quantity,
        updated_at = now();

      update public.department_stock
      set quantity = quantity + p_quantity_delta
      where id = v_stock_id;

      insert into public.inventory_stock_movements (
        organization_id, stock_id, item_id, department_id,
        movement_type, quantity_delta, reason, recorded_by
      ) values (
        v_organization_id, v_stock_id, p_item_id, p_department_id,
        p_movement_type, p_quantity_delta, btrim(p_reason), auth.uid()
      );
    else
      -- Negative adjustment / write-off / disposal
      v_is_disposal := (p_movement_type = 'disposal' or lower(p_reason) like '%expired%');

      for v_alloc in select * from public.allocate_perishable_stock_fefo(v_stock_id, abs(p_quantity_delta), v_is_disposal) loop
        insert into public.inventory_stock_movements (
          organization_id, stock_id, item_id, department_id, batch_id,
          movement_type, quantity_delta, reason, recorded_by
        ) values (
          v_organization_id, v_stock_id, p_item_id, p_department_id, v_alloc.allocated_batch_id,
          case when v_is_disposal then 'disposal' else p_movement_type end,
          -v_alloc.allocated_quantity, btrim(p_reason), auth.uid()
        );
      end loop;

      update public.department_stock
      set quantity = quantity + p_quantity_delta
      where id = v_stock_id and quantity + p_quantity_delta >= 0;

      if not found then
        raise exception 'The adjustment would make stock negative.' using errcode = '22023';
      end if;
    end if;
  end if;

  return v_stock_id;
end;
$$;

revoke all on function public.adjust_department_stock(uuid, uuid, numeric, text, text) from public, anon;
grant execute on function public.adjust_department_stock(uuid, uuid, numeric, text, text) to authenticated;

-- 7. Updated transfer_department_stock with FEFO for perishable items
create or replace function public.transfer_department_stock(
  p_item_id uuid,
  p_from_department_id uuid,
  p_to_department_id uuid,
  p_quantity numeric,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_organization_id uuid;
  v_is_perishable boolean;
  v_from_stock_id uuid;
  v_to_stock_id uuid;
  v_transfer_group_id uuid := gen_random_uuid();
  v_alloc record;
  v_to_batch_id uuid;
  v_source_batch record;
begin
  select item.organization_id, item.is_perishable
  into v_organization_id, v_is_perishable
  from public.inventory_items item
  where item.id = p_item_id and active;

  if v_organization_id is null or not public.has_organization_permission(v_organization_id, 'can_manage_inventory') then
    raise exception 'Inventory management permission is required.' using errcode = '42501';
  end if;

  if p_quantity is null or p_quantity <= 0 or p_from_department_id = p_to_department_id
    or length(coalesce(btrim(p_reason), '')) < 2 then
    raise exception 'A positive quantity, two departments, and reason are required.' using errcode = '22023';
  end if;

  if (select count(*) from public.departments where organization_id = v_organization_id and active and id in (p_from_department_id, p_to_department_id)) <> 2 then
    raise exception 'Both departments must be active and belong to the item clinic.' using errcode = '22023';
  end if;

  select id into v_from_stock_id
  from public.department_stock
  where organization_id = v_organization_id and item_id = p_item_id and department_id = p_from_department_id
  for update;

  if v_from_stock_id is null then
    raise exception 'Source department stock not found.' using errcode = '22023';
  end if;

  insert into public.department_stock (organization_id, item_id, department_id, quantity)
  values (v_organization_id, p_item_id, p_to_department_id, 0)
  on conflict (organization_id, item_id, department_id) do nothing
  returning id into v_to_stock_id;

  if v_to_stock_id is null then
    select id into v_to_stock_id
    from public.department_stock
    where organization_id = v_organization_id and item_id = p_item_id and department_id = p_to_department_id
    for update;
  end if;

  if not v_is_perishable then
    update public.department_stock
    set quantity = quantity - p_quantity
    where id = v_from_stock_id and quantity >= p_quantity;

    if not found then
      raise exception 'Insufficient stock for this transfer.' using errcode = '22023';
    end if;

    update public.department_stock
    set quantity = quantity + p_quantity
    where id = v_to_stock_id;

    insert into public.inventory_stock_movements (
      organization_id, stock_id, item_id, department_id, movement_type,
      quantity_delta, reason, transfer_group_id, recorded_by
    ) values
      (v_organization_id, v_from_stock_id, p_item_id, p_from_department_id, 'transfer_out', -p_quantity, btrim(p_reason), v_transfer_group_id, auth.uid()),
      (v_organization_id, v_to_stock_id, p_item_id, p_to_department_id, 'transfer_in', p_quantity, btrim(p_reason), v_transfer_group_id, auth.uid());
  else
    -- Allocate FEFO from source batches
    for v_alloc in select * from public.allocate_perishable_stock_fefo(v_from_stock_id, p_quantity, false) loop
      select * into v_source_batch from public.inventory_batches where id = v_alloc.allocated_batch_id;

      insert into public.inventory_batches (
        organization_id, stock_id, item_id, department_id,
        lot_number, expiry_date, quantity, legacy_unassigned_expiry, received_at
      ) values (
        v_organization_id, v_to_stock_id, p_item_id, p_to_department_id,
        v_alloc.allocated_lot_number, v_alloc.allocated_expiry_date, v_alloc.allocated_quantity,
        v_source_batch.legacy_unassigned_expiry, v_source_batch.received_at
      )
      on conflict (stock_id, expiry_date, coalesce(lot_number, ''))
      do update set
        quantity = public.inventory_batches.quantity + excluded.quantity,
        updated_at = now()
      returning id into v_to_batch_id;

      insert into public.inventory_stock_movements (
        organization_id, stock_id, item_id, department_id, batch_id,
        movement_type, quantity_delta, reason, transfer_group_id, recorded_by
      ) values
        (v_organization_id, v_from_stock_id, p_item_id, p_from_department_id, v_alloc.allocated_batch_id, 'transfer_out', -v_alloc.allocated_quantity, btrim(p_reason), v_transfer_group_id, auth.uid()),
        (v_organization_id, v_to_stock_id, p_item_id, p_to_department_id, v_to_batch_id, 'transfer_in', v_alloc.allocated_quantity, btrim(p_reason), v_transfer_group_id, auth.uid());
    end loop;

    update public.department_stock
    set quantity = quantity - p_quantity
    where id = v_from_stock_id and quantity >= p_quantity;

    if not found then
      raise exception 'Insufficient stock for this transfer.' using errcode = '22023';
    end if;

    update public.department_stock
    set quantity = quantity + p_quantity
    where id = v_to_stock_id;
  end if;

  return v_transfer_group_id;
end;
$$;

revoke all on function public.transfer_department_stock(uuid, uuid, uuid, numeric, text) from public, anon;
grant execute on function public.transfer_department_stock(uuid, uuid, uuid, numeric, text) to authenticated;

-- 8. Updated tag_inventory_usage with FEFO batch allocations & consumptions
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
  v_alloc record;
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
  where assignment.organization_id = v_encounter.organization_id and assignment.user_id = auth.uid();

  if v_assigned_department_id is not null and p_department_id is not null
    and v_assigned_department_id is distinct from p_department_id then
    raise exception 'Your inventory tagging is assigned to a different department.' using errcode = '42501';
  end if;

  v_department_id := coalesce(v_assigned_department_id, p_department_id);

  select * into v_stock from public.department_stock
  where id = p_stock_id and organization_id = v_encounter.organization_id
    and (v_department_id is null or department_id = v_department_id)
  for update;

  if not found then
    raise exception 'The selected department stock is not available for this clinic or department.' using errcode = '22023';
  end if;

  select * into v_item from public.inventory_items where id = v_stock.item_id and active;
  if not found then
    raise exception 'The inventory item is inactive.' using errcode = '22023';
  end if;

  -- Insert aggregate usage row
  insert into public.inventory_usages (
    organization_id, stock_id, item_id, department_id, encounter_id, patient_id,
    quantity, unit_price, unit_cost, currency, tagged_by
  ) values (
    v_encounter.organization_id, v_stock.id, v_item.id, v_stock.department_id,
    v_encounter.id, v_encounter.patient_id, p_quantity, v_item.selling_price,
    v_item.unit_cost, v_item.currency, auth.uid()
  ) returning id into v_usage_id;

  if v_item.is_perishable then
    -- Allocate FEFO batches
    for v_alloc in select * from public.allocate_perishable_stock_fefo(v_stock.id, p_quantity, false) loop
      insert into public.inventory_usage_batch_consumptions (
        organization_id, usage_id, batch_id, quantity
      ) values (
        v_encounter.organization_id, v_usage_id, v_alloc.allocated_batch_id, v_alloc.allocated_quantity
      );

      insert into public.inventory_stock_movements (
        organization_id, stock_id, item_id, department_id, batch_id,
        movement_type, quantity_delta, reason, usage_id, recorded_by
      ) values (
        v_encounter.organization_id, v_stock.id, v_item.id, v_stock.department_id, v_alloc.allocated_batch_id,
        'usage', -v_alloc.allocated_quantity, 'Patient-tagged inventory usage', v_usage_id, auth.uid()
      );
    end loop;

    update public.department_stock
    set quantity = quantity - p_quantity
    where id = v_stock.id and quantity >= p_quantity;

    if not found then
      raise exception 'Insufficient stock in the selected department.' using errcode = '22023';
    end if;
  else
    update public.department_stock
    set quantity = quantity - p_quantity
    where id = v_stock.id and quantity >= p_quantity;

    if not found then
      raise exception 'Insufficient stock in the selected department.' using errcode = '22023';
    end if;

    insert into public.inventory_stock_movements (
      organization_id, stock_id, item_id, department_id,
      movement_type, quantity_delta, reason, usage_id, recorded_by
    ) values (
      v_encounter.organization_id, v_stock.id, v_item.id, v_stock.department_id,
      'usage', -p_quantity, 'Patient-tagged inventory usage', v_usage_id, auth.uid()
    );
  end if;

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
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  return public.tag_inventory_usage(p_encounter_id, p_stock_id, p_quantity, null);
end;
$$;

revoke all on function public.tag_inventory_usage(uuid, uuid, numeric) from public, anon;
revoke all on function public.tag_inventory_usage(uuid, uuid, numeric, uuid) from public, anon;
grant execute on function public.tag_inventory_usage(uuid, uuid, numeric) to authenticated;
grant execute on function public.tag_inventory_usage(uuid, uuid, numeric, uuid) to authenticated;

-- 9. Updated create_pos_sale with FEFO Pharmacy stock allocation
create or replace function public.create_pos_sale(
  p_organization_id uuid,
  p_items jsonb,
  p_customer_name text default null,
  p_payment_method public.payment_method default 'cash'
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_event_id uuid;
  v_sale_id uuid;
  v_invoice_id uuid;
  v_payment_id uuid;
  v_item jsonb;
  v_subtotal numeric(14,2) := 0;
  v_inv_item public.inventory_items%rowtype;
  v_pharmacy_dept_id uuid;
  v_stock_id uuid;
  v_item_qty numeric;
  v_alloc record;
begin
  if not public.has_organization_permission(p_organization_id, 'can_manage_pos') then
    raise exception 'POS permission is required.' using errcode = '42501';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one item is required.' using errcode = '22023';
  end if;

  -- Resolve configured or active pharmacy department
  select pharmacy_department_id into v_pharmacy_dept_id
  from public.inventory_pos_settings
  where organization_id = p_organization_id;

  if v_pharmacy_dept_id is null then
    select dept.id into v_pharmacy_dept_id
    from public.departments dept
    where dept.organization_id = p_organization_id
      and dept.active
      and (
        lower(dept.code) in ('pharmacy', 'pharm')
        or lower(dept.name) in ('pharmacy', 'pharm')
        or lower(dept.name) like '%pharmacy%'
      )
    order by dept.created_at asc
    limit 1;
  end if;

  if v_pharmacy_dept_id is null then
    select dept.id into v_pharmacy_dept_id
    from public.departments dept
    where dept.organization_id = p_organization_id
      and dept.active
    order by dept.created_at asc
    limit 1;
  end if;

  -- Create billing event (no encounter, no patient)
  insert into public.billing_events (organization_id, payor_type, status)
  values (p_organization_id, 'self_pay', 'draft')
  returning id into v_event_id;

  -- Add line items from cart and allocate stock
  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_inv_item from public.inventory_items
    where id = (v_item ->> 'item_id')::uuid
      and organization_id = p_organization_id and active;
    if not found then
      raise exception 'Item % not found.', v_item ->> 'item_id' using errcode = 'P0002';
    end if;

    v_item_qty := coalesce((v_item ->> 'quantity')::numeric, 1);
    if v_item_qty <= 0 then
      raise exception 'Quantity must be positive.' using errcode = '22023';
    end if;

    insert into public.billing_line_items (
      organization_id, billing_event_id, source_type, source_id,
      description, quantity, unit_price, currency
    ) values (
      p_organization_id, v_event_id, 'pos_item', v_inv_item.id,
      v_inv_item.name,
      v_item_qty,
      v_inv_item.unit_price, v_inv_item.currency
    );

    -- Stock deduction if department exists
    if v_pharmacy_dept_id is not null then
      select id into v_stock_id
      from public.department_stock
      where organization_id = p_organization_id
        and item_id = v_inv_item.id
        and department_id = v_pharmacy_dept_id
      for update;

      if v_stock_id is not null then
        if v_inv_item.is_perishable then
          for v_alloc in select * from public.allocate_perishable_stock_fefo(v_stock_id, v_item_qty, false) loop
            insert into public.inventory_stock_movements (
              organization_id, stock_id, item_id, department_id, batch_id,
              movement_type, quantity_delta, reason, recorded_by
            ) values (
              p_organization_id, v_stock_id, v_inv_item.id, v_pharmacy_dept_id, v_alloc.allocated_batch_id,
              'usage', -v_alloc.allocated_quantity, 'Retail POS sale', auth.uid()
            );
          end loop;

          update public.department_stock
          set quantity = quantity - v_item_qty
          where id = v_stock_id and quantity >= v_item_qty;

          if not found then
            raise exception 'Insufficient stock for % in pharmacy department.', v_inv_item.name using errcode = '22023';
          end if;
        else
          update public.department_stock
          set quantity = quantity - v_item_qty
          where id = v_stock_id and quantity >= v_item_qty;

          if not found then
            raise exception 'Insufficient stock for % in pharmacy department.', v_inv_item.name using errcode = '22023';
          end if;

          insert into public.inventory_stock_movements (
            organization_id, stock_id, item_id, department_id,
            movement_type, quantity_delta, reason, recorded_by
          ) values (
            p_organization_id, v_stock_id, v_inv_item.id, v_pharmacy_dept_id,
            'usage', -v_item_qty, 'Retail POS sale', auth.uid()
          );
        end if;
      end if;
    end if;
  end loop;

  -- Calculate subtotal
  select coalesce(sum(line_total), 0) into v_subtotal
  from public.billing_line_items where billing_event_id = v_event_id;

  -- Finalize billing event
  update public.billing_events
  set status = 'finalized', finalized_at = now(), finalized_by = auth.uid()
  where id = v_event_id;

  -- Create POS sale
  insert into public.pos_sales (
    organization_id, billing_event_id, cashier_user_id, status,
    customer_name, receipt_number, completed_at
  ) values (
    p_organization_id, v_event_id, auth.uid(), 'completed',
    nullif(btrim(p_customer_name), ''),
    public.generate_receipt_number(p_organization_id), now()
  ) returning id into v_sale_id;

  -- Create invoice + immediate payment
  insert into public.invoices (
    organization_id, billing_event_id, invoice_number,
    status, subtotal, total_due, amount_paid, balance_due, issued_at, paid_at
  ) values (
    p_organization_id, v_event_id,
    public.generate_invoice_number(p_organization_id),
    'paid', v_subtotal, v_subtotal, v_subtotal, 0, now(), now()
  ) returning id into v_invoice_id;

  insert into public.payments (
    organization_id, invoice_id, amount, currency, method, status,
    confirmed_at, recorded_by
  ) values (
    p_organization_id, v_invoice_id, v_subtotal, 'PHP', p_payment_method,
    'confirmed', now(), auth.uid()
  ) returning id into v_payment_id;

  return jsonb_build_object(
    'billing_event_id', v_event_id,
    'pos_sale_id', v_sale_id,
    'invoice_id', v_invoice_id,
    'payment_id', v_payment_id,
    'receipt_number', (select receipt_number from public.pos_sales where id = v_sale_id),
    'total', v_subtotal
  );
end;
$$;

revoke all on function public.create_pos_sale(uuid, jsonb, text, public.payment_method) from public, anon;
grant execute on function public.create_pos_sale(uuid, jsonb, text, public.payment_method) to authenticated;

-- 10. Updated checkout_nbb_pharmacy_pos / create_nbb_pharmacy_pos_sale with FEFO
create or replace function public.create_nbb_pharmacy_pos_sale(
  p_organization_id uuid,
  p_items jsonb,
  p_patient_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_sale_id uuid;
  v_invoice_id uuid;
  v_pharmacy_dept_id uuid;
  v_trimmed_patient_name text;
  v_elem jsonb;
  v_item_id_text text;
  v_qty_text text;
  v_qty numeric;
  v_receipt_number text;
  v_standard_total_cents bigint := 0;
  v_distinct_item_count int;
  v_locked_count int;
  v_stock_rec record;
  v_item_unit_price_cents bigint;
  v_item_line_total_cents bigint;
  v_alloc record;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if not public.has_organization_permission(p_organization_id, 'can_manage_pos') then
    raise exception 'POS permission is required.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.organizations org
    where org.id = p_organization_id
      and org.default_payor_type in ('philhealth_nbb', 'government_subsidized')
  ) then
    raise exception 'NBB_FACILITY_REQUIRED' using errcode = '42501';
  end if;

  v_trimmed_patient_name := btrim(coalesce(p_patient_name, ''));
  if length(v_trimmed_patient_name) = 0 then
    raise exception 'PATIENT_NAME_REQUIRED' using errcode = '22023';
  end if;

  -- Check explicit cashier department assignment first
  select dept.id into v_pharmacy_dept_id
  from public.staff_department_assignments sda
  join public.departments dept
    on dept.id = sda.department_id and dept.organization_id = sda.organization_id
  where sda.organization_id = p_organization_id
    and sda.user_id = auth.uid()
    and dept.active
    and (
      lower(dept.code) in ('pharmacy', 'pharm')
      or lower(dept.name) in ('pharmacy', 'pharm')
      or lower(dept.name) like '%pharmacy%'
    )
  limit 1;

  if v_pharmacy_dept_id is null and exists (
    select 1
    from public.staff_department_assignments sda
    where sda.organization_id = p_organization_id
      and sda.user_id = auth.uid()
  ) then
    raise exception 'PHARMACY_ASSIGNMENT_REQUIRED' using errcode = '42501';
  end if;

  if v_pharmacy_dept_id is null then
    select pharmacy_department_id into v_pharmacy_dept_id
    from public.inventory_pos_settings
    where organization_id = p_organization_id;
  end if;

  if v_pharmacy_dept_id is null then
    select dept.id into v_pharmacy_dept_id
    from public.departments dept
    where dept.organization_id = p_organization_id
      and dept.active
      and (
        lower(dept.code) in ('pharmacy', 'pharm')
        or lower(dept.name) in ('pharmacy', 'pharm')
        or lower(dept.name) like '%pharmacy%'
      )
    order by dept.created_at asc
    limit 1;
  end if;

  if v_pharmacy_dept_id is null then
    raise exception 'PHARMACY_ASSIGNMENT_REQUIRED' using errcode = '42501';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'INVALID_CART_ITEM' using errcode = '22023';
  end if;

  for v_elem in select value from jsonb_array_elements(p_items) loop
    v_item_id_text := v_elem ->> 'item_id';
    if v_item_id_text is null or v_item_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'INVALID_CART_ITEM' using errcode = '22023';
    end if;

    v_qty_text := v_elem ->> 'quantity';
    if v_qty_text is null or v_qty_text !~ '^[0-9]+(\.[0-9]+)?$' then
      raise exception 'INVALID_CART_ITEM' using errcode = '22023';
    end if;

    v_qty := v_qty_text::numeric;
    if v_qty <= 0 or v_qty <> floor(v_qty) then
      raise exception 'INVALID_CART_ITEM' using errcode = '22023';
    end if;
  end loop;

  create temp table _nbb_cart on commit drop as
  select (elem->>'item_id')::uuid as item_id, sum((elem->>'quantity')::numeric) as quantity
  from jsonb_array_elements(p_items) elem
  group by (elem->>'item_id')::uuid;

  select count(*) into v_distinct_item_count from _nbb_cart;
  if v_distinct_item_count = 0 then
    raise exception 'INVALID_CART_ITEM' using errcode = '22023';
  end if;

  create temp table _nbb_locked_items on commit drop as
  select
    ds.id as stock_id,
    ds.item_id,
    ds.quantity as available_quantity,
    cart.quantity as requested_quantity,
    item.name as item_name,
    item.unit_price,
    item.currency,
    item.is_perishable
  from _nbb_cart cart
  join public.department_stock ds
    on ds.item_id = cart.item_id
    and ds.department_id = v_pharmacy_dept_id
    and ds.organization_id = p_organization_id
  join public.inventory_items item
    on item.id = ds.item_id
    and item.organization_id = p_organization_id
    and item.active
  order by cart.item_id asc
  for update of ds;

  select count(*) into v_locked_count from _nbb_locked_items;
  if v_locked_count <> v_distinct_item_count then
    raise exception 'INVALID_CART_ITEM' using errcode = '22023';
  end if;

  if exists (
    select 1 from _nbb_locked_items
    where available_quantity < requested_quantity
  ) then
    raise exception 'INSUFFICIENT_PHARMACY_STOCK' using errcode = '22023';
  end if;

  select coalesce(sum(
    requested_quantity::bigint * round(coalesce(unit_price, 0) * 100)::bigint
  ), 0)::bigint
  into v_standard_total_cents
  from _nbb_locked_items;

  insert into public.billing_events (
    organization_id, payor_type, billing_mode, status, finalized_at, finalized_by
  ) values (
    p_organization_id, 'philhealth_nbb', 'nbb', 'finalized', now(), auth.uid()
  ) returning id into v_event_id;

  v_receipt_number := public.generate_receipt_number(p_organization_id);
  insert into public.pos_sales (
    organization_id, billing_event_id, cashier_user_id, status,
    customer_name, receipt_number, completed_at, standard_total_in_centavos
  ) values (
    p_organization_id, v_event_id, auth.uid(), 'completed',
    v_trimmed_patient_name, v_receipt_number, now(), v_standard_total_cents
  ) returning id into v_sale_id;

  insert into public.invoices (
    organization_id, billing_event_id, patient_id, invoice_number, status,
    subtotal, total_due, amount_paid, balance_due, issued_at, paid_at,
    standard_total_in_centavos, patient_balance_due_in_centavos
  ) values (
    p_organization_id, v_event_id, null,
    public.generate_invoice_number(p_organization_id),
    'paid',
    round(v_standard_total_cents::numeric / 100.0, 2),
    0, 0, 0,
    now(), now(),
    v_standard_total_cents, 0
  ) returning id into v_invoice_id;

  for v_stock_rec in select * from _nbb_locked_items order by item_id asc loop
    v_item_unit_price_cents := round(coalesce(v_stock_rec.unit_price, 0) * 100)::bigint;
    v_item_line_total_cents := v_item_unit_price_cents * v_stock_rec.requested_quantity::bigint;

    insert into public.billing_line_items (
      organization_id, billing_event_id, invoice_id, source_type, source_id,
      description, quantity, unit_price, currency, billing_mode, payor_type,
      payment_status, standard_unit_price_in_centavos, standard_line_total_in_centavos
    ) values (
      p_organization_id, v_event_id, v_invoice_id, 'pos_item', v_stock_rec.item_id,
      v_stock_rec.item_name, v_stock_rec.requested_quantity, v_stock_rec.unit_price,
      coalesce(v_stock_rec.currency, 'PHP'), 'nbb', 'philhealth_nbb',
      'written_off', v_item_unit_price_cents, v_item_line_total_cents
    );

    if v_stock_rec.is_perishable then
      for v_alloc in select * from public.allocate_perishable_stock_fefo(v_stock_rec.stock_id, v_stock_rec.requested_quantity, false) loop
        insert into public.inventory_stock_movements (
          organization_id, stock_id, item_id, department_id, batch_id,
          movement_type, quantity_delta, reason, recorded_by
        ) values (
          p_organization_id, v_stock_rec.stock_id, v_stock_rec.item_id, v_pharmacy_dept_id, v_alloc.allocated_batch_id,
          'usage', -v_alloc.allocated_quantity, 'NBB pharmacy POS sale', auth.uid()
        );
      end loop;

      update public.department_stock
      set quantity = quantity - v_stock_rec.requested_quantity
      where id = v_stock_rec.stock_id
        and quantity >= v_stock_rec.requested_quantity;

      if not found then
        raise exception 'INSUFFICIENT_PHARMACY_STOCK' using errcode = '22023';
      end if;
    else
      update public.department_stock
      set quantity = quantity - v_stock_rec.requested_quantity
      where id = v_stock_rec.stock_id
        and quantity >= v_stock_rec.requested_quantity;

      if not found then
        raise exception 'INSUFFICIENT_PHARMACY_STOCK' using errcode = '22023';
      end if;

      insert into public.inventory_stock_movements (
        organization_id, stock_id, item_id, department_id,
        movement_type, quantity_delta, reason, recorded_by
      ) values (
        p_organization_id, v_stock_rec.stock_id, v_stock_rec.item_id, v_pharmacy_dept_id,
        'usage', -v_stock_rec.requested_quantity, 'NBB pharmacy POS sale', auth.uid()
      );
    end if;
  end loop;

  perform public.log_billing_transition(
    p_organization_id, 'billing_event', v_event_id, null, 'finalized', 'NBB pharmacy POS sale'
  );
  perform public.log_billing_transition(
    p_organization_id, 'invoice', v_invoice_id, null, 'paid', 'NBB write-off'
  );

  return jsonb_build_object(
    'billing_event_id', v_event_id,
    'pos_sale_id', v_sale_id,
    'invoice_id', v_invoice_id,
    'receipt_number', v_receipt_number,
    'standard_total_in_centavos', v_standard_total_cents,
    'patient_balance_due_in_centavos', 0
  );
end;
$$;

revoke all on function public.create_nbb_pharmacy_pos_sale(uuid, jsonb, text) from public, anon;
grant execute on function public.create_nbb_pharmacy_pos_sale(uuid, jsonb, text) to authenticated;
