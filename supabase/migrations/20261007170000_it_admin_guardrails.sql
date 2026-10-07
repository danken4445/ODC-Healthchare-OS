-- IT Administrator Boundary & Admin/Owner Account Protection Guardrails
-- Ensures IT administrators can manage all departmental accounts while strictly preventing:
-- 1. Modifying or assigning admin / owner roles
-- 2. Modifying, deactivating, or reassigning admin / owner accounts
-- 3. Modifying admin / owner role definitions or permission overrides

-- 1. Function to reassign a staff member's role with admin/owner protections
create or replace function public.assign_staff_role(
  p_organization_id uuid,
  p_user_id uuid,
  p_role_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_normalized_code text := lower(btrim(p_role_code));
  v_role_id uuid;
  v_practitioner_id uuid;
  v_is_privileged boolean := (
    public.is_superadmin()
    or public.has_organization_role(p_organization_id, array['admin', 'owner'])
  );
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if not public.can_manage_organization_accounts(p_organization_id) then
    raise exception 'Staff management permission is required.' using errcode = '42501';
  end if;

  -- Guardrail: Non-admin/owner callers (e.g. IT admin) cannot assign admin or owner roles
  if not v_is_privileged and v_normalized_code in ('admin', 'owner') then
    raise exception 'IT administrators cannot assign admin or owner roles.' using errcode = '42501';
  end if;

  -- Guardrail: Non-admin/owner callers (e.g. IT admin) cannot modify existing admin or owner accounts
  if not v_is_privileged and exists (
    select 1
    from public.user_roles membership
    join public.roles role on role.id = membership.role_id
    where membership.organization_id = p_organization_id
      and membership.user_id = p_user_id
      and role.name in ('admin', 'owner')
  ) then
    raise exception 'IT administrators cannot modify admin or owner accounts.' using errcode = '42501';
  end if;

  -- Verify destination role exists and is active
  if not exists (select 1 from public.roles where name = v_normalized_code)
     and not exists (select 1 from public.clinic_role_definitions where organization_id = p_organization_id and code = v_normalized_code and active) then
    raise exception 'Role "%" not found or inactive.', v_normalized_code using errcode = '22023';
  end if;

  -- Admin roles (admin, owner, it_admin) live in user_roles
  if v_normalized_code in ('admin', 'owner', 'it_admin') then
    select id into v_role_id from public.roles where name = v_normalized_code;

    -- Deactivate any practitioner_roles for this organization
    update public.practitioner_roles pr
    set active = false
    from public.practitioners p
    where p.id = pr.practitioner_id
      and p.auth_user_id = p_user_id
      and pr.organization_id = p_organization_id;

    -- Upsert user_roles membership
    delete from public.user_roles
    where organization_id = p_organization_id and user_id = p_user_id;

    insert into public.user_roles (organization_id, user_id, role_id)
    values (p_organization_id, p_user_id, v_role_id);
  else
    -- Operational / clinical / custom roles live in practitioner_roles
    delete from public.user_roles
    where organization_id = p_organization_id and user_id = p_user_id;

    select id into v_practitioner_id
    from public.practitioners
    where organization_id = p_organization_id and auth_user_id = p_user_id;

    if v_practitioner_id is null then
      insert into public.practitioners (organization_id, auth_user_id, name)
      values (p_organization_id, p_user_id, jsonb_build_object('text', coalesce((select raw_user_meta_data->>'display_name' from auth.users where id = p_user_id), 'Staff')))
      returning id into v_practitioner_id;
    end if;

    if exists (
      select 1 from public.practitioner_roles
      where organization_id = p_organization_id and practitioner_id = v_practitioner_id
    ) then
      update public.practitioner_roles
      set role_code = v_normalized_code, active = true
      where organization_id = p_organization_id and practitioner_id = v_practitioner_id;
    else
      insert into public.practitioner_roles (organization_id, practitioner_id, role_code, active)
      values (p_organization_id, v_practitioner_id, v_normalized_code, true);
    end if;
  end if;
end;
$$;

revoke all on function public.assign_staff_role(uuid, uuid, text) from public, anon;
grant execute on function public.assign_staff_role(uuid, uuid, text) to authenticated;

-- 2. Function to toggle account active status with admin/owner protections
create or replace function public.set_clinic_user_active(p_organization_id uuid, p_user_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public, auth as $$
declare
  v_is_privileged boolean := (
    public.is_superadmin()
    or public.has_organization_role(p_organization_id, array['admin', 'owner'])
  );
begin
  if not public.has_organization_permission(p_organization_id, 'can_manage_staff_roles') then
    raise exception 'Staff management permission is required.' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() and not p_active then
    raise exception 'You cannot deactivate your own clinic access.' using errcode = '22023';
  end if;

  -- Guardrail: Only administrators or owners may change admin or owner access
  if exists (
    select 1
    from public.user_roles membership
    join public.roles role on role.id = membership.role_id
    where membership.organization_id = p_organization_id
      and membership.user_id = p_user_id
      and role.name in ('admin', 'owner')
  ) and not v_is_privileged then
    raise exception 'IT administrators cannot modify admin or owner accounts.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.user_roles where organization_id = p_organization_id and user_id = p_user_id
    union select 1 from public.practitioners where organization_id = p_organization_id and auth_user_id = p_user_id
  ) then
    raise exception 'Clinic staff account not found.' using errcode = 'P0002';
  end if;

  insert into public.clinic_user_access_status (organization_id, user_id, active, updated_by)
  values (p_organization_id, p_user_id, p_active, auth.uid())
  on conflict (organization_id, user_id) do update set active = excluded.active, updated_by = auth.uid();
end;
$$;

revoke all on function public.set_clinic_user_active(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_clinic_user_active(uuid, uuid, boolean) to authenticated;

-- 3. Function to assign department with admin/owner protections
create or replace function public.assign_staff_department(
  p_organization_id uuid,
  p_user_id uuid,
  p_department_id uuid
)
returns void
language plpgsql security definer set search_path = public, auth
as $$
declare
  v_is_privileged boolean := (
    public.is_superadmin()
    or public.has_organization_role(p_organization_id, array['admin', 'owner'])
  );
begin
  if not public.can_manage_organization_accounts(p_organization_id) then
    raise exception 'Staff management permission is required.' using errcode = '42501';
  end if;

  -- Guardrail: Non-admin/owner callers cannot modify department of admin or owner accounts
  if not v_is_privileged and exists (
    select 1
    from public.user_roles membership
    join public.roles role on role.id = membership.role_id
    where membership.organization_id = p_organization_id
      and membership.user_id = p_user_id
      and role.name in ('admin', 'owner')
  ) then
    raise exception 'IT administrators cannot modify admin or owner accounts.' using errcode = '42501';
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

revoke all on function public.assign_staff_department(uuid, uuid, uuid) from public, anon;
grant execute on function public.assign_staff_department(uuid, uuid, uuid) to authenticated;

-- 4. Function to save clinic role definition with admin/owner protections
create or replace function public.save_clinic_role_definition(
  p_organization_id uuid, p_code text, p_name text, p_permissions text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  normalized_code text := coalesce(
    nullif(lower(btrim(p_code)), ''),
    lower(replace(public.system_generated_code('role'), '-', '_'))
  );
  normalized_name text := btrim(p_name);
  v_is_privileged boolean := (
    public.is_superadmin()
    or public.has_organization_role(p_organization_id, array['admin', 'owner'])
  );
  allowed_permissions text[] := array[
    'can_access_admin_portal', 'can_access_provider_portal',
    'can_manage_appointments', 'can_record_triage', 'can_start_consultation',
    'can_manage_provider_schedule', 'can_manage_staff_roles',
    'can_view_inventory', 'can_manage_inventory', 'can_tag_inventory_usage',
    'can_order_diagnostics', 'can_view_diagnostics',
    'can_view_lab_worklist', 'can_record_lab_results',
    'can_view_referrals', 'can_update_referrals',
    'can_manage_laboratory_services', 'can_manage_billing',
    'can_view_billing', 'can_manage_pos', 'can_manage_claims',
    'can_view_claims', 'can_view_payouts', 'can_manage_payouts',
    'can_view_analytics', 'can_manage_patients', 'can_view_audit_log',
    'can_identify_patients', 'can_manage_clinic_branding',
    'can_manage_service_catalog', 'can_manage_document_templates',
    'can_manage_feature_modules', 'can_manage_services',
    'can_manage_professional_fees', 'can_view_clinic_queue',
    'can_manage_rooms', 'can_reassign_appointments'
  ];
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if not public.can_manage_organization_accounts(p_organization_id) then
    raise exception 'Role management permission is required.' using errcode = '42501';
  end if;

  -- Guardrail: Non-admin/owner callers cannot modify admin or owner role definitions
  if not v_is_privileged and normalized_code in ('admin', 'owner') then
    raise exception 'IT administrators cannot modify admin or owner role definitions.' using errcode = '42501';
  end if;

  if normalized_code !~ '^[a-z][a-z0-9_]{1,39}$'
    or length(normalized_name) not between 2 and 80
    or exists (
      select 1
      from unnest(coalesce(p_permissions, '{}'::text[])) permission
      where permission <> all(allowed_permissions)
    ) then
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
  select p_organization_id, normalized_code, unnest(p_permissions);
  insert into public.clinic_role_permission_overrides (organization_id, role_code, permission)
  values (p_organization_id, normalized_code, 'role_permissions_configured')
  on conflict (organization_id, role_code, permission) do nothing;
end;
$function$;

revoke all on function public.save_clinic_role_definition(uuid, text, text, text[]) from public, anon;
grant execute on function public.save_clinic_role_definition(uuid, text, text, text[]) to authenticated;

-- 5. Function to reset role permissions with admin/owner protections
create or replace function public.reset_clinic_role_permissions(
  p_organization_id uuid,
  p_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_normalized_code text := lower(btrim(p_code));
  v_is_privileged boolean := (
    public.is_superadmin()
    or public.has_organization_role(p_organization_id, array['admin', 'owner'])
  );
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if not public.can_manage_organization_accounts(p_organization_id) then
    raise exception 'Role management permission is required.' using errcode = '42501';
  end if;

  -- Guardrail: Non-admin/owner callers cannot reset admin or owner role permissions
  if not v_is_privileged and v_normalized_code in ('admin', 'owner') then
    raise exception 'IT administrators cannot reset admin or owner role permissions.' using errcode = '42501';
  end if;

  -- Only built-in roles have global defaults to revert to
  if not exists (select 1 from public.roles where name = v_normalized_code) then
    raise exception 'Only built-in roles can be reset to default permissions.' using errcode = '22023';
  end if;

  -- Remove clinic overrides so list_clinic_role_definitions and has_organization_permission fall back to global role_permissions
  delete from public.clinic_role_permission_overrides
  where organization_id = p_organization_id and role_code = v_normalized_code;
end;
$$;

revoke all on function public.reset_clinic_role_permissions(uuid, text) from public, anon;
grant execute on function public.reset_clinic_role_permissions(uuid, text) to authenticated;
