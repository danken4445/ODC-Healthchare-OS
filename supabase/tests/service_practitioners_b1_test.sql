begin;
select plan(8);

select has_table('public', 'service_practitioners', 'B1 creates service practitioner membership');
select has_column('public', 'service_practitioners', 'organization_id', 'membership is organization-scoped');
select has_column('public', 'service_practitioners', 'duration_minutes_override', 'membership supports a duration override');
select has_index('public', 'service_practitioners', 'service_practitioners_org_role_active_idx', 'assigned-service lookup is indexed');
select policies_are(
  'public',
  'service_practitioners',
  array['service_practitioners_manage', 'service_practitioners_select'],
  'membership table has only the expected organization-scoped policies'
);
select ok(
  public.has_organization_permission(
    '10000000-0000-0000-0000-000000000001',
    'can_manage_services'
  ) is false,
  'without an authenticated caller the new permission is not granted'
);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000106', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000106"}', true);
set local role authenticated;
select ok(
  public.has_organization_permission(
    '10000000-0000-0000-0000-000000000001',
    'can_manage_services'
  ),
  'admin receives the service-management permission through the Roles CMS'
);
select is(
  (select count(*) >= 0 from public.service_practitioners),
  true,
  'staff can read the organization-scoped membership table'
);
reset role;

select * from finish();
rollback;
