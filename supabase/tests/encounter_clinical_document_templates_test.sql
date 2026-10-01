begin;
select plan(7);

insert into public.organizations (id, name)
values
  ('93000000-0000-0000-0000-000000000001', 'Template Context Clinic'),
  ('93000000-0000-0000-0000-000000000002', 'Foreign Template Clinic');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, email_change, email_change_token_new, recovery_token,
  recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '93000000-0000-0000-0000-000000000101', 'authenticated', 'authenticated', 'template-doctor-a@example.test', crypt('LocalOnly-2026!', gen_salt('bf')), now(), '', '', '', '', now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '93000000-0000-0000-0000-000000000102', 'authenticated', 'authenticated', 'template-doctor-b@example.test', crypt('LocalOnly-2026!', gen_salt('bf')), now(), '', '', '', '', now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '93000000-0000-0000-0000-000000000103', 'authenticated', 'authenticated', 'template-foreign-doctor@example.test', crypt('LocalOnly-2026!', gen_salt('bf')), now(), '', '', '', '', now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());

insert into public.practitioners (id, organization_id, auth_user_id, name)
values
  ('93000000-0000-0000-0000-000000000201', '93000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000101', '{"text":"Doctor A"}'::jsonb),
  ('93000000-0000-0000-0000-000000000202', '93000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000102', '{"text":"Doctor B"}'::jsonb),
  ('93000000-0000-0000-0000-000000000203', '93000000-0000-0000-0000-000000000002', '93000000-0000-0000-0000-000000000103', '{"text":"Foreign Doctor"}'::jsonb);

insert into public.practitioner_roles (id, organization_id, practitioner_id, role_code)
values
  ('93000000-0000-0000-0000-000000000301', '93000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000201', 'doctor'),
  ('93000000-0000-0000-0000-000000000302', '93000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000202', 'doctor'),
  ('93000000-0000-0000-0000-000000000303', '93000000-0000-0000-0000-000000000002', '93000000-0000-0000-0000-000000000203', 'doctor');

insert into public.patients (id, organization_id, walk_in_id, name)
values ('93000000-0000-0000-0000-000000000401', '93000000-0000-0000-0000-000000000001', 'template-context-patient', '{"text":"Template Patient"}'::jsonb);

insert into public.appointments (id, organization_id, patient_id, practitioner_role_id, status, start_at, end_at)
values ('93000000-0000-0000-0000-000000000501', '93000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000401', '93000000-0000-0000-0000-000000000301', 'booked', '2099-02-01 10:00:00+00', '2099-02-01 10:30:00+00');

insert into public.encounters (id, organization_id, patient_id, appointment_id, practitioner_role_id, status, period_start)
values ('93000000-0000-0000-0000-000000000601', '93000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000401', '93000000-0000-0000-0000-000000000501', '93000000-0000-0000-0000-000000000301', 'in_progress', '2099-02-01 10:00:00+00');

select ok(
  to_regprocedure('public.list_encounter_clinical_document_templates(uuid,text)') is not null,
  'encounter-scoped template lookup is available'
);
select ok(
  has_function_privilege('authenticated', 'public.list_encounter_clinical_document_templates(uuid,text)', 'execute'),
  'authenticated clinicians may call the encounter-scoped template lookup'
);
select ok(
  not has_function_privilege('anon', 'public.list_encounter_clinical_document_templates(uuid,text)', 'execute'),
  'anonymous callers cannot call the encounter-scoped template lookup'
);
select ok(
  pg_get_functiondef('public.list_encounter_clinical_document_templates(uuid,text)'::regprocedure)
    like '%template.status = ''published''%'
    and pg_get_functiondef('public.list_encounter_clinical_document_templates(uuid,text)'::regprocedure)
      like '%template.owner_doctor_id is null or template.owner_doctor_id = current_doctor_id%',
  'lookup returns published shared templates and only the current doctors personal templates'
);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '93000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"93000000-0000-0000-0000-000000000101"}', true);
set local role authenticated;
select lives_ok(
  $$ select public.get_encounter_template_context('93000000-0000-0000-0000-000000000601') $$,
  'assigned Doctor A can get encounter template context'
);
reset role;

select set_config('request.jwt.claim.sub', '93000000-0000-0000-0000-000000000102', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"93000000-0000-0000-0000-000000000102"}', true);
set local role authenticated;
select throws_ok(
  $$ select public.get_encounter_template_context('93000000-0000-0000-0000-000000000601') $$,
  '42501',
  'Only the active doctor assigned to this encounter may use clinical document templates.',
  'same-organization unassigned Doctor B cannot get encounter template context'
);
reset role;

select set_config('request.jwt.claim.sub', '93000000-0000-0000-0000-000000000103', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"93000000-0000-0000-0000-000000000103"}', true);
set local role authenticated;
select throws_ok(
  $$ select public.get_encounter_template_context('93000000-0000-0000-0000-000000000601') $$,
  '42501',
  'Consultation permission is required.',
  'cross-organization doctor cannot get encounter template context'
);
reset role;

select * from finish();
rollback;
