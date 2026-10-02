-- Loop B6-B9: immutable practitioner professional-fee declarations.
-- Rollback: revoke the RPCs and remove dependent UI first. Do not delete fee
-- history from a live database; archive it only after the billing retention period.

alter table public.clinic_services
  add column if not exists min_professional_fee numeric(12,2),
  add column if not exists max_professional_fee numeric(12,2),
  add constraint clinic_services_min_professional_fee_nonnegative
    check (min_professional_fee is null or min_professional_fee >= 0),
  add constraint clinic_services_max_professional_fee_nonnegative
    check (max_professional_fee is null or max_professional_fee >= 0),
  add constraint clinic_services_professional_fee_bounds_order
    check (
      min_professional_fee is null
      or max_professional_fee is null
      or min_professional_fee <= max_professional_fee
    );

create table public.practitioner_service_fees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  practitioner_role_id uuid not null references public.practitioner_roles(id),
  service_practitioner_id uuid not null references public.service_practitioners(id),
  amount numeric(12,2) not null check (amount >= 0),
  effective_from timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index practitioner_service_fees_current_lookup_idx
  on public.practitioner_service_fees (service_practitioner_id, effective_from desc, created_at desc);
create index practitioner_service_fees_org_role_history_idx
  on public.practitioner_service_fees (organization_id, practitioner_role_id, effective_from desc);

create or replace function public.enforce_practitioner_service_fee_tenant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.service_practitioners as membership
    where membership.id = new.service_practitioner_id
      and membership.organization_id = new.organization_id
      and membership.practitioner_role_id = new.practitioner_role_id
  ) then
    raise exception 'Professional fee must use the matching organization and practitioner service assignment.'
      using errcode = '23503';
  end if;

  return new;
end;
$$;

create trigger practitioner_service_fees_tenant_integrity
  before insert on public.practitioner_service_fees
  for each row execute function public.enforce_practitioner_service_fee_tenant();

create trigger practitioner_service_fees_audit
  after insert on public.practitioner_service_fees
  for each row execute function public.write_audit_log();

alter table public.practitioner_service_fees enable row level security;

create policy practitioner_service_fees_select on public.practitioner_service_fees
  for select to authenticated
  using (
    public.has_organization_permission(organization_id, 'can_manage_services')
    or (
      public.has_organization_permission(organization_id, 'can_manage_professional_fees')
      and exists (
        select 1
        from public.practitioner_roles as practitioner_role
        join public.practitioners as practitioner on practitioner.id = practitioner_role.practitioner_id
        where practitioner_role.id = practitioner_service_fees.practitioner_role_id
          and practitioner.auth_user_id = auth.uid()
      )
    )
  );

revoke all on public.practitioner_service_fees from anon, authenticated;

create or replace function public.assert_professional_fee_declaration_allowed(
  p_organization_id uuid,
  p_amount numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fee_model text;
  v_is_government boolean;
begin
  if p_amount is null or p_amount < 0 then
    raise exception 'Professional fee amount must be zero or greater.' using errcode = '22023';
  end if;

  select
    settings.fee_model,
    organization.default_payor_type in ('philhealth_nbb', 'government_subsidized')
  into v_fee_model, v_is_government
  from public.organization_settings as settings
  join public.organizations as organization on organization.id = settings.organization_id
  where settings.organization_id = p_organization_id;

  if not found then
    raise exception 'Organization fee settings not found.' using errcode = 'P0002';
  end if;

  if v_is_government then
    raise exception 'Government facilities cannot declare professional fees.' using errcode = '22023';
  end if;

  if v_fee_model <> 'practitioner_declared' then
    raise exception 'Professional fees are available only in practitioner_declared mode.' using errcode = '22023';
  end if;
end;
$$;

create or replace function public.assert_professional_fee_bounds(
  p_service_id uuid,
  p_amount numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_min numeric(12,2);
  v_max numeric(12,2);
begin
  select min_professional_fee, max_professional_fee
  into v_min, v_max
  from public.clinic_services
  where id = p_service_id;

  if not found then
    raise exception 'Service not found.' using errcode = 'P0002';
  end if;

  if (v_min is not null and p_amount < v_min)
    or (v_max is not null and p_amount > v_max) then
    raise exception 'Professional fee must be within the service bounds.' using errcode = '22023';
  end if;
end;
$$;

create or replace function public.set_my_professional_fee(
  p_service_id uuid,
  p_amount numeric,
  p_effective_from timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membership public.service_practitioners%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select membership.*
  into v_membership
  from public.service_practitioners as membership
  join public.practitioner_roles as practitioner_role on practitioner_role.id = membership.practitioner_role_id
  join public.practitioners as practitioner on practitioner.id = practitioner_role.practitioner_id
  where membership.clinic_service_id = p_service_id
    and membership.is_active
    and practitioner_role.active
    and practitioner.active
    and practitioner.auth_user_id = auth.uid()
  order by membership.created_at
  limit 1;

  if v_membership.id is null then
    raise exception 'You are not an active practitioner assigned to this service.' using errcode = '42501';
  end if;

  if not public.has_organization_permission(v_membership.organization_id, 'can_manage_professional_fees') then
    raise exception 'Professional fee permission is required.' using errcode = '42501';
  end if;

  if p_effective_from is null then
    raise exception 'Professional fee effective time is required.' using errcode = '22023';
  end if;

  perform public.assert_professional_fee_declaration_allowed(v_membership.organization_id, p_amount);
  perform public.assert_professional_fee_bounds(v_membership.clinic_service_id, p_amount);

  insert into public.practitioner_service_fees (
    organization_id, practitioner_role_id, service_practitioner_id,
    amount, effective_from, created_by
  ) values (
    v_membership.organization_id, v_membership.practitioner_role_id, v_membership.id,
    p_amount, p_effective_from, auth.uid()
  ) returning id into v_membership.id;

  return v_membership.id;
end;
$$;

create or replace function public.set_professional_fee_for_practitioner(
  p_service_practitioner_id uuid,
  p_amount numeric,
  p_effective_from timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membership public.service_practitioners%rowtype;
  v_fee_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select * into v_membership
  from public.service_practitioners
  where id = p_service_practitioner_id
    and is_active;

  if v_membership.id is null then
    raise exception 'Active service practitioner assignment not found.' using errcode = 'P0002';
  end if;

  if not public.has_organization_permission(v_membership.organization_id, 'can_manage_services') then
    raise exception 'Service management permission is required.' using errcode = '42501';
  end if;

  if p_effective_from is null then
    raise exception 'Professional fee effective time is required.' using errcode = '22023';
  end if;

  perform public.assert_professional_fee_declaration_allowed(v_membership.organization_id, p_amount);
  perform public.assert_professional_fee_bounds(v_membership.clinic_service_id, p_amount);

  insert into public.practitioner_service_fees (
    organization_id, practitioner_role_id, service_practitioner_id,
    amount, effective_from, created_by
  ) values (
    v_membership.organization_id, v_membership.practitioner_role_id, v_membership.id,
    p_amount, p_effective_from, auth.uid()
  ) returning id into v_fee_id;

  return v_fee_id;
end;
$$;

create or replace function public.get_professional_fee_at(
  p_service_practitioner_id uuid,
  p_at timestamptz default now()
)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_membership public.service_practitioners%rowtype;
  v_can_view boolean;
  v_amount numeric(12,2);
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  if p_at is null then
    raise exception 'Fee lookup time is required.' using errcode = '22023';
  end if;

  select * into v_membership
  from public.service_practitioners as membership
  where membership.id = p_service_practitioner_id;
  if v_membership.id is null then
    raise exception 'Service practitioner assignment not found.' using errcode = 'P0002';
  end if;

  select
    public.has_organization_permission(v_membership.organization_id, 'can_manage_services')
    or (
      public.has_organization_permission(v_membership.organization_id, 'can_manage_professional_fees')
      and exists (
        select 1
        from public.practitioner_roles as practitioner_role
        join public.practitioners as practitioner on practitioner.id = practitioner_role.practitioner_id
        where practitioner_role.id = v_membership.practitioner_role_id
          and practitioner.auth_user_id = auth.uid()
      )
    )
  into v_can_view;

  if not v_can_view then
    raise exception 'Professional fee access is denied.' using errcode = '42501';
  end if;

  select fee.amount into v_amount
  from public.practitioner_service_fees as fee
  where fee.service_practitioner_id = v_membership.id
    and fee.effective_from <= p_at
  order by fee.effective_from desc, fee.created_at desc, fee.id desc
  limit 1;

  return v_amount;
end;
$$;

create or replace function public.list_my_professional_fee_services()
returns table (
  service_practitioner_id uuid,
  service_id uuid,
  service_name text,
  currency text,
  min_professional_fee numeric,
  max_professional_fee numeric,
  current_fee numeric,
  current_fee_effective_from timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  return query
  select
    membership.id,
    service.id,
    service.name,
    service.currency,
    service.min_professional_fee,
    service.max_professional_fee,
    current_fee.amount,
    current_fee.effective_from
  from public.service_practitioners as membership
  join public.clinic_services as service on service.id = membership.clinic_service_id
  join public.practitioner_roles as practitioner_role on practitioner_role.id = membership.practitioner_role_id
  join public.practitioners as practitioner on practitioner.id = practitioner_role.practitioner_id
  left join lateral (
    select fee.amount, fee.effective_from
    from public.practitioner_service_fees as fee
    where fee.service_practitioner_id = membership.id
      and fee.effective_from <= now()
    order by fee.effective_from desc, fee.created_at desc, fee.id desc
    limit 1
  ) as current_fee on true
  where membership.is_active
    and service.active
    and practitioner_role.active
    and practitioner.active
    and practitioner.auth_user_id = auth.uid()
    and public.has_organization_permission(membership.organization_id, 'can_manage_professional_fees')
  order by service.name, membership.created_at;
end;
$$;

create or replace function public.list_professional_fee_history(
  p_service_practitioner_id uuid
)
returns table (
  id uuid,
  amount numeric,
  effective_from timestamptz,
  created_by uuid,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_membership public.service_practitioners%rowtype;
  v_can_view boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select * into v_membership
  from public.service_practitioners as membership
  where membership.id = p_service_practitioner_id;
  if v_membership.id is null then
    raise exception 'Service practitioner assignment not found.' using errcode = 'P0002';
  end if;

  select
    public.has_organization_permission(v_membership.organization_id, 'can_manage_services')
    or (
      public.has_organization_permission(v_membership.organization_id, 'can_manage_professional_fees')
      and exists (
        select 1
        from public.practitioner_roles as practitioner_role
        join public.practitioners as practitioner on practitioner.id = practitioner_role.practitioner_id
        where practitioner_role.id = v_membership.practitioner_role_id
          and practitioner.auth_user_id = auth.uid()
      )
    )
  into v_can_view;

  if not v_can_view then
    raise exception 'Professional fee access is denied.' using errcode = '42501';
  end if;

  return query
  select fee.id, fee.amount, fee.effective_from, fee.created_by, fee.created_at
  from public.practitioner_service_fees as fee
  where fee.service_practitioner_id = v_membership.id
  order by fee.effective_from desc, fee.created_at desc, fee.id desc;
end;
$$;

create or replace function public.get_professional_fee_overview(
  p_organization_id uuid
)
returns table (
  service_practitioner_id uuid,
  service_id uuid,
  service_name text,
  practitioner_role_id uuid,
  practitioner_name text,
  currency text,
  min_professional_fee numeric,
  max_professional_fee numeric,
  current_fee numeric,
  current_fee_effective_from timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  if not public.has_organization_permission(p_organization_id, 'can_manage_services') then
    raise exception 'Service management permission is required.' using errcode = '42501';
  end if;

  return query
  select
    membership.id,
    service.id,
    service.name,
    membership.practitioner_role_id,
    coalesce(practitioner.name ->> 'text', 'Practitioner'),
    service.currency,
    service.min_professional_fee,
    service.max_professional_fee,
    current_fee.amount,
    current_fee.effective_from
  from public.service_practitioners as membership
  join public.clinic_services as service on service.id = membership.clinic_service_id
  join public.practitioner_roles as practitioner_role on practitioner_role.id = membership.practitioner_role_id
  join public.practitioners as practitioner on practitioner.id = practitioner_role.practitioner_id
  left join lateral (
    select fee.amount, fee.effective_from
    from public.practitioner_service_fees as fee
    where fee.service_practitioner_id = membership.id
      and fee.effective_from <= now()
    order by fee.effective_from desc, fee.created_at desc, fee.id desc
    limit 1
  ) as current_fee on true
  where membership.organization_id = p_organization_id
    and membership.is_active
  order by service.name, practitioner.name ->> 'text', membership.created_at;
end;
$$;

create or replace function public.is_service_practitioner_bookable(
  p_service_practitioner_id uuid,
  p_at timestamptz default now()
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_membership public.service_practitioners%rowtype;
  v_fee_model text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select membership.* into v_membership
  from public.service_practitioners as membership
  where membership.id = p_service_practitioner_id;
  if v_membership.id is null or not public.can_access_organization(v_membership.organization_id) then
    return false;
  end if;

  if p_at is null then
    raise exception 'Bookability lookup time is required.' using errcode = '22023';
  end if;

  select fee_model into v_fee_model
  from public.organization_settings
  where organization_id = v_membership.organization_id;

  if not v_membership.is_active then
    return false;
  end if;

  if v_fee_model = 'fixed_rate' then
    return true;
  end if;

  return exists (
    select 1
    from public.practitioner_service_fees as fee
    where fee.service_practitioner_id = v_membership.id
      and fee.effective_from <= p_at
  );
end;
$$;

revoke all on function public.assert_professional_fee_declaration_allowed(uuid, numeric) from public, anon, authenticated;
revoke all on function public.assert_professional_fee_bounds(uuid, numeric) from public, anon, authenticated;
revoke all on function public.set_my_professional_fee(uuid, numeric, timestamptz) from public, anon, authenticated;
revoke all on function public.set_professional_fee_for_practitioner(uuid, numeric, timestamptz) from public, anon, authenticated;
revoke all on function public.get_professional_fee_at(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.list_my_professional_fee_services() from public, anon, authenticated;
revoke all on function public.list_professional_fee_history(uuid) from public, anon, authenticated;
revoke all on function public.get_professional_fee_overview(uuid) from public, anon, authenticated;
revoke all on function public.is_service_practitioner_bookable(uuid, timestamptz) from public, anon, authenticated;

grant execute on function public.set_my_professional_fee(uuid, numeric, timestamptz) to authenticated;
grant execute on function public.set_professional_fee_for_practitioner(uuid, numeric, timestamptz) to authenticated;
grant execute on function public.get_professional_fee_at(uuid, timestamptz) to authenticated;
grant execute on function public.list_my_professional_fee_services() to authenticated;
grant execute on function public.list_professional_fee_history(uuid) to authenticated;
grant execute on function public.get_professional_fee_overview(uuid) to authenticated;
grant execute on function public.is_service_practitioner_bookable(uuid, timestamptz) to authenticated;

comment on table public.practitioner_service_fees is
  'Append-only effective-dated professional fee declarations. Current fee is the latest row effective at the requested time.';
comment on function public.is_service_practitioner_bookable(uuid, timestamptz) is
  'Loop C helper: in practitioner_declared mode an active service practitioner without an effective fee is not bookable.';
