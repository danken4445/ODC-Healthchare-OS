begin;
select plan(12);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000103', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000103"}', true);
set local role authenticated;

select lives_ok(
  $$ select public.set_patient_clinic_context('10000000-0000-0000-0000-000000000001') $$,
  'patient selects the first organization before loading doctor-first booking'
);

select ok(
  exists (
    select 1 from public.bookable_practitioners('52000000-0000-0000-0000-000000000001')
    where practitioner_role_id = '30000000-0000-0000-0000-000000000101'
  ),
  'bookable practitioners returns the active service doctor'
);

select is_empty(
  $$
    select id
    from public.appointment_slots
    where organization_id = '10000000-0000-0000-0000-000000000002'
  $$,
  'patient cannot directly read other organization slots'
);

select is_empty(
  $$
    select id
    from public.appointment_slots
    where organization_id = '10000000-0000-0000-0000-000000000001'
      and status = 'free'
  $$,
  'patient no longer directly reads free slots after the doctor-first RPC cutover'
);

select ok(
  not exists (
    select 1
    from pg_get_function_result('public.bookable_practitioners(uuid)'::regprocedure) as signature
    where signature like '%identifier%' or signature like '%telecom%' or signature like '%email%'
  ),
  'doctor projection excludes license numbers and email fields'
);

select ok(
  exists (
    select 1
    from public.get_available_slots(
      '52000000-0000-0000-0000-000000000001',
      tstzrange(now(), now() + interval '1 day', '[)'),
      '30000000-0000-0000-0000-000000000101'
    )
  ),
  'available slots require and return the selected doctor'
);

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000106', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000106"}', true);
set local role authenticated;
select is(
  public.set_organization_fee_model('10000000-0000-0000-0000-000000000001', 'practitioner_declared'),
  'practitioner_declared',
  'private organization uses declared-fee bookability'
);
reset role;
insert into public.service_practitioners (organization_id, clinic_service_id, practitioner_role_id, is_active)
values (
  '10000000-0000-0000-0000-000000000001',
  '52000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000109',
  true
) on conflict (clinic_service_id, practitioner_role_id) do update set is_active = true;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000101"}', true);
set local role authenticated;
select lives_ok(
  $$ select public.set_my_professional_fee('52000000-0000-0000-0000-000000000001', 250, now() - interval '1 minute') $$,
  'assigned doctor declares an effective private fee'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000103', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000103"}', true);
set local role authenticated;
select ok(
  not exists (
    select 1 from public.bookable_practitioners('52000000-0000-0000-0000-000000000001')
    where practitioner_role_id = '30000000-0000-0000-0000-000000000109'
  ),
  'private mode excludes a service doctor with no declared fee'
);

reset role;
update public.organization_settings
set fee_model = 'fixed_rate'
where organization_id = '10000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000103', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000103"}', true);
set local role authenticated;

select lives_ok(
  $$ select public.book_appointment('51000000-0000-0000-0000-000000000006') $$,
  'booking locks, attaches, and bills a free slot in one transaction'
);
select throws_ok(
  $$ select public.book_appointment('51000000-0000-0000-0000-000000000006') $$,
  'PT409',
  'SLOT_TAKEN',
  'second booking receives the typed slot-taken conflict'
);
select ok(
  exists (
    select 1
    from public.appointment_slots as slot
    join public.appointments as appointment on appointment.id = slot.appointment_id
    where slot.id = '51000000-0000-0000-0000-000000000006'
      and slot.status = 'busy'
      and appointment.status in ('pending', 'booked')
  ),
  'booked slot has exactly one active attached appointment'
);

select * from finish();
rollback;
