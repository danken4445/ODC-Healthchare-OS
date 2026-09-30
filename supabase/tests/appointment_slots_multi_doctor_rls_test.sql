begin;
select plan(10);

-- The fixtures live entirely inside this transaction so this test does not
-- depend on supabase/seed.sql and leaves no persistent data behind.
insert into public.organizations (id, name)
values
  ('91000000-0000-0000-0000-000000000001', 'Loop A RLS Clinic'),
  ('91000000-0000-0000-0000-000000000002', 'Foreign Loop A Clinic');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, email_change, email_change_token_new, recovery_token,
  recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '91000000-0000-0000-0000-000000000101', 'authenticated', 'authenticated', 'loop-a-doctor-a@example.test', crypt('LocalOnly-2026!', gen_salt('bf')), now(), '', '', '', '', now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '91000000-0000-0000-0000-000000000102', 'authenticated', 'authenticated', 'loop-a-doctor-b@example.test', crypt('LocalOnly-2026!', gen_salt('bf')), now(), '', '', '', '', now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '91000000-0000-0000-0000-000000000103', 'authenticated', 'authenticated', 'loop-a-patient@example.test', crypt('LocalOnly-2026!', gen_salt('bf')), now(), '', '', '', '', now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '91000000-0000-0000-0000-000000000104', 'authenticated', 'authenticated', 'loop-a-manager@example.test', crypt('LocalOnly-2026!', gen_salt('bf')), now(), '', '', '', '', now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '91000000-0000-0000-0000-000000000105', 'authenticated', 'authenticated', 'loop-a-staff@example.test', crypt('LocalOnly-2026!', gen_salt('bf')), now(), '', '', '', '', now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '91000000-0000-0000-0000-000000000106', 'authenticated', 'authenticated', 'loop-a-dual-role@example.test', crypt('LocalOnly-2026!', gen_salt('bf')), now(), '', '', '', '', now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());

insert into public.practitioners (id, organization_id, auth_user_id, name)
values
  ('91000000-0000-0000-0000-000000000201', '91000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000101', '{"text":"Doctor A"}'::jsonb),
  ('91000000-0000-0000-0000-000000000202', '91000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000102', '{"text":"Doctor B"}'::jsonb),
  ('91000000-0000-0000-0000-000000000203', '91000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000106', '{"text":"Dual Role Nurse"}'::jsonb),
  ('91000000-0000-0000-0000-000000000204', '91000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000105', '{"text":"Ordinary Staff Nurse"}'::jsonb),
  ('91000000-0000-0000-0000-000000000205', '91000000-0000-0000-0000-000000000002', null, '{"text":"Foreign Clinic Doctor"}'::jsonb);

insert into public.practitioner_roles (
  id, organization_id, practitioner_id, role_code
) values
  ('91000000-0000-0000-0000-000000000301', '91000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000201', 'doctor'),
  ('91000000-0000-0000-0000-000000000302', '91000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000202', 'doctor'),
  ('91000000-0000-0000-0000-000000000303', '91000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000203', 'nurse'),
  ('91000000-0000-0000-0000-000000000304', '91000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000204', 'nurse'),
  ('91000000-0000-0000-0000-000000000305', '91000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000205', 'doctor');

insert into public.user_roles (organization_id, user_id, role_id)
select '91000000-0000-0000-0000-000000000001', fixture.user_id, role.id
from (values
  ('91000000-0000-0000-0000-000000000104'::uuid, 'admin'::text),
  ('91000000-0000-0000-0000-000000000105'::uuid, 'nurse'::text)
) as fixture(user_id, role_name)
join public.roles role on role.name = fixture.role_name;

insert into public.patients (id, organization_id, auth_user_id, name)
values
  ('91000000-0000-0000-0000-000000000401', '91000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000103', '{"text":"Portal Patient"}'::jsonb),
  ('91000000-0000-0000-0000-000000000402', '91000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000106', '{"text":"Dual Role Patient"}'::jsonb);

insert into public.patient_clinic_contexts (auth_user_id, organization_id)
values
  ('91000000-0000-0000-0000-000000000103', '91000000-0000-0000-0000-000000000001'),
  ('91000000-0000-0000-0000-000000000106', '91000000-0000-0000-0000-000000000001');

insert into public.appointments (
  id, organization_id, patient_id, practitioner_role_id, status, start_at, end_at
) values
  ('91000000-0000-0000-0000-000000000501', '91000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000401', '91000000-0000-0000-0000-000000000301', 'booked', '2099-01-01 12:00:00+00', '2099-01-01 12:30:00+00'),
  ('91000000-0000-0000-0000-000000000502', '91000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000402', '91000000-0000-0000-0000-000000000301', 'booked', '2099-01-01 13:00:00+00', '2099-01-01 13:30:00+00');

insert into public.appointment_slots (
  id, organization_id, practitioner_role_id, appointment_id, status,
  service_type, start_at, end_at
) values
  ('91000000-0000-0000-0000-000000000601', '91000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000301', null, 'free', 'Loop A', '2099-01-01 10:00:00+00', '2099-01-01 10:30:00+00'),
  ('91000000-0000-0000-0000-000000000602', '91000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000301', null, 'free', 'Loop A', '2000-01-01 10:00:00+00', '2000-01-01 10:30:00+00'),
  ('91000000-0000-0000-0000-000000000603', '91000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000301', '91000000-0000-0000-0000-000000000501', 'busy', 'Loop A', '2099-01-01 12:00:00+00', '2099-01-01 12:30:00+00'),
  ('91000000-0000-0000-0000-000000000604', '91000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000301', '91000000-0000-0000-0000-000000000502', 'busy', 'Loop A', '2099-01-01 13:00:00+00', '2099-01-01 13:30:00+00'),
  ('91000000-0000-0000-0000-000000000605', '91000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000302', null, 'free', 'Loop A', '2099-01-01 14:00:00+00', '2099-01-01 14:30:00+00'),
  ('91000000-0000-0000-0000-000000000606', '91000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000303', null, 'free', 'Loop A', '2099-01-01 15:00:00+00', '2099-01-01 15:30:00+00'),
  ('91000000-0000-0000-0000-000000000607', '91000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000305', null, 'free', 'Loop A Foreign', '2099-01-01 16:00:00+00', '2099-01-01 16:30:00+00');

select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select is(
  (
    select array_agg(id order by id)
    from public.appointment_slots
    where id = any (array[
      '91000000-0000-0000-0000-000000000601'::uuid,
      '91000000-0000-0000-0000-000000000602'::uuid,
      '91000000-0000-0000-0000-000000000603'::uuid,
      '91000000-0000-0000-0000-000000000604'::uuid,
      '91000000-0000-0000-0000-000000000605'::uuid,
      '91000000-0000-0000-0000-000000000606'::uuid,
      '91000000-0000-0000-0000-000000000607'::uuid
    ])
  ),
  array[
    '91000000-0000-0000-0000-000000000601'::uuid,
    '91000000-0000-0000-0000-000000000605'::uuid,
    '91000000-0000-0000-0000-000000000606'::uuid,
    '91000000-0000-0000-0000-000000000607'::uuid
  ],
  'anon can read future free slots only'
);
reset role;

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000103', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"91000000-0000-0000-0000-000000000103"}', true);
set local role authenticated;
select is(
  (select array_agg(id order by id) from public.appointment_slots),
  array[
    '91000000-0000-0000-0000-000000000601'::uuid,
    '91000000-0000-0000-0000-000000000603'::uuid,
    '91000000-0000-0000-0000-000000000605'::uuid,
    '91000000-0000-0000-0000-000000000606'::uuid
  ],
  'authenticated patient sees same-clinic future free slots and own booked slot'
);
select is(
  (select count(*) from public.appointment_slots where id = '91000000-0000-0000-0000-000000000607'),
  0::bigint,
  'authenticated patient cannot read a foreign-organization free slot'
);
reset role;

select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"91000000-0000-0000-0000-000000000101"}', true);
set local role authenticated;
select is(
  (select array_agg(id order by id) from public.appointment_slots),
  array[
    '91000000-0000-0000-0000-000000000601'::uuid,
    '91000000-0000-0000-0000-000000000602'::uuid,
    '91000000-0000-0000-0000-000000000603'::uuid,
    '91000000-0000-0000-0000-000000000604'::uuid
  ],
  'Doctor A cannot read Doctor B slots'
);
select is(
  (select count(*) from public.appointment_slots where id = '91000000-0000-0000-0000-000000000607'),
  0::bigint,
  'Doctor A cannot read a foreign-organization slot'
);
reset role;

select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000102', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"91000000-0000-0000-0000-000000000102"}', true);
set local role authenticated;
select is(
  (select array_agg(id order by id) from public.appointment_slots),
  array['91000000-0000-0000-0000-000000000605'::uuid],
  'Doctor B cannot read Doctor A slots'
);
reset role;

select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000104', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"91000000-0000-0000-0000-000000000104"}', true);
set local role authenticated;
select is(
  (select count(*) from public.appointment_slots),
  6::bigint,
  'can_manage_appointments manager can read all clinic slots'
);
select is(
  (select count(*) from public.appointment_slots where id = '91000000-0000-0000-0000-000000000607'),
  0::bigint,
  'appointment manager cannot read a foreign-organization slot'
);
reset role;

select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000105', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"91000000-0000-0000-0000-000000000105"}', true);
set local role authenticated;
select is(
  (select count(*) from public.appointment_slots),
  0::bigint,
  'ordinary operational staff without can_manage_appointments cannot read slots'
);
reset role;

select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000106', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"91000000-0000-0000-0000-000000000106"}', true);
set local role authenticated;
select is(
  (select array_agg(id order by id) from public.appointment_slots),
  array['91000000-0000-0000-0000-000000000606'::uuid],
  'active practitioner dual-role identity is denied the patient-wide branch'
);
reset role;

select * from finish();
rollback;
