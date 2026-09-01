-- Run after migrations. Structural guardrails for Loop 2; behavioral role and
-- cross-clinic assertions are covered by RLS tests and the Playwright flow.
do $$
begin
  if to_regprocedure('public.add_soap_observation(uuid,text,text,uuid)') is null
    or to_regprocedure('public.issue_prescription(uuid,text,text,text)') is null
    or to_regprocedure('public.issue_medical_certificate(uuid,text,text)') is null
    or to_regprocedure('public.finish_clinical_encounter(uuid)') is null
    or to_regprocedure('public.update_own_patient_profile(uuid,text,date,text,text,text)') is null then
    raise exception 'Loop 2 RPC surface is incomplete.';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.observations'::regclass and tgname = 'observations_are_immutable'
  ) then raise exception 'SOAP Observation immutability trigger is missing.'; end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.observations'::regclass and tgname = 'observations_audit'
  ) or not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.medication_requests'::regclass and tgname = 'medication_requests_audit'
  ) or not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.document_references'::regclass and tgname = 'document_references_audit'
  ) then raise exception 'Loop 2 patient-data audit coverage is incomplete.'; end if;

  if has_function_privilege('anon', 'public.add_soap_observation(uuid,text,text,uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.issue_prescription(uuid,text,text,text)', 'EXECUTE')
    or has_function_privilege('anon', 'public.issue_medical_certificate(uuid,text,text)', 'EXECUTE') then
    raise exception 'Anonymous users must not execute clinical-documentation RPCs.';
  end if;
end $$;
