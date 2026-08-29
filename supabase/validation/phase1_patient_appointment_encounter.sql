-- Run in the Supabase SQL editor or psql as a database administrator.
-- Synthetic data only. The transaction rolls back so it leaves no records behind.
begin;

with clinic as (
  insert into public.organizations (name)
  values ('Phase 1 Synthetic Clinic')
  returning id
), patient as (
  insert into public.patients (organization_id, walk_in_id, name)
  select id, 'WALKIN-PHASE1-0001', '{"text":"Synthetic Patient"}'::jsonb
  from clinic
  returning id, organization_id
), appointment as (
  insert into public.appointments (organization_id, patient_id, status, start_at, end_at)
  select organization_id, id, 'booked', now(), now() + interval '30 minutes'
  from patient
  returning id, organization_id, patient_id
), encounter as (
  insert into public.encounters (organization_id, patient_id, appointment_id, status, period_start)
  select organization_id, patient_id, id, 'in_progress', now()
  from appointment
  returning id, organization_id, patient_id, appointment_id
)
select
  encounter.id as encounter_id,
  encounter.organization_id,
  encounter.patient_id,
  encounter.appointment_id
from encounter;

-- The CTE succeeds only if both foreign-key relationships hold.
rollback;
