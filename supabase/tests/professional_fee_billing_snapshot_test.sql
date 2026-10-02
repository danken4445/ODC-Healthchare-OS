begin;
select plan(6);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000106', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000106"}', true);
set local role authenticated;
select is(
  public.set_organization_fee_model('10000000-0000-0000-0000-000000000001', 'practitioner_declared'),
  'practitioner_declared',
  'private organization enables practitioner-declared fees before bill generation'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000101"}', true);
set local role authenticated;
select lives_ok(
  $$ select public.set_my_professional_fee(
    '52000000-0000-0000-0000-000000000001', 250, now() - interval '1 minute'
  ) $$,
  'doctor declares the effective professional fee before bill generation'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000103', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000103"}', true);
set local role authenticated;
select lives_ok(
  $$ select public.book_appointment_slot('51000000-0000-0000-0000-000000000001') $$,
  'patient booking generates a fee-split invoice'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000101"}', true);
set local role authenticated;
select lives_ok(
  $$ select public.set_my_professional_fee(
    '52000000-0000-0000-0000-000000000001', 400, now()
  ) $$,
  'doctor can later declare a new version of the professional fee'
);
reset role;

select is(
  (
    select unit_price
    from public.billing_line_items
    where billing_event_id = (
      select id from public.billing_events
      where appointment_id = (
        select appointment_id from public.appointment_slots
        where id = '51000000-0000-0000-0000-000000000001'
      )
    )
      and source_type = 'professional_fee'
  ),
  250::numeric,
  'professional-fee invoice line remains the bill-generation snapshot after a later fee change'
);

update public.encounters
set practitioner_role_id = '30000000-0000-0000-0000-000000000101',
    status = 'finished'
where id = '60000000-0000-0000-0000-000000000001';

insert into public.billing_line_items (
  organization_id, billing_event_id, source_type, description, quantity, unit_price, currency
) values (
  '10000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'professional_fee',
  'Professional fee - zero-fee regression fixture',
  1,
  0,
  'PHP'
);

select public.refresh_doctor_payout('60000000-0000-0000-0000-000000000001');

select is(
  (
    select payout_amount
    from public.doctor_payouts
    where encounter_id = '60000000-0000-0000-0000-000000000001'
  ),
  0::numeric,
  'a declared zero fee remains a zero payout instead of falling back to the facility price'
);

select * from finish();
rollback;
