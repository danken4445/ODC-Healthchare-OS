-- Run after `supabase db reset`. Every result must be true; writes roll back.
\set ON_ERROR_STOP on

do $$
begin
  if to_regclass('public.teleconsult_rooms') is null
    or to_regclass('public.practitioner_payout_settings') is null
    or to_regclass('public.doctor_payouts') is null then
    raise exception 'Loop 6 table surface is incomplete.';
  end if;
  if to_regprocedure('public.book_appointment_slot(uuid,uuid,public.appointment_delivery_mode)') is null
    or to_regprocedure('public.list_teleconsult_appointments(uuid)') is null
    or to_regprocedure('public.list_doctor_payouts(uuid)') is null
    or to_regprocedure('public.settle_doctor_payouts(uuid,uuid[],text)') is null then
    raise exception 'Loop 6 RPC surface is incomplete.';
  end if;
  if not ('custom_webrtc' = any(enum_range(null::public.teleconsult_provider)::text[])) then
    raise exception 'The custom WebRTC teleconsult provider is unavailable.';
  end if;
  if has_function_privilege('anon', 'public.list_teleconsult_appointments(uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.settle_doctor_payouts(uuid,uuid[],text)', 'EXECUTE') then
    raise exception 'Anonymous remote-care access exists.';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid='public.teleconsult_rooms'::regclass and tgname='teleconsult_rooms_audit')
    or not exists (select 1 from pg_trigger where tgrelid='public.doctor_payouts'::regclass and tgname='doctor_payouts_audit')
    or not exists (
      select 1 from pg_trigger
      where tgrelid='public.teleconsult_rooms'::regclass
        and tgname='teleconsult_rooms_tenant_integrity'
        and tgfoid='public.enforce_teleconsult_room_tenant_integrity()'::regprocedure
    ) then
    raise exception 'Loop 6 audit or tenant-integrity coverage is incomplete.';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='realtime' and tablename='messages'
      and policyname='teleconsult_webrtc_broadcast_receive'
  ) or not exists (
    select 1 from pg_policies
    where schemaname='realtime' and tablename='messages'
      and policyname='teleconsult_webrtc_broadcast_send'
  ) then
    raise exception 'Private WebRTC Broadcast authorization is incomplete.';
  end if;
end $$;

begin;

-- Create one virtual appointment in each seeded clinic as database owner.
update public.appointments set delivery_mode='virtual'
where id in (
  '50000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000002'
);
select count(*) = 2 and bool_and(provider='custom_webrtc') as virtual_appointments_create_custom_webrtc_rooms
from public.teleconsult_rooms;
select queue_number is null and queue_date is null as virtual_has_no_physical_queue
from public.appointments where id='50000000-0000-0000-0000-000000000001';

select set_config('request.jwt.claim.role', 'authenticated', true);

-- Assigned doctor sees and starts only the room at their clinic.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000101"}', true);
set local role authenticated;
select count(*) = 1 as doctor_sees_only_assigned_room from public.teleconsult_rooms;
select count(*) = 1 as doctor_rpc_is_tenant_scoped
from public.list_teleconsult_appointments('10000000-0000-0000-0000-000000000001');
select public.start_appointment_encounter('50000000-0000-0000-0000-000000000001')
  = '60000000-0000-0000-0000-000000000001'::uuid as virtual_visit_uses_existing_encounter;
select status='open' as starting_encounter_opens_room
from public.teleconsult_rooms where appointment_id='50000000-0000-0000-0000-000000000001';
reset role;

-- Patient sees only their own clinic-scoped room and cannot see the other clinic.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000103', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000103"}', true);
set local role authenticated;
select public.set_patient_clinic_context('10000000-0000-0000-0000-000000000001');
select count(*) = 1 as patient_sees_only_own_room from public.teleconsult_rooms;
select count(*) = 0 as patient_cannot_infer_other_clinic_room
from public.teleconsult_rooms where organization_id='10000000-0000-0000-0000-000000000002';
reset role;

-- Finalized service billing for a finished Encounter creates one payout snapshot.
update public.encounters set status='finished', period_end=now()
where id='60000000-0000-0000-0000-000000000001';
insert into public.billing_events (
  id, organization_id, encounter_id, patient_id, status
) values (
  'b6000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001', 'draft'
);
insert into public.billing_line_items (
  organization_id, billing_event_id, source_type, source_id,
  description, quantity, unit_price, currency
) values (
  '10000000-0000-0000-0000-000000000001',
  'b6000000-0000-0000-0000-000000000001',
  'clinic_service', '52000000-0000-0000-0000-000000000001',
  'Synthetic validation consultation', 1, 650, 'PHP'
);
update public.billing_events set status='finalized', finalized_at=now()
where id='b6000000-0000-0000-0000-000000000001';
select count(*)=1 and min(payout_amount)=650 as finalized_visit_creates_payout
from public.doctor_payouts where encounter_id='60000000-0000-0000-0000-000000000001';

-- Clinic admin can settle its payout, with an audited state transition.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000106', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000106"}', true);
set local role authenticated;
select public.settle_doctor_payouts(
  '10000000-0000-0000-0000-000000000001',
  array[(select id from public.doctor_payouts where status='pending')],
  'SYNTHETIC-TRANSFER-001'
) = 1 as clinic_admin_settles_pending_payout;
select count(*)=0 as admin_cannot_read_other_clinic_payouts
from public.doctor_payouts where organization_id='10000000-0000-0000-0000-000000000002';
reset role;

select exists (
  select 1 from public.audit_log
  where table_name='doctor_payouts' and action='update'
) as payout_settlement_is_audited;

rollback;
