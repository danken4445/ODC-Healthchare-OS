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
select public.set_patient_clinic_context('10000000-0000-0000-0000-000000000001');
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
select 1 / case when (select count(*) from public.appointments) = 1 then 1 else 0 end
  as nurse_can_open_same_clinic_appointment_context_only;
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

-- Loop 2 writes are RPC-only; authenticated callers cannot bypass tenant,
-- patient, author, or role derivation with direct DML.
select 1 / case when not has_table_privilege('authenticated', 'public.encounters', 'insert,update,delete') then 1 else 0 end
  as clinical_encounters_are_rpc_only;
select 1 / case when not has_table_privilege('authenticated', 'public.observations', 'insert,update,delete') then 1 else 0 end
  as observations_are_rpc_only;
select 1 / case when not has_table_privilege('authenticated', 'public.medication_requests', 'insert,update,delete') then 1 else 0 end
  as prescriptions_are_rpc_only;
select 1 / case when not has_table_privilege('authenticated', 'public.document_references', 'insert,update,delete') then 1 else 0 end
  as clinical_documents_are_rpc_only;
select 1 / case when not has_table_privilege('authenticated', 'public.provider_weekly_availability', 'insert,update,delete') then 1 else 0 end
  as provider_availability_is_rpc_only;
select 1 / case when not has_table_privilege('authenticated', 'public.clinic_services', 'insert,update,delete') then 1 else 0 end
  as provider_service_catalog_is_rpc_only;

-- Doctor creates a complete versioned chart at clinic A and cannot mutate a
-- guessed encounter from clinic B.
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000101"}', true);
set local role authenticated;
do $$
declare
  first_note uuid;
  revised_note uuid;
  provider_service uuid;
begin
  first_note := public.add_soap_note(
    '60000000-0000-0000-0000-000000000001',
    'Synthetic SOAP note version one', null
  );
  revised_note := public.add_soap_note(
    '60000000-0000-0000-0000-000000000001',
    'Synthetic SOAP note version two', first_note
  );
  if not exists (
    select 1 from public.observations
    where id = revised_note and supersedes_id = first_note and code = 'SOAP-NOTE'
  ) then raise exception 'SOAP revision chain was not preserved.'; end if;

  perform public.issue_prescription(
    '60000000-0000-0000-0000-000000000001',
    'Synthetic medicine', 'One synthetic unit daily', null
  );
  perform public.issue_medical_certificate(
    '60000000-0000-0000-0000-000000000001',
    'Synthetic certificate', 'Synthetic certificate statement'
  );

  provider_service := public.save_provider_clinic_service(
    null, '10000000-0000-0000-0000-000000000001', 'RLS-SERVICE',
    'Synthetic RLS service', '', 30, 100, true
  );
  perform public.save_provider_weekly_availability(
    provider_service,
    '[{"day_of_week":0,"start_time":"10:00","end_time":"11:00"}]'::jsonb
  );
  perform public.retire_provider_clinic_service(provider_service);
  if exists (
    select 1 from public.appointment_slots
    where clinic_service_id = provider_service and status = 'free'
  ) then raise exception 'Retired service retained bookable slots.'; end if;

  begin
    perform public.add_soap_note(
      '60000000-0000-0000-0000-000000000002',
      'Cross-clinic note must fail', null
    );
    raise exception 'Doctor wrote to another clinic encounter.';
  exception when sqlstate '42501' then null;
  end;
end $$;
reset role;

-- A nurse can revise the combined SOAP note for an in-progress clinic chart,
-- but cannot prescribe, issue certificates, or finish the encounter.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000102', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000102"}', true);
set local role authenticated;
do $$
declare latest_note uuid;
begin
  select id into latest_note from public.observations
  where encounter_id = '60000000-0000-0000-0000-000000000001'
    and code = 'SOAP-NOTE'
  order by created_at desc limit 1;
  perform public.add_soap_note(
    '60000000-0000-0000-0000-000000000001',
    'Synthetic nurse SOAP revision', latest_note
  );
  begin
    perform public.issue_prescription(
      '60000000-0000-0000-0000-000000000001',
      'Denied medicine', 'Denied directions', null
    );
    raise exception 'Nurse issued a prescription.';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.issue_medical_certificate(
      '60000000-0000-0000-0000-000000000001',
      'Denied certificate', 'Denied statement'
    );
    raise exception 'Nurse issued a certificate.';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.finish_clinical_encounter(
      '60000000-0000-0000-0000-000000000001'
    );
    raise exception 'Nurse completed an encounter.';
  exception when sqlstate '42501' then null;
  end;
end $$;
reset role;

-- Patient profile self-service is clinic-context-bound.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000103', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000103"}', true);
set local role authenticated;
select public.set_patient_clinic_context('10000000-0000-0000-0000-000000000001');
select public.update_own_patient_profile(
  '40000000-0000-0000-0000-000000000001', 'Synthetic Updated Patient',
  '2000-01-01', 'unknown', '+63 900 000 0000', 'Synthetic address'
);
select 1 / case when exists (
  select 1 from public.patients
  where id = '40000000-0000-0000-0000-000000000001'
    and name ->> 'text' = 'Synthetic Updated Patient'
) then 1 else 0 end as patient_updated_own_profile;
do $$
begin
  begin
    perform public.update_own_patient_profile(
      '40000000-0000-0000-0000-000000000002', 'Cross-clinic patient',
      '2000-01-01', 'unknown', null, null
    );
    raise exception 'Patient updated another clinic profile.';
  exception when sqlstate '42501' then null;
  end;
end $$;
reset role;

-- Clinical and scheduling configuration writes produced audit events.
select 1 / case when exists (
  select 1 from public.audit_log
  where table_name = 'observations'
    and actor_id in (
      '00000000-0000-0000-0000-000000000101',
      '00000000-0000-0000-0000-000000000102'
    )
) then 1 else 0 end as clinical_writes_are_audited;
select 1 / case when exists (
  select 1 from public.audit_log
  where table_name = 'provider_weekly_availability'
    and actor_id = '00000000-0000-0000-0000-000000000101'
) then 1 else 0 end as provider_availability_is_audited;

rollback;
