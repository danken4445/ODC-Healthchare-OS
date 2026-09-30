-- Rollback: restore public.issue_prescription(uuid, text, text, text, uuid,
-- integer) from 20260926074449_provider_document_template_cms.sql, then
-- reapply its execute grants.
--
-- Prescription issuance is governed by the existing consultation permission.
-- Resolve the author through an active role in the encounter organization so
-- a permissive practitioner lookup fallback cannot authorize another role.

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
  v_practitioner_id uuid;
  v_request_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select encounter.*
  into v_encounter
  from public.encounters encounter
  where encounter.id = p_encounter_id
  for update;

  if not found or v_encounter.status <> 'in_progress' then
    raise exception 'An in-progress encounter is required.' using errcode = '22023';
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
  order by practitioner_role.created_at, practitioner_role.id
  limit 1;

  if v_practitioner_id is null then
    raise exception 'An active practitioner role in this organization is required.'
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
) from public, anon;

grant execute on function public.issue_prescription(
  uuid, text, text, text, uuid, integer
) to authenticated;

comment on function public.issue_prescription(
  uuid, text, text, text, uuid, integer
) is 'Issues an organization-scoped prescription for an authenticated practitioner with consultation permission.';
