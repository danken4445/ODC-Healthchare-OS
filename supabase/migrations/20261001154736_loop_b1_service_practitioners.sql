-- Loop B1: service-to-practitioner membership. Rollback: drop the policies,
-- triggers, and table only after dependants introduced by later loops are gone.
-- The former single owner remains the source for the B2 contract migration.

alter table public.clinic_role_permission_overrides
  drop constraint if exists clinic_role_permission_overrides_permission_check;
alter table public.clinic_role_permission_overrides
  add constraint clinic_role_permission_overrides_permission_check check (permission in (
    'can_access_admin_portal', 'can_access_provider_portal', 'can_manage_appointments',
    'can_record_triage', 'can_start_consultation', 'can_manage_provider_schedule',
    'can_manage_staff_roles', 'can_view_inventory', 'can_manage_inventory',
    'can_tag_inventory_usage', 'can_order_diagnostics', 'can_view_diagnostics',
    'can_update_referrals', 'can_manage_laboratory_services', 'role_permissions_configured',
    'can_manage_billing', 'can_view_billing', 'can_manage_pos',
    'can_manage_claims', 'can_view_claims', 'can_view_payouts', 'can_manage_payouts',
    'can_view_analytics', 'can_manage_patients', 'can_view_audit_log',
    'can_identify_patients', 'can_manage_clinic_branding', 'can_manage_service_catalog',
    'can_manage_document_templates', 'can_manage_feature_modules',
    'can_manage_services'
  ));

insert into public.role_permissions (role_id, organization_id, permission)
select role.id, null, 'can_manage_services'
from public.roles as role
where role.name in ('admin', 'owner')
on conflict (role_id, organization_id, permission) do nothing;

insert into public.clinic_role_permission_overrides (organization_id, role_code, permission)
select organization.id, grant_row.role_code, grant_row.permission
from public.organizations as organization
cross join (values
  ('admin'::text, 'can_manage_services'::text),
  ('owner'::text, 'can_manage_services'::text)
) as grant_row(role_code, permission)
on conflict (organization_id, role_code, permission) do nothing;

create table public.service_practitioners (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  clinic_service_id uuid not null references public.clinic_services(id) on delete cascade,
  practitioner_role_id uuid not null references public.practitioner_roles(id) on delete cascade,
  is_active boolean not null default true,
  duration_minutes_override integer null check (duration_minutes_override between 5 and 480),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_service_id, practitioner_role_id)
);

create index service_practitioners_org_role_active_idx
  on public.service_practitioners (organization_id, practitioner_role_id, is_active);

create or replace function public.enforce_service_practitioner_tenant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.clinic_services as service
    where service.id = new.clinic_service_id
      and service.organization_id = new.organization_id
  ) then
    raise exception 'Service assignment must use a service from the same organization.'
      using errcode = '23503';
  end if;

  if not exists (
    select 1
    from public.practitioner_roles as practitioner_role
    where practitioner_role.id = new.practitioner_role_id
      and practitioner_role.organization_id = new.organization_id
      and practitioner_role.role_code in ('doctor', 'specialist')
  ) then
    raise exception 'Service assignment must use a doctor or specialist role from the same organization.'
      using errcode = '23503';
  end if;

  return new;
end;
$$;

create trigger service_practitioners_tenant_integrity
  before insert or update on public.service_practitioners
  for each row execute function public.enforce_service_practitioner_tenant();

create trigger service_practitioners_set_updated_at
  before update on public.service_practitioners
  for each row execute function public.set_updated_at();

create trigger service_practitioners_audit
  after insert or update or delete on public.service_practitioners
  for each row execute function public.write_audit_log();

alter table public.service_practitioners enable row level security;

create policy service_practitioners_select on public.service_practitioners
  for select to authenticated
  using (public.can_access_organization(organization_id));

create policy service_practitioners_manage on public.service_practitioners
  for all to authenticated
  using (public.has_organization_permission(organization_id, 'can_manage_services'))
  with check (public.has_organization_permission(organization_id, 'can_manage_services'));

revoke insert, update, delete on public.service_practitioners from anon, authenticated;

comment on table public.service_practitioners is
  'Organization-scoped service membership for doctors and specialists. B1 expanded table; B2 backfills legacy owners.';
