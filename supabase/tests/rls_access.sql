-- CI authorization regression suite. It runs against a freshly reset local
-- Supabase instance using only the seeded synthetic identities. A zero divisor
-- intentionally aborts psql when a visibility assertion is false.
\set ON_ERROR_STOP on

begin;

-- Patients cannot read records at another organization.
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000103', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000103"}', true);
set local role authenticated;
select 1 / case when (select count(*) from public.patients) = 1 then 1 else 0 end
  as patient_cannot_read_other_patient;
select 1 / case when (select count(*) from public.appointments) = 1 then 1 else 0 end
  as patient_cannot_read_other_organization_appointment;
select 1 / case when (select count(*) from public.encounters) = 1 then 1 else 0 end
  as patient_cannot_read_other_organization_encounter;
select 1 / case when (select count(*) from public.observations) = 1 then 1 else 0 end
  as patient_cannot_read_other_organization_observation;
reset role;

-- A doctor sees only appointments assigned to their own active role and only
-- clinical records at their organization.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000101"}', true);
set local role authenticated;
select 1 / case when (select count(*) from public.appointments) = 1 then 1 else 0 end
  as doctor_cannot_read_unassigned_or_other_organization_appointments;
select 1 / case when (select count(*) from public.observations) = 1 then 1 else 0 end
  as doctor_cannot_read_other_organization_observations;
reset role;

-- A nurse can read clinical records in their clinic, but cannot see the other
-- clinic or medication requests (which are intentionally role-restricted).
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000102', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000102"}', true);
set local role authenticated;
select 1 / case when (select count(*) from public.encounters) = 1 then 1 else 0 end
  as nurse_cannot_read_other_organization_encounters;
select 1 / case when (select count(*) from public.medication_requests) = 0 then 1 else 0 end
  as nurse_cannot_read_medication_requests;
reset role;

-- Front desk can operate the clinic schedule but cannot inspect clinical
-- observations, and cannot see a second clinic's schedule.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000105', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000105"}', true);
set local role authenticated;
select 1 / case when (select count(*) from public.appointments) = 1 then 1 else 0 end
  as front_desk_cannot_read_other_organization_appointments;
select 1 / case when (select count(*) from public.observations) = 0 then 1 else 0 end
  as front_desk_cannot_read_clinical_observations;
reset role;

-- The unauthenticated API role has no direct clinical table read privilege.
select 1 / case when has_table_privilege('anon', 'public.patients', 'select') = false then 1 else 0 end
  as anon_cannot_read_patients;
select 1 / case when has_table_privilege('anon', 'public.appointments', 'select') = false then 1 else 0 end
  as anon_cannot_read_appointments;

rollback;
