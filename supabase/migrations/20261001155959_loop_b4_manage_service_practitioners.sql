-- Loop B4: permissioned, audited service-assignment RPCs. Rollback: revoke
-- execute, then drop these functions; membership rows remain recoverable.

create or replace function public.assign_service_practitioners(
  p_organization_id uuid,
  p_clinic_service_id uuid,
  p_practitioner_role_ids uuid[],
  p_duration_minutes_override integer default null
)
returns table (
  id uuid,
  organization_id uuid,
  clinic_service_id uuid,
  practitioner_role_id uuid,
  is_active boolean,
  duration_minutes_override integer,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or not public.has_organization_permission(p_organization_id, 'can_manage_services') then
    raise exception 'Service management permission is required.' using errcode = '42501';
  end if;

  if p_practitioner_role_ids is null or cardinality(p_practitioner_role_ids) = 0 then
    raise exception 'Select at least one doctor or specialist.' using errcode = '22023';
  end if;
  if p_duration_minutes_override is not null
    and p_duration_minutes_override not between 5 and 480 then
    raise exception 'Duration override must be between 5 and 480 minutes.' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.clinic_services as service
    where service.id = p_clinic_service_id
      and service.organization_id = p_organization_id
  ) then
    raise exception 'Service does not belong to this organization.' using errcode = '23503';
  end if;
  if exists (
    select 1
    from unnest(p_practitioner_role_ids) as requested(practitioner_role_id)
    left join public.practitioner_roles as practitioner_role
      on practitioner_role.id = requested.practitioner_role_id
      and practitioner_role.organization_id = p_organization_id
      and practitioner_role.role_code in ('doctor', 'specialist')
    where practitioner_role.id is null
  ) then
    raise exception 'Every assigned role must be a same-organization doctor or specialist.'
      using errcode = '23503';
  end if;

  return query
  insert into public.service_practitioners as membership (
    organization_id,
    clinic_service_id,
    practitioner_role_id,
    is_active,
    duration_minutes_override
  )
  select
    p_organization_id,
    p_clinic_service_id,
    requested.practitioner_role_id,
    true,
    p_duration_minutes_override
  from (
    select distinct unnest(p_practitioner_role_ids) as practitioner_role_id
  ) as requested
  on conflict on constraint service_practitioners_clinic_service_id_practitioner_role_i_key do update
  set is_active = true,
      duration_minutes_override = excluded.duration_minutes_override
  returning
    membership.id,
    membership.organization_id,
    membership.clinic_service_id,
    membership.practitioner_role_id,
    membership.is_active,
    membership.duration_minutes_override,
    membership.created_at,
    membership.updated_at;
end;
$$;

create or replace function public.unassign_service_practitioners(
  p_organization_id uuid,
  p_clinic_service_id uuid,
  p_practitioner_role_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_count integer;
begin
  if auth.uid() is null
    or not public.has_organization_permission(p_organization_id, 'can_manage_services') then
    raise exception 'Service management permission is required.' using errcode = '42501';
  end if;
  if p_practitioner_role_ids is null or cardinality(p_practitioner_role_ids) = 0 then
    raise exception 'Select at least one doctor or specialist.' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.clinic_services as service
    where service.id = p_clinic_service_id
      and service.organization_id = p_organization_id
  ) then
    raise exception 'Service does not belong to this organization.' using errcode = '23503';
  end if;
  if exists (
    select 1
    from unnest(p_practitioner_role_ids) as requested(practitioner_role_id)
    left join public.practitioner_roles as practitioner_role
      on practitioner_role.id = requested.practitioner_role_id
      and practitioner_role.organization_id = p_organization_id
      and practitioner_role.role_code in ('doctor', 'specialist')
    where practitioner_role.id is null
  ) then
    raise exception 'Every unassigned role must be a same-organization doctor or specialist.'
      using errcode = '23503';
  end if;

  update public.service_practitioners as membership
  set is_active = false
  where membership.organization_id = p_organization_id
    and membership.clinic_service_id = p_clinic_service_id
    and membership.practitioner_role_id = any(p_practitioner_role_ids)
    and membership.is_active;
  get diagnostics affected_count = row_count;
  return affected_count;
end;
$$;

revoke all on function public.assign_service_practitioners(uuid, uuid, uuid[], integer) from public, anon;
revoke all on function public.unassign_service_practitioners(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.assign_service_practitioners(uuid, uuid, uuid[], integer) to authenticated;
grant execute on function public.unassign_service_practitioners(uuid, uuid, uuid[]) to authenticated;
