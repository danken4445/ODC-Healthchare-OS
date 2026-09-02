-- Let CMS-configured clinical staff see the queue needed to perform triage.
-- The older policy only listed the built-in nurse role code.

drop policy if exists appointments_select on public.appointments;
create policy appointments_select on public.appointments
for select to authenticated
using (
  public.is_patient_self(patient_id, organization_id)
  or public.has_organization_permission(organization_id, 'can_manage_appointments')
  or public.has_organization_permission(organization_id, 'can_record_triage')
  or exists (
    select 1
    from public.practitioner_roles practitioner_role
    join public.practitioners practitioner on practitioner.id = practitioner_role.practitioner_id
    where practitioner_role.id = appointments.practitioner_role_id
      and practitioner_role.active and practitioner.active
      and practitioner.auth_user_id = auth.uid()
  )
);
