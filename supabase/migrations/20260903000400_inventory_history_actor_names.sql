-- Loop 3 inventory history: resolve actor names for stock movements and usages.

create or replace function public.list_inventory_staff_names(p_organization_id uuid)
returns table (user_id uuid, display_name text)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not (
    public.has_organization_permission(p_organization_id, 'can_view_inventory')
    or public.has_organization_permission(p_organization_id, 'can_manage_inventory')
    or public.has_organization_permission(p_organization_id, 'can_tag_inventory_usage')
  ) then
    raise exception 'Inventory permission is required.' using errcode = '42501';
  end if;

  return query
  select distinct on (staff.user_id)
    staff.user_id,
    staff.display_name
  from (
    select
      practitioner.auth_user_id as user_id,
      coalesce(
        nullif(practitioner.name ->> 'text', ''),
        nullif(user_account.raw_user_meta_data ->> 'display_name', ''),
        user_account.email,
        'Staff member'
      ) as display_name
    from public.practitioners practitioner
    left join auth.users user_account on user_account.id = practitioner.auth_user_id
    where practitioner.organization_id = p_organization_id
      and practitioner.auth_user_id is not null

    union all

    select
      membership.user_id as user_id,
      coalesce(
        nullif(user_account.raw_user_meta_data ->> 'display_name', ''),
        user_account.email,
        'Staff member'
      ) as display_name
    from public.user_roles membership
    left join auth.users user_account on user_account.id = membership.user_id
    where membership.organization_id = p_organization_id
  ) staff
  where staff.user_id is not null;
end;
$$;

revoke all on function public.list_inventory_staff_names(uuid) from public, anon, authenticated;
grant execute on function public.list_inventory_staff_names(uuid) to authenticated;
