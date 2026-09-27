-- Facility Classification & Operating Mode Toggle
-- Allows hospital administrators to toggle their facility between
-- a Government No-Billing facility ('philhealth_nbb') and a Private Hospital ('self_pay').

create or replace function public.get_organization_facility_classification(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_payor public.payor_type;
  v_can_manage boolean;
begin
  if not (
    public.is_superadmin()
    or public.can_access_organization(p_organization_id)
  ) then
    raise exception 'Organization not found or access denied.' using errcode = '42501';
  end if;

  select default_payor_type into v_payor
  from public.organizations
  where id = p_organization_id;

  if not found then
    raise exception 'Organization not found.' using errcode = 'P0002';
  end if;

  v_can_manage := public.is_superadmin()
    or public.has_organization_role(p_organization_id, array['admin', 'owner']);

  return jsonb_build_object(
    'organization_id', p_organization_id,
    'default_payor_type', v_payor,
    'is_government_no_billing', (v_payor = 'philhealth_nbb'),
    'can_manage', v_can_manage
  );
end;
$$;

create or replace function public.set_organization_facility_classification(
  p_organization_id uuid,
  p_payor_type public.payor_type
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_updated_at timestamptz := now();
begin
  -- Security check: ONLY the admin or owner of this hospital (or platform superadmin) can modify classification
  if not (
    public.is_superadmin()
    or public.has_organization_role(p_organization_id, array['admin', 'owner'])
  ) then
    raise exception 'Only an administrator of this facility can modify its facility classification.' using errcode = '42501';
  end if;

  if p_payor_type not in ('self_pay', 'philhealth_nbb', 'government_subsidized', 'hmo') then
    raise exception 'Invalid payor type.' using errcode = '22023';
  end if;

  update public.organizations
  set default_payor_type = p_payor_type,
      updated_at = v_updated_at
  where id = p_organization_id;

  if not found then
    raise exception 'Organization not found.' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'organization_id', p_organization_id,
    'default_payor_type', p_payor_type,
    'is_government_no_billing', (p_payor_type = 'philhealth_nbb'),
    'updated_at', v_updated_at
  );
end;
$$;

revoke all on function public.get_organization_facility_classification(uuid) from public, anon;
grant execute on function public.get_organization_facility_classification(uuid) to authenticated;

revoke all on function public.set_organization_facility_classification(uuid, public.payor_type) from public, anon;
grant execute on function public.set_organization_facility_classification(uuid, public.payor_type) to authenticated;

comment on function public.get_organization_facility_classification(uuid) is 'Returns the operating classification and default payor routing for a facility, along with admin management permission flag.';
comment on function public.set_organization_facility_classification(uuid, public.payor_type) is 'Updates the default payor routing between Government No-Billing (philhealth_nbb) and Private Hospital (self_pay). Strictly restricted to facility administrators.';
