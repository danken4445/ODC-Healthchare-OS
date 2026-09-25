-- Restore admin CMS mutations through narrow, permission-checked functions.
-- Clinical and financial rows remain soft-deleted so their audit history stays intact.

drop policy if exists patients_update on public.patients;
create policy patients_update on public.patients
for update to authenticated
using (
  public.is_superadmin()
  or public.has_organization_permission(organization_id, 'can_manage_patients')
)
with check (
  public.is_superadmin()
  or public.has_organization_permission(organization_id, 'can_manage_patients')
);

grant select (id, organization_id, active) on public.patients to authenticated;
grant update (active) on public.patients to authenticated;

drop policy if exists coverages_manage on public.coverages;
create policy coverages_manage on public.coverages
for all to authenticated
using (
  public.is_superadmin()
  or public.has_organization_permission(organization_id, 'can_manage_billing')
  or public.has_organization_permission(organization_id, 'can_manage_claims')
)
with check (
  public.is_superadmin()
  or public.has_organization_permission(organization_id, 'can_manage_billing')
  or public.has_organization_permission(organization_id, 'can_manage_claims')
);

create or replace function public.set_governance_patient_active(
  p_organization_id uuid,
  p_patient_id uuid,
  p_active boolean
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if not (
    public.is_superadmin()
    or public.has_organization_permission(p_organization_id, 'can_manage_patients')
  ) then
    raise exception 'Patient management permission is required.' using errcode = '42501';
  end if;

  update public.patients
  set active = p_active
  where id = p_patient_id
    and organization_id = p_organization_id;

  if not found then
    raise exception 'Patient record was not found in this organization.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.set_governance_patient_active(uuid, uuid, boolean) from public;
revoke all on function public.set_governance_patient_active(uuid, uuid, boolean) from anon;
grant execute on function public.set_governance_patient_active(uuid, uuid, boolean) to authenticated;

create or replace function public.save_company_coverage(
  p_organization_id uuid,
  p_coverage_id uuid,
  p_patient_id uuid,
  p_coverage_type text,
  p_subscriber_id text,
  p_payor_name text,
  p_period_start date,
  p_period_end date,
  p_status text
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  saved_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if not (
    public.is_superadmin()
    or public.has_organization_permission(p_organization_id, 'can_manage_billing')
    or public.has_organization_permission(p_organization_id, 'can_manage_claims')
  ) then
    raise exception 'Billing or claims management permission is required.' using errcode = '42501';
  end if;

  if p_coverage_type not in ('company', 'corporate', 'employer', 'employer_sponsored') then
    raise exception 'Unsupported company coverage type.' using errcode = '22023';
  end if;

  if p_status not in ('active', 'cancelled', 'draft', 'entered_in_error') then
    raise exception 'Unsupported coverage status.' using errcode = '22023';
  end if;

  if nullif(btrim(p_payor_name), '') is null then
    raise exception 'Company or payor name is required.' using errcode = '22023';
  end if;

  if p_period_end is not null and p_period_start is not null and p_period_end < p_period_start then
    raise exception 'Coverage end date cannot be earlier than its start date.' using errcode = '22007';
  end if;

  if not exists (
    select 1 from public.patients
    where id = p_patient_id and organization_id = p_organization_id
  ) then
    raise exception 'Covered patient was not found in this organization.' using errcode = '23503';
  end if;

  if p_coverage_id is null then
    insert into public.coverages (
      organization_id,
      patient_id,
      coverage_type,
      subscriber_id,
      payor,
      period_start,
      period_end,
      status
    )
    values (
      p_organization_id,
      p_patient_id,
      p_coverage_type,
      nullif(btrim(p_subscriber_id), ''),
      jsonb_build_object('name', btrim(p_payor_name)),
      p_period_start,
      p_period_end,
      p_status
    )
    returning id into saved_id;
  else
    update public.coverages
    set patient_id = p_patient_id,
        coverage_type = p_coverage_type,
        subscriber_id = nullif(btrim(p_subscriber_id), ''),
        payor = jsonb_build_object('name', btrim(p_payor_name)),
        period_start = p_period_start,
        period_end = p_period_end,
        status = p_status
    where id = p_coverage_id
      and organization_id = p_organization_id
    returning id into saved_id;

    if saved_id is null then
      raise exception 'Coverage record was not found in this organization.' using errcode = 'P0002';
    end if;
  end if;

  return saved_id;
end;
$$;

revoke all on function public.save_company_coverage(uuid, uuid, uuid, text, text, text, date, date, text) from public;
revoke all on function public.save_company_coverage(uuid, uuid, uuid, text, text, text, date, date, text) from anon;
grant execute on function public.save_company_coverage(uuid, uuid, uuid, text, text, text, date, date, text) to authenticated;
