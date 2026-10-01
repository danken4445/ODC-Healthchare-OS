begin;
select plan(7);

insert into public.practitioners (id, organization_id, auth_user_id, name)
values (
  '20000000-0000-0000-0000-000000000104',
  '10000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000104',
  '{"text":"Other Clinic Doctor"}'::jsonb
);
insert into public.practitioner_roles (id, organization_id, practitioner_id, role_code)
values (
  '30000000-0000-0000-0000-000000000104',
  '10000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000104',
  'doctor'
);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000106', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000106"}', true);
set local role authenticated;
select is(
  (select count(*) from public.assign_service_practitioners(
    '10000000-0000-0000-0000-000000000001',
    '52000000-0000-0000-0000-000000000001',
    array['30000000-0000-0000-0000-000000000109']::uuid[],
    null
  )),
  1::bigint,
  'service manager can assign one same-organization specialist'
);
select ok(
  exists (
    select 1
    from public.service_practitioners
    where clinic_service_id = '52000000-0000-0000-0000-000000000001'
      and practitioner_role_id = '30000000-0000-0000-0000-000000000109'
      and is_active
  ),
  'assignment is active'
);
select ok(
  exists (
    select 1
    from public.audit_log
    where organization_id = '10000000-0000-0000-0000-000000000001'
      and table_name = 'service_practitioners'
      and action = 'insert'
  ),
  'assignment is audited'
);
select throws_ok(
  $$ select public.assign_service_practitioners(
    '10000000-0000-0000-0000-000000000001',
    '52000000-0000-0000-0000-000000000001',
    array['30000000-0000-0000-0000-000000000104']::uuid[],
    null
  ) $$,
  '23503',
  'Every assigned role must be a same-organization doctor or specialist.',
  'cross-organization assignment is rejected'
);
select is(
  public.unassign_service_practitioners(
    '10000000-0000-0000-0000-000000000001',
    '52000000-0000-0000-0000-000000000001',
    array['30000000-0000-0000-0000-000000000109']::uuid[]
  ),
  1,
  'service manager can deactivate an assignment'
);
select ok(
  exists (
    select 1
    from public.audit_log
    where organization_id = '10000000-0000-0000-0000-000000000001'
      and table_name = 'service_practitioners'
      and action = 'update'
  ),
  'unassignment is audited'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000101"}', true);
set local role authenticated;
select throws_ok(
  $$ select public.assign_service_practitioners(
    '10000000-0000-0000-0000-000000000001',
    '52000000-0000-0000-0000-000000000001',
    array['30000000-0000-0000-0000-000000000109']::uuid[],
    null
  ) $$,
  '42501',
  'Service management permission is required.',
  'doctor without can_manage_services cannot assign practitioners'
);
reset role;

select * from finish();
rollback;
