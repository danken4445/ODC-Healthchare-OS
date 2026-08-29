-- Run after `supabase db reset` in the local development project as a database
-- administrator. Each result must report `true`; the transaction rolls back.
-- This verifies RLS through direct SQL rather than application query behavior.
begin;

select set_config('request.jwt.claim.role', 'authenticated', true);

-- Seeded doctor: sees only the clinical records at their organization and every
-- successful write automatically produces an audit record.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000101"}', true);
set local role authenticated;
select count(*) = 1 as doctor_sees_only_own_organization_encounters from public.encounters;
select count(*) = 1 as doctor_sees_only_own_organization_observations from public.observations;
insert into public.observations (organization_id, patient_id, encounter_id, status, code, value)
values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'final', 'phase2-audit-check', '{"value":3}'::jsonb);
reset role;
select exists (
  select 1 from public.audit_log
  where table_name = 'observations' and action = 'insert'
    and record_id in (select id from public.observations where code = 'phase2-audit-check')
) as observation_write_is_audited;

-- Seeded nurse: can read clinical data at their organization but cannot read the
-- other clinic or write a medication request.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000102', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000102"}', true);
set local role authenticated;
select count(*) = 1 as nurse_sees_only_own_organization_encounters from public.encounters;
select count(*) = 0 as nurse_sees_no_medication_requests from public.medication_requests;
reset role;

-- Seeded patient: sees precisely their own rows, not a different patient's
-- appointment, encounter, or observation.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000103', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000103"}', true);
set local role authenticated;
select count(*) = 1 as patient_sees_only_own_patient_row from public.patients;
select count(*) = 1 as patient_sees_only_own_appointments from public.appointments;
select count(*) = 1 as patient_sees_only_own_encounters from public.encounters;
select count(*) = 1 as patient_sees_only_own_observations from public.observations;
reset role;

rollback;
