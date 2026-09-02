-- Run after `supabase db reset`. Every result must be true; writes roll back.
\set ON_ERROR_STOP on

do $$
begin
  if to_regclass('public.clinical_notifications') is null then raise exception 'Notification table is missing.'; end if;
  if to_regprocedure('public.create_diagnostic_service_request(uuid,text,text,text,text,text,uuid)') is null
    or to_regprocedure('public.record_diagnostic_report(uuid,text,jsonb)') is null
    or to_regprocedure('public.list_diagnostic_encounters(uuid)') is null
    or to_regprocedure('public.update_referral_status(uuid,public.request_status)') is null then
    raise exception 'Loop 4 RPC surface is incomplete.';
  end if;
  if has_function_privilege('anon', 'public.record_diagnostic_report(uuid,text,jsonb)', 'EXECUTE')
    or has_function_privilege('anon', 'public.create_diagnostic_service_request(uuid,text,text,text,text,text,uuid)', 'EXECUTE') then
    raise exception 'Anonymous diagnostics mutation access exists.';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid='public.service_requests'::regclass and tgname='service_requests_audit')
    or not exists (select 1 from pg_trigger where tgrelid='public.diagnostic_reports'::regclass and tgname='diagnostic_reports_audit')
    or not exists (select 1 from pg_trigger where tgrelid='public.clinical_notifications'::regclass and tgname='clinical_notifications_audit') then
    raise exception 'Loop 4 audit coverage is incomplete.';
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='service_requests')
    or not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='diagnostic_reports') then
    raise exception 'Diagnostics Realtime publication is incomplete.';
  end if;
end $$;

begin;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Ordering doctor creates the shared ServiceRequest shape for both categories.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000101"}', true);
set local role authenticated;
select public.create_diagnostic_service_request(
  '60000000-0000-0000-0000-000000000001', 'laboratory', 'CBC', 'Complete blood count', 'routine', 'Synthetic validation order', null
) is not null as doctor_can_place_lab_order;
select public.create_diagnostic_service_request(
  '60000000-0000-0000-0000-000000000001', 'referral', 'CARD', 'Cardiology review', 'urgent', 'Synthetic validation referral',
  '30000000-0000-0000-0000-000000000109'
) is not null as doctor_can_route_referral;
reset role;

-- Lab staff can see only the lab worklist and atomically publish report + results.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000107', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000107"}', true);
set local role authenticated;
select count(*) = 1 as lab_sees_active_lab_only from public.service_requests where status='active';
select public.record_diagnostic_report(
  (select id from public.service_requests where category='laboratory' order by created_at desc limit 1),
  'Synthetic values within expected range',
  '[{"code":"HGB","display":"Hemoglobin","value":140,"unit":"g/L","referenceRange":{"text":"120-160"}}]'::jsonb
) is not null as lab_publishes_atomic_report;
select count(*) = 1 as lab_result_observation_linked
from public.observations where diagnostic_report_id is not null and code='HGB';
select count(*) = 0 as lab_cannot_read_other_clinic_requests
from public.service_requests where organization_id='10000000-0000-0000-0000-000000000002';
reset role;

-- Routed specialist sees their referral and can complete it.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000109', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000109"}', true);
set local role authenticated;
select count(*) = 1 as specialist_sees_routed_referral from public.service_requests;
select public.update_referral_status((select id from public.service_requests limit 1), 'completed') is null
  as specialist_completes_referral;
reset role;

-- Patient sees their final report but never provider notifications.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000103', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000103"}', true);
set local role authenticated;
select count(*) = 1 as patient_sees_final_report from public.diagnostic_reports;
select count(*) = 0 as patient_cannot_read_provider_notifications from public.clinical_notifications;
select count(*) = 0 as patient_cannot_read_other_clinic_reports
from public.diagnostic_reports where organization_id='10000000-0000-0000-0000-000000000002';
reset role;

-- Doctor receives both lab and referral notification records.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000101"}', true);
set local role authenticated;
select count(*) = 2 as ordering_doctor_is_notified from public.clinical_notifications;
reset role;
rollback;
