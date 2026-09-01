-- Portal RBAC and platform-level administration.
--
-- PractitionerRole is the authoritative source for clinical/front-desk work.
-- user_roles grants organization-level admin/owner assignments.  A platform
-- superadmin is intentionally a separate, unscoped identity and never gains
-- ambient access to patient-linked clinical records.

create table public.platform_admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid not null references auth.users(id)
);

alter table public.platform_admins enable row level security;

create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.platform_admins platform_admin
    where platform_admin.user_id = auth.uid()
  );
$$;

-- A clinical role always requires the matching active PractitionerRole. This
-- preserves the Practitioner/PractitionerRole FHIR relationship and prevents
-- a bare user_roles row from becoming a clinical credential.
create or replace function public.has_organization_role(
  target_organization_id uuid,
  allowed_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.practitioner_roles practitioner_role
    join public.practitioners practitioner on practitioner.id = practitioner_role.practitioner_id
    where practitioner_role.organization_id = target_organization_id
      and practitioner_role.active
      and practitioner.active
      and practitioner.auth_user_id = auth.uid()
      and practitioner_role.role_code = any(allowed_roles)
  ) or exists (
    select 1
    from public.user_roles membership
    join public.roles role on role.id = membership.role_id
    where membership.organization_id = target_organization_id
      and membership.user_id = auth.uid()
      and role.name in ('admin', 'owner')
      and role.name = any(allowed_roles)
  );
$$;

create or replace function public.is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.practitioner_roles practitioner_role
    join public.practitioners practitioner on practitioner.id = practitioner_role.practitioner_id
    where practitioner_role.active
      and practitioner.active
      and practitioner.auth_user_id = auth.uid()
  ) or exists (
    select 1
    from public.user_roles membership
    join public.roles role on role.id = membership.role_id
    where membership.user_id = auth.uid()
      and role.name in ('admin', 'owner')
  );
$$;

create or replace function public.is_any_owner()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.practitioner_roles practitioner_role
    join public.practitioners practitioner on practitioner.id = practitioner_role.practitioner_id
    where practitioner_role.active
      and practitioner.active
      and practitioner.auth_user_id = auth.uid()
      and practitioner_role.role_code = 'owner'
  ) or exists (
    select 1
    from public.user_roles membership
    join public.roles role on role.id = membership.role_id
    where membership.user_id = auth.uid() and role.name = 'owner'
  );
$$;

-- A staff or platform identity cannot turn a linked Patient row into a second
-- portal identity. Patient data remains available only through a non-staff
-- universal patient account (or the separately-issued walk-in token).
create or replace function public.is_patient_self(
  target_patient_id uuid,
  target_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select (
    not public.is_active_staff()
    and not public.is_superadmin()
    and exists (
      select 1
      from public.patients patient
      join public.patient_clinic_contexts context
        on context.auth_user_id = patient.auth_user_id
       and context.organization_id = patient.organization_id
      where patient.id = target_patient_id
        and patient.organization_id = target_organization_id
        and patient.active
        and patient.auth_user_id = auth.uid()
    )
  ) or public.is_walk_in_patient(target_patient_id, target_organization_id);
$$;

create or replace function public.enroll_patient_at_clinic(
  p_organization_id uuid,
  p_display_name text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller_id uuid := auth.uid();
  patient_id uuid;
  display_name text := btrim(p_display_name);
begin
  if caller_id is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;
  if public.is_active_staff() or public.is_superadmin() then
    raise exception 'Operational accounts cannot enroll as patients.' using errcode = '42501';
  end if;
  if display_name is null or length(display_name) < 2 or length(display_name) > 120 then
    raise exception 'A patient display name between 2 and 120 characters is required.'
      using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.organizations organization
    where organization.id = p_organization_id and organization.active
  ) then
    raise exception 'The selected clinic is not accepting registrations.' using errcode = '22023';
  end if;

  insert into public.patients (organization_id, auth_user_id, name)
  values (p_organization_id, caller_id, jsonb_build_object('text', display_name))
  on conflict (organization_id, auth_user_id) where auth_user_id is not null
  do update set name = public.patients.name
  returning id into patient_id;

  insert into public.patient_clinic_contexts (auth_user_id, organization_id)
  values (caller_id, p_organization_id)
  on conflict (auth_user_id) do update
  set organization_id = excluded.organization_id;

  return patient_id;
end;
$$;

create or replace function public.set_patient_clinic_context(
  p_organization_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;
  if public.is_active_staff() or public.is_superadmin() then
    raise exception 'Operational accounts cannot select a patient clinic.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.patients patient
    where patient.auth_user_id = auth.uid()
      and patient.organization_id = p_organization_id
      and patient.active
  ) then
    raise exception 'You are not enrolled at the selected clinic.' using errcode = '42501';
  end if;
  insert into public.patient_clinic_contexts (auth_user_id, organization_id)
  values (auth.uid(), p_organization_id)
  on conflict (auth_user_id) do update
  set organization_id = excluded.organization_id;
end;
$$;

-- A regional administrator may hold admin/owner assignments at several
-- clinics. Clinical/front-desk identities remain tied to their Practitioner
-- record and cannot be manufactured through user_roles.
create or replace function public.enforce_staff_user_clinic_boundary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned_role text;
begin
  select role.name into assigned_role from public.roles role where role.id = new.role_id;

  if assigned_role in ('doctor', 'nurse', 'lab_staff', 'specialist', 'front_desk')
    and not exists (
      select 1
      from public.practitioner_roles practitioner_role
      join public.practitioners practitioner on practitioner.id = practitioner_role.practitioner_id
      where practitioner.auth_user_id = new.user_id
        and practitioner.organization_id = new.organization_id
        and practitioner.active
        and practitioner_role.active
        and practitioner_role.role_code = assigned_role
    ) then
    raise exception 'Clinical and front-desk memberships require a matching active PractitionerRole.'
      using errcode = '23514';
  end if;

  if assigned_role in ('doctor', 'nurse', 'lab_staff', 'specialist', 'front_desk') and exists (
    select 1 from public.practitioners practitioner
    where practitioner.auth_user_id = new.user_id
      and practitioner.organization_id <> new.organization_id
  ) then
    raise exception 'Clinical and front-desk access must match the practitioner clinic.' using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_practitioner_user_clinic_boundary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.auth_user_id is not null and exists (
    select 1
    from public.user_roles membership
    join public.roles role on role.id = membership.role_id
    where membership.user_id = new.auth_user_id
      and membership.organization_id <> new.organization_id
      and role.name in ('doctor', 'nurse', 'lab_staff', 'specialist', 'front_desk')
  ) then
    raise exception 'Clinical and front-desk access must match the practitioner clinic.' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- This is the only browser-facing portal authorization decision. Apps use it
-- immediately after login, while RLS/RPC checks remain authoritative for all
-- records and mutations after entry.
create or replace function public.get_portal_access(p_portal text)
returns table (
  is_allowed boolean,
  is_superadmin boolean,
  organization_ids uuid[],
  role_codes text[]
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_organizations uuid[] := '{}'::uuid[];
  v_roles text[] := '{}'::text[];
  v_superadmin boolean := public.is_superadmin();
begin
  if p_portal not in ('patient', 'provider', 'admin') then
    raise exception 'Unsupported portal.' using errcode = '22023';
  end if;

  if p_portal = 'patient' then
    -- Patient registration is permitted for a non-staff Auth account even
    -- before it has enrolled at its first clinic.
    return query select
      not v_superadmin and not public.is_active_staff(),
      false,
      v_organizations,
      v_roles;
    return;
  end if;

  if p_portal = 'provider' then
    select
      coalesce(array_agg(distinct practitioner_role.organization_id), '{}'::uuid[]),
      coalesce(array_agg(distinct practitioner_role.role_code), '{}'::text[])
    into v_organizations, v_roles
    from public.practitioner_roles practitioner_role
    join public.practitioners practitioner on practitioner.id = practitioner_role.practitioner_id
    where practitioner.auth_user_id = auth.uid()
      and practitioner.active
      and practitioner_role.active
      and practitioner_role.role_code in ('doctor', 'specialist');

    return query select cardinality(v_organizations) > 0, false, v_organizations, v_roles;
    return;
  end if;

  if v_superadmin then
    return query select true, true, v_organizations, array['superadmin']::text[];
    return;
  end if;

  select
    coalesce(array_agg(distinct assignment.organization_id), '{}'::uuid[]),
    coalesce(array_agg(distinct assignment.role_code), '{}'::text[])
  into v_organizations, v_roles
  from (
    select practitioner_role.organization_id, practitioner_role.role_code
    from public.practitioner_roles practitioner_role
    join public.practitioners practitioner on practitioner.id = practitioner_role.practitioner_id
    where practitioner.auth_user_id = auth.uid()
      and practitioner.active
      and practitioner_role.active
      and practitioner_role.role_code in ('front_desk', 'admin', 'owner')
    union
    select membership.organization_id, role.name
    from public.user_roles membership
    join public.roles role on role.id = membership.role_id
    where membership.user_id = auth.uid()
      and role.name in ('admin', 'owner')
  ) assignment;

  return query select cardinality(v_organizations) > 0, false, v_organizations, v_roles;
end;
$$;

-- Superadmins may operate platform configuration and audit data, but never
-- inherit patient/encounter/clinical-resource policies. Break-glass is a
-- future, separately-audited workflow.
drop policy if exists organizations_select on public.organizations;
drop policy if exists organizations_manage on public.organizations;
drop policy if exists practitioners_select on public.practitioners;
drop policy if exists practitioners_manage on public.practitioners;
drop policy if exists practitioner_roles_select on public.practitioner_roles;
drop policy if exists practitioner_roles_manage on public.practitioner_roles;
drop policy if exists roles_select on public.roles;
drop policy if exists role_permissions_select on public.role_permissions;
drop policy if exists role_permissions_manage on public.role_permissions;
drop policy if exists user_roles_select on public.user_roles;
drop policy if exists user_roles_manage on public.user_roles;
drop policy if exists audit_log_select on public.audit_log;
drop policy if exists clinic_services_manage on public.clinic_services;

create policy organizations_select on public.organizations for select to authenticated
  using (public.is_superadmin() or public.can_access_organization(id) or exists (
    select 1 from public.patients patient
    where patient.organization_id = id and public.is_patient_self(patient.id, patient.organization_id)
  ));
create policy organizations_manage on public.organizations for all to authenticated
  using (public.is_superadmin() or public.has_organization_role(id, array['owner', 'admin']))
  with check (public.is_superadmin() or public.has_organization_role(id, array['owner', 'admin']));

create policy practitioners_select on public.practitioners for select to authenticated
  using (public.is_superadmin() or auth_user_id = auth.uid() or public.can_access_organization(organization_id) or exists (
    select 1 from public.patients patient
    where patient.organization_id = practitioners.organization_id
      and public.is_patient_self(patient.id, patient.organization_id)
  ));
create policy practitioners_manage on public.practitioners for all to authenticated
  using (public.is_superadmin() or public.has_organization_role(organization_id, array['owner', 'admin']))
  with check (public.is_superadmin() or public.has_organization_role(organization_id, array['owner', 'admin']));

create policy practitioner_roles_select on public.practitioner_roles for select to authenticated
  using (public.is_superadmin() or public.can_access_organization(organization_id) or exists (
    select 1 from public.patients patient
    where patient.organization_id = practitioner_roles.organization_id
      and public.is_patient_self(patient.id, patient.organization_id)
  ));
create policy practitioner_roles_manage on public.practitioner_roles for all to authenticated
  using (public.is_superadmin() or public.has_organization_role(organization_id, array['owner', 'admin']))
  with check (public.is_superadmin() or public.has_organization_role(organization_id, array['owner', 'admin']));

create policy roles_select on public.roles for select to authenticated
  using (public.is_superadmin() or public.is_active_staff());
create policy role_permissions_select on public.role_permissions for select to authenticated
  using (public.is_superadmin() or (organization_id is null and public.is_active_staff()) or public.can_access_organization(organization_id));
create policy role_permissions_manage on public.role_permissions for all to authenticated
  using (public.is_superadmin() or (organization_id is null and public.is_any_owner()) or public.has_organization_role(organization_id, array['owner']))
  with check (public.is_superadmin() or (organization_id is null and public.is_any_owner()) or public.has_organization_role(organization_id, array['owner']));
create policy user_roles_select on public.user_roles for select to authenticated
  using (public.is_superadmin() or user_id = auth.uid() or public.has_organization_role(organization_id, array['admin', 'owner']));
create policy user_roles_manage on public.user_roles for all to authenticated
  using (public.is_superadmin() or public.has_organization_role(organization_id, array['owner']))
  with check (public.is_superadmin() or public.has_organization_role(organization_id, array['owner']));
create policy audit_log_select on public.audit_log for select to authenticated
  using (public.is_superadmin() or (organization_id is not null and public.has_organization_role(organization_id, array['admin', 'owner'])));
create policy clinic_services_manage on public.clinic_services for all to authenticated
  using (public.is_superadmin() or public.has_organization_role(organization_id, array['admin', 'owner']))
  with check (public.is_superadmin() or public.has_organization_role(organization_id, array['admin', 'owner']));
create policy platform_admins_select on public.platform_admins for select to authenticated
  using (public.is_superadmin());

create trigger platform_admins_audit
  after insert or update or delete on public.platform_admins
  for each row execute function public.write_audit_log();

revoke all on function public.is_superadmin() from public;
revoke all on function public.get_portal_access(text) from public;
grant execute on function public.is_superadmin() to authenticated;
grant execute on function public.get_portal_access(text) to authenticated;

comment on table public.platform_admins is
  'Odyssey platform operators. This table is intentionally not organization-scoped and grants administrative, never ambient clinical, access.';
comment on function public.get_portal_access(text) is
  'Database-authoritative portal entry decision. Patient is for non-staff identities; provider requires an active doctor/specialist PractitionerRole; admin requires front-desk/admin/owner or platform-admin status.';
