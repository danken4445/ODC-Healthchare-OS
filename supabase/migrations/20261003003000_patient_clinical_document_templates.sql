-- Migration: 20261003003000_patient_clinical_document_templates.sql
-- Description: Allow patients to view doctor templates for their issued clinical documents
-- (prescriptions, medical certificates) and retrieve published default templates.
-- Rollback: drop function if exists public.get_patient_document_template(uuid, integer); drop function if exists public.get_patient_default_template(uuid, text, text); drop policy if exists document_templates_patient_select on public.document_templates; drop policy if exists document_template_versions_patient_select on public.document_template_versions;

-- 1. Patient RLS policy for published templates in their organization
drop policy if exists document_templates_patient_select on public.document_templates;
create policy document_templates_patient_select on public.document_templates
for select to authenticated using (
  status = 'published'
  and exists (
    select 1 from public.patients patient
    where patient.organization_id = document_templates.organization_id
      and patient.auth_user_id = auth.uid()
  )
);

-- 2. Patient RLS policy for template versions in their organization
drop policy if exists document_template_versions_patient_select on public.document_template_versions;
create policy document_template_versions_patient_select on public.document_template_versions
for select to authenticated using (
  exists (
    select 1 from public.patients patient
    where patient.organization_id = document_template_versions.organization_id
      and patient.auth_user_id = auth.uid()
  )
);

-- 3. RPC: get_patient_document_template
-- Securely retrieves template content for a patient or clinician
create or replace function public.get_patient_document_template(
  p_template_id uuid,
  p_template_version integer default null
)
returns table (
  id uuid,
  organization_id uuid,
  category text,
  name text,
  condition_code text,
  condition_display text,
  structured_body jsonb,
  version integer
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if p_template_id is null then
    return;
  end if;

  return query
  select
    t.id,
    t.organization_id,
    t.category,
    t.name,
    t.condition_code,
    t.condition_display,
    coalesce(v.structured_body, t.structured_body) as structured_body,
    coalesce(v.version, t.version) as version
  from public.document_templates t
  left join public.document_template_versions v
    on v.template_id = t.id and (p_template_version is null or v.version = p_template_version)
  where t.id = p_template_id
    and (
      exists (
        select 1 from public.patients p
        where p.organization_id = t.organization_id
          and p.auth_user_id = auth.uid()
      )
      or public.can_access_organization(t.organization_id)
      or public.is_superadmin()
    )
  order by v.version desc nulls last
  limit 1;
end;
$$;

-- 4. RPC: get_patient_default_template
-- Retrieves the published default template for an organization and document category
create or replace function public.get_patient_default_template(
  p_organization_id uuid,
  p_type text,
  p_condition_code text default null
)
returns table (
  id uuid,
  organization_id uuid,
  category text,
  name text,
  condition_code text,
  condition_display text,
  structured_body jsonb,
  version integer
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if p_organization_id is null or p_type is null then
    return;
  end if;

  -- Ensure caller belongs to the organization
  if not (
    exists (
      select 1 from public.patients p
      where p.organization_id = p_organization_id
        and p.auth_user_id = auth.uid()
    )
    or public.can_access_organization(p_organization_id)
    or public.is_superadmin()
  ) then
    return;
  end if;

  return query
  select
    t.id,
    t.organization_id,
    t.category,
    t.name,
    t.condition_code,
    t.condition_display,
    t.structured_body,
    t.version
  from public.document_templates t
  where t.organization_id = p_organization_id
    and t.category = p_type
    and t.status = 'published'
  order by
    case when p_condition_code is not null and t.condition_code = p_condition_code then 0 else 1 end,
    t.is_default desc,
    t.updated_at desc
  limit 1;
end;
$$;

revoke all on function public.get_patient_document_template(uuid, integer) from public, anon;
grant execute on function public.get_patient_document_template(uuid, integer) to authenticated;

revoke all on function public.get_patient_default_template(uuid, text, text) from public, anon;
grant execute on function public.get_patient_default_template(uuid, text, text) to authenticated;
