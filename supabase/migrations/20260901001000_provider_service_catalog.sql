-- Doctors and specialists maintain the services they offer at their assigned
-- clinic. Services remain organization-scoped because appointment slots and
-- patient bookings must retain a durable clinic service reference.

drop policy if exists clinic_services_manage on public.clinic_services;

create policy clinic_services_manage on public.clinic_services for all to authenticated
  using (
    public.is_superadmin()
    or public.has_organization_role(organization_id, array['admin', 'owner'])
    or exists (
      select 1 from public.practitioner_roles role
      join public.practitioners practitioner on practitioner.id = role.practitioner_id
      where role.organization_id = clinic_services.organization_id
        and role.role_code in ('doctor', 'specialist') and role.active
        and practitioner.active and practitioner.auth_user_id = auth.uid()
    )
  )
  with check (
    public.is_superadmin()
    or public.has_organization_role(organization_id, array['admin', 'owner'])
    or exists (
      select 1 from public.practitioner_roles role
      join public.practitioners practitioner on practitioner.id = role.practitioner_id
      where role.organization_id = clinic_services.organization_id
        and role.role_code in ('doctor', 'specialist') and role.active
        and practitioner.active and practitioner.auth_user_id = auth.uid()
    )
  );
