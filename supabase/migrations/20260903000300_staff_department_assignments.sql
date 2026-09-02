-- Staff department context for inventory tagging.
-- A nullable assignment means the tagger must choose a department at use time.

create table public.staff_department_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  department_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (department_id, organization_id)
    references public.departments(id, organization_id) on delete cascade,
  unique (organization_id, user_id)
);

create index staff_department_assignments_org_department_idx
  on public.staff_department_assignments (organization_id, department_id);

create trigger staff_department_assignments_set_updated_at
before update on public.staff_department_assignments
for each row execute function public.set_updated_at();

create trigger staff_department_assignments_audit
after insert or update or delete on public.staff_department_assignments
for each row execute function public.write_audit_log();

alter table public.staff_department_assignments enable row level security;

create policy staff_department_assignments_select
on public.staff_department_assignments for select to authenticated
using (public.can_manage_organization_accounts(organization_id) or user_id = auth.uid());

create policy staff_department_assignments_manage
on public.staff_department_assignments for all to authenticated
using (public.can_manage_organization_accounts(organization_id))
with check (public.can_manage_organization_accounts(organization_id));

create or replace function public.list_staff_departments(p_organization_id uuid)
returns table (id uuid, code text, name text, active boolean)
language plpgsql stable security definer set search_path = public, auth
as $$
begin
  if not public.can_manage_organization_accounts(p_organization_id) then
    raise exception 'Staff management permission is required.' using errcode = '42501';
  end if;

  return query
  select department.id, department.code, department.name, department.active
  from public.departments department
  where department.organization_id = p_organization_id
  order by department.active desc, department.name;
end;
$$;

create or replace function public.list_clinic_staff(p_organization_id uuid)
returns table (
  user_id uuid,
  display_name text,
  email text,
  role_code text,
  department_id uuid,
  active boolean
)
language plpgsql stable security definer set search_path = public, auth
as $$
begin
  if not public.can_manage_organization_accounts(p_organization_id) then
    raise exception 'Staff management permission is required.' using errcode = '42501';
  end if;

  return query
  with staff_members as (
    select
      practitioner.auth_user_id as staff_user_id,
      coalesce(
        nullif(practitioner.name ->> 'text', ''),
        nullif(user_account.raw_user_meta_data ->> 'display_name', ''),
        user_account.email,
        'Unnamed staff'
      ) as staff_display_name,
      user_account.email as staff_email,
      practitioner_role.role_code as staff_role_code,
      practitioner.active and practitioner_role.active as staff_active
    from public.practitioner_roles practitioner_role
    join public.practitioners practitioner
      on practitioner.id = practitioner_role.practitioner_id
    left join auth.users user_account
      on user_account.id = practitioner.auth_user_id
    where practitioner_role.organization_id = p_organization_id
      and practitioner.auth_user_id is not null

    union

    select
      membership.user_id as staff_user_id,
      coalesce(
        nullif(user_account.raw_user_meta_data ->> 'display_name', ''),
        user_account.email,
        'Unnamed staff'
      ) as staff_display_name,
      user_account.email as staff_email,
      role.name as staff_role_code,
      true as staff_active
    from public.user_roles membership
    join public.roles role on role.id = membership.role_id
    left join auth.users user_account on user_account.id = membership.user_id
    where membership.organization_id = p_organization_id
      and role.name <> 'patient'
  )
  select
    staff_members.staff_user_id,
    staff_members.staff_display_name,
    staff_members.staff_email,
    staff_members.staff_role_code,
    assignment.department_id,
    staff_members.staff_active
  from staff_members
  left join public.staff_department_assignments assignment
    on assignment.organization_id = p_organization_id
    and assignment.user_id = staff_members.staff_user_id
  order by staff_members.staff_active desc, staff_members.staff_display_name, staff_members.staff_role_code;
end;
$$;

create or replace function public.get_current_staff_department(p_organization_id uuid)
returns uuid
language sql stable security definer set search_path = public, auth
as $$
  select assignment.department_id
  from public.staff_department_assignments assignment
  join public.departments department
    on department.id = assignment.department_id
    and department.organization_id = assignment.organization_id
  where assignment.organization_id = p_organization_id
    and assignment.user_id = auth.uid()
    and department.active
    and public.can_access_organization(p_organization_id)
  limit 1;
$$;

create or replace function public.assign_staff_department(
  p_organization_id uuid,
  p_user_id uuid,
  p_department_id uuid
)
returns void
language plpgsql security definer set search_path = public, auth
as $$
begin
  if not public.can_manage_organization_accounts(p_organization_id) then
    raise exception 'Staff management permission is required.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.practitioner_roles practitioner_role
    join public.practitioners practitioner on practitioner.id = practitioner_role.practitioner_id
    where practitioner_role.organization_id = p_organization_id
      and practitioner.auth_user_id = p_user_id
      and practitioner.active and practitioner_role.active
    union
    select 1
    from public.user_roles membership
    where membership.organization_id = p_organization_id
      and membership.user_id = p_user_id
  ) then
    raise exception 'The selected staff member is not assigned to this clinic.' using errcode = '22023';
  end if;

  if p_department_id is null then
    delete from public.staff_department_assignments
    where organization_id = p_organization_id and user_id = p_user_id;
    return;
  end if;

  if not exists (
    select 1 from public.departments department
    where department.id = p_department_id
      and department.organization_id = p_organization_id
      and department.active
  ) then
    raise exception 'Select an active department in this clinic.' using errcode = '22023';
  end if;

  insert into public.staff_department_assignments (organization_id, user_id, department_id)
  values (p_organization_id, p_user_id, p_department_id)
  on conflict (organization_id, user_id) do update
    set department_id = excluded.department_id;
end;
$$;

-- Passing a department is optional for backwards compatibility. An assigned
-- tagger is always constrained to their assigned department by the 4-argument
-- implementation below.
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

create or replace function public.tag_inventory_usage(
  p_encounter_id uuid,
  p_stock_id uuid,
  p_quantity numeric,
  p_department_id uuid
)
returns uuid
language plpgsql security definer set search_path = public, auth
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
    patient_id, quantity, unit_price, currency, tagged_by
  ) values (
    v_encounter.organization_id, v_stock.id, v_item.id, v_stock.department_id,
    v_encounter.id, v_encounter.patient_id, p_quantity,
    v_item.unit_price, v_item.currency, auth.uid()
  ) returning id into v_usage_id;

  insert into public.inventory_stock_movements (
    organization_id, stock_id, item_id, department_id, movement_type,
    quantity_delta, reason, usage_id, recorded_by
  ) values (
    v_encounter.organization_id, v_stock.id, v_item.id, v_stock.department_id,
    'usage', -p_quantity, 'Encounter usage', v_usage_id, auth.uid()
  );
  return v_usage_id;
end;
$$;

revoke all on function public.list_staff_departments(uuid) from public;
revoke all on function public.list_clinic_staff(uuid) from public;
revoke all on function public.get_current_staff_department(uuid) from public;
revoke all on function public.assign_staff_department(uuid, uuid, uuid) from public;
revoke all on function public.tag_inventory_usage(uuid, uuid, numeric) from public;
revoke all on function public.tag_inventory_usage(uuid, uuid, numeric, uuid) from public;
grant execute on function public.list_staff_departments(uuid) to authenticated;
grant execute on function public.list_clinic_staff(uuid) to authenticated;
grant execute on function public.get_current_staff_department(uuid) to authenticated;
grant execute on function public.assign_staff_department(uuid, uuid, uuid) to authenticated;
grant execute on function public.tag_inventory_usage(uuid, uuid, numeric) to authenticated;
grant execute on function public.tag_inventory_usage(uuid, uuid, numeric, uuid) to authenticated;

comment on table public.staff_department_assignments is
  'Optional clinic department context for staff; unassigned inventory taggers choose a department at use time.';
