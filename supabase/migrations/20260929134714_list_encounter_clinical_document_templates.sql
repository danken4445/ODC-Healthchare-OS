-- Resolve published template visibility against the actual encounter. This
-- avoids a client-selected organization becoming the source of truth while
-- retaining personal-template privacy between clinicians.
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
set search_path = public, auth
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

  select practitioner.id into current_doctor_id
  from public.practitioners practitioner
  join public.practitioner_roles role on role.practitioner_id = practitioner.id
  where practitioner.auth_user_id = auth.uid()
    and practitioner.organization_id = encounter_row.organization_id
    and practitioner.active
    and role.active
    and role.organization_id = encounter_row.organization_id
    and role.role_code in ('doctor', 'specialist')
  limit 1;
  if current_doctor_id is null then
    raise exception 'Only a doctor may use clinical document templates.' using errcode = '42501';
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
