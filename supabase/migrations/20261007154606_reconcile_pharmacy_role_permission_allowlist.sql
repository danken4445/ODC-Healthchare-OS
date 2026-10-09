-- Reconcile the out-of-order pharmacy queue migration with the later
-- IT-admin/owner role guardrails already present on the linked project.
-- This migration is additive and preserves existing role assignments.

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
    'can_manage_rooms', 'can_reassign_appointments',
    'can_encode_pharmacy_prescriptions',
    'can_dispense_pharmacy_prescriptions',
    'can_export_epidemiology_records'
  ];
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if not public.can_manage_organization_accounts(p_organization_id) then
    raise exception 'Role management permission is required.' using errcode = '42501';
  end if;
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
