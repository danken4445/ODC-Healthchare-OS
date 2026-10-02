begin;
select plan(5);

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

select * from finish();
rollback;
