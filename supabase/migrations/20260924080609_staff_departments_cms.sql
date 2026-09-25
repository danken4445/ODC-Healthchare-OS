-- Restore clinic department management to the staff and access workspace.
-- The table is shared with inventory, so both inventory managers and staff
-- administrators retain the least privilege needed for their workflows.

drop policy if exists departments_select on public.departments;
create policy departments_select on public.departments
for select to authenticated
using (
  public.can_manage_organization_accounts(organization_id)
  or public.has_organization_permission(organization_id, 'can_view_inventory')
  or public.has_organization_permission(organization_id, 'can_tag_inventory_usage')
);

drop policy if exists departments_manage on public.departments;
create policy departments_manage on public.departments
for all to authenticated
using (
  public.can_manage_organization_accounts(organization_id)
  or public.has_organization_permission(organization_id, 'can_manage_inventory')
)
with check (
  public.can_manage_organization_accounts(organization_id)
  or public.has_organization_permission(organization_id, 'can_manage_inventory')
);

create or replace function public.save_staff_department(
  p_organization_id uuid,
  p_department_id uuid,
  p_name text,
  p_description text,
  p_active boolean
)
returns uuid
language plpgsql
security invoker
set search_path = public, auth
as $$
declare
  saved_id uuid;
  normalized_name text := btrim(coalesce(p_name, ''));
begin
  if not public.can_manage_organization_accounts(p_organization_id) then
    raise exception 'Staff and role management permission is required.' using errcode = '42501';
  end if;

  if length(normalized_name) not between 2 and 120 then
    raise exception 'Department name must contain between 2 and 120 characters.' using errcode = '22023';
  end if;

  if p_department_id is null then
    insert into public.departments (organization_id, code, name, description, active)
    values (
      p_organization_id,
      '',
      normalized_name,
      nullif(btrim(coalesce(p_description, '')), ''),
      coalesce(p_active, true)
    )
    returning id into saved_id;
  else
    update public.departments
    set name = normalized_name,
        description = nullif(btrim(coalesce(p_description, '')), ''),
        active = coalesce(p_active, true)
    where id = p_department_id
      and organization_id = p_organization_id
    returning id into saved_id;

    if saved_id is null then
      raise exception 'Department was not found in this clinic.' using errcode = 'P0002';
    end if;
  end if;

  return saved_id;
end;
$$;

revoke all on function public.save_staff_department(uuid, uuid, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.save_staff_department(uuid, uuid, text, text, boolean)
  to authenticated;

comment on function public.save_staff_department(uuid, uuid, text, text, boolean) is
  'Creates or updates a clinic department for an authorized staff administrator; table RLS remains authoritative.';
