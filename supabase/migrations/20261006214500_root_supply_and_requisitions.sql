-- Root Supply Department & Inventory Requisition Lifecycle
-- Establishes the Central Supply Room as the root inventory receiving warehouse,
-- isolates departmental stock, and enforces the Monday-Wednesday requisition cutoff.

-- 1. Extend departments with root supply designation
alter table public.departments
  add column if not exists is_root_supply boolean not null default false;

create unique index if not exists uq_organization_root_supply
  on public.departments (organization_id)
  where (is_root_supply is true and active is true);

-- Helper to retrieve the root supply department for an organization
create or replace function public.get_root_supply_department(p_organization_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select id
  from public.departments
  where organization_id = p_organization_id
    and is_root_supply is true
    and active is true
  limit 1;
$$;

revoke all on function public.get_root_supply_department(uuid) from public, anon;
grant execute on function public.get_root_supply_department(uuid) to authenticated;

-- Helper to designate the root supply department
create or replace function public.set_root_supply_department(
  p_organization_id uuid,
  p_department_id uuid
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

  if not exists (
    select 1
    from public.departments
    where id = p_department_id
      and organization_id = p_organization_id
      and active is true
  ) then
    raise exception 'Target department not found or inactive.' using errcode = '22023';
  end if;

  -- Reset existing root supply flags in the organization
  update public.departments
  set is_root_supply = false,
      updated_at = now()
  where organization_id = p_organization_id
    and is_root_supply is true
    and id <> p_department_id;

  -- Designate the new root supply department
  update public.departments
  set is_root_supply = true,
      updated_at = now()
  where id = p_department_id
    and organization_id = p_organization_id;
end;
$$;

revoke all on function public.set_root_supply_department(uuid, uuid) from public, anon;
grant execute on function public.set_root_supply_department(uuid, uuid) to authenticated;

-- 2. Inventory Requisitions Table
create table if not exists public.inventory_requisitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  requisition_number text not null,
  requesting_department_id uuid not null,
  supply_department_id uuid not null,
  status text not null default 'submitted' check (
    status in ('submitted', 'approved', 'partially_dispersed', 'fulfilled', 'cancelled')
  ),
  is_emergency boolean not null default false,
  emergency_justification text,
  target_delivery_week date not null,
  notes text,
  submitted_by uuid not null references auth.users(id),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (requesting_department_id, organization_id)
    references public.departments(id, organization_id),
  foreign key (supply_department_id, organization_id)
    references public.departments(id, organization_id),
  unique (organization_id, requisition_number)
);

create table if not exists public.inventory_requisition_items (
  id uuid primary key default gen_random_uuid(),
  requisition_id uuid not null references public.inventory_requisitions(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  item_id uuid not null references public.inventory_items(id),
  requested_quantity numeric(12, 3) not null check (requested_quantity > 0),
  dispersed_quantity numeric(12, 3) not null default 0 check (dispersed_quantity >= 0),
  status text not null default 'pending' check (
    status in ('pending', 'awaiting_supply_intake', 'ready_for_dispersal', 'dispersed', 'cancelled')
  ),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (dispersed_quantity <= requested_quantity)
);

-- Indexes for requisitions
create index if not exists idx_inv_requisitions_org_dept
  on public.inventory_requisitions (organization_id, requesting_department_id, status);

create index if not exists idx_inv_requisitions_supply_status
  on public.inventory_requisitions (organization_id, supply_department_id, status);

create index if not exists idx_inv_requisition_items_req_status
  on public.inventory_requisition_items (requisition_id, status);

create index if not exists idx_inv_requisition_items_item_status
  on public.inventory_requisition_items (organization_id, item_id, status);

-- Enable RLS
alter table public.inventory_requisitions enable row level security;
alter table public.inventory_requisition_items enable row level security;

create policy inventory_requisitions_select on public.inventory_requisitions
for select to authenticated using (
  public.has_organization_permission(organization_id, 'can_manage_inventory')
  or public.has_organization_permission(organization_id, 'can_view_inventory')
  or exists (
    select 1
    from public.staff_department_assignments sda
    where sda.organization_id = inventory_requisitions.organization_id
      and sda.user_id = auth.uid()
      and sda.department_id in (
        inventory_requisitions.requesting_department_id,
        inventory_requisitions.supply_department_id
      )
  )
);

create policy inventory_requisition_items_select on public.inventory_requisition_items
for select to authenticated using (
  exists (
    select 1
    from public.inventory_requisitions req
    where req.id = inventory_requisition_items.requisition_id
      and (
        public.has_organization_permission(req.organization_id, 'can_manage_inventory')
        or public.has_organization_permission(req.organization_id, 'can_view_inventory')
        or exists (
          select 1
          from public.staff_department_assignments sda
          where sda.organization_id = req.organization_id
            and sda.user_id = auth.uid()
            and sda.department_id in (req.requesting_department_id, req.supply_department_id)
        )
      )
  )
);

revoke all on public.inventory_requisitions from public, anon;
grant select on public.inventory_requisitions to authenticated;

revoke all on public.inventory_requisition_items from public, anon;
grant select on public.inventory_requisition_items to authenticated;

-- Publish to realtime
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'inventory_requisitions'
  ) then
    alter publication supabase_realtime add table public.inventory_requisitions;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'inventory_requisition_items'
  ) then
    alter publication supabase_realtime add table public.inventory_requisition_items;
  end if;
end;
$$;

-- 3. Submit Inventory Requisition RPC
create or replace function public.submit_inventory_requisition(
  p_organization_id uuid,
  p_requesting_department_id uuid,
  p_items jsonb,
  p_notes text default null,
  p_is_emergency boolean default false,
  p_emergency_justification text default null,
  p_simulated_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
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

  -- Resolve Root Supply Department
  v_supply_dept_id := public.get_root_supply_department(p_organization_id);
  if v_supply_dept_id is null then
    raise exception 'No root supply department is configured for this clinic.' using errcode = '22023';
  end if;

  if p_requesting_department_id = v_supply_dept_id then
    raise exception 'The root supply department cannot requisition items from itself.' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.departments
    where id = p_requesting_department_id
      and organization_id = p_organization_id
      and active is true
  ) then
    raise exception 'The requesting department is not active.' using errcode = '22023';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'At least one item is required for requisition.' using errcode = '22023';
  end if;

  -- Evaluate submission day of week (in Asia/Manila)
  v_eval_date := coalesce(p_simulated_date, (now() at time zone 'Asia/Manila')::date);
  v_dow := extract(isodow from v_eval_date)::int;

  -- 1=Monday, 2=Tuesday, 3=Wednesday
  if v_dow not in (1, 2, 3) and not p_is_emergency then
    raise exception 'REQUISITION_WINDOW_CLOSED: Requisitions are accepted Monday to Wednesday only for guaranteed next-week delivery.' using errcode = '22023';
  end if;

  if p_is_emergency and coalesce(btrim(p_emergency_justification), '') = '' then
    raise exception 'An emergency justification is required for off-window requisitions.' using errcode = '22023';
  end if;

  -- Next delivery week is the Monday of the upcoming week
  v_target_delivery_week := (date_trunc('week', v_eval_date)::date) + 7;

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

    -- Check availability in Root Supply Department
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

revoke all on function public.submit_inventory_requisition(uuid, uuid, jsonb, text, boolean, text, date) from public, anon;
grant execute on function public.submit_inventory_requisition(uuid, uuid, jsonb, text, boolean, text, date) to authenticated;

-- 4. Disperse Inventory Requisition Item RPC
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

  if not public.has_organization_permission(v_req.organization_id, 'can_manage_inventory') then
    raise exception 'Inventory management permission is required to disperse stock.' using errcode = '42501';
  end if;

  if v_item.status = 'dispersed' then
    raise exception 'This requisition item has already been fully dispersed.' using errcode = '22023';
  end if;

  v_remaining_needed := v_item.requested_quantity - v_item.dispersed_quantity;
  v_disperse_qty := coalesce(p_quantity, v_remaining_needed);

  if v_disperse_qty <= 0 or v_disperse_qty > v_remaining_needed then
    raise exception 'Invalid dispersal quantity.' using errcode = '22023';
  end if;

  -- Execute transfer from Supply Room to Requesting Department using FEFO
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
