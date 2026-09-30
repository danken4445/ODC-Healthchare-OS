-- Rollback: restore public.issue_medical_certificate(uuid, text, text, uuid,
-- integer) from 20260926074449_provider_document_template_cms.sql, then
-- reapply its execute grants.
--
-- Medical-certificate issuance uses the existing consultation permission and
-- resolves its author through an active role in the encounter organization.

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
  v_practitioner_id uuid;
  v_document_id uuid := gen_random_uuid();
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
  order by practitioner_role.created_at, practitioner_role.id
  limit 1;

  if v_practitioner_id is null then
    raise exception 'An active practitioner role in this organization is required.'
      using errcode = '42501';
  end if;

  if p_title is null
    or p_statement is null
    or length(btrim(p_title)) not between 2 and 200
    or length(btrim(p_statement)) not between 2 and 5000 then
    raise exception 'Certificate title and statement are required.'
      using errcode = '22023';
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
) from public, anon;

grant execute on function public.issue_medical_certificate(
  uuid, text, text, uuid, integer
) to authenticated;

comment on function public.issue_medical_certificate(
  uuid, text, text, uuid, integer
) is 'Issues an organization-scoped medical certificate for an authenticated practitioner with consultation permission.';
