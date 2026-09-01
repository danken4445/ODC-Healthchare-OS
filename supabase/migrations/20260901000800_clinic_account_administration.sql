-- Clinic-scoped account administration. The Edge Function that creates Auth
-- users calls this as the original authenticated actor, so service-role access
-- can never choose a clinic on an administrator's behalf.
create or replace function public.can_manage_organization_accounts(
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_organization_role(
    p_organization_id,
    array['admin', 'owner']
  );
$$;

revoke all on function public.can_manage_organization_accounts(uuid) from public;
grant execute on function public.can_manage_organization_accounts(uuid) to authenticated;

comment on function public.can_manage_organization_accounts(uuid) is
  'Returns true only for an admin/owner assigned to the requested clinic. Front desk and clinical roles are deliberately excluded from account administration.';
