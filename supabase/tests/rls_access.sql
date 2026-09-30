-- CI authorization regression suite. It runs against a freshly reset local
-- Supabase instance using only the seeded synthetic identities.
\set ON_ERROR_STOP on

begin;
select plan(22);

-- Patients cannot read records at another organization.
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000103', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000103"}', true);
set local role authenticated;
select public.set_patient_clinic_context('10000000-0000-0000-0000-000000000001');
select ok(
  (select count(*) from public.patients) = 1,
  'patient cannot read another patient'
);
select ok(
  (select count(*) from public.appointments) = 1,
  'patient cannot read another organization appointment'
);
select ok(
  (select count(*) from public.encounters) = 1,
  'patient cannot read another organization encounter'
);
select ok(
  (select count(*) from public.observations) = 1,
  'patient cannot read another organization observation'
);
reset role;

-- A doctor sees only appointments assigned to their own active role and only
-- clinical records at their organization.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000101"}', true);
set local role authenticated;
select ok(
  (select count(*) from public.appointments) = 1,
  'doctor cannot read unassigned or other-organization appointments'
);
select ok(
  (select count(*) from public.observations) = 1,
  'doctor cannot read other-organization observations'
);
reset role;

-- A nurse can read clinical records in their clinic, but cannot see the other
-- clinic or medication requests (which are intentionally role-restricted).
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000102', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000102"}', true);
set local role authenticated;
select ok(
  (select count(*) from public.encounters) = 1,
  'nurse cannot read other-organization encounters'
);
select ok(
  (select count(*) from public.appointments) = 1,
  'nurse can open same-clinic appointment context only'
);
select ok(
  (select count(*) from public.medication_requests) = 0,
  'nurse cannot read medication requests'
);
reset role;

-- Front desk can operate the clinic schedule but cannot inspect clinical
-- observations, and cannot see a second clinic's schedule.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000105', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000105"}', true);
set local role authenticated;
select ok(
  (select count(*) from public.appointments) = 1,
  'front desk cannot read other-organization appointments'
);
select ok(
  (select count(*) from public.observations) = 0,
  'front desk cannot read clinical observations'
);
reset role;

-- The unauthenticated API role has no direct clinical row visibility. Patients
-- are privilege-denied; appointments retain the platform's table-level SELECT
-- grant but have no anon policy, so RLS must return no rows.
select ok(
  not has_table_privilege('anon', 'public.patients', 'select'),
  'anon cannot select patients'
);
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select is(
  (select count(*) from public.appointments),
  0::bigint,
  'anon cannot read appointment rows through RLS'
);
reset role;

-- Loop 2 writes are RPC-only; authenticated callers cannot bypass tenant,
-- patient, author, or role derivation with direct DML.
select ok(
  not has_table_privilege('authenticated', 'public.encounters', 'insert,update,delete'),
  'clinical encounters are RPC-only'
);
select ok(
  not has_table_privilege('authenticated', 'public.observations', 'insert,update,delete'),
  'observations are RPC-only'
);
select ok(
  not has_table_privilege('authenticated', 'public.medication_requests', 'insert,update,delete'),
  'prescriptions are RPC-only'
);
select ok(
  not has_table_privilege('authenticated', 'public.document_references', 'insert,update,delete'),
  'clinical documents are RPC-only'
);
select ok(
  not has_table_privilege('authenticated', 'public.provider_weekly_availability', 'insert,update,delete'),
  'provider availability is RPC-only'
);
select ok(
  not has_table_privilege('authenticated', 'public.clinic_services', 'insert,update,delete'),
  'provider service catalog is RPC-only'
);

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
  exception when others then
    if sqlstate <> '42501'
      and not (
        sqlstate = '23503'
        and sqlerrm = 'Performer must belong to the record organization.'
      ) then
      raise;
    end if;
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
select ok(
  exists (
    select 1 from public.patients
    where id = '40000000-0000-0000-0000-000000000001'
      and name ->> 'text' = 'Synthetic Updated Patient'
  ),
  'patient updated own profile'
);
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
select ok(
  exists (
    select 1 from public.audit_log
    where table_name = 'observations'
      and actor_id in (
        '00000000-0000-0000-0000-000000000101',
        '00000000-0000-0000-0000-000000000102'
      )
  ),
  'clinical writes are audited'
);
select ok(
  exists (
    select 1 from public.audit_log
    where table_name = 'provider_weekly_availability'
      and actor_id = '00000000-0000-0000-0000-000000000101'
  ),
  'provider availability is audited'
);

select * from finish();
rollback;
