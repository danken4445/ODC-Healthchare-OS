-- Loop C: retire Loop A's temporary direct authenticated free-slot read.
-- Rollback: restore the free-slot branch of appointment_slots_select from
-- 20260930160000_loop_a_scope_appointment_slot_reads.sql only if a signed-in
-- patient consumer still needs direct table access.

drop policy if exists appointment_slots_select on public.appointment_slots;
create policy appointment_slots_select on public.appointment_slots
for select to authenticated
using (
  exists (
    select 1
    from public.patients as patient
    join public.appointments as appointment
      on appointment.id = appointment_slots.appointment_id
     and appointment.organization_id = appointment_slots.organization_id
     and appointment.patient_id = patient.id
    where patient.organization_id = appointment_slots.organization_id
      and patient.active
      and public.is_patient_self(patient.id, patient.organization_id)
  )
  or exists (
    select 1
    from public.practitioner_roles as practitioner_role
    join public.practitioners as practitioner
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

comment on policy appointment_slots_select on public.appointment_slots is
  'Patients read only their booked slots. Doctor-first availability is exposed by get_available_slots, not a direct table policy.';
