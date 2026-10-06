begin;
select plan(2);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000106', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000106"}', true);
set local role authenticated;

select lives_ok(
  $$
    select public.save_clinic_role_definition(
      '10000000-0000-0000-0000-000000000001',
      '',
      'Generated Role Regression',
      '{}'::text[]
    )
  $$,
  'save_clinic_role_definition accepts an empty p_code'
);

select ok(
  exists (
    select 1
    from public.clinic_role_definitions
    where organization_id = '10000000-0000-0000-0000-000000000001'
      and name = 'Generated Role Regression'
      and code ~ '^role_[a-f0-9]{10}$'
  ),
  'empty p_code persists a valid generated clinic role code'
);

select * from finish();
rollback;
