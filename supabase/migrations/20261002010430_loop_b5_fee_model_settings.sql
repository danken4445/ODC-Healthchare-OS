-- Loop B5: organization-scoped professional-fee configuration.
-- Rollback: stop using the functions, then drop the policies, triggers, and
-- organization_settings table only after dependent fee records are retired.

create table public.organization_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  fee_model text not null default 'fixed_rate'
    check (fee_model in ('fixed_rate', 'practitioner_declared')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.organization_settings (organization_id, fee_model)
select organization.id, 'fixed_rate'
from public.organizations as organization
on conflict (organization_id) do nothing;

create trigger organization_settings_set_updated_at
  before update on public.organization_settings
  for each row execute function public.set_updated_at();

create trigger organization_settings_audit
  after insert or update or delete on public.organization_settings
  for each row execute function public.write_audit_log();

alter table public.organization_settings enable row level security;

create policy organization_settings_select on public.organization_settings
  for select to authenticated
  using (public.can_access_organization(organization_id));

revoke all on public.organization_settings from anon, authenticated;

alter table public.clinic_role_permission_overrides
  drop constraint if exists clinic_role_permission_overrides_permission_check;
alter table public.clinic_role_permission_overrides
  add constraint clinic_role_permission_overrides_permission_check check (permission in (
    'can_access_admin_portal', 'can_access_provider_portal', 'can_manage_appointments',
    'can_record_triage', 'can_start_consultation', 'can_manage_provider_schedule',
    'can_manage_staff_roles', 'can_view_inventory', 'can_manage_inventory',
    'can_tag_inventory_usage', 'can_order_diagnostics', 'can_view_diagnostics',
    'can_view_lab_worklist', 'can_record_lab_results', 'can_view_referrals',
    'can_update_referrals', 'can_manage_laboratory_services', 'role_permissions_configured',
    'can_manage_billing', 'can_view_billing', 'can_manage_pos',
    'can_manage_claims', 'can_view_claims', 'can_view_payouts', 'can_manage_payouts',
    'can_view_analytics', 'can_manage_patients', 'can_view_audit_log',
    'can_identify_patients', 'can_manage_clinic_branding', 'can_manage_service_catalog',
    'can_manage_document_templates', 'can_manage_feature_modules',
    'can_manage_services', 'can_manage_professional_fees'
  ));

insert into public.role_permissions (role_id, organization_id, permission)
select role.id, null, 'can_manage_professional_fees'
from public.roles as role
where role.name in ('doctor', 'specialist')
on conflict (role_id, organization_id, permission) do nothing;

insert into public.clinic_role_permission_overrides (organization_id, role_code, permission)
select organization.id, role.name, 'can_manage_professional_fees'
from public.organizations as organization
cross join public.roles as role
where role.name in ('doctor', 'specialist')
on conflict (organization_id, role_code, permission) do nothing;

create or replace function public.get_organization_fee_settings(
  p_organization_id uuid
)
returns table (
  organization_id uuid,
  fee_model text,
  is_government boolean,
  can_manage_fee_model boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  if not public.can_access_organization(p_organization_id) then
    raise exception 'Organization not found or access denied.' using errcode = '42501';
  end if;

  return query
  select
    settings.organization_id,
    settings.fee_model,
    organization.default_payor_type in ('philhealth_nbb', 'government_subsidized'),
    public.has_organization_permission(settings.organization_id, 'can_manage_services')
  from public.organization_settings as settings
  join public.organizations as organization on organization.id = settings.organization_id
  where settings.organization_id = p_organization_id;
end;
$$;

create or replace function public.set_organization_fee_model(
  p_organization_id uuid,
  p_fee_model text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_government boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  if p_fee_model not in ('fixed_rate', 'practitioner_declared') then
    raise exception 'Fee model must be fixed_rate or practitioner_declared.' using errcode = '22023';
  end if;

  if not public.has_organization_permission(p_organization_id, 'can_manage_services') then
    raise exception 'Service management permission is required.' using errcode = '42501';
  end if;

  select default_payor_type in ('philhealth_nbb', 'government_subsidized')
  into v_is_government
  from public.organizations
  where id = p_organization_id;

  if not found then
    raise exception 'Organization not found.' using errcode = 'P0002';
  end if;

  if v_is_government and p_fee_model = 'practitioner_declared' then
    raise exception 'Government facilities must use the fixed_rate fee model.' using errcode = '22023';
  end if;

  insert into public.organization_settings (organization_id, fee_model)
  values (p_organization_id, p_fee_model)
  on conflict (organization_id) do update
    set fee_model = excluded.fee_model,
        updated_at = now();

  return p_fee_model;
end;
$$;

revoke all on function public.get_organization_fee_settings(uuid) from public, anon, authenticated;
revoke all on function public.set_organization_fee_model(uuid, text) from public, anon, authenticated;
grant execute on function public.get_organization_fee_settings(uuid) to authenticated;
grant execute on function public.set_organization_fee_model(uuid, text) to authenticated;

comment on table public.organization_settings is
  'Organization feature settings. fee_model defaults to fixed_rate so existing facilities retain their billing behavior.';
comment on column public.organization_settings.fee_model is
  'fixed_rate preserves catalog-only pricing; practitioner_declared requires an effective professional fee for each service practitioner.';
