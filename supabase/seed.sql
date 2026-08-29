-- Synthetic development data only. Never add real patient information here.
-- The password below is deliberately public, local-only test data; it is not a
-- deployable credential and must never be used outside a reset local database.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, email_change, email_change_token_new, recovery_token,
  recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000101', 'authenticated', 'authenticated', 'doctor@synthetic.odyssey.test', crypt('LocalOnly-2026!', gen_salt('bf')), now(), '', '', '', '', now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000102', 'authenticated', 'authenticated', 'nurse@synthetic.odyssey.test', crypt('LocalOnly-2026!', gen_salt('bf')), now(), '', '', '', '', now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000105', 'authenticated', 'authenticated', 'front-desk@synthetic.odyssey.test', crypt('LocalOnly-2026!', gen_salt('bf')), now(), '', '', '', '', now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000106', 'authenticated', 'authenticated', 'admin@synthetic.odyssey.test', crypt('LocalOnly-2026!', gen_salt('bf')), now(), '', '', '', '', now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000107', 'authenticated', 'authenticated', 'lab@synthetic.odyssey.test', crypt('LocalOnly-2026!', gen_salt('bf')), now(), '', '', '', '', now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000103', 'authenticated', 'authenticated', 'patient@synthetic.odyssey.test', crypt('LocalOnly-2026!', gen_salt('bf')), now(), '', '', '', '', now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000104', 'authenticated', 'authenticated', 'other-patient@synthetic.odyssey.test', crypt('LocalOnly-2026!', gen_salt('bf')), now(), '', '', '', '', now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do nothing;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'auth' and table_name = 'identities' and column_name = 'provider_id'
  ) then
    insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    select id, id::text, id, jsonb_build_object('sub', id::text, 'email', email), 'email', now(), now(), now()
    from auth.users user_account
    where user_account.email like '%@synthetic.odyssey.test'
      and not exists (select 1 from auth.identities identity_row where identity_row.user_id = user_account.id);
  else
    insert into auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    select id::text, id, jsonb_build_object('sub', id::text, 'email', email), 'email', now(), now(), now()
    from auth.users user_account
    where user_account.email like '%@synthetic.odyssey.test'
      and not exists (select 1 from auth.identities identity_row where identity_row.user_id = user_account.id);
  end if;
end;
$$;

insert into public.organizations (id, name) values
  ('10000000-0000-0000-0000-000000000001', 'Synthetic Access Control Clinic'),
  ('10000000-0000-0000-0000-000000000002', 'Synthetic Other Clinic')
on conflict (id) do nothing;

insert into public.practitioners (id, organization_id, auth_user_id, name) values
  ('20000000-0000-0000-0000-000000000101', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101', '{"text":"Synthetic Doctor"}'::jsonb),
  ('20000000-0000-0000-0000-000000000102', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000102', '{"text":"Synthetic Nurse"}'::jsonb),
  ('20000000-0000-0000-0000-000000000105', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000105', '{"text":"Synthetic Front Desk"}'::jsonb),
  ('20000000-0000-0000-0000-000000000106', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000106', '{"text":"Synthetic Administrator"}'::jsonb),
  ('20000000-0000-0000-0000-000000000107', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000107', '{"text":"Synthetic Lab Staff"}'::jsonb)
on conflict (id) do nothing;

insert into public.practitioner_roles (id, organization_id, practitioner_id, role_code) values
  ('30000000-0000-0000-0000-000000000101', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000101', 'doctor'),
  ('30000000-0000-0000-0000-000000000102', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000102', 'nurse'),
  ('30000000-0000-0000-0000-000000000105', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000105', 'front_desk'),
  ('30000000-0000-0000-0000-000000000106', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000106', 'admin'),
  ('30000000-0000-0000-0000-000000000107', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000107', 'lab_staff')
on conflict (id) do nothing;

insert into public.patients (id, organization_id, auth_user_id, name) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000103', '{"text":"Synthetic Registered Patient"}'::jsonb),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000104', '{"text":"Synthetic Other Patient"}'::jsonb)
on conflict (id) do nothing;

insert into public.appointments (id, organization_id, patient_id, status, start_at, end_at) values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'booked', now(), now() + interval '30 minutes'),
  ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', 'booked', now(), now() + interval '30 minutes')
on conflict (id) do nothing;

insert into public.encounters (id, organization_id, patient_id, appointment_id, status, period_start) values
  ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'in_progress', now()),
  ('60000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000002', 'in_progress', now())
on conflict (id) do nothing;

insert into public.observations (id, organization_id, patient_id, encounter_id, status, code, value) values
  ('70000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'final', 'synthetic-observation', '{"value":1}'::jsonb),
  ('70000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000002', 'final', 'synthetic-observation', '{"value":2}'::jsonb)
on conflict (id) do nothing;

insert into public.medication_requests (id, organization_id, patient_id, encounter_id, status, medication_code) values
  ('80000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000002', 'active', 'synthetic-medication')
on conflict (id) do nothing;

insert into public.hello_world (message) values ('Odyssey Healthcare OS foundation is connected.');
