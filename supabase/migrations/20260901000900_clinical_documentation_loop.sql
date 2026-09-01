-- Loop 2: Encounter-linked clinical documentation.
-- All browser writes use these RPCs so subject, tenant, author, and role are
-- derived from the authenticated encounter instead of trusted client input.

create or replace function public.get_current_practitioner(
  p_organization_id uuid,
  p_roles text[]
)
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select practitioner.id
  from public.practitioners practitioner
  join public.practitioner_roles practitioner_role
    on practitioner_role.practitioner_id = practitioner.id
  where practitioner.auth_user_id = auth.uid()
    and practitioner.organization_id = p_organization_id
    and practitioner.active
    and practitioner_role.active
    and practitioner_role.organization_id = p_organization_id
    and practitioner_role.role_code = any(p_roles)
  limit 1;
$$;

create or replace function public.add_soap_observation(
  p_encounter_id uuid,
  p_section text,
  p_text text,
  p_supersedes_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_encounter public.encounters%rowtype;
  v_practitioner_id uuid;
  v_observation_id uuid;
  v_latest_id uuid;
  v_section text := upper(btrim(p_section));
  v_text text := btrim(p_text);
begin
  select * into v_encounter from public.encounters where id = p_encounter_id for update;
  if not found or v_encounter.status <> 'in_progress' then
    raise exception 'An in-progress encounter is required.' using errcode = '22023';
  end if;
  v_practitioner_id := public.get_current_practitioner(v_encounter.organization_id, array['doctor', 'nurse', 'specialist']);
  if v_practitioner_id is null then
    raise exception 'Clinical documentation access is required.' using errcode = '42501';
  end if;
  if v_section is null or v_text is null or v_section not in ('S', 'O', 'A', 'P') or length(v_text) < 1 or length(v_text) > 10000 then
    raise exception 'SOAP section and text are invalid.' using errcode = '22023';
  end if;
  select observation.id into v_latest_id
  from public.observations observation
  where observation.encounter_id = v_encounter.id
    and observation.code = 'SOAP-' || v_section
  order by observation.created_at desc
  limit 1;
  if v_latest_id is distinct from p_supersedes_id then
    raise exception 'A SOAP revision must supersede the latest section version.' using errcode = '40001';
  end if;
  if p_supersedes_id is not null and not exists (
    select 1 from public.observations observation
    where observation.id = p_supersedes_id
      and observation.encounter_id = v_encounter.id
      and observation.code = 'SOAP-' || v_section
  ) then
    raise exception 'The prior SOAP version does not belong to this section and encounter.' using errcode = '23503';
  end if;

  insert into public.observations (
    organization_id, patient_id, encounter_id, performer_practitioner_id,
    status, category_codes, code_system, code, code_display, effective_at,
    issued_at, value, supersedes_id
  ) values (
    v_encounter.organization_id, v_encounter.patient_id, v_encounter.id, v_practitioner_id,
    'final', '[{"coding":[{"code":"clinical-note","display":"Clinical note"}]}]'::jsonb,
    'urn:odyssey:soap', 'SOAP-' || v_section,
    case v_section when 'S' then 'Subjective' when 'O' then 'Objective' when 'A' then 'Assessment' else 'Plan' end,
    now(), now(), jsonb_build_object('text', v_text), p_supersedes_id
  ) returning id into v_observation_id;
  return v_observation_id;
end;
$$;

create or replace function public.issue_prescription(
  p_encounter_id uuid,
  p_medication text,
  p_dosage text,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_encounter public.encounters%rowtype;
  v_practitioner_id uuid;
  v_request_id uuid;
begin
  select * into v_encounter from public.encounters where id = p_encounter_id for update;
  if not found or v_encounter.status <> 'in_progress' then
    raise exception 'An in-progress encounter is required.' using errcode = '22023';
  end if;
  v_practitioner_id := public.get_current_practitioner(v_encounter.organization_id, array['doctor', 'specialist']);
  if v_practitioner_id is null then
    raise exception 'Only a doctor may prescribe medication.' using errcode = '42501';
  end if;
  if p_medication is null or p_dosage is null
    or length(btrim(p_medication)) < 2 or length(btrim(p_medication)) > 240
    or length(btrim(p_dosage)) < 2 or length(btrim(p_dosage)) > 1000 then
    raise exception 'Medication and dosage are required.' using errcode = '22023';
  end if;
  insert into public.medication_requests (
    organization_id, patient_id, encounter_id, requester_practitioner_id,
    status, medication_code, medication_display, dosage_instruction, note
  ) values (
    v_encounter.organization_id, v_encounter.patient_id, v_encounter.id, v_practitioner_id,
    'active', lower(regexp_replace(btrim(p_medication), '[^a-zA-Z0-9]+', '-', 'g')),
    btrim(p_medication), jsonb_build_array(jsonb_build_object('text', btrim(p_dosage))), nullif(btrim(p_note), '')
  ) returning id into v_request_id;
  return v_request_id;
end;
$$;

create or replace function public.issue_medical_certificate(
  p_encounter_id uuid,
  p_title text,
  p_statement text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_encounter public.encounters%rowtype;
  v_practitioner_id uuid;
  v_document_id uuid := gen_random_uuid();
begin
  select * into v_encounter from public.encounters where id = p_encounter_id for update;
  if not found or v_encounter.status <> 'in_progress' then
    raise exception 'An in-progress encounter is required.' using errcode = '22023';
  end if;
  v_practitioner_id := public.get_current_practitioner(v_encounter.organization_id, array['doctor', 'specialist']);
  if v_practitioner_id is null then
    raise exception 'Only a doctor may issue a medical certificate.' using errcode = '42501';
  end if;
  if p_title is null or p_statement is null
    or length(btrim(p_title)) < 2 or length(btrim(p_title)) > 200
    or length(btrim(p_statement)) < 2 or length(btrim(p_statement)) > 5000 then
    raise exception 'Certificate title and statement are required.' using errcode = '22023';
  end if;
  insert into public.document_references (
    id, organization_id, patient_id, encounter_id, author_practitioner_id,
    status, doc_status, type_code, type_display, category_codes, description,
    content_url, content_type, content_title
  ) values (
    v_document_id, v_encounter.organization_id, v_encounter.patient_id, v_encounter.id, v_practitioner_id,
    'current', 'final', 'medical-certificate', 'Medical certificate',
    '[{"coding":[{"code":"medical-certificate"}]}]'::jsonb, btrim(p_statement),
    'urn:odyssey:document:' || v_document_id::text, 'text/plain', btrim(p_title)
  );
  return v_document_id;
end;
$$;

create or replace function public.finish_clinical_encounter(p_encounter_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_encounter public.encounters%rowtype;
begin
  select * into v_encounter from public.encounters where id = p_encounter_id for update;
  if not found or v_encounter.status <> 'in_progress' then
    raise exception 'An in-progress encounter is required.' using errcode = '22023';
  end if;
  if public.get_current_practitioner(v_encounter.organization_id, array['doctor', 'specialist']) is null then
    raise exception 'Only a doctor may complete an encounter.' using errcode = '42501';
  end if;
  update public.encounters set status = 'finished', period_end = now() where id = v_encounter.id;
  update public.appointments set status = 'fulfilled' where id = v_encounter.appointment_id;
end;
$$;

-- Patient self-service is deliberately narrower than direct table updates.
create or replace function public.update_own_patient_profile(
  p_patient_id uuid,
  p_display_name text,
  p_birth_date date,
  p_gender text,
  p_phone text,
  p_address text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.patients where id = p_patient_id;
  if v_org is null or not public.is_patient_self(p_patient_id, v_org) then
    raise exception 'The patient profile is not accessible.' using errcode = '42501';
  end if;
  if p_display_name is null or length(btrim(p_display_name)) < 2 or length(btrim(p_display_name)) > 120
    or (p_gender is not null and p_gender not in ('female', 'male', 'other', 'unknown'))
    or length(coalesce(p_phone, '')) > 40 or length(coalesce(p_address, '')) > 500 then
    raise exception 'Profile values are invalid.' using errcode = '22023';
  end if;
  update public.patients set
    name = jsonb_build_object('text', btrim(p_display_name)),
    birth_date = p_birth_date,
    gender = nullif(p_gender, ''),
    telecom = case when nullif(btrim(p_phone), '') is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('system', 'phone', 'value', btrim(p_phone))) end,
    address = case when nullif(btrim(p_address), '') is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('text', btrim(p_address))) end
  where id = p_patient_id;
end;
$$;

-- Nurse access is part of the provider clinical-documentation workspace.
create or replace function public.get_portal_access(p_portal text)
returns table (is_allowed boolean, is_superadmin boolean, organization_ids uuid[], role_codes text[])
language plpgsql stable security definer set search_path = public, auth
as $$
declare v_organizations uuid[] := '{}'::uuid[]; v_roles text[] := '{}'::text[]; v_superadmin boolean := public.is_superadmin();
begin
  if p_portal not in ('patient', 'provider', 'admin') then raise exception 'Unsupported portal.' using errcode = '22023'; end if;
  if p_portal = 'patient' then return query select not v_superadmin and not public.is_active_staff(), false, v_organizations, v_roles; return; end if;
  if p_portal = 'provider' then
    select coalesce(array_agg(distinct pr.organization_id), '{}'::uuid[]), coalesce(array_agg(distinct pr.role_code), '{}'::text[])
    into v_organizations, v_roles from public.practitioner_roles pr join public.practitioners p on p.id = pr.practitioner_id
    where p.auth_user_id = auth.uid() and p.active and pr.active and pr.role_code in ('doctor', 'nurse', 'specialist');
    return query select cardinality(v_organizations) > 0, false, v_organizations, v_roles; return;
  end if;
  if v_superadmin then return query select true, true, v_organizations, array['superadmin']::text[]; return; end if;
  select coalesce(array_agg(distinct a.organization_id), '{}'::uuid[]), coalesce(array_agg(distinct a.role_code), '{}'::text[])
  into v_organizations, v_roles from (
    select pr.organization_id, pr.role_code from public.practitioner_roles pr join public.practitioners p on p.id = pr.practitioner_id
      where p.auth_user_id = auth.uid() and p.active and pr.active and pr.role_code in ('front_desk', 'admin', 'owner')
    union select ur.organization_id, r.name from public.user_roles ur join public.roles r on r.id = ur.role_id
      where ur.user_id = auth.uid() and r.name in ('admin', 'owner')
  ) a;
  return query select cardinality(v_organizations) > 0, false, v_organizations, v_roles;
end;
$$;

revoke all on function public.get_current_practitioner(uuid, text[]) from public;
revoke all on function public.add_soap_observation(uuid, text, text, uuid) from public;
revoke all on function public.issue_prescription(uuid, text, text, text) from public;
revoke all on function public.issue_medical_certificate(uuid, text, text) from public;
revoke all on function public.finish_clinical_encounter(uuid) from public;
revoke all on function public.update_own_patient_profile(uuid, text, date, text, text, text) from public;
grant execute on function public.add_soap_observation(uuid, text, text, uuid) to authenticated;
grant execute on function public.issue_prescription(uuid, text, text, text) to authenticated;
grant execute on function public.issue_medical_certificate(uuid, text, text) to authenticated;
grant execute on function public.finish_clinical_encounter(uuid) to authenticated;
grant execute on function public.update_own_patient_profile(uuid, text, date, text, text, text) to authenticated;

-- Clinical writes are RPC-only. This prevents a browser from choosing a
-- different patient, author, tenant, or role while retaining RLS for reads.
revoke insert, update, delete on public.observations from authenticated;
revoke insert, update, delete on public.medication_requests from authenticated;
revoke insert, update, delete on public.document_references from authenticated;
revoke insert, update, delete on public.encounters from authenticated;
revoke update on public.patients from authenticated;

alter table public.observations replica identity full;
alter table public.medication_requests replica identity full;
alter table public.document_references replica identity full;
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='observations') then alter publication supabase_realtime add table public.observations; end if;
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='medication_requests') then alter publication supabase_realtime add table public.medication_requests; end if;
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='document_references') then alter publication supabase_realtime add table public.document_references; end if;
  end if;
end $$;

comment on function public.add_soap_observation(uuid, text, text, uuid) is 'Creates an immutable, version-linked FHIR Observation for one SOAP section.';
comment on function public.issue_prescription(uuid, text, text, text) is 'Creates a doctor-authored FHIR MedicationRequest for an in-progress Encounter.';
comment on function public.issue_medical_certificate(uuid, text, text) is 'Creates a doctor-authored FHIR DocumentReference for an in-progress Encounter.';
