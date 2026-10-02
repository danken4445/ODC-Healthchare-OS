-- Loop B7: permissioned service-level professional-fee bounds management.
-- Rollback: revoke this RPC before removing the optional bound columns in a
-- future contract release; existing fee declarations remain immutable.

create or replace function public.set_clinic_service_professional_fee_bounds(
  p_service_id uuid,
  p_min_professional_fee numeric default null,
  p_max_professional_fee numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_service public.clinic_services%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  if p_min_professional_fee is not null and p_min_professional_fee < 0
    or p_max_professional_fee is not null and p_max_professional_fee < 0
    or p_min_professional_fee is not null and p_max_professional_fee is not null
      and p_min_professional_fee > p_max_professional_fee then
    raise exception 'Professional fee bounds are invalid.' using errcode = '22023';
  end if;

  select * into v_service
  from public.clinic_services
  where id = p_service_id;
  if v_service.id is null then
    raise exception 'Service not found.' using errcode = 'P0002';
  end if;

  if not public.has_organization_permission(v_service.organization_id, 'can_manage_services') then
    raise exception 'Service management permission is required.' using errcode = '42501';
  end if;

  update public.clinic_services
  set min_professional_fee = p_min_professional_fee,
      max_professional_fee = p_max_professional_fee
  where id = v_service.id
    and organization_id = v_service.organization_id;

  return v_service.id;
end;
$$;

revoke all on function public.set_clinic_service_professional_fee_bounds(uuid, numeric, numeric)
  from public, anon, authenticated;
grant execute on function public.set_clinic_service_professional_fee_bounds(uuid, numeric, numeric)
  to authenticated;
