\set ON_ERROR_STOP on

begin;
select plan(18);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, email_change, email_change_token_new, recovery_token,
  recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000110', 'authenticated', 'authenticated',
  'doctor-two@synthetic.odyssey.test', crypt('LocalOnly-2026!', gen_salt('bf')),
  now(), '', '', '', '', now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  now(), now()
) on conflict (id) do nothing;
insert into public.practitioners (id, organization_id, auth_user_id, name)
values ('20000000-0000-0000-0000-000000000110', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000110', '{"text":"Synthetic Doctor Two"}'::jsonb);
insert into public.practitioner_roles (id, organization_id, practitioner_id, role_code)
values ('30000000-0000-0000-0000-000000000110', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000110', 'doctor');
insert into public.service_practitioners (organization_id, clinic_service_id, practitioner_role_id, is_active)
values ('10000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000110', true)
on conflict (clinic_service_id, practitioner_role_id) do update set is_active = true;

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000105', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000105"}', true);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000105', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000105"}', true);
select throws_ok(
  $$ select public.reassign_appointment('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000110', 'test') $$,
  '42501', 'Appointment reassignment permission is required.',
  'reassignment is denied without can_reassign_appointments'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000106', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000106"}', true);
set local role postgres;

do $$
declare
  v_service uuid := '52000000-0000-0000-0000-000000000002';
  v_appointment uuid := '50000000-0000-0000-0000-000000000110';
begin
  insert into public.appointments (id, organization_id, patient_id, practitioner_role_id, clinic_service_id, status, service_type, delivery_mode, start_at, end_at)
  values (v_appointment, '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000101', v_service, 'booked', 'Follow-up consultation', 'in_person', now() + interval '2 days', now() + interval '2 days 30 minutes');
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000106', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000106"}', true);
select throws_ok(
  $$ select public.reassign_appointment('50000000-0000-0000-0000-000000000110', '30000000-0000-0000-0000-000000000110', 'wrong service') $$,
  '23503', 'The target doctor is not assigned to this service.',
  'target doctor must be assigned to the appointment service'
);
reset role;
set local role postgres;

insert into public.practitioners (id, organization_id, name)
values ('20000000-0000-0000-0000-000000000111', '10000000-0000-0000-0000-000000000002', '{"text":"Other Clinic Doctor"}'::jsonb);
insert into public.practitioner_roles (id, organization_id, practitioner_id, role_code)
values ('30000000-0000-0000-0000-000000000111', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000111', 'doctor');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000106', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000106"}', true);
select throws_ok(
  $$ select public.reassign_appointment('50000000-0000-0000-0000-000000000110', '30000000-0000-0000-0000-000000000111', 'cross org') $$,
  '23503', 'The target must be an active doctor in the appointment organization.',
  'cross-organization target is denied'
);
reset role;
set local role postgres;

insert into public.appointments (id, organization_id, patient_id, practitioner_role_id, clinic_service_id, status, service_type, delivery_mode, start_at, end_at)
values ('50000000-0000-0000-0000-000000000111', '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000101', '52000000-0000-0000-0000-000000000001', 'fulfilled', 'General consultation', 'in_person', now() + interval '3 days', now() + interval '3 days 30 minutes');
set local role authenticated;
select throws_ok(
  $$ select public.reassign_appointment('50000000-0000-0000-0000-000000000111', '30000000-0000-0000-0000-000000000110', 'finished') $$,
  '22023', 'Finished or cancelled appointments cannot be reassigned.',
  'finished appointment is denied'
);
reset role;
set local role postgres;

insert into public.appointments (id, organization_id, patient_id, practitioner_role_id, clinic_service_id, status, service_type, delivery_mode, start_at, end_at)
values ('50000000-0000-0000-0000-000000000112', '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000101', '52000000-0000-0000-0000-000000000001', 'booked', 'General consultation', 'in_person', now() + interval '4 days', now() + interval '4 days 30 minutes');
insert into public.encounters (id, organization_id, patient_id, appointment_id, practitioner_role_id, status, period_start)
values ('60000000-0000-0000-0000-000000000110', '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000112', '30000000-0000-0000-0000-000000000101', 'in_progress', now() + interval '4 days');
insert into public.appointment_slots (id, organization_id, practitioner_role_id, clinic_service_id, appointment_id, status, service_type, start_at, end_at)
select '51000000-0000-0000-0000-000000000110', organization_id, '30000000-0000-0000-0000-000000000101', clinic_service_id, id, 'busy', service_type, start_at, end_at
from public.appointments where id = '50000000-0000-0000-0000-000000000112';
insert into public.appointment_slots (id, organization_id, practitioner_role_id, clinic_service_id, status, service_type, start_at, end_at)
select '51000000-0000-0000-0000-000000000111', organization_id, '30000000-0000-0000-0000-000000000110', clinic_service_id, 'free', service_type, start_at, end_at
from public.appointments where id = '50000000-0000-0000-0000-000000000112';

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000106', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000106"}', true);
select is(public.reassign_appointment('50000000-0000-0000-0000-000000000112', '30000000-0000-0000-0000-000000000110', 'Doctor absent'), '50000000-0000-0000-0000-000000000112'::uuid, 'reassignment returns the appointment id');
reset role;
set local role postgres;
select is((select practitioner_role_id from public.appointments where id = '50000000-0000-0000-0000-000000000112'), '30000000-0000-0000-0000-000000000110'::uuid, 'appointment moved to target doctor');
select is((select practitioner_role_id from public.encounters where id = '60000000-0000-0000-0000-000000000110'), '30000000-0000-0000-0000-000000000110'::uuid, 'open encounter moved with appointment');
select is((select status::text from public.appointment_slots where id = '51000000-0000-0000-0000-000000000110'), 'free', 'old slot released');
select is((select status::text from public.appointment_slots where id = '51000000-0000-0000-0000-000000000111'), 'busy', 'replacement slot booked');
select is((select appointment_id from public.appointment_slots where id = '51000000-0000-0000-0000-000000000111'), '50000000-0000-0000-0000-000000000112'::uuid, 'replacement slot has the appointment');
select is((select queue_label from public.appointments where id = '50000000-0000-0000-0000-000000000112'), (select queue_label from public.waiting_room_queue where appointment_id = '50000000-0000-0000-0000-000000000112'), 'queue label remains unchanged');
select ok(exists (select 1 from public.audit_log where table_name = 'appointments' and record_id = '50000000-0000-0000-0000-000000000112' and metadata ->> 'assigned_practitioner_role_id' = '30000000-0000-0000-0000-000000000101' and metadata ->> 'new_practitioner_role_id' = '30000000-0000-0000-0000-000000000110'), 'reassignment audit records both practitioner roles');

reset role;
set local role postgres;

do $$
declare v_day date := (now() at time zone 'Asia/Manila')::date + 10; v_start timestamptz := ((v_day::text || ' 11:00:00')::timestamp at time zone 'Asia/Manila');
begin
  insert into public.appointments (id, organization_id, patient_id, practitioner_role_id, clinic_service_id, status, service_type, delivery_mode, start_at, end_at)
  values
    ('50000000-0000-0000-0000-000000000114', '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000101', '52000000-0000-0000-0000-000000000001', 'booked', 'General consultation', 'virtual', v_start, v_start + interval '30 minutes'),
    ('50000000-0000-0000-0000-000000000115', '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000101', '52000000-0000-0000-0000-000000000002', 'booked', 'Follow-up consultation', 'virtual', v_start + interval '1 hour', v_start + interval '1 hour 30 minutes');
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000106', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000106"}', true);
set local role authenticated;
create temp table absent_result (moved_count integer, not_movable_count integer, results jsonb);
insert into absent_result select * from public.mark_practitioner_absent('30000000-0000-0000-0000-000000000101', (now() at time zone 'Asia/Manila')::date + 10, '30000000-0000-0000-0000-000000000110', 'Doctor absent');
select is((select moved_count from absent_result), 1, 'mark absent reports moved appointments');
select is((select not_movable_count from absent_result), 1, 'mark absent reports not-movable appointments');
reset role;
set local role postgres;

do $$
declare v_day date := (now() at time zone 'Asia/Manila')::date + 1; v_start timestamptz := ((v_day::text || ' 10:00:00')::timestamp at time zone 'Asia/Manila'); v_id uuid := '50000000-0000-0000-0000-000000000113';
begin
  insert into public.appointments (id, organization_id, patient_id, practitioner_role_id, clinic_service_id, status, service_type, delivery_mode, start_at, end_at)
  values (v_id, '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000101', '52000000-0000-0000-0000-000000000001', 'booked', 'General consultation', 'virtual', v_start, v_start + interval '30 minutes');
  insert into public.encounters (id, organization_id, patient_id, appointment_id, practitioner_role_id, status, period_start)
  values ('60000000-0000-0000-0000-000000000111', '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', v_id, '30000000-0000-0000-0000-000000000101', 'in_progress', v_start);
end $$;
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000110', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000110"}', true);
set local role authenticated;
select throws_ok($$ select public.add_soap_observation('60000000-0000-0000-0000-000000000111', 'S', 'Before grant', null) $$, '42501', 'Only the assigned doctor or an active covering doctor may document this encounter.', 'covering doctor is denied before grant');
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000106', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000106"}', true);
set local role postgres;
insert into public.practitioner_coverage_grants (organization_id, covered_practitioner_role_id, covering_practitioner_role_id, valid_from, valid_to, reason, created_by)
select '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000101', '30000000-0000-0000-0000-000000000110', (now() at time zone 'Asia/Manila')::date + 1, (now() at time zone 'Asia/Manila')::date + 2, 'Scheduled absence', auth.uid();
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000110', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000110"}', true);
set local role authenticated;
select lives_ok($$ select public.add_soap_observation('60000000-0000-0000-0000-000000000111', 'S', 'Covering doctor note', null) $$, 'covering doctor can write during active grant');
select ok((select authored_by_practitioner_role_id from public.observations where encounter_id = '60000000-0000-0000-0000-000000000111' order by created_at desc limit 1) = '30000000-0000-0000-0000-000000000110', 'authored_by role is recorded');
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000106', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000106"}', true);
set local role postgres;
update public.practitioner_coverage_grants set valid_from = valid_from - 2, valid_to = valid_from - 1 where covering_practitioner_role_id = '30000000-0000-0000-0000-000000000110';
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000110', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000110"}', true);
set local role authenticated;
select throws_ok($$ select public.add_soap_observation('60000000-0000-0000-0000-000000000111', 'O', 'After grant', null) $$, '42501', 'Only the assigned doctor or an active covering doctor may document this encounter.', 'covering doctor is denied after grant');
reset role;

select * from finish();
rollback;
