-- Rollback: restore appointment_slots_public_select for anon and authenticated,
-- and restore appointment_slots_select from
-- 20260905000900_optimize_appointment_slots_select_policy.sql.

drop policy if exists appointment_slots_public_select on public.appointment_slots;
create policy appointment_slots_public_select on public.appointment_slots
for select to anon
using (
  status = 'free'
  and appointment_id is null
  and start_at > now()
);

drop policy if exists appointment_slots_select on public.appointment_slots;
create policy appointment_slots_select on public.appointment_slots
for select to authenticated
using (
  exists (
    select 1
    from public.patients patient
    where patient.organization_id = appointment_slots.organization_id
      and patient.active
      and public.is_patient_self(patient.id, patient.organization_id)
      and (
        (
          appointment_slots.status = 'free'
          and appointment_slots.appointment_id is null
          and appointment_slots.start_at > now()
        )
        or exists (
          select 1
          from public.appointments appointment
          where appointment.id = appointment_slots.appointment_id
            and appointment.organization_id = appointment_slots.organization_id
            and appointment.patient_id = patient.id
        )
      )
  )
  or exists (
    select 1
    from public.practitioner_roles practitioner_role
    join public.practitioners practitioner
      on practitioner.id = practitioner_role.practitioner_id
    where practitioner_role.id = appointment_slots.practitioner_role_id
      and practitioner_role.organization_id = appointment_slots.organization_id
      and practitioner_role.active
      and practitioner.active
      and practitioner.auth_user_id = auth.uid()
  )
  or public.has_organization_permission(
    appointment_slots.organization_id,
    'can_manage_appointments'
  )
);
