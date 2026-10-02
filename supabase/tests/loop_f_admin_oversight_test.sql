\set ON_ERROR_STOP on

begin;
select plan(16);

select has_function('public', 'list_clinic_calendar', array['uuid','date','uuid','uuid'], 'calendar read RPC exists');
select has_function('public', 'list_doctor_management', array['uuid','date'], 'doctor management read RPC exists');
select ok(exists (select 1 from pg_trigger where tgrelid = 'public.room_assignments'::regclass and tgname = 'room_assignments_audit'), 'room assignments are audited');
select ok(exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'teleconsult_rooms' and policyname = 'teleconsult_rooms_participant_select' and qual::text like '%is_active_practitioner_coverage%'), 'teleconsult RLS includes active coverage');
select ok(not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'audit_log' and cmd = 'INSERT'), 'clients cannot insert audit rows');
select ok(not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'audit_log' and cmd = 'UPDATE'), 'clients cannot update audit rows');
select ok(not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'audit_log' and cmd = 'DELETE'), 'clients cannot delete audit rows');

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000106', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000106"}', true);
set local role authenticated;
select lives_ok($$ select * from public.list_clinic_calendar('10000000-0000-0000-0000-000000000001', (now() at time zone 'Asia/Manila')::date, null, null) $$, 'admin can read the organization calendar');
select ok((select count(*) from public.list_clinic_calendar('10000000-0000-0000-0000-000000000002', (now() at time zone 'Asia/Manila')::date, null, null)) = 0, 'admin cannot read another organization calendar');
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000101"}', true);
set local role authenticated;
select is((select count(*) from public.list_clinic_calendar('10000000-0000-0000-0000-000000000001', (now() at time zone 'Asia/Manila')::date, null, null)), 0::bigint, 'doctor without queue permission gets no calendar rows');
select is((select count(*) from public.audit_log), 0::bigint, 'doctor cannot read organization audit rows');
reset role;

set local role postgres;
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, email_change, email_change_token_new, recovery_token, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000110', 'authenticated', 'authenticated', 'coverage-doctor@synthetic.odyssey.test', crypt('LocalOnly-2026!', gen_salt('bf')), now(), '', '', '', '', now(), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
insert into public.practitioners (id, organization_id, auth_user_id, name) values ('20000000-0000-0000-0000-000000000110', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000110', '{"text":"Coverage Doctor"}');
insert into public.practitioner_roles (id, organization_id, practitioner_id, role_code) values ('30000000-0000-0000-0000-000000000110', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000110', 'doctor');
insert into public.appointments (id, organization_id, patient_id, practitioner_role_id, status, service_type, delivery_mode, start_at, end_at)
values ('50000000-0000-0000-0000-000000000110', '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000101', 'booked', 'Virtual audit test', 'virtual', now() + interval '15 minutes', now() + interval '45 minutes');
insert into public.practitioner_coverage_grants (organization_id, covered_practitioner_role_id, covering_practitioner_role_id, valid_from, valid_to, reason, created_by)
values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000101', '30000000-0000-0000-0000-000000000110', (now() at time zone 'Asia/Manila')::date, (now() at time zone 'Asia/Manila')::date + 1, 'Teleconsult coverage test', '00000000-0000-0000-0000-000000000106');
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000101"}', true);
set local role authenticated;
select is((select count(*) from public.teleconsult_rooms), 1::bigint, 'assigned doctor can read the teleconsult room');
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000109', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000109"}', true);
set local role authenticated;
select is((select count(*) from public.teleconsult_rooms), 0::bigint, 'unrelated practitioner cannot read the teleconsult room');
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000110', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000110"}', true);
set local role authenticated;
select ok(public.is_active_practitioner_coverage('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000101', (now() at time zone 'Asia/Manila')::date), 'coverage helper recognizes the active covering doctor');
select is((select count(*) from public.list_teleconsult_appointments('10000000-0000-0000-0000-000000000001') where appointment_id = '50000000-0000-0000-0000-000000000110'), 1::bigint, 'active covering doctor can join the teleconsult room');
reset role;

set local role postgres;
update public.practitioner_coverage_grants set valid_from = (now() at time zone 'Asia/Manila')::date - 1, valid_to = (now() at time zone 'Asia/Manila')::date where covering_practitioner_role_id = '30000000-0000-0000-0000-000000000110';
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000110', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000110"}', true);
set local role authenticated;
select is((select count(*) from public.list_teleconsult_appointments('10000000-0000-0000-0000-000000000001') where appointment_id = '50000000-0000-0000-0000-000000000110'), 0::bigint, 'covering doctor loses room access after grant expiry');
reset role;

select * from finish();
rollback;
