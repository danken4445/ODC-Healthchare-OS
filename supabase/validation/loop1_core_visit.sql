-- Run after `supabase db reset`. Every result must be true; all writes roll back.
\set ON_ERROR_STOP on

begin;

-- Anonymous visitors can browse active services and free slots, but the
-- waiting-room projection exposes no patient identity columns.
set local role anon;
select count(*) = 2 as public_can_browse_services
from public.clinic_services
where organization_id = '10000000-0000-0000-0000-000000000001';
select count(*) >= 1 as public_can_browse_free_slots
from public.appointment_slots
where organization_id = '10000000-0000-0000-0000-000000000001';
select count(*) = 0 as waiting_queue_has_no_patient_identity_columns
from information_schema.columns
where table_schema = 'public'
  and table_name = 'waiting_room_queue'
  and column_name in ('patient_id', 'patient_name', 'name', 'birth_date');
reset role;

select not has_table_privilege('authenticated', 'public.appointment_slots', 'insert')
  as availability_writes_are_rpc_only;
select not has_table_privilege('authenticated', 'public.appointments', 'update')
  as appointment_status_writes_are_rpc_only;

-- Assigned doctors can add and withdraw only their own availability.
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000101"}', true);
set local role authenticated;
select public.create_appointment_slot(
  date_trunc('hour', now()) + interval '2 days',
  date_trunc('hour', now()) + interval '2 days 30 minutes',
  '52000000-0000-0000-0000-000000000001'
) is not null as doctor_creates_availability;
select public.set_appointment_slot_unavailable(
  (
    select id from public.appointment_slots
    where start_at = date_trunc('hour', now()) + interval '2 days'
    limit 1
  ),
  true
) is null as doctor_withdraws_availability;
reset role;

-- Front desk status changes update the privacy-safe queue, and the patient's
-- own Appointment row remains the source of truth.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000105', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000105"}', true);
set local role authenticated;
select public.update_appointment_status(
  '50000000-0000-0000-0000-000000000001',
  'arrived'
) is null as front_desk_checks_in_patient;
select stage = 'in_progress' as encounter_stage_is_not_regressed_by_check_in
from public.waiting_room_queue
where appointment_id = '50000000-0000-0000-0000-000000000001';
reset role;

select exists (
  select 1 from pg_publication_tables
  where pubname = 'supabase_realtime'
    and schemaname = 'public'
    and tablename = 'waiting_room_queue'
) as waiting_queue_is_published_for_realtime;

rollback;
