-- Inter-Departmental Requisition Network & Decentralized Dispersal
-- Enables any department to requisition stock from any other department (including Central Supply Room).
-- Mon-Wed schedule window strictly applies to Central Supply; peer-to-peer satellite transfers are open anytime.

-- 1. Drop old 7-argument overload of submit_inventory_requisition to avoid Postgres signature ambiguity
drop function if exists public.submit_inventory_requisition(uuid, uuid, jsonb, text, boolean, text, date);

-- 2. Create updated submit_inventory_requisition with optional p_supply_department_id
create or replace function public.submit_inventory_requisition(
  p_organization_id uuid,
  p_requesting_department_id uuid,
  p_items jsonb,
  p_notes text default null,
  p_is_emergency boolean default false,
  p_emergency_justification text default null,
  p_simulated_date date default null,
  p_supply_department_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_root_supply_dept_id uuid;
  v_supply_dept_id uuid;
  v_dow int;
  v_eval_date date;
  v_target_delivery_week date;
  v_req_id uuid;
  v_seq int;
  v_req_num text;
  v_item jsonb;
  v_item_id uuid;
  v_req_qty numeric;
  v_item_notes text;
  v_avail_supply_qty numeric;
  v_initial_item_status text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if not (
    public.has_organization_permission(p_organization_id, 'can_manage_inventory')
    or exists (
      select 1
      from public.staff_department_assignments sda
      where sda.organization_id = p_organization_id
        and sda.user_id = auth.uid()
        and sda.department_id = p_requesting_department_id
    )
  ) then
    raise exception 'Department assignment or inventory permission is required to submit requisitions.' using errcode = '42501';
  end if;

  -- Resolve Root Supply Department for organization
  v_root_supply_dept_id := public.get_root_supply_department(p_organization_id);

  -- Supply Department resolution: either explicit parameter or fallback to root supply
  v_supply_dept_id := coalesce(p_supply_department_id, v_root_supply_dept_id);
  if v_supply_dept_id is null then
    raise exception 'No valid supplying department specified or configured for this clinic.' using errcode = '22023';
  end if;

  -- Validate requesting department exists and is active
  if not exists (
    select 1
    from public.departments
    where id = p_requesting_department_id
      and organization_id = p_organization_id
      and active is true
  ) then
    raise exception 'The requesting department is not active or does not exist.' using errcode = '22023';
  end if;

  -- Validate supplying department exists and is active
  if not exists (
    select 1
    from public.departments
    where id = v_supply_dept_id
      and organization_id = p_organization_id
      and active is true
  ) then
    raise exception 'The supplying department is not active or does not exist.' using errcode = '22023';
  end if;

  -- Prevent department from requesting items from itself
  if p_requesting_department_id = v_supply_dept_id then
    raise exception 'A department cannot requisition items from itself.' using errcode = '22023';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'At least one item is required for requisition.' using errcode = '22023';
  end if;

  -- Evaluate submission date (in Asia/Manila)
  v_eval_date := coalesce(p_simulated_date, (now() at time zone 'Asia/Manila')::date);
  v_dow := extract(isodow from v_eval_date)::int;

  -- Schedule cutoff window:
  -- Only enforced when requesting from the Root Supply Department (Central Supply / GSO).
  -- Peer-to-peer inter-department requisitions are open anytime (Mon-Sun).
  if v_root_supply_dept_id is not null and v_supply_dept_id = v_root_supply_dept_id then
    -- 1=Monday, 2=Tuesday, 3=Wednesday
    if v_dow not in (1, 2, 3) and not p_is_emergency then
      raise exception 'REQUISITION_WINDOW_CLOSED: Requisitions to Central Supply are accepted Monday to Wednesday only for guaranteed next-week delivery.' using errcode = '22023';
    end if;

    if p_is_emergency and coalesce(btrim(p_emergency_justification), '') = '' then
      raise exception 'An emergency justification is required for off-window requisitions to Central Supply.' using errcode = '22023';
    end if;

    -- Next delivery week is the Monday of the upcoming week
    v_target_delivery_week := (date_trunc('week', v_eval_date)::date) + 7;
  else
    -- Inter-department requisitions between satellite departments
    v_target_delivery_week := (date_trunc('week', v_eval_date)::date);
  end if;

  -- Generate sequential requisition number for the day
  select count(*) + 1 into v_seq
  from public.inventory_requisitions
  where organization_id = p_organization_id
    and created_at::date = now()::date;

  v_req_num := 'REQ-' || to_char(v_eval_date, 'YYYYMMDD') || '-' || lpad(v_seq::text, 4, '0');

  -- Create requisition header
  insert into public.inventory_requisitions (
    organization_id,
    requisition_number,
    requesting_department_id,
    supply_department_id,
    status,
    is_emergency,
    emergency_justification,
    target_delivery_week,
    notes,
    submitted_by,
    submitted_at
  ) values (
    p_organization_id,
    v_req_num,
    p_requesting_department_id,
    v_supply_dept_id,
    'submitted',
    p_is_emergency,
    p_emergency_justification,
    v_target_delivery_week,
    p_notes,
    auth.uid(),
    now()
  ) returning id into v_req_id;

  -- Insert requisition lines
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_item_id := (v_item->>'item_id')::uuid;
    v_req_qty := (v_item->>'requested_quantity')::numeric;
    v_item_notes := v_item->>'notes';

    if v_req_qty is null or v_req_qty <= 0 then
      raise exception 'Requested quantity must be positive for all items.' using errcode = '22023';
    end if;

    -- Check availability in the designated Supplying Department
    select coalesce(quantity, 0) into v_avail_supply_qty
    from public.department_stock
    where organization_id = p_organization_id
      and item_id = v_item_id
      and department_id = v_supply_dept_id;

    if v_avail_supply_qty is not null and v_avail_supply_qty >= v_req_qty then
      v_initial_item_status := 'ready_for_dispersal';
    else
      v_initial_item_status := 'awaiting_supply_intake';
    end if;

    insert into public.inventory_requisition_items (
      requisition_id,
      organization_id,
      item_id,
      requested_quantity,
      dispersed_quantity,
      status,
      notes
    ) values (
      v_req_id,
      p_organization_id,
      v_item_id,
      v_req_qty,
      0,
      v_initial_item_status,
      v_item_notes
    );
  end loop;

  return v_req_id;
end;
$$;

revoke all on function public.submit_inventory_requisition(uuid, uuid, jsonb, text, boolean, text, date, uuid) from public, anon;
grant execute on function public.submit_inventory_requisition(uuid, uuid, jsonb, text, boolean, text, date, uuid) to authenticated;

-- 3. Update transfer_department_stock permission check to allow staff assigned to source department
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

  if v_organization_id is null or not (
    public.has_organization_permission(v_organization_id, 'can_manage_inventory')
    or exists (
      select 1
      from public.staff_department_assignments sda
      where sda.organization_id = v_organization_id
        and sda.user_id = auth.uid()
        and sda.department_id = p_from_department_id
    )
  ) then
    raise exception 'Inventory management permission or assignment to source department is required.' using errcode = '42501';
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

-- 4. Update disperse_inventory_requisition_item permission check to allow supplying department staff
create or replace function public.disperse_inventory_requisition_item(
  p_requisition_item_id uuid,
  p_quantity numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_item record;
  v_req record;
  v_disperse_qty numeric;
  v_remaining_needed numeric;
  v_transfer_id uuid;
  v_all_dispersed boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select * into v_item
  from public.inventory_requisition_items
  where id = p_requisition_item_id
  for update;

  if not found then
    raise exception 'Requisition item not found.' using errcode = '22023';
  end if;

  select * into v_req
  from public.inventory_requisitions
  where id = v_item.requisition_id
  for update;

  if not found then
    raise exception 'Requisition not found.' using errcode = '22023';
  end if;

  if not (
    public.has_organization_permission(v_req.organization_id, 'can_manage_inventory')
    or exists (
      select 1
      from public.staff_department_assignments sda
      where sda.organization_id = v_req.organization_id
        and sda.user_id = auth.uid()
        and sda.department_id = v_req.supply_department_id
    )
  ) then
    raise exception 'Inventory management permission or assignment to supplying department is required to disperse stock.' using errcode = '42501';
  end if;

  if v_item.status = 'dispersed' then
    raise exception 'This requisition item has already been fully dispersed.' using errcode = '22023';
  end if;

  v_remaining_needed := v_item.requested_quantity - v_item.dispersed_quantity;
  v_disperse_qty := coalesce(p_quantity, v_remaining_needed);

  if v_disperse_qty <= 0 or v_disperse_qty > v_remaining_needed then
    raise exception 'Invalid dispersal quantity.' using errcode = '22023';
  end if;

  -- Execute transfer from Supplying Department to Requesting Department using FEFO
  v_transfer_id := public.transfer_department_stock(
    p_item_id := v_item.item_id,
    p_from_department_id := v_req.supply_department_id,
    p_to_department_id := v_req.requesting_department_id,
    p_quantity := v_disperse_qty,
    p_reason := 'Dispersal for ' || v_req.requisition_number
  );

  -- Update line item
  update public.inventory_requisition_items
  set dispersed_quantity = dispersed_quantity + v_disperse_qty,
      status = case
        when dispersed_quantity + v_disperse_qty >= requested_quantity then 'dispersed'
        else 'ready_for_dispersal'
      end,
      updated_at = now()
  where id = v_item.id;

  -- Check if all items in this requisition are now dispersed
  select not exists (
    select 1
    from public.inventory_requisition_items
    where requisition_id = v_req.id
      and status <> 'dispersed'
  ) into v_all_dispersed;

  update public.inventory_requisitions
  set status = case
        when v_all_dispersed then 'fulfilled'
        else 'partially_dispersed'
      end,
      reviewed_by = coalesce(reviewed_by, auth.uid()),
      reviewed_at = coalesce(reviewed_at, now()),
      updated_at = now()
  where id = v_req.id;

  return v_item.id;
end;
$$;

revoke all on function public.disperse_inventory_requisition_item(uuid, numeric) from public, anon;
grant execute on function public.disperse_inventory_requisition_item(uuid, numeric) to authenticated;
