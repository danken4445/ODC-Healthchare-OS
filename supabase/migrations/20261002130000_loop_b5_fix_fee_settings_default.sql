-- Loop B5 corrective fix: return effective fee settings even when an
-- organization_settings row is missing.
-- Rollback: restore the get_organization_fee_settings function definition
-- from 20261002010430_loop_b5_fee_model_settings.sql if this corrective
-- defaulting behavior must be reverted; do not remove organization settings.

create or replace function public.get_organization_fee_settings(
  p_organization_id uuid
)
returns table (
  organization_id uuid,
  fee_model text,
  is_government boolean,
  can_manage_fee_model boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  if not public.can_access_organization(p_organization_id) then
    raise exception 'Organization not found or access denied.' using errcode = '42501';
  end if;

  return query
  select
    organization.id,
    coalesce(settings.fee_model, 'fixed_rate'::text),
    organization.default_payor_type in ('philhealth_nbb', 'government_subsidized'),
    public.has_organization_permission(organization.id, 'can_manage_services')
  from public.organizations as organization
  left join public.organization_settings as settings
    on settings.organization_id = organization.id
  where organization.id = p_organization_id;
end;
$$;

revoke all on function public.get_organization_fee_settings(uuid) from public, anon, authenticated;
grant execute on function public.get_organization_fee_settings(uuid) to authenticated;
