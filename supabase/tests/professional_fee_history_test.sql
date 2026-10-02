begin;
select plan(13);

insert into public.service_practitioners (
  organization_id, clinic_service_id, practitioner_role_id, is_active
) values (
  '10000000-0000-0000-0000-000000000001',
  '52000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000109',
  true
)
on conflict (clinic_service_id, practitioner_role_id) do update set is_active = true;

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000101"}', true);
set local role authenticated;

select throws_ok(
  $$ select public.set_my_professional_fee('52000000-0000-0000-0000-000000000001', 100, now()) $$,
  '22023',
  'Professional fees are available only in practitioner_declared mode.',
  'fixed_rate mode rejects a practitioner fee declaration'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000106', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000106"}', true);
set local role authenticated;
select is(
  public.set_organization_fee_model('10000000-0000-0000-0000-000000000001', 'practitioner_declared'),
  'practitioner_declared',
  'service manager enables practitioner-declared fees for a private facility'
);
select lives_ok(
  $$ select public.set_clinic_service_professional_fee_bounds(
    '52000000-0000-0000-0000-000000000001', 100, 400
  ) $$,
  'service manager can set professional-fee bounds'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000101"}', true);
set local role authenticated;
select throws_ok(
  $$ select public.set_my_professional_fee('52000000-0000-0000-0000-000000000001', 99, now()) $$,
  '22023',
  'Professional fee must be within the service bounds.',
  'service minimum professional-fee bound is enforced inside the RPC'
);
select lives_ok(
  $$ select public.set_my_professional_fee('52000000-0000-0000-0000-000000000001', 250, now() - interval '1 minute') $$,
  'assigned practitioner can declare an in-range own fee'
);
select is(
  public.is_service_practitioner_bookable(
    (select id from public.service_practitioners
      where clinic_service_id = '52000000-0000-0000-0000-000000000001'
        and practitioner_role_id = '30000000-0000-0000-0000-000000000101')
  ),
  true,
  'declared-mode practitioner is bookable with an effective fee'
);
select is(
  public.is_service_practitioner_bookable(
    (select id from public.service_practitioners
      where clinic_service_id = '52000000-0000-0000-0000-000000000002'
        and practitioner_role_id = '30000000-0000-0000-0000-000000000109')
  ),
  false,
  'declared-mode practitioner without a fee is not bookable'
);
select throws_ok(
  $$ select public.list_professional_fee_history(
    (select id from public.service_practitioners
      where clinic_service_id = '52000000-0000-0000-0000-000000000002'
        and practitioner_role_id = '30000000-0000-0000-0000-000000000109')
  ) $$,
  '42501',
  'Professional fee access is denied.',
  'practitioner cannot view another doctor fee history'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000106', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000106"}', true);
set local role authenticated;
select lives_ok(
  $$ select public.set_professional_fee_for_practitioner(
    (select id from public.service_practitioners
      where clinic_service_id = '52000000-0000-0000-0000-000000000002'
        and practitioner_role_id = '30000000-0000-0000-0000-000000000109'),
    300,
    now()
  ) $$,
  'service manager can set a professional fee on a practitioner behalf'
);
select ok(
  exists (
    select 1 from public.audit_log
    where organization_id = '10000000-0000-0000-0000-000000000001'
      and table_name = 'practitioner_service_fees'
      and action = 'insert'
  ),
  'professional fee declarations are audited'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000101"}', true);
set local role authenticated;
select throws_ok(
  $$ update public.practitioner_service_fees set amount = 500 where amount = 250 $$,
  '42501',
  'permission denied for table practitioner_service_fees',
  'professional fee history cannot be updated directly'
);
select throws_ok(
  $$ delete from public.practitioner_service_fees where amount = 250 $$,
  '42501',
  'permission denied for table practitioner_service_fees',
  'professional fee history cannot be deleted directly'
);
reset role;

update public.organizations
set default_payor_type = 'government_subsidized'
where id = '10000000-0000-0000-0000-000000000001';

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000101"}', true);
set local role authenticated;
select throws_ok(
  $$ select public.set_my_professional_fee('52000000-0000-0000-0000-000000000001', 300, now()) $$,
  '22023',
  'Government facilities cannot declare professional fees.',
  'government organization rejects a fee declaration'
);
reset role;

select * from finish();
rollback;
