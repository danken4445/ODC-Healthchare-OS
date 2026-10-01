-- Rollback: restore public.issue_prescription(uuid, text, text, text, uuid,
-- integer), public.issue_medical_certificate(uuid, text, text, uuid, integer),
-- and public.finish_clinical_encounter(uuid) from migrations 20260930233000,
-- 20260930234000, and 20260930235000 respectively, then reapply the execute
-- grants below.
--
-- Loop A P8 hardening: the authenticated practitioner role must be the role
-- assigned to both the encounter and its organization-scoped appointment.
-- Coverage and reassignment exceptions are deliberately deferred to Loop E.

create or replace function public.issue_prescription(
  p_encounter_id uuid,
  p_medication text,
  p_dosage text,
  p_note text default null,
  p_template_id uuid default null,
  p_template_version integer default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_encounter public.encounters%rowtype;
  v_assigned_practitioner_role_id uuid;
  v_practitioner_id uuid;
  v_request_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select encounter.*
  into v_encounter
  from public.encounters encounter
  join public.appointments appointment
    on appointment.id = encounter.appointment_id
    and appointment.organization_id = encounter.organization_id
  where encounter.id = p_encounter_id
  for update of encounter, appointment;

  if not found or v_encounter.status <> 'in_progress' then
    raise exception 'An in-progress encounter is required.' using errcode = '22023';
  end if;

  select appointment.practitioner_role_id
  into v_assigned_practitioner_role_id
  from public.appointments appointment
  where appointment.id = v_encounter.appointment_id
    and appointment.organization_id = v_encounter.organization_id;

  if v_encounter.practitioner_role_id is null
    or v_encounter.practitioner_role_id <> v_assigned_practitioner_role_id then
    raise exception 'The encounter and appointment must have the same assigned practitioner role.'
      using errcode = '22023';
  end if;

  if not public.has_organization_permission(
    v_encounter.organization_id,
    'can_start_consultation'
  ) then
    raise exception 'Consultation permission is required to prescribe medication.'
      using errcode = '42501';
  end if;

  select practitioner.id
  into v_practitioner_id
  from public.practitioners practitioner
  join public.practitioner_roles practitioner_role
    on practitioner_role.practitioner_id = practitioner.id
  where practitioner.auth_user_id = auth.uid()
    and practitioner.active
    and practitioner_role.active
    and practitioner_role.organization_id = v_encounter.organization_id
    and practitioner_role.id = v_encounter.practitioner_role_id
  limit 1;

  if v_practitioner_id is null then
    raise exception 'Only the practitioner assigned to this encounter may prescribe medication.'
      using errcode = '42501';
  end if;

  if p_medication is null
    or p_dosage is null
    or length(btrim(p_medication)) not between 2 and 240
    or length(btrim(p_dosage)) not between 2 and 1000 then
    raise exception 'Medication and dosage are required.' using errcode = '22023';
  end if;

  if (p_template_id is null) <> (p_template_version is null) then
    raise exception 'Template id and version must be supplied together.'
      using errcode = '22023';
  end if;

  if p_template_id is not null and not exists (
    select 1
    from public.document_templates template
    join public.document_template_versions version_row
      on version_row.template_id = template.id
      and version_row.version = p_template_version
    where template.id = p_template_id
      and template.organization_id = v_encounter.organization_id
      and template.category = 'prescription'
      and template.status = 'published'
      and (
        template.owner_doctor_id is null
        or template.owner_doctor_id = v_practitioner_id
      )
  ) then
    raise exception 'The selected prescription template version is unavailable.'
      using errcode = '42501';
  end if;

  insert into public.medication_requests (
    organization_id,
    patient_id,
    encounter_id,
    requester_practitioner_id,
    status,
    medication_code,
    medication_display,
    dosage_instruction,
    note,
    template_id,
    template_version
  ) values (
    v_encounter.organization_id,
    v_encounter.patient_id,
    v_encounter.id,
    v_practitioner_id,
    'active',
    lower(regexp_replace(btrim(p_medication), '[^a-zA-Z0-9]+', '-', 'g')),
    btrim(p_medication),
    jsonb_build_array(jsonb_build_object('text', btrim(p_dosage))),
    nullif(btrim(p_note), ''),
    p_template_id,
    p_template_version
  )
  returning id into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.issue_prescription(
  uuid, text, text, text, uuid, integer
) from public, anon, authenticated;

grant execute on function public.issue_prescription(
  uuid, text, text, text, uuid, integer
) to authenticated;

comment on function public.issue_prescription(
  uuid, text, text, text, uuid, integer
) is 'Issues an organization-scoped prescription only for the practitioner assigned to the in-progress encounter.';

create or replace function public.issue_medical_certificate(
  p_encounter_id uuid,
  p_title text,
  p_statement text,
  p_template_id uuid default null,
  p_template_version integer default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_encounter public.encounters%rowtype;
  v_assigned_practitioner_role_id uuid;
  v_practitioner_id uuid;
  v_document_id uuid := gen_random_uuid();
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select encounter.*
  into v_encounter
  from public.encounters encounter
  join public.appointments appointment
    on appointment.id = encounter.appointment_id
    and appointment.organization_id = encounter.organization_id
  where encounter.id = p_encounter_id
  for update of encounter, appointment;

  if not found or v_encounter.status <> 'in_progress' then
    raise exception 'An in-progress encounter is required.' using errcode = '22023';
  end if;

  select appointment.practitioner_role_id
  into v_assigned_practitioner_role_id
  from public.appointments appointment
  where appointment.id = v_encounter.appointment_id
    and appointment.organization_id = v_encounter.organization_id;

  if v_encounter.practitioner_role_id is null
    or v_encounter.practitioner_role_id <> v_assigned_practitioner_role_id then
    raise exception 'The encounter and appointment must have the same assigned practitioner role.'
      using errcode = '22023';
  end if;

  if not public.has_organization_permission(
    v_encounter.organization_id,
    'can_start_consultation'
  ) then
    raise exception 'Consultation permission is required to issue a medical certificate.'
      using errcode = '42501';
  end if;

  select practitioner.id
  into v_practitioner_id
  from public.practitioners practitioner
  join public.practitioner_roles practitioner_role
    on practitioner_role.practitioner_id = practitioner.id
  where practitioner.auth_user_id = auth.uid()
    and practitioner.active
    and practitioner_role.active
    and practitioner_role.organization_id = v_encounter.organization_id
    and practitioner_role.id = v_encounter.practitioner_role_id
  limit 1;

  if v_practitioner_id is null then
    raise exception 'Only the practitioner assigned to this encounter may issue a medical certificate.'
      using errcode = '42501';
  end if;

  if p_title is null
    or p_statement is null
    or length(btrim(p_title)) not between 2 and 200
    or length(btrim(p_statement)) not between 2 and 5000 then
    raise exception 'Certificate title and statement are required.' using errcode = '22023';
  end if;

  if (p_template_id is null) <> (p_template_version is null) then
    raise exception 'Template id and version must be supplied together.'
      using errcode = '22023';
  end if;

  if p_template_id is not null and not exists (
    select 1
    from public.document_templates template
    join public.document_template_versions version_row
      on version_row.template_id = template.id
      and version_row.version = p_template_version
    where template.id = p_template_id
      and template.organization_id = v_encounter.organization_id
      and template.category = 'medical_certificate'
      and template.status = 'published'
      and (
        template.owner_doctor_id is null
        or template.owner_doctor_id = v_practitioner_id
      )
  ) then
    raise exception 'The selected certificate template version is unavailable.'
      using errcode = '42501';
  end if;

  insert into public.document_references (
    id,
    organization_id,
    patient_id,
    encounter_id,
    author_practitioner_id,
    status,
    doc_status,
    type_code,
    type_display,
    category_codes,
    description,
    content_url,
    content_type,
    content_title,
    template_id,
    template_version
  ) values (
    v_document_id,
    v_encounter.organization_id,
    v_encounter.patient_id,
    v_encounter.id,
    v_practitioner_id,
    'current',
    'final',
    'medical-certificate',
    'Medical certificate',
    '[{"coding":[{"code":"medical-certificate"}]}]'::jsonb,
    btrim(p_statement),
    'urn:odyssey:document:' || v_document_id::text,
    'text/plain',
    btrim(p_title),
    p_template_id,
    p_template_version
  );

  return v_document_id;
end;
$$;

revoke all on function public.issue_medical_certificate(
  uuid, text, text, uuid, integer
) from public, anon, authenticated;

grant execute on function public.issue_medical_certificate(
  uuid, text, text, uuid, integer
) to authenticated;

comment on function public.issue_medical_certificate(
  uuid, text, text, uuid, integer
) is 'Issues an organization-scoped medical certificate only for the practitioner assigned to the in-progress encounter.';

create or replace function public.finish_clinical_encounter(
  p_encounter_id uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_encounter public.encounters%rowtype;
  v_assigned_practitioner_role_id uuid;
  v_practitioner_id uuid;
  v_event_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select encounter.*
  into v_encounter
  from public.encounters encounter
  join public.appointments appointment
    on appointment.id = encounter.appointment_id
    and appointment.organization_id = encounter.organization_id
  where encounter.id = p_encounter_id
  for update of encounter, appointment;

  if not found or v_encounter.status <> 'in_progress' then
    raise exception 'An in-progress encounter is required.' using errcode = '22023';
  end if;

  select appointment.practitioner_role_id
  into v_assigned_practitioner_role_id
  from public.appointments appointment
  where appointment.id = v_encounter.appointment_id
    and appointment.organization_id = v_encounter.organization_id;

  if v_encounter.practitioner_role_id is null
    or v_encounter.practitioner_role_id <> v_assigned_practitioner_role_id then
    raise exception 'The encounter and appointment must have the same assigned practitioner role.'
      using errcode = '22023';
  end if;

  if not public.has_organization_permission(
    v_encounter.organization_id,
    'can_start_consultation'
  ) then
    raise exception 'Consultation permission is required to complete an encounter.'
      using errcode = '42501';
  end if;

  select practitioner.id
  into v_practitioner_id
  from public.practitioners practitioner
  join public.practitioner_roles practitioner_role
    on practitioner_role.practitioner_id = practitioner.id
  where practitioner.auth_user_id = auth.uid()
    and practitioner.active
    and practitioner_role.active
    and practitioner_role.organization_id = v_encounter.organization_id
    and practitioner_role.id = v_encounter.practitioner_role_id
  limit 1;

  if v_practitioner_id is null then
    raise exception 'Only the practitioner assigned to this encounter may complete it.'
      using errcode = '42501';
  end if;

  update public.encounters
  set status = 'finished', period_end = now()
  where id = v_encounter.id
    and organization_id = v_encounter.organization_id;

  update public.appointments
  set status = 'fulfilled'
  where id = v_encounter.appointment_id
    and organization_id = v_encounter.organization_id;

  select billing_event.id
  into v_event_id
  from public.billing_events billing_event
  where billing_event.encounter_id = v_encounter.id
    and billing_event.organization_id = v_encounter.organization_id
    and billing_event.status = 'draft'
  order by billing_event.created_at desc
  limit 1;

  if v_event_id is not null then
    perform public.issue_billing_invoice(v_event_id);
  end if;
end;
$$;

revoke all on function public.finish_clinical_encounter(uuid)
from public, anon, authenticated;

grant execute on function public.finish_clinical_encounter(uuid)
to authenticated;

comment on function public.finish_clinical_encounter(uuid) is
  'Completes an organization-scoped encounter only for its assigned practitioner.';
