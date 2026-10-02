begin;
select plan(4);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000106', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000106"}', true);
set local role authenticated;

select is(
  public.set_organization_fee_model('10000000-0000-0000-0000-000000000001', 'practitioner_declared'),
  'practitioner_declared',
  'private organization can enable practitioner-declared fees'
);

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000101"}', true);
set local role authenticated;

select ok(
  public.has_organization_permission(
    '10000000-0000-0000-0000-000000000001',
    'can_manage_professional_fees'
  ),
  'doctor receives the fee permission default in practitioner-declared mode'
);

select is(
  (select fee_model from public.get_organization_fee_settings('10000000-0000-0000-0000-000000000001')),
  'practitioner_declared',
  'fee settings expose the practitioner-declared mode to the doctor'
);

select ok(
  not exists (
    select 1
    from public.clinic_role_permission_overrides
    where organization_id = '10000000-0000-0000-0000-000000000002'
      and role_code = 'doctor'
      and permission = 'can_manage_professional_fees'
  ),
  'government organization does not receive the private fee default'
);

select * from finish();
rollback;
