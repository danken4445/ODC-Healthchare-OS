-- Optimize appointment_slots RLS policies:
-- 1. Fast-path free slots directly without evaluating expensive nested subqueries.
-- 2. Allow both anon and authenticated users to read free appointment slots instantly.

drop policy if exists appointment_slots_public_select on public.appointment_slots;
create policy appointment_slots_public_select on public.appointment_slots
for select to anon, authenticated
using (
  status = 'free'
  and appointment_id is null
  and start_at > now()
);

drop policy if exists appointment_slots_select on public.appointment_slots;
create policy appointment_slots_select on public.appointment_slots
for select to authenticated
using (
  (status = 'free' and appointment_id is null)
  or exists (
    select 1 from public.patients patient
    where patient.organization_id = appointment_slots.organization_id
      and patient.auth_user_id = auth.uid()
      and patient.active
      and exists (
        select 1 from public.appointments appointment
        where appointment.id = appointment_slots.appointment_id
          and appointment.patient_id = patient.id
      )
  )
  or public.has_organization_role(
    appointment_slots.organization_id,
    array['front_desk', 'admin', 'owner']
  )
  or exists (
    select 1
    from public.practitioner_roles role
    join public.practitioners practitioner on practitioner.id = role.practitioner_id
    where role.id = appointment_slots.practitioner_role_id
      and role.active and practitioner.active
      and practitioner.auth_user_id = auth.uid()
  )
);
