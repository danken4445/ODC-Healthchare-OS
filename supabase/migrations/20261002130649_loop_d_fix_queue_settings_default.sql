-- Loop D corrective fix: return the effective queue mode when an
-- organization_settings row is missing.
-- Rollback: restore the get_organization_queue_settings function definition
-- from 20261002081147_loop_d_queue_scopes_and_labels.sql if this defaulting
-- behavior must be reverted; do not remove organization settings.

create or replace function public.get_organization_queue_settings(
  p_organization_id uuid
)
returns table (
  organization_id uuid,
  queue_mode text,
  can_manage_queue_mode boolean
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
    coalesce(settings.queue_mode, 'clinic_wide'::text),
    public.has_organization_permission(organization.id, 'can_manage_appointments')
  from public.organizations as organization
  left join public.organization_settings as settings
    on settings.organization_id = organization.id
  where organization.id = p_organization_id;
end;
$$;

revoke all on function public.get_organization_queue_settings(uuid) from public, anon, authenticated;
grant execute on function public.get_organization_queue_settings(uuid) to authenticated;
