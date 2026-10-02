-- Loop F corrective fix: use append-only effective-dated fee history when
-- calculating the doctor management declaration summary.
-- Rollback: restore the previous list_doctor_management function definition
-- only if the missing-column defect is intentionally reintroduced; do not
-- delete practitioner_service_fees rows or alter the insert-only fee history.

create or replace function public.list_doctor_management(p_organization_id uuid, p_date date)
returns table (
  practitioner_role_id uuid, doctor_name text, assigned_services text[], room_label text,
  queue_prefix text, declared_fee_summary text
)
language plpgsql stable security definer set search_path = '' as $$
declare v_private boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;
  if not public.has_organization_permission(p_organization_id, 'can_access_admin_portal') then
    raise exception 'Administrative workspace permission is required.' using errcode = '42501';
  end if;

  select settings.fee_model = 'practitioner_declared' into v_private
  from public.organization_settings settings
  where settings.organization_id = p_organization_id;

  return query
  select role.id,
    coalesce(practitioner.name ->> 'text', 'Practitioner'),
    coalesce((select array_agg(service.name order by service.name)
      from public.service_practitioners membership
      join public.clinic_services service on service.id = membership.clinic_service_id
      where membership.organization_id = p_organization_id
        and membership.practitioner_role_id = role.id
        and membership.is_active), '{}'::text[]),
    (select room.label
      from public.room_assignments assignment
      join public.clinic_rooms room on room.id = assignment.room_id
      where assignment.organization_id = p_organization_id
        and assignment.practitioner_role_id = role.id
        and assignment.date = p_date
      limit 1),
    role.queue_prefix,
    case when v_private then (
      select format('%s declared / %s services',
        count(*) filter (where current_fee.amount is not null), count(*))
      from public.service_practitioners membership
      left join lateral (
        select fee.amount
        from public.practitioner_service_fees fee
        where fee.organization_id = p_organization_id
          and fee.practitioner_role_id = role.id
          and fee.service_practitioner_id = membership.id
          and fee.effective_from <= now()
        order by fee.effective_from desc, fee.created_at desc, fee.id desc
        limit 1
      ) current_fee on true
      where membership.organization_id = p_organization_id
        and membership.practitioner_role_id = role.id
        and membership.is_active
    ) else null end
  from public.practitioner_roles role
  join public.practitioners practitioner on practitioner.id = role.practitioner_id
  where role.organization_id = p_organization_id
    and role.role_code = 'doctor'
    and role.active
    and practitioner.active
  order by doctor_name;
end;
$$;

revoke all on function public.list_doctor_management(uuid, date) from public, anon;
grant execute on function public.list_doctor_management(uuid, date) to authenticated;
