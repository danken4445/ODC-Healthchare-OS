-- auth.users.email is varchar, while this RPC promises text. PL/pgSQL
-- requires RETURN QUERY columns to match the declared table type exactly.
create or replace function public.list_clinic_staff(p_organization_id uuid)
returns table (
  user_id uuid,
  display_name text,
  email text,
  role_code text,
  department_id uuid,
  active boolean
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.can_manage_organization_accounts(p_organization_id) then
    raise exception 'Staff management permission is required.' using errcode = '42501';
  end if;

  return query
  with staff_members as (
    select
      practitioner.auth_user_id as staff_user_id,
      coalesce(
        nullif(practitioner.name ->> 'text', ''),
        nullif(user_account.raw_user_meta_data ->> 'display_name', ''),
        user_account.email,
        'Unnamed staff'
      ) as staff_display_name,
      user_account.email::text as staff_email,
      practitioner_role.role_code as staff_role_code,
      practitioner.active and practitioner_role.active as staff_active
    from public.practitioner_roles practitioner_role
    join public.practitioners practitioner
      on practitioner.id = practitioner_role.practitioner_id
    left join auth.users user_account
      on user_account.id = practitioner.auth_user_id
    where practitioner_role.organization_id = p_organization_id
      and practitioner.auth_user_id is not null

    union

    select
      membership.user_id,
      coalesce(
        nullif(user_account.raw_user_meta_data ->> 'display_name', ''),
        user_account.email,
        'Unnamed staff'
      ),
      user_account.email::text,
      role.name,
      true
    from public.user_roles membership
    join public.roles role
      on role.id = membership.role_id
    left join auth.users user_account
      on user_account.id = membership.user_id
    where membership.organization_id = p_organization_id
      and role.name <> 'patient'
  )
  select
    staff.staff_user_id,
    staff.staff_display_name,
    staff.staff_email,
    staff.staff_role_code,
    assignment.department_id,
    staff.staff_active and coalesce(status.active, true)
  from staff_members staff
  left join public.staff_department_assignments assignment
    on assignment.organization_id = p_organization_id
    and assignment.user_id = staff.staff_user_id
  left join public.clinic_user_access_status status
    on status.organization_id = p_organization_id
    and status.user_id = staff.staff_user_id
  order by
    (staff.staff_active and coalesce(status.active, true)) desc,
    staff.staff_display_name,
    staff.staff_role_code;
end;
$$;

revoke execute on function public.list_clinic_staff(uuid) from public, anon;
grant execute on function public.list_clinic_staff(uuid) to authenticated, service_role;

comment on function public.list_clinic_staff(uuid) is
  'Lists clinic staff for authorized account administrators with an exact text email return type.';
