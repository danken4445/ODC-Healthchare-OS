-- Provider-owned clinical document templates. This evolves the existing
-- organization-scoped document_templates registry rather than creating a
-- parallel template system.

alter table public.document_templates
  add column if not exists owner_doctor_id uuid references public.practitioners(id),
  add column if not exists condition_system text,
  add column if not exists condition_code text,
  add column if not exists condition_display text,
  add column if not exists structured_body jsonb not null default '{"html":"","medications":[]}'::jsonb,
  add column if not exists is_default boolean not null default false,
  add column if not exists status text not null default 'published';

alter table public.document_templates
  drop constraint if exists document_templates_status_check;
alter table public.document_templates
  add constraint document_templates_status_check
  check (status in ('draft', 'published', 'archived'));

alter table public.document_templates
  drop constraint if exists document_templates_condition_code_pair_check;
alter table public.document_templates
  add constraint document_templates_condition_code_pair_check
  check ((condition_system is null and condition_code is null) or (condition_system is not null and condition_code is not null));

update public.document_templates
set structured_body = jsonb_build_object('html', body, 'medications', '[]'::jsonb)
where structured_body = '{"html":"","medications":[]}'::jsonb
  and body is not null;

create index if not exists document_templates_provider_lookup_idx
  on public.document_templates (organization_id, category, status, owner_doctor_id, updated_at desc);
create unique index if not exists document_templates_one_default_condition_idx
  on public.document_templates (
    organization_id,
    category,
    coalesce(owner_doctor_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(condition_system, ''),
    coalesce(condition_code, ''),
    lower(coalesce(condition_display, ''))
  )
  where is_default and status = 'published';

create table if not exists public.document_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.document_templates(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  version integer not null check (version > 0),
  title text not null,
  type text not null check (type in ('medical_certificate', 'prescription')),
  condition_system text,
  condition_code text,
  condition_display text,
  structured_body jsonb not null,
  published_by uuid references auth.users(id),
  published_at timestamptz not null default now(),
  unique (template_id, version)
);

create index if not exists document_template_versions_lookup_idx
  on public.document_template_versions (organization_id, template_id, version desc);

insert into public.document_template_versions (
  template_id, organization_id, version, title, type, condition_system,
  condition_code, condition_display, structured_body, published_by, published_at
)
select id, organization_id, version, name, category, condition_system,
  condition_code, condition_display, structured_body, updated_by, updated_at
from public.document_templates
where category in ('medical_certificate', 'prescription')
  and status = 'published'
on conflict (template_id, version) do nothing;

alter table public.medication_requests
  add column if not exists template_id uuid references public.document_templates(id) on delete restrict,
  add column if not exists template_version integer;
alter table public.document_references
  add column if not exists template_id uuid references public.document_templates(id) on delete restrict,
  add column if not exists template_version integer;

alter table public.medication_requests
  drop constraint if exists medication_requests_template_reference_check;
alter table public.medication_requests
  add constraint medication_requests_template_reference_check
  check ((template_id is null and template_version is null) or (template_id is not null and template_version is not null and template_version > 0));
alter table public.document_references
  drop constraint if exists document_references_template_reference_check;
alter table public.document_references
  add constraint document_references_template_reference_check
  check ((template_id is null and template_version is null) or (template_id is not null and template_version is not null and template_version > 0));

-- Published clinic templates are readable by clinicians who may issue the
-- corresponding documents. Drafts and personal templates remain private to
-- their owning doctor unless the caller has template-management access.
drop policy if exists document_templates_select on public.document_templates;
create policy document_templates_select on public.document_templates
for select to authenticated using (
  public.has_organization_permission(organization_id, 'can_manage_document_templates')
  or (
    status = 'published'
    and category in ('medical_certificate', 'prescription')
    and public.has_organization_permission(organization_id, 'can_start_consultation')
    and (
      owner_doctor_id is null
      or exists (
        select 1 from public.practitioners practitioner
        where practitioner.id = owner_doctor_id
          and practitioner.organization_id = document_templates.organization_id
          and practitioner.auth_user_id = auth.uid()
          and practitioner.active
      )
    )
  )
);

alter table public.document_template_versions enable row level security;
drop policy if exists document_template_versions_select on public.document_template_versions;
create policy document_template_versions_select on public.document_template_versions
for select to authenticated using (
  public.has_organization_permission(organization_id, 'can_manage_document_templates')
  or (
    public.has_organization_permission(organization_id, 'can_start_consultation')
    and exists (
      select 1 from public.document_templates template
      where template.id = document_template_versions.template_id
    )
  )
);
revoke insert, update, delete on public.document_template_versions from authenticated, anon;

create or replace function public.get_encounter_template_context(p_encounter_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  encounter_row public.encounters%rowtype;
  patient_row public.patients%rowtype;
  practitioner_row public.practitioners%rowtype;
  organization_row public.organizations%rowtype;
  diagnosis_row jsonb := '{}'::jsonb;
  condition_row jsonb := '{}'::jsonb;
  coding_row jsonb := '{}'::jsonb;
  doctor_name text;
  clinic_address text;
begin
  select * into encounter_row from public.encounters where id = p_encounter_id;
  if encounter_row.id is null
    or not public.has_organization_permission(encounter_row.organization_id, 'can_start_consultation') then
    raise exception 'Consultation permission is required.' using errcode = '42501';
  end if;

  select practitioner.* into practitioner_row
  from public.practitioners practitioner
  join public.practitioner_roles role on role.practitioner_id = practitioner.id
  where practitioner.auth_user_id = auth.uid()
    and practitioner.organization_id = encounter_row.organization_id
    and practitioner.active and role.active
    and role.organization_id = encounter_row.organization_id
    and role.role_code in ('doctor', 'specialist')
  limit 1;
  if practitioner_row.id is null then
    raise exception 'Only a doctor may use clinical document templates.' using errcode = '42501';
  end if;

  select * into patient_row from public.patients where id = encounter_row.patient_id;
  select * into organization_row from public.organizations where id = encounter_row.organization_id;
  diagnosis_row := coalesce(encounter_row.diagnosis -> -1, '{}'::jsonb);
  condition_row := coalesce(diagnosis_row -> 'condition', '{}'::jsonb);
  coding_row := coalesce(condition_row -> 'coding' -> 0, '{}'::jsonb);
  doctor_name := coalesce(nullif(practitioner_row.name ->> 'text', ''), 'Assigned clinician');
  clinic_address := coalesce(
    nullif(organization_row.address -> 0 ->> 'text', ''),
    nullif(organization_row.address ->> 'text', ''),
    'Clinic address not recorded'
  );

  return jsonb_build_object(
    'values', jsonb_build_object(
      'patient.name', coalesce(nullif(patient_row.name ->> 'text', ''), 'Patient'),
      'patient.age', case when patient_row.birth_date is null then 'Not recorded' else extract(year from age(current_date, patient_row.birth_date))::text end,
      'patient.dob', coalesce(patient_row.birth_date::text, 'Not recorded'),
      'doctor.name', doctor_name,
      'doctor.license_no', coalesce(practitioner_row.identifier -> 0 ->> 'value', ''),
      'doctor.prc_no', coalesce(practitioner_row.identifier -> 1 ->> 'value', ''),
      'clinic.name', organization_row.name,
      'clinic.address', clinic_address,
      'encounter.date', coalesce(encounter_row.period_start::date::text, current_date::text),
      'diagnosis.summary', coalesce(nullif(condition_row ->> 'text', ''), 'Diagnosis not recorded'),
      'rest_days', '',
      'medication.name', '',
      'medication.dosage', '',
      'medication.directions', ''
    ),
    'diagnosisSystem', nullif(coding_row ->> 'system', ''),
    'diagnosisCode', nullif(coding_row ->> 'code', ''),
    'diagnosisDisplay', coalesce(nullif(coding_row ->> 'display', ''), nullif(condition_row ->> 'text', ''))
  );
end;
$$;

create or replace function public.save_clinical_document_template(
  p_organization_id uuid,
  p_template_id uuid,
  p_type text,
  p_title text,
  p_scope text,
  p_condition_system text,
  p_condition_code text,
  p_condition_display text,
  p_structured_body jsonb,
  p_is_default boolean,
  p_status text
) returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_doctor_id uuid;
  existing_template public.document_templates%rowtype;
  saved_id uuid;
  next_version integer;
  normalized_title text := btrim(p_title);
  normalized_system text := nullif(btrim(p_condition_system), '');
  normalized_code text := nullif(btrim(p_condition_code), '');
  normalized_display text := nullif(btrim(p_condition_display), '');
  normalized_html text := coalesce(p_structured_body ->> 'html', '');
  saved_owner uuid;
begin
  if not public.has_organization_permission(p_organization_id, 'can_manage_document_templates') then
    raise exception 'Template management permission is required.' using errcode = '42501';
  end if;
  if p_type not in ('medical_certificate', 'prescription')
    or p_scope not in ('personal', 'clinic_shared')
    or p_status not in ('draft', 'published')
    or length(normalized_title) not between 2 and 120
    or length(normalized_html) not between 1 and 20000
    or jsonb_typeof(p_structured_body) <> 'object'
    or ((normalized_system is null) <> (normalized_code is null))
    or (normalized_display is not null and length(normalized_display) > 240) then
    raise exception 'Template details are invalid.' using errcode = '22023';
  end if;

  select practitioner.id into current_doctor_id
  from public.practitioners practitioner
  join public.practitioner_roles role on role.practitioner_id = practitioner.id
  where practitioner.auth_user_id = auth.uid()
    and practitioner.organization_id = p_organization_id
    and practitioner.active and role.active
    and role.organization_id = p_organization_id
    and role.role_code in ('doctor', 'specialist')
  limit 1;
  if current_doctor_id is null then
    raise exception 'Only an active doctor may manage clinical templates.' using errcode = '42501';
  end if;

  if p_template_id is not null then
    select * into existing_template from public.document_templates
    where id = p_template_id and organization_id = p_organization_id
    for update;
    if existing_template.id is null then
      raise exception 'Template not found.' using errcode = 'P0002';
    end if;
    if existing_template.owner_doctor_id is not null and existing_template.owner_doctor_id <> current_doctor_id then
      raise exception 'Personal templates may only be changed by their owner.' using errcode = '42501';
    end if;
  end if;

  saved_owner := case when p_scope = 'personal' then current_doctor_id else null end;
  if p_is_default and p_status = 'published' then
    update public.document_templates
    set is_default = false
    where organization_id = p_organization_id
      and category = p_type
      and owner_doctor_id is not distinct from saved_owner
      and condition_system is not distinct from normalized_system
      and condition_code is not distinct from normalized_code
      and condition_display is not distinct from normalized_display;
  end if;

  if p_template_id is null then
    insert into public.document_templates (
      organization_id, code, name, category, description, body, structured_body,
      owner_doctor_id, condition_system, condition_code, condition_display,
      is_default, status, active, created_by, updated_by
    ) values (
      p_organization_id, public.system_generated_code('TPL'), normalized_title, p_type,
      normalized_display, normalized_html, p_structured_body, saved_owner,
      normalized_system, normalized_code, normalized_display,
      p_is_default and p_status = 'published', p_status, p_status = 'published', auth.uid(), auth.uid()
    ) returning id, version into saved_id, next_version;
  else
    update public.document_templates set
      name = normalized_title,
      category = p_type,
      description = normalized_display,
      body = normalized_html,
      structured_body = p_structured_body,
      owner_doctor_id = saved_owner,
      condition_system = normalized_system,
      condition_code = normalized_code,
      condition_display = normalized_display,
      is_default = p_is_default and p_status = 'published',
      status = p_status,
      active = p_status = 'published',
      version = version + 1,
      updated_by = auth.uid()
    where id = p_template_id and organization_id = p_organization_id
    returning id, version into saved_id, next_version;
  end if;

  if p_status = 'published' then
    insert into public.document_template_versions (
      template_id, organization_id, version, title, type, condition_system,
      condition_code, condition_display, structured_body, published_by
    ) values (
      saved_id, p_organization_id, next_version, normalized_title, p_type,
      normalized_system, normalized_code, normalized_display, p_structured_body, auth.uid()
    ) on conflict (template_id, version) do nothing;
  end if;
  return saved_id;
end;
$$;

create or replace function public.archive_clinical_document_template(
  p_organization_id uuid,
  p_template_id uuid
) returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare current_doctor_id uuid;
begin
  if not public.has_organization_permission(p_organization_id, 'can_manage_document_templates') then
    raise exception 'Template management permission is required.' using errcode = '42501';
  end if;
  select practitioner.id into current_doctor_id from public.practitioners practitioner
  where practitioner.auth_user_id = auth.uid() and practitioner.organization_id = p_organization_id and practitioner.active
  limit 1;
  update public.document_templates set status = 'archived', active = false, is_default = false,
    version = version + 1, updated_by = auth.uid()
  where id = p_template_id and organization_id = p_organization_id
    and (owner_doctor_id is null or owner_doctor_id = current_doctor_id);
  if not found then raise exception 'Template not found or not owned by this doctor.' using errcode = '42501'; end if;
end;
$$;

-- Keep the existing admin CMS mutation compatible with the richer storage so
-- clinic-level templates created there remain selectable in provider workflows.
create or replace function public.save_document_template(
  p_organization_id uuid, p_template_id uuid, p_name text, p_category text,
  p_description text, p_body text, p_active boolean
) returns uuid language plpgsql security definer set search_path = public, auth as $$
declare saved_id uuid; saved_version integer; content jsonb := jsonb_build_object('html', p_body, 'medications', '[]'::jsonb);
begin
  if not public.has_organization_permission(p_organization_id, 'can_manage_document_templates') then raise exception 'Template management permission is required.' using errcode = '42501'; end if;
  if p_template_id is null then
    insert into public.document_templates (organization_id, code, name, category, description, body, structured_body, active, status, created_by, updated_by)
    values (p_organization_id, public.system_generated_code('TPL'), btrim(p_name), p_category, nullif(btrim(p_description), ''), p_body, content, coalesce(p_active, true), case when coalesce(p_active, true) then 'published' else 'draft' end, auth.uid(), auth.uid())
    returning id, version into saved_id, saved_version;
  else
    update public.document_templates set name = btrim(p_name), category = p_category, description = nullif(btrim(p_description), ''), body = p_body,
      structured_body = content, active = coalesce(p_active, true), status = case when coalesce(p_active, true) then 'published' else 'draft' end,
      version = version + 1, updated_by = auth.uid()
    where id = p_template_id and organization_id = p_organization_id
    returning id, version into saved_id, saved_version;
    if saved_id is null then raise exception 'Document template not found.' using errcode = 'P0002'; end if;
  end if;
  if p_category in ('medical_certificate', 'prescription') and coalesce(p_active, true) then
    insert into public.document_template_versions (template_id, organization_id, version, title, type, structured_body, published_by)
    values (saved_id, p_organization_id, saved_version, btrim(p_name), p_category, content, auth.uid())
    on conflict (template_id, version) do nothing;
  end if;
  return saved_id;
end;
$$;

drop function if exists public.issue_prescription(uuid, text, text, text);
create function public.issue_prescription(
  p_encounter_id uuid,
  p_medication text,
  p_dosage text,
  p_note text default null,
  p_template_id uuid default null,
  p_template_version integer default null
) returns uuid
language plpgsql security definer set search_path = public, auth
as $$
declare
  v_encounter public.encounters%rowtype;
  v_practitioner_id uuid;
  v_request_id uuid;
begin
  select * into v_encounter from public.encounters where id = p_encounter_id for update;
  if not found or v_encounter.status <> 'in_progress' then raise exception 'An in-progress encounter is required.' using errcode = '22023'; end if;
  v_practitioner_id := public.get_current_practitioner(v_encounter.organization_id, array['doctor', 'specialist']);
  if v_practitioner_id is null then raise exception 'Only a doctor may prescribe medication.' using errcode = '42501'; end if;
  if p_medication is null or p_dosage is null or length(btrim(p_medication)) not between 2 and 240 or length(btrim(p_dosage)) not between 2 and 1000 then raise exception 'Medication and dosage are required.' using errcode = '22023'; end if;
  if (p_template_id is null) <> (p_template_version is null) then raise exception 'Template id and version must be supplied together.' using errcode = '22023'; end if;
  if p_template_id is not null and not exists (
    select 1 from public.document_templates template
    join public.document_template_versions version_row on version_row.template_id = template.id and version_row.version = p_template_version
    where template.id = p_template_id and template.organization_id = v_encounter.organization_id
      and template.category = 'prescription' and template.status = 'published'
      and (template.owner_doctor_id is null or template.owner_doctor_id = v_practitioner_id)
  ) then raise exception 'The selected prescription template version is unavailable.' using errcode = '42501'; end if;
  insert into public.medication_requests (organization_id, patient_id, encounter_id, requester_practitioner_id, status, medication_code, medication_display, dosage_instruction, note, template_id, template_version)
  values (v_encounter.organization_id, v_encounter.patient_id, v_encounter.id, v_practitioner_id, 'active', lower(regexp_replace(btrim(p_medication), '[^a-zA-Z0-9]+', '-', 'g')), btrim(p_medication), jsonb_build_array(jsonb_build_object('text', btrim(p_dosage))), nullif(btrim(p_note), ''), p_template_id, p_template_version)
  returning id into v_request_id;
  return v_request_id;
end;
$$;

create function public.issue_prescription_regimen(
  p_encounter_id uuid,
  p_medications jsonb,
  p_template_id uuid default null,
  p_template_version integer default null
) returns uuid[]
language plpgsql security definer set search_path = public, auth
as $$
declare medication_row jsonb; issued_ids uuid[] := '{}'::uuid[]; issued_id uuid;
begin
  if jsonb_typeof(p_medications) <> 'array' or jsonb_array_length(p_medications) not between 1 and 20 then
    raise exception 'A regimen must contain between one and twenty medications.' using errcode = '22023';
  end if;
  for medication_row in select value from jsonb_array_elements(p_medications) loop
    issued_id := public.issue_prescription(
      p_encounter_id,
      medication_row ->> 'medication',
      medication_row ->> 'dosage',
      nullif(medication_row ->> 'note', ''),
      p_template_id,
      p_template_version
    );
    issued_ids := array_append(issued_ids, issued_id);
  end loop;
  return issued_ids;
end;
$$;

drop function if exists public.issue_medical_certificate(uuid, text, text);
create function public.issue_medical_certificate(
  p_encounter_id uuid,
  p_title text,
  p_statement text,
  p_template_id uuid default null,
  p_template_version integer default null
) returns uuid
language plpgsql security definer set search_path = public, auth
as $$
declare v_encounter public.encounters%rowtype; v_practitioner_id uuid; v_document_id uuid := gen_random_uuid();
begin
  select * into v_encounter from public.encounters where id = p_encounter_id for update;
  if not found or v_encounter.status <> 'in_progress' then raise exception 'An in-progress encounter is required.' using errcode = '22023'; end if;
  v_practitioner_id := public.get_current_practitioner(v_encounter.organization_id, array['doctor', 'specialist']);
  if v_practitioner_id is null then raise exception 'Only a doctor may issue a medical certificate.' using errcode = '42501'; end if;
  if p_title is null or p_statement is null or length(btrim(p_title)) not between 2 and 200 or length(btrim(p_statement)) not between 2 and 5000 then raise exception 'Certificate title and statement are required.' using errcode = '22023'; end if;
  if (p_template_id is null) <> (p_template_version is null) then raise exception 'Template id and version must be supplied together.' using errcode = '22023'; end if;
  if p_template_id is not null and not exists (
    select 1 from public.document_templates template join public.document_template_versions version_row on version_row.template_id = template.id and version_row.version = p_template_version
    where template.id = p_template_id and template.organization_id = v_encounter.organization_id and template.category = 'medical_certificate' and template.status = 'published'
      and (template.owner_doctor_id is null or template.owner_doctor_id = v_practitioner_id)
  ) then raise exception 'The selected certificate template version is unavailable.' using errcode = '42501'; end if;
  insert into public.document_references (id, organization_id, patient_id, encounter_id, author_practitioner_id, status, doc_status, type_code, type_display, category_codes, description, content_url, content_type, content_title, template_id, template_version)
  values (v_document_id, v_encounter.organization_id, v_encounter.patient_id, v_encounter.id, v_practitioner_id, 'current', 'final', 'medical-certificate', 'Medical certificate', '[{"coding":[{"code":"medical-certificate"}]}]'::jsonb, btrim(p_statement), 'urn:odyssey:document:' || v_document_id::text, 'text/plain', btrim(p_title), p_template_id, p_template_version);
  return v_document_id;
end;
$$;

revoke all on function public.get_encounter_template_context(uuid) from public, anon;
revoke all on function public.save_clinical_document_template(uuid, uuid, text, text, text, text, text, text, jsonb, boolean, text) from public, anon;
revoke all on function public.archive_clinical_document_template(uuid, uuid) from public, anon;
revoke all on function public.issue_prescription(uuid, text, text, text, uuid, integer) from public, anon;
revoke all on function public.issue_prescription_regimen(uuid, jsonb, uuid, integer) from public, anon;
revoke all on function public.issue_medical_certificate(uuid, text, text, uuid, integer) from public, anon;
grant execute on function public.get_encounter_template_context(uuid) to authenticated;
grant execute on function public.save_clinical_document_template(uuid, uuid, text, text, text, text, text, text, jsonb, boolean, text) to authenticated;
grant execute on function public.archive_clinical_document_template(uuid, uuid) to authenticated;
grant execute on function public.issue_prescription(uuid, text, text, text, uuid, integer) to authenticated;
grant execute on function public.issue_prescription_regimen(uuid, jsonb, uuid, integer) to authenticated;
grant execute on function public.issue_medical_certificate(uuid, text, text, uuid, integer) to authenticated;

comment on table public.document_template_versions is 'Immutable published template snapshots retained for issued clinical document auditability.';
