-- Ensure private practitioner-declared organizations grant doctors the
-- established fee permission when the model is enabled.
-- Rollback: restore the previous fee-model RPC and remove only permission
-- rows created by this release after dependent fee clients are disabled.

create or replace function public.set_organization_fee_model(
  p_organization_id uuid,
  p_fee_model text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_government boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;
  if p_fee_model not in ('fixed_rate', 'practitioner_declared') then
    raise exception 'Fee model must be fixed_rate or practitioner_declared.' using errcode = '22023';
  end if;
  if not public.has_organization_permission(p_organization_id, 'can_manage_services') then
    raise exception 'Service management permission is required.' using errcode = '42501';
  end if;

  select default_payor_type in ('philhealth_nbb', 'government_subsidized')
  into v_is_government
  from public.organizations
  where id = p_organization_id;
  if not found then
    raise exception 'Organization not found.' using errcode = 'P0002';
  end if;
  if v_is_government and p_fee_model = 'practitioner_declared' then
    raise exception 'Government facilities must use the fixed_rate fee model.' using errcode = '22023';
  end if;

  insert into public.organization_settings (organization_id, fee_model)
  values (p_organization_id, p_fee_model)
  on conflict (organization_id) do update
    set fee_model = excluded.fee_model, updated_at = now();

  if p_fee_model = 'practitioner_declared' then
    insert into public.clinic_role_permission_overrides (organization_id, role_code, permission)
    values (p_organization_id, 'doctor', 'can_manage_professional_fees')
    on conflict (organization_id, role_code, permission) do nothing;
  end if;

  return p_fee_model;
end;
$$;

revoke all on function public.set_organization_fee_model(uuid, text) from public, anon, authenticated;
grant execute on function public.set_organization_fee_model(uuid, text) to authenticated;
