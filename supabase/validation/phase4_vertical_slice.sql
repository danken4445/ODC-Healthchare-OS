-- Run after `supabase db reset`. Every result must be true; all writes roll back.
begin;

select set_config('request.jwt.claim.role', 'authenticated', true);

-- Registered patient atomically consumes a slot and sees only their appointment.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000103', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000103"}', true);
set local role authenticated;
select public.book_appointment_slot('51000000-0000-0000-0000-000000000001') is not null
  as patient_books_available_slot;
select count(*) = 2 as patient_sees_only_their_two_appointments
from public.appointments;
reset role;

-- Assigned doctor sees the booking and starting it creates exactly one Encounter.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000101"}', true);
set local role authenticated;
select count(*) = 2 as doctor_sees_only_assigned_appointments
from public.appointments;
select public.start_appointment_encounter(
  (select id from public.appointments where start_at > now() order by start_at limit 1)
) is not null as doctor_starts_encounter;
select count(*) = 2 as encounter_was_created from public.encounters;
reset role;

select exists (
  select 1 from pg_publication_tables
  where pubname = 'supabase_realtime'
    and schemaname = 'public'
    and tablename = 'appointments'
) as appointments_are_published_for_realtime;

rollback;
