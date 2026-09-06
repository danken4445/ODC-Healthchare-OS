-- A trigger NEW record has the shape of its target table. Keep each tenant
-- check in its own trigger function so teleconsult inserts never evaluate
-- payout-only fields (and vice versa).

create or replace function public.enforce_teleconsult_room_tenant_integrity()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (
    select 1 from public.appointments appointment
    where appointment.id = new.appointment_id
      and appointment.organization_id = new.organization_id
      and appointment.delivery_mode = 'virtual'
  ) then
    raise exception 'Teleconsult room appointment must be virtual and belong to the same organization.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_practitioner_payout_setting_tenant_integrity()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (
    select 1 from public.practitioner_roles practitioner_role
    where practitioner_role.id = new.practitioner_role_id
      and practitioner_role.organization_id = new.organization_id
  ) then
    raise exception 'Payout setting practitioner must belong to the same organization.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_doctor_payout_tenant_integrity()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (
    select 1
    from public.encounters encounter
    join public.billing_events billing_event
      on billing_event.id = new.billing_event_id
      and billing_event.encounter_id = encounter.id
    join public.practitioner_roles practitioner_role
      on practitioner_role.id = new.practitioner_role_id
    where encounter.id = new.encounter_id
      and encounter.practitioner_role_id = new.practitioner_role_id
      and encounter.organization_id = new.organization_id
      and billing_event.organization_id = new.organization_id
      and practitioner_role.organization_id = new.organization_id
  ) then
    raise exception 'Payout links must all belong to the same organization and encounter.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists teleconsult_rooms_tenant_integrity on public.teleconsult_rooms;
drop trigger if exists practitioner_payout_settings_tenant_integrity on public.practitioner_payout_settings;
drop trigger if exists doctor_payouts_tenant_integrity on public.doctor_payouts;

create trigger teleconsult_rooms_tenant_integrity
  before insert or update on public.teleconsult_rooms
  for each row execute function public.enforce_teleconsult_room_tenant_integrity();
create trigger practitioner_payout_settings_tenant_integrity
  before insert or update on public.practitioner_payout_settings
  for each row execute function public.enforce_practitioner_payout_setting_tenant_integrity();
create trigger doctor_payouts_tenant_integrity
  before insert or update on public.doctor_payouts
  for each row execute function public.enforce_doctor_payout_tenant_integrity();

notify pgrst, 'reload schema';
