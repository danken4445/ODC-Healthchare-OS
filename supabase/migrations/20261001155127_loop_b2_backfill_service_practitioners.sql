-- Loop B2: expand-to-contract backfill. Rollback: remove only membership rows
-- created for legacy owners if no B3/B4 writes have been accepted.

do $$
begin
  if exists (
    select 1
    from public.clinic_services as service
    where service.owner_practitioner_role_id is null
  ) then
    raise exception 'Cannot backfill service practitioners: every legacy service must have an owner.'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.clinic_services as service
    left join public.practitioner_roles as practitioner_role
      on practitioner_role.id = service.owner_practitioner_role_id
      and practitioner_role.organization_id = service.organization_id
      and practitioner_role.role_code in ('doctor', 'specialist')
    where practitioner_role.id is null
  ) then
    raise exception 'Cannot backfill service practitioners: legacy service owner is not a same-organization doctor or specialist.'
      using errcode = 'P0001';
  end if;
end;
$$;

insert into public.service_practitioners (
  organization_id,
  clinic_service_id,
  practitioner_role_id,
  is_active,
  duration_minutes_override
)
select
  service.organization_id,
  service.id,
  service.owner_practitioner_role_id,
  true,
  null
from public.clinic_services as service
on conflict (clinic_service_id, practitioner_role_id) do nothing;

-- Keep the expand phase compatible with legacy service writers until they are
-- switched to the membership RPC in a later release. This also makes the
-- migration's backfill invariant observable in local seed fixtures.
create or replace function public.sync_legacy_service_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.owner_practitioner_role_id is not null then
    insert into public.service_practitioners (
      organization_id,
      clinic_service_id,
      practitioner_role_id,
      is_active,
      duration_minutes_override
    ) values (
      new.organization_id,
      new.id,
      new.owner_practitioner_role_id,
      true,
      null
    )
    on conflict (clinic_service_id, practitioner_role_id) do nothing;
  end if;

  return new;
end;
$$;

create trigger clinic_services_legacy_owner_membership
  after insert or update of owner_practitioner_role_id, organization_id
  on public.clinic_services
  for each row execute function public.sync_legacy_service_owner_membership();

alter table public.clinic_services
  alter column owner_practitioner_role_id drop not null;

comment on column public.clinic_services.owner_practitioner_role_id is
  'DEPRECATED after Loop B2. Read only for compatibility during the expand-to-contract release; do not use for new authorization or ownership decisions.';
