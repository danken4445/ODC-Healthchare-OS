begin;
select plan(4);

update public.practitioner_roles
set role_code = 'doctor'
where id = '30000000-0000-0000-0000-000000000109';

insert into public.service_practitioners (
  organization_id, clinic_service_id, practitioner_role_id, is_active
) values (
  '10000000-0000-0000-0000-000000000001',
  '52000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000109',
  true
);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000101"}', true);
set local role authenticated;
select lives_ok(
  $$ select public.save_provider_weekly_availability(
    '52000000-0000-0000-0000-000000000001',
    '[{"day_of_week":1,"start_time":"09:00","end_time":"12:00"}]'::jsonb
  ) $$,
  'first assigned doctor can save the shared service Monday 9-12 schedule'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000109', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000109"}', true);
set local role authenticated;
select lives_ok(
  $$ select public.save_provider_weekly_availability(
    '52000000-0000-0000-0000-000000000001',
    '[{"day_of_week":1,"start_time":"09:00","end_time":"12:00"}]'::jsonb
  ) $$,
  'second assigned doctor can save an overlapping shared-service Monday 9-12 schedule'
);
reset role;

select is(
  (select count(*)
   from public.provider_weekly_availability
   where clinic_service_id = '52000000-0000-0000-0000-000000000001'
     and day_of_week = 1
     and start_time = '09:00'::time
     and end_time = '12:00'::time),
  2::bigint,
  'the shared service retains overlapping Monday schedules for two doctors'
);

delete from public.service_practitioners
where clinic_service_id = '52000000-0000-0000-0000-000000000001'
  and practitioner_role_id = '30000000-0000-0000-0000-000000000109';

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000109', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000109"}', true);
set local role authenticated;
select throws_ok(
  $$ select public.save_provider_weekly_availability(
    '52000000-0000-0000-0000-000000000001',
    '[{"day_of_week":1,"start_time":"09:00","end_time":"12:00"}]'::jsonb
  ) $$,
  '42501',
  'An active service assignment for this doctor is required.',
  'a doctor not assigned to the service cannot publish availability'
);
reset role;

select * from finish();
rollback;
