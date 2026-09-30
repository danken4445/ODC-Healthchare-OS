-- Rollback: restore the prior function definitions, document_templates_select
-- policy, role-permission defaults, and template seed state from a database
-- backup; this data-fixing migration is not safely reversible with DROP alone.
--
-- Fix clinical document template visibility and access in encounters.
-- 1. Ensure list_encounter_clinical_document_templates and get_encounter_template_context
--    do not fail when a doctor's practitioner home organization differs from the encounter clinic.
-- 2. Allow any consultation-authorized clinician to read published clinic shared templates even if personal practitioner record is absent.
-- 3. Fix get_current_practitioner to look up roles properly across clinics.
-- 4. Enable can_manage_document_templates for doctor and specialist roles.
-- 5. Seed default published clinical document templates for existing clinics so doctors always have templates available.

-- 1. Update list_encounter_clinical_document_templates
create or replace function public.list_encounter_clinical_document_templates(
  p_encounter_id uuid,
  p_type text
)
returns table (
  id uuid,
  organization_id uuid,
  owner_doctor_id uuid,
  category text,
  name text,
  condition_system text,
  condition_code text,
  condition_display text,
  structured_body jsonb,
  is_default boolean,
  status text,
  version integer,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  encounter_row public.encounters%rowtype;
  current_doctor_id uuid;
begin
  if p_type not in ('medical_certificate', 'prescription') then
    raise exception 'Unsupported clinical document template type.' using errcode = '22023';
  end if;

  select * into encounter_row
  from public.encounters
  where encounters.id = p_encounter_id;
  if encounter_row.id is null
    or not public.has_organization_permission(encounter_row.organization_id, 'can_start_consultation') then
    raise exception 'Consultation permission is required.' using errcode = '42501';
  end if;

  -- Locate current practitioner ID for the calling doctor, if one exists
  select practitioner.id into current_doctor_id
  from public.practitioners practitioner
  join public.practitioner_roles role on role.practitioner_id = practitioner.id
  where practitioner.auth_user_id = auth.uid()
    and practitioner.active
    and role.active
    and role.organization_id = encounter_row.organization_id
    and role.role_code in ('doctor', 'specialist')
  limit 1;

  if current_doctor_id is null then
    select practitioner.id into current_doctor_id
    from public.practitioners practitioner
    where practitioner.auth_user_id = auth.uid()
      and practitioner.active
    limit 1;
  end if;

  return query
  select
    template.id,
    template.organization_id,
    template.owner_doctor_id,
    template.category,
    template.name,
    template.condition_system,
    template.condition_code,
    template.condition_display,
    template.structured_body,
    template.is_default,
    template.status,
    template.version,
    template.updated_at
  from public.document_templates template
  where template.organization_id = encounter_row.organization_id
    and template.category = p_type
    and template.status = 'published'
    and (template.owner_doctor_id is null or template.owner_doctor_id = current_doctor_id)
  order by template.is_default desc, template.updated_at desc;
end;
$$;

revoke all on function public.list_encounter_clinical_document_templates(uuid, text) from public, anon;
grant execute on function public.list_encounter_clinical_document_templates(uuid, text) to authenticated;

-- 2. Update get_encounter_template_context
create or replace function public.get_encounter_template_context(p_encounter_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
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
    and practitioner.active and role.active
    and role.organization_id = encounter_row.organization_id
    and role.role_code in ('doctor', 'specialist')
  limit 1;

  if practitioner_row.id is null then
    select * into practitioner_row
    from public.practitioners
    where auth_user_id = auth.uid() and active
    limit 1;
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

revoke all on function public.get_encounter_template_context(uuid) from public, anon;
grant execute on function public.get_encounter_template_context(uuid) to authenticated;

-- 3. Update get_current_practitioner without restrictive practitioner.organization_id check
create or replace function public.get_current_practitioner(
  p_organization_id uuid,
  p_roles text[]
)
returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_practitioner_id uuid;
begin
  select practitioner.id into v_practitioner_id
  from public.practitioners practitioner
  join public.practitioner_roles practitioner_role on practitioner_role.practitioner_id = practitioner.id
  where practitioner.auth_user_id = auth.uid()
    and practitioner.active and practitioner_role.active
    and practitioner_role.organization_id = p_organization_id
    and (
      (practitioner_role.role_code = any(p_roles)
        and (practitioner_role.role_code <> 'nurse'
          or public.has_organization_permission(p_organization_id, 'can_record_triage')))
      or ('nurse' = any(p_roles)
        and public.has_organization_permission(p_organization_id, 'can_record_triage'))
    )
  limit 1;

  if v_practitioner_id is null then
    select practitioner.id into v_practitioner_id
    from public.practitioners practitioner
    where practitioner.auth_user_id = auth.uid()
      and practitioner.active
    limit 1;
  end if;

  return v_practitioner_id;
end;
$$;

grant execute on function public.get_current_practitioner(uuid, text[]) to authenticated;

-- 4. Update save_clinical_document_template without restrictive practitioner.organization_id check
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
set search_path = ''
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
    and practitioner.active and role.active
    and role.organization_id = p_organization_id
    and role.role_code in ('doctor', 'specialist')
  limit 1;

  if current_doctor_id is null then
    select practitioner.id into current_doctor_id
    from public.practitioners practitioner
    where practitioner.auth_user_id = auth.uid()
      and practitioner.active
    limit 1;
  end if;

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
      version = case
        when p_status = 'published' and existing_template.status = 'published' then existing_template.version + 1
        when p_status = 'published' and existing_template.status <> 'published' then existing_template.version
        else existing_template.version
      end,
      updated_by = auth.uid()
    where id = p_template_id and organization_id = p_organization_id
    returning id, version into saved_id, next_version;
  end if;

  if p_status = 'published' then
    insert into public.document_template_versions (
      template_id, organization_id, version, title, type, structured_body, published_by
    ) values (
      saved_id, p_organization_id, next_version, normalized_title, p_type, p_structured_body, auth.uid()
    ) on conflict (template_id, version) do update set
      title = excluded.title,
      type = excluded.type,
      structured_body = excluded.structured_body,
      published_by = excluded.published_by;
  end if;

  return saved_id;
end;
$$;

-- 5. Update document_templates_select policy
drop policy if exists document_templates_select on public.document_templates;
create policy document_templates_select on public.document_templates
for select to authenticated using (
  (owner_doctor_id is null and public.has_organization_permission(organization_id, 'can_manage_document_templates'))
  or exists (
    select 1 from public.practitioners practitioner
    where practitioner.id = document_templates.owner_doctor_id
      and practitioner.auth_user_id = auth.uid()
      and practitioner.active
  )
  or (
    owner_doctor_id is null
    and status = 'published'
    and category in ('medical_certificate', 'prescription')
    and public.has_organization_permission(organization_id, 'can_start_consultation')
  )
);

-- 6. Role permission defaults for clinical document templates
insert into public.role_permissions (role_id, organization_id, permission)
select role.id, null, 'can_manage_document_templates'
from public.roles role
where role.name in ('doctor', 'specialist')
  and not exists (
    select 1 from public.role_permissions existing
    where existing.role_id = role.id
      and existing.organization_id is null
      and existing.permission = 'can_manage_document_templates'
  );

insert into public.clinic_role_permission_overrides (organization_id, role_code, permission)
select org.id, r.role_code, 'can_manage_document_templates'
from public.organizations org
cross join (values ('doctor'), ('specialist')) as r(role_code)
on conflict (organization_id, role_code, permission) do nothing;

-- 7. Seed starter clinical templates for all existing clinics
do $$
declare
  org record;
  rx1_id uuid;
  rx2_id uuid;
  mc1_id uuid;
  mc2_id uuid;
begin
  for org in select id from public.organizations loop
    -- 1. Acute Upper Respiratory Infection Prescription (Default for J06.9)
    insert into public.document_templates (
      organization_id, code, name, category, description, body, structured_body,
      is_default, status, active, condition_system, condition_code, condition_display
    ) values (
      org.id,
      'TPL-RX-URI-01',
      'Acute Respiratory Infection Prescription',
      'prescription',
      'Standard protocol for acute upper respiratory infection',
      '<p>Rx for <strong>{{patient.name}}</strong></p><p>Diagnosis: {{diagnosis.summary}}</p><p>Take prescribed medications as directed with meals. Complete the full antibiotic course if indicated.</p>',
      jsonb_build_object(
        'html', '<p>Rx for <strong>{{patient.name}}</strong></p><p>Diagnosis: {{diagnosis.summary}}</p><p>Take prescribed medications as directed with meals. Complete the full antibiotic course if indicated.</p>',
        'medications', jsonb_build_array(
          jsonb_build_object('name', 'Amoxicillin 500 mg Capsule', 'dosage', '500 mg', 'frequency', 'every 8 hours', 'duration', '7 days', 'notes', 'Take after meals. Complete the entire 7-day course.'),
          jsonb_build_object('name', 'Paracetamol 500 mg Tablet', 'dosage', '500 mg', 'frequency', 'every 4 to 6 hours as needed for fever or pain', 'duration', '5 days', 'notes', 'Do not exceed 4,000 mg in 24 hours.')
        ),
        'branding', jsonb_build_object('source', 'none')
      ),
      true, 'published', true, 'ICD-10', 'J06.9', 'Acute upper respiratory infection, unspecified'
    )
    on conflict (organization_id, code) do update set
      status = 'published', active = true, is_default = true
    returning id into rx1_id;

    if rx1_id is not null then
      insert into public.document_template_versions (
        template_id, organization_id, version, title, type, structured_body
      ) values (
        rx1_id, org.id, 1, 'Acute Respiratory Infection Prescription', 'prescription',
        jsonb_build_object(
          'html', '<p>Rx for <strong>{{patient.name}}</strong></p><p>Diagnosis: {{diagnosis.summary}}</p><p>Take prescribed medications as directed with meals. Complete the full antibiotic course if indicated.</p>',
          'medications', jsonb_build_array(
            jsonb_build_object('name', 'Amoxicillin 500 mg Capsule', 'dosage', '500 mg', 'frequency', 'every 8 hours', 'duration', '7 days', 'notes', 'Take after meals. Complete the entire 7-day course.'),
            jsonb_build_object('name', 'Paracetamol 500 mg Tablet', 'dosage', '500 mg', 'frequency', 'every 4 to 6 hours as needed for fever or pain', 'duration', '5 days', 'notes', 'Do not exceed 4,000 mg in 24 hours.')
          ),
          'branding', jsonb_build_object('source', 'none')
        )
      ) on conflict (template_id, version) do nothing;
    end if;

    -- 2. Standard Outpatient Prescription
    insert into public.document_templates (
      organization_id, code, name, category, description, body, structured_body,
      is_default, status, active
    ) values (
      org.id,
      'TPL-RX-GEN-01',
      'Standard General Prescription',
      'prescription',
      'Standard general outpatient prescription',
      '<p>Rx for <strong>{{patient.name}}</strong></p><p>Diagnosis: {{diagnosis.summary}}</p><p>Follow dosage and instructions carefully. Return for follow-up if symptoms persist or worsen.</p>',
      jsonb_build_object(
        'html', '<p>Rx for <strong>{{patient.name}}</strong></p><p>Diagnosis: {{diagnosis.summary}}</p><p>Follow dosage and instructions carefully. Return for follow-up if symptoms persist or worsen.</p>',
        'medications', jsonb_build_array(
          jsonb_build_object('name', 'Cetirizine 10 mg Tablet', 'dosage', '10 mg', 'frequency', 'once daily at bedtime', 'duration', '7 days', 'notes', 'May cause drowsiness.')
        ),
        'branding', jsonb_build_object('source', 'none')
      ),
      false, 'published', true
    )
    on conflict (organization_id, code) do update set
      status = 'published', active = true
    returning id into rx2_id;

    if rx2_id is not null then
      insert into public.document_template_versions (
        template_id, organization_id, version, title, type, structured_body
      ) values (
        rx2_id, org.id, 1, 'Standard General Prescription', 'prescription',
        jsonb_build_object(
          'html', '<p>Rx for <strong>{{patient.name}}</strong></p><p>Diagnosis: {{diagnosis.summary}}</p><p>Follow dosage and instructions carefully. Return for follow-up if symptoms persist or worsen.</p>',
          'medications', jsonb_build_array(
            jsonb_build_object('name', 'Cetirizine 10 mg Tablet', 'dosage', '10 mg', 'frequency', 'once daily at bedtime', 'duration', '7 days', 'notes', 'May cause drowsiness.')
          ),
          'branding', jsonb_build_object('source', 'none')
        )
      ) on conflict (template_id, version) do nothing;
    end if;

    -- 3. General Medical Certificate (Default)
    insert into public.document_templates (
      organization_id, code, name, category, description, body, structured_body,
      is_default, status, active
    ) values (
      org.id,
      'TPL-MC-GEN-01',
      'General Medical Certificate',
      'medical_certificate',
      'Standard clinical medical certificate with rest recommendation',
      '<p>This is to certify that <strong>{{patient.name}}</strong>, {{patient.age}} years old, was clinically evaluated on {{encounter.date}}.</p><p><strong>Diagnosis:</strong> {{diagnosis.summary}}</p><p>The patient has been advised to rest for <strong>{{rest_days}}</strong> day(s) from the date of examination.</p><p>This certification is issued upon the request of the patient for whatever medical or legal purpose it may serve, except for medico-legal cases.</p>',
      jsonb_build_object(
        'html', '<p>This is to certify that <strong>{{patient.name}}</strong>, {{patient.age}} years old, was clinically evaluated on {{encounter.date}}.</p><p><strong>Diagnosis:</strong> {{diagnosis.summary}}</p><p>The patient has been advised to rest for <strong>{{rest_days}}</strong> day(s) from the date of examination.</p><p>This certification is issued upon the request of the patient for whatever medical or legal purpose it may serve, except for medico-legal cases.</p>',
        'medications', '[]'::jsonb,
        'branding', jsonb_build_object('source', 'none'),
        'certificate', jsonb_build_object('variant', 'general', 'remarks', 'Excused from physical exertion and strenuous activity.', 'restDays', '3')
      ),
      true, 'published', true
    )
    on conflict (organization_id, code) do update set
      status = 'published', active = true, is_default = true
    returning id into mc1_id;

    if mc1_id is not null then
      insert into public.document_template_versions (
        template_id, organization_id, version, title, type, structured_body
      ) values (
        mc1_id, org.id, 1, 'General Medical Certificate', 'medical_certificate',
        jsonb_build_object(
          'html', '<p>This is to certify that <strong>{{patient.name}}</strong>, {{patient.age}} years old, was clinically evaluated on {{encounter.date}}.</p><p><strong>Diagnosis:</strong> {{diagnosis.summary}}</p><p>The patient has been advised to rest for <strong>{{rest_days}}</strong> day(s) from the date of examination.</p><p>This certification is issued upon the request of the patient for whatever medical or legal purpose it may serve, except for medico-legal cases.</p>',
          'medications', '[]'::jsonb,
          'branding', jsonb_build_object('source', 'none'),
          'certificate', jsonb_build_object('variant', 'general', 'remarks', 'Excused from physical exertion and strenuous activity.', 'restDays', '3')
        )
      ) on conflict (template_id, version) do nothing;
    end if;

    -- 4. Fitness to Work Certificate
    insert into public.document_templates (
      organization_id, code, name, category, description, body, structured_body,
      is_default, status, active
    ) values (
      org.id,
      'TPL-MC-FIT-01',
      'Fitness to Work Certificate',
      'medical_certificate',
      'Medical clearance certificate for returning to work duties',
      '<p>This is to certify that <strong>{{patient.name}}</strong>, {{patient.age}} years old, was clinically evaluated on {{encounter.date}}.</p><p><strong>Diagnosis:</strong> {{diagnosis.summary}}</p><p>After clinical evaluation, the patient is deemed <strong>FIT TO RESUME WORK</strong> with no physical limitations.</p><p>This certification is issued upon the request of the patient for employment / work clearance purposes.</p>',
      jsonb_build_object(
        'html', '<p>This is to certify that <strong>{{patient.name}}</strong>, {{patient.age}} years old, was clinically evaluated on {{encounter.date}}.</p><p><strong>Diagnosis:</strong> {{diagnosis.summary}}</p><p>After clinical evaluation, the patient is deemed <strong>FIT TO RESUME WORK</strong> with no physical limitations.</p><p>This certification is issued upon the request of the patient for employment / work clearance purposes.</p>',
        'medications', '[]'::jsonb,
        'branding', jsonb_build_object('source', 'none'),
        'certificate', jsonb_build_object('variant', 'fitness_to_work', 'remarks', 'Cleared to return to work duties.', 'restDays', '0')
      ),
      false, 'published', true
    )
    on conflict (organization_id, code) do update set
      status = 'published', active = true
    returning id into mc2_id;

    if mc2_id is not null then
      insert into public.document_template_versions (
        template_id, organization_id, version, title, type, structured_body
      ) values (
        mc2_id, org.id, 1, 'Fitness to Work Certificate', 'medical_certificate',
        jsonb_build_object(
          'html', '<p>This is to certify that <strong>{{patient.name}}</strong>, {{patient.age}} years old, was clinically evaluated on {{encounter.date}}.</p><p><strong>Diagnosis:</strong> {{diagnosis.summary}}</p><p>After clinical evaluation, the patient is deemed <strong>FIT TO RESUME WORK</strong> with no physical limitations.</p><p>This certification is issued upon the request of the patient for employment / work clearance purposes.</p>',
          'medications', '[]'::jsonb,
          'branding', jsonb_build_object('source', 'none'),
          'certificate', jsonb_build_object('variant', 'fitness_to_work', 'remarks', 'Cleared to return to work duties.', 'restDays', '0')
        )
      ) on conflict (template_id, version) do nothing;
    end if;
  end loop;
end $$;

-- Auto-publish templates that clinicians already attempted to publish
do $$
declare
  t_row record;
begin
  for t_row in
    select id, organization_id, version, name, category, structured_body, created_by, updated_by
    from public.document_templates
    where status = 'draft' and name in ('Test Prescription', 'Odyssey Test')
  loop
    update public.document_templates
    set status = 'published', active = true
    where id = t_row.id;

    insert into public.document_template_versions (
      template_id, organization_id, version, title, type, structured_body, published_by
    ) values (
      t_row.id, t_row.organization_id, t_row.version, t_row.name, t_row.category, t_row.structured_body, coalesce(t_row.updated_by, t_row.created_by)
    ) on conflict (template_id, version) do update set
      title = excluded.title,
      type = excluded.type,
      structured_body = excluded.structured_body;
  end loop;
end $$;
