-- A teleconsult deep link must work on a new device before that browser has a
-- selected patient-clinic context. The caller may learn only the organization
-- for their own assigned virtual appointment.
create or replace function public.resolve_patient_teleconsult_clinic(
  p_appointment_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select appointment.organization_id
  from public.appointments appointment
  join public.patients patient on patient.id = appointment.patient_id
  join public.teleconsult_rooms room on room.appointment_id = appointment.id
  where appointment.id = p_appointment_id
    and appointment.delivery_mode = 'virtual'
    and patient.auth_user_id = auth.uid()
    and patient.active
  limit 1;
$$;

revoke all on function public.resolve_patient_teleconsult_clinic(uuid) from public;
grant execute on function public.resolve_patient_teleconsult_clinic(uuid) to authenticated;
