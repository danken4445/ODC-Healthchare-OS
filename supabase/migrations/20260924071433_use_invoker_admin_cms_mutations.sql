alter function public.set_governance_patient_active(uuid, uuid, boolean) security invoker;
alter function public.save_company_coverage(uuid, uuid, uuid, text, text, text, date, date, text) security invoker;

drop policy if exists patients_update on public.patients;
create policy patients_update on public.patients
for update to authenticated
using (
  public.is_superadmin()
  or public.has_organization_permission(organization_id, 'can_manage_patients')
)
with check (
  public.is_superadmin()
  or public.has_organization_permission(organization_id, 'can_manage_patients')
);

grant select (id, organization_id, active) on public.patients to authenticated;
grant update (active) on public.patients to authenticated;

drop policy if exists coverages_manage on public.coverages;
create policy coverages_manage on public.coverages
for all to authenticated
using (
  public.is_superadmin()
  or public.has_organization_permission(organization_id, 'can_manage_billing')
  or public.has_organization_permission(organization_id, 'can_manage_claims')
)
with check (
  public.is_superadmin()
  or public.has_organization_permission(organization_id, 'can_manage_billing')
  or public.has_organization_permission(organization_id, 'can_manage_claims')
);
