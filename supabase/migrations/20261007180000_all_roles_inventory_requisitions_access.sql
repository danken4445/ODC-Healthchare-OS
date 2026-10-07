-- Universal Inventory & Requisition Access Across All Roles
-- Ensures all roles (built-in and custom) have access to inventory and the Requisition module
-- by granting 'can_view_inventory' and 'can_access_admin_portal' across all non-patient roles.

-- 1. Seed global default permissions for all non-patient catalog roles
insert into public.role_permissions (role_id, organization_id, permission)
select role.id, null, defaults.permission
from public.roles role
cross join (values
  ('can_access_admin_portal'),
  ('can_view_inventory')
) as defaults(permission)
where role.name <> 'patient'
on conflict (role_id, organization_id, permission) do nothing;

-- 2. Materialize permissions into clinic_role_permission_overrides for all organizations
-- A. For all catalog roles across all existing organizations
insert into public.clinic_role_permission_overrides (organization_id, role_code, permission)
select org.id, r.name, perm.permission
from public.organizations org
cross join public.roles r
cross join (values ('can_access_admin_portal'), ('can_view_inventory')) as perm(permission)
where r.name <> 'patient'
on conflict (organization_id, role_code, permission) do nothing;

-- B. For all custom clinic roles across all existing organizations
insert into public.clinic_role_permission_overrides (organization_id, role_code, permission)
select crd.organization_id, crd.code, perm.permission
from public.clinic_role_definitions crd
cross join (values ('can_access_admin_portal'), ('can_view_inventory')) as perm(permission)
on conflict (organization_id, role_code, permission) do nothing;

-- 3. Ensure submit_inventory_requisition permits any staff member with inventory view access
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
    or public.has_organization_permission(p_organization_id, 'can_view_inventory')
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

  -- Central Supply Root Window Check (Mon-Wed only for root supply unless emergency)
  if v_supply_dept_id = v_root_supply_dept_id then
    if not p_is_emergency and v_dow not in (1, 2, 3) then
      raise exception 'Routine requisitions to Central Supply are only accepted Monday to Wednesday (Asia/Manila). Emergency requisitions require justification.'
        using errcode = '22023';
    end if;

    if p_is_emergency and (p_emergency_justification is null or length(btrim(p_emergency_justification)) < 10) then
      raise exception 'Emergency requisitions require a detailed justification (minimum 10 characters).'
        using errcode = '22023';
    end if;
  end if;

  -- Calculate target delivery week (Next Monday)
  v_target_delivery_week := v_eval_date + ((8 - v_dow) % 7)::int;
  if v_dow = 1 and v_target_delivery_week = v_eval_date then
    v_target_delivery_week := v_eval_date + 7;
  end if;

  -- Generate human-friendly requisition number REQ-YYYYMMDD-XXXX
  select count(*) + 1 into v_seq
  from public.inventory_requisitions
  where organization_id = p_organization_id
    and created_at::date = v_eval_date;

  v_req_num := 'REQ-' || to_char(v_eval_date, 'YYYYMMDD') || '-' || lpad(v_seq::text, 4, '0');

  -- Create master requisition record
  insert into public.inventory_requisitions (
    organization_id,
    requesting_department_id,
    supply_department_id,
    requisition_number,
    status,
    notes,
    is_emergency,
    emergency_justification,
    submission_date,
    target_delivery_week,
    submitted_by
  ) values (
    p_organization_id,
    p_requesting_department_id,
    v_supply_dept_id,
    v_req_num,
    'submitted',
    p_notes,
    p_is_emergency,
    p_emergency_justification,
    v_eval_date,
    v_target_delivery_week,
    auth.uid()
  )
  returning id into v_req_id;

  -- Process line items
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_item_id := (v_item ->> 'item_id')::uuid;
    v_req_qty := (v_item ->> 'requested_quantity')::numeric;
    v_item_notes := v_item ->> 'notes';

    if v_req_qty <= 0 then
      raise exception 'Requested quantity must be positive.' using errcode = '22023';
    end if;

    -- Check availability in supplying department
    select coalesce(quantity, 0) into v_avail_supply_qty
    from public.department_stock
    where organization_id = p_organization_id
      and item_id = v_item_id
      and department_id = v_supply_dept_id;

    v_avail_supply_qty := coalesce(v_avail_supply_qty, 0);

    if v_avail_supply_qty = 0 then
      v_initial_item_status := 'stockout_backordered';
    elsif v_avail_supply_qty < v_req_qty then
      v_initial_item_status := 'ready_for_dispersal';
    else
      v_initial_item_status := 'ready_for_dispersal';
    end if;

    insert into public.inventory_requisition_items (
      requisition_id,
      item_id,
      requested_quantity,
      dispersed_quantity,
      status,
      notes
    ) values (
      v_req_id,
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
