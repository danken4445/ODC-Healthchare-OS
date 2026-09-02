-- Clinic-scoped role CMS. Built-in operational roles remain stable codes for
-- existing records, while clinics may add roles and override a role's complete
-- permission set without changing application code.

create table public.clinic_role_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code),
  check (code ~ '^[a-z][a-z0-9_]{1,39}$'),
  check (length(btrim(name)) between 2 and 80)
);

create table public.clinic_role_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role_code text not null,
  permission text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, role_code, permission),
  check (permission in (
    'can_access_admin_portal', 'can_access_provider_portal',
    'can_manage_appointments', 'can_record_triage',
    'can_start_consultation', 'can_manage_provider_schedule',
    'can_manage_staff_roles', 'can_view_inventory',
    'can_manage_inventory', 'can_tag_inventory_usage',
    'role_permissions_configured'
  ))
);

create index clinic_role_definitions_org_active_idx
  on public.clinic_role_definitions (organization_id, active, name);

create or replace function public.has_organization_permission(
  target_organization_id uuid,
  target_permission text
)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  with caller_roles as (
    select practitioner_role.role_code
    from public.practitioner_roles practitioner_role
    join public.practitioners practitioner on practitioner.id = practitioner_role.practitioner_id
    where practitioner.auth_user_id = auth.uid()
      and practitioner.active and practitioner_role.active
      and practitioner_role.organization_id = target_organization_id
    union
    select role.name
    from public.user_roles membership
    join public.roles role on role.id = membership.role_id
    where membership.user_id = auth.uid()
      and membership.organization_id = target_organization_id
  )
  select exists (
    select 1
    from caller_roles caller_role
    where exists (
      select 1
      from public.clinic_role_permission_overrides role_override
      where role_override.organization_id = target_organization_id
        and role_override.role_code = caller_role.role_code
        and role_override.permission = target_permission
    )
    or (
      not exists (
        select 1 from public.clinic_role_permission_overrides role_override
        where role_override.organization_id = target_organization_id
          and role_override.role_code = caller_role.role_code
      )
      and exists (
        select 1
        from public.role_permissions permission
        join public.roles role on role.id = permission.role_id
        where role.name = caller_role.role_code
          and permission.organization_id is null
          and permission.permission = target_permission
      )
    )
  );
$$;

-- Defaults preserve the existing workspaces while making the access model
-- visible and editable in the staff CMS.
insert into public.clinic_role_permission_overrides (organization_id, role_code, permission)
select organization.id, defaults.role_code, defaults.permission
from public.organizations organization
cross join (values
  ('admin', 'can_access_admin_portal'), ('admin', 'can_manage_appointments'),
  ('admin', 'can_manage_staff_roles'), ('admin', 'can_view_inventory'),
  ('admin', 'can_manage_inventory'), ('admin', 'can_tag_inventory_usage'),
  ('owner', 'can_access_admin_portal'), ('owner', 'can_manage_appointments'),
  ('owner', 'can_manage_staff_roles'), ('owner', 'can_view_inventory'),
  ('owner', 'can_manage_inventory'), ('owner', 'can_tag_inventory_usage'),
  ('front_desk', 'can_access_admin_portal'), ('front_desk', 'can_manage_appointments'),
  ('nurse', 'can_access_provider_portal'), ('nurse', 'can_record_triage'),
  ('doctor', 'can_access_provider_portal'), ('doctor', 'can_start_consultation'),
  ('doctor', 'can_manage_provider_schedule'), ('doctor', 'can_tag_inventory_usage'),
  ('specialist', 'can_access_provider_portal'), ('specialist', 'can_start_consultation'),
  ('specialist', 'can_manage_provider_schedule'), ('specialist', 'can_tag_inventory_usage'),
  ('inventory_staff', 'can_access_admin_portal'), ('inventory_staff', 'can_view_inventory'),
  ('inventory_staff', 'can_manage_inventory'), ('inventory_staff', 'can_tag_inventory_usage')
) as defaults(role_code, permission)
on conflict (organization_id, role_code, permission) do nothing;

insert into public.clinic_role_permission_overrides (organization_id, role_code, permission)
select organization.id, role.name, 'role_permissions_configured'
from public.organizations organization
join public.roles role on role.name <> 'patient'
on conflict (organization_id, role_code, permission) do nothing;

create or replace function public.can_manage_organization_accounts(p_organization_id uuid)
returns boolean
language sql stable security definer set search_path = public, auth
as $$ select public.has_organization_permission(p_organization_id, 'can_manage_staff_roles'); $$;

create or replace function public.can_access_organization(target_organization_id uuid)
returns boolean
language sql stable security definer set search_path = public, auth
as $$
  select public.has_organization_permission(target_organization_id, 'can_access_admin_portal')
    or public.has_organization_permission(target_organization_id, 'can_access_provider_portal');
$$;

create or replace function public.get_current_staff_organization()
returns uuid
language sql stable security definer set search_path = public, auth
as $$
  select practitioner_role.organization_id
  from public.practitioner_roles practitioner_role
  join public.practitioners practitioner on practitioner.id = practitioner_role.practitioner_id
  where practitioner.auth_user_id = auth.uid()
    and practitioner.active and practitioner_role.active
    and (
      public.has_organization_permission(practitioner_role.organization_id, 'can_access_provider_portal')
      or public.has_organization_permission(practitioner_role.organization_id, 'can_access_admin_portal')
    )
  order by practitioner_role.created_at
  limit 1;
$$;

create or replace function public.get_portal_access(p_portal text)
returns table (is_allowed boolean, is_superadmin boolean, organization_ids uuid[], role_codes text[])
language plpgsql stable security definer set search_path = public, auth
as $$
declare
  v_organizations uuid[] := '{}'::uuid[];
  v_roles text[] := '{}'::text[];
  v_superadmin boolean := public.is_superadmin();
  required_permission text;
begin
  if p_portal not in ('patient', 'provider', 'admin') then
    raise exception 'Unsupported portal.' using errcode = '22023';
  end if;
  if p_portal = 'patient' then
    return query select not v_superadmin and not public.is_active_staff(), false, v_organizations, v_roles;
    return;
  end if;
  if p_portal = 'admin' and v_superadmin then
    return query select true, true, v_organizations, array['superadmin']::text[];
    return;
  end if;
  required_permission := case when p_portal = 'provider'
    then 'can_access_provider_portal' else 'can_access_admin_portal' end;

  select coalesce(array_agg(distinct membership.organization_id), '{}'::uuid[]),
    coalesce(array_agg(distinct membership.role_code), '{}'::text[])
  into v_organizations, v_roles
  from (
    select practitioner_role.organization_id, practitioner_role.role_code
    from public.practitioner_roles practitioner_role
    join public.practitioners practitioner on practitioner.id = practitioner_role.practitioner_id
    where practitioner.auth_user_id = auth.uid()
      and practitioner.active and practitioner_role.active
      and public.has_organization_permission(practitioner_role.organization_id, required_permission)
    union
    select membership.organization_id, role.name
    from public.user_roles membership
    join public.roles role on role.id = membership.role_id
    where membership.user_id = auth.uid()
      and public.has_organization_permission(membership.organization_id, required_permission)
  ) membership;
  return query select cardinality(v_organizations) > 0, false, v_organizations, v_roles;
end;
$$;

create or replace function public.list_clinic_role_definitions(p_organization_id uuid)
returns table (code text, name text, is_custom boolean, permissions text[])
language plpgsql stable security definer set search_path = public, auth
as $$
begin
  if not public.can_manage_organization_accounts(p_organization_id) then
    raise exception 'Role management permission is required.' using errcode = '42501';
  end if;
  return query
  with catalog as (
    select role.name as role_code, initcap(replace(role.name, '_', ' ')) as role_name, false as custom_role
    from public.roles role
    where role.name <> 'patient'
    union all
    select definition.code, definition.name, true
    from public.clinic_role_definitions definition
    where definition.organization_id = p_organization_id and definition.active
  )
  select catalog.role_code, catalog.role_name, catalog.custom_role,
    coalesce(array_agg(role_override.permission order by role_override.permission) filter (where role_override.permission <> 'role_permissions_configured'), '{}'::text[])
  from catalog
  left join public.clinic_role_permission_overrides role_override
    on role_override.organization_id = p_organization_id and role_override.role_code = catalog.role_code
  group by catalog.role_code, catalog.role_name, catalog.custom_role
  order by catalog.custom_role, catalog.role_name;
end;
$$;

create or replace function public.save_clinic_role_definition(
  p_organization_id uuid,
  p_code text,
  p_name text,
  p_permissions text[]
)
returns void
language plpgsql security definer set search_path = public, auth
as $$
declare
  normalized_code text := lower(btrim(p_code));
  normalized_name text := btrim(p_name);
  allowed_permissions text[] := array[
    'can_access_admin_portal', 'can_access_provider_portal',
    'can_manage_appointments', 'can_record_triage', 'can_start_consultation',
    'can_manage_provider_schedule', 'can_manage_staff_roles',
    'can_view_inventory', 'can_manage_inventory', 'can_tag_inventory_usage'
  ];
begin
  if not public.can_manage_organization_accounts(p_organization_id) then
    raise exception 'Role management permission is required.' using errcode = '42501';
  end if;
  if normalized_code !~ '^[a-z][a-z0-9_]{1,39}$'
    or length(normalized_name) not between 2 and 80
    or exists (select 1 from unnest(coalesce(p_permissions, '{}'::text[])) permission where permission <> all(allowed_permissions)) then
    raise exception 'Role details or permissions are invalid.' using errcode = '22023';
  end if;

  if not exists (select 1 from public.roles role where role.name = normalized_code) then
    insert into public.clinic_role_definitions (organization_id, code, name)
    values (p_organization_id, normalized_code, normalized_name)
    on conflict (organization_id, code) do update set name = excluded.name, active = true;
  end if;

  delete from public.clinic_role_permission_overrides
  where organization_id = p_organization_id and role_code = normalized_code;
  insert into public.clinic_role_permission_overrides (organization_id, role_code, permission)
  select p_organization_id, normalized_code, permission
  from unnest(array_append(coalesce(p_permissions, '{}'::text[]), 'role_permissions_configured')) permission;
end;
$$;

-- Core workflow authorization is now permission-driven. The role code remains
-- useful as a label, but cannot bypass a disabled permission.
create or replace function public.update_appointment_status(
  p_appointment_id uuid,
  p_status public.appointment_status
)
returns void
language plpgsql security definer set search_path = public, auth
as $$
declare current_appointment public.appointments%rowtype;
begin
  select * into current_appointment from public.appointments appointment
  where appointment.id = p_appointment_id for update;
  if current_appointment.id is null
    or not public.has_organization_permission(current_appointment.organization_id, 'can_manage_appointments') then
    raise exception 'Appointment not found.' using errcode = 'P0002';
  end if;
  if not (
    (current_appointment.status = 'booked' and p_status in ('arrived', 'cancelled', 'noshow'))
    or (current_appointment.status = 'arrived' and p_status in ('cancelled', 'noshow'))
    or current_appointment.status = p_status
  ) then raise exception 'Invalid appointment status transition.' using errcode = '23514'; end if;
  update public.appointments set status = p_status where id = p_appointment_id;
end;
$$;

-- A custom clinic staff role may triage when granted the triage permission.
-- Disabling triage for the built-in nurse role also takes effect immediately.
create or replace function public.get_current_practitioner(
  p_organization_id uuid,
  p_roles text[]
)
returns uuid
language sql stable security definer set search_path = public, auth
as $$
  select practitioner.id
  from public.practitioners practitioner
  join public.practitioner_roles practitioner_role on practitioner_role.practitioner_id = practitioner.id
  where practitioner.auth_user_id = auth.uid()
    and practitioner.organization_id = p_organization_id
    and practitioner.active and practitioner_role.active
    and practitioner_role.organization_id = p_organization_id
    and (
      (practitioner_role.role_code = any(p_roles)
        and (practitioner_role.role_code <> 'nurse'
          or public.has_organization_permission(p_organization_id, 'can_record_triage')))
      or ('nurse' = any(p_roles)
        and public.has_organization_permission(p_organization_id, 'can_record_triage'))
    )
  limit 1;
$$;

create or replace function public.start_appointment_encounter(p_appointment_id uuid)
returns uuid
language plpgsql security definer set search_path = public, auth
as $$
declare
  selected_appointment public.appointments%rowtype;
  selected_encounter public.encounters%rowtype;
begin
  select appointment.* into selected_appointment
  from public.appointments appointment
  join public.practitioner_roles practitioner_role on practitioner_role.id = appointment.practitioner_role_id
  join public.practitioners practitioner on practitioner.id = practitioner_role.practitioner_id
  where appointment.id = p_appointment_id
    and practitioner.active and practitioner_role.active
    and practitioner.auth_user_id = auth.uid()
  for update of appointment;
  if selected_appointment.id is null then
    raise exception 'Assigned appointment not found.' using errcode = 'P0002';
  end if;
  if not public.has_organization_permission(selected_appointment.organization_id, 'can_start_consultation') then
    raise exception 'Consultation permission is required.' using errcode = '42501';
  end if;
  if selected_appointment.status <> 'arrived' then
    raise exception 'Only a checked-in appointment can be started.' using errcode = '23514';
  end if;
  select * into selected_encounter from public.encounters encounter
  where encounter.appointment_id = selected_appointment.id for update;
  if selected_encounter.id is null or not exists (
    select 1 from public.observations observation
    where observation.encounter_id = selected_encounter.id
      and observation.code = 'TRIAGE-VITALS' and observation.status = 'final'
  ) then
    raise exception 'Completed triage is required before the consultation can start.' using errcode = '23514';
  end if;
  if selected_encounter.status = 'in_progress' then return selected_encounter.id; end if;
  if selected_encounter.status <> 'arrived' then
    raise exception 'This appointment already has an encounter.' using errcode = '23505';
  end if;
  update public.encounters set status = 'in_progress', period_start = coalesce(period_start, now())
  where id = selected_encounter.id;
  return selected_encounter.id;
end;
$$;

alter table public.clinic_role_definitions enable row level security;
alter table public.clinic_role_permission_overrides enable row level security;
create policy clinic_role_definitions_select on public.clinic_role_definitions for select to authenticated
  using (public.can_manage_organization_accounts(organization_id));
create policy clinic_role_permission_overrides_select on public.clinic_role_permission_overrides for select to authenticated
  using (public.can_manage_organization_accounts(organization_id));
revoke insert, update, delete on public.clinic_role_definitions, public.clinic_role_permission_overrides from authenticated;

revoke all on function public.list_clinic_role_definitions(uuid) from public;
revoke all on function public.save_clinic_role_definition(uuid, text, text, text[]) from public;
grant execute on function public.list_clinic_role_definitions(uuid) to authenticated;
grant execute on function public.save_clinic_role_definition(uuid, text, text, text[]) to authenticated;
grant execute on function public.can_manage_organization_accounts(uuid) to authenticated;
grant execute on function public.get_current_staff_organization() to authenticated;
grant execute on function public.get_portal_access(text) to authenticated;
grant execute on function public.update_appointment_status(uuid, public.appointment_status) to authenticated;
grant execute on function public.get_current_practitioner(uuid, text[]) to authenticated;
grant execute on function public.start_appointment_encounter(uuid) to authenticated;
