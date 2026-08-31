-- Phase 4 vertical slice: FHIR Slot availability, guarded appointment booking,
-- provider queue access, and idempotent Encounter creation.

create type public.slot_status as enum (
  'busy',
  'free',
  'busy_unavailable',
  'busy_tentative',
  'entered_in_error'
);

-- FHIR Slot. A slot belongs to one PractitionerRole at one clinic and can be
-- consumed by exactly one Appointment.
create table public.appointment_slots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  practitioner_role_id uuid not null references public.practitioner_roles(id),
  appointment_id uuid unique references public.appointments(id),
  status public.slot_status not null default 'free',
  service_type text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at),
  check ((status = 'free' and appointment_id is null) or status <> 'free'),
  unique (practitioner_role_id, start_at)
);

create index appointment_slots_org_start_status_idx
  on public.appointment_slots (organization_id, start_at, status);

create or replace function public.enforce_appointment_slot_integrity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.practitioner_roles role
    where role.id = new.practitioner_role_id
      and role.organization_id = new.organization_id
      and role.active
  ) then
    raise exception 'The appointment slot practitioner role must be active at the same organization.'
      using errcode = '23514';
  end if;

  if new.appointment_id is not null and not exists (
    select 1
    from public.appointments appointment
    where appointment.id = new.appointment_id
      and appointment.organization_id = new.organization_id
      and appointment.practitioner_role_id = new.practitioner_role_id
      and appointment.start_at = new.start_at
      and appointment.end_at = new.end_at
  ) then
    raise exception 'The appointment consuming a slot must match its clinic, practitioner, and period.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger appointment_slots_tenant_integrity
  before insert or update on public.appointment_slots
  for each row execute function public.enforce_appointment_slot_integrity();
create trigger appointment_slots_set_updated_at
  before update on public.appointment_slots
  for each row execute function public.set_updated_at();
create trigger appointment_slots_audit
  after insert or update or delete on public.appointment_slots
  for each row execute function public.write_audit_log();

alter table public.appointment_slots enable row level security;

-- A registered patient can discover availability only at the clinic where
-- their Patient row lives. Operational staff see clinic availability, while a
-- provider sees only slots assigned to their own PractitionerRole.
create policy appointment_slots_select on public.appointment_slots
for select to authenticated
using (
  exists (
    select 1 from public.patients patient
    where patient.organization_id = appointment_slots.organization_id
      and patient.auth_user_id = auth.uid()
      and patient.active
  )
  or public.has_organization_role(
    appointment_slots.organization_id,
    array['front_desk', 'admin', 'owner']
  )
  or exists (
    select 1
    from public.practitioner_roles role
    join public.practitioners practitioner on practitioner.id = role.practitioner_id
    where role.id = appointment_slots.practitioner_role_id
      and role.active
      and practitioner.active
      and practitioner.auth_user_id = auth.uid()
  )
);

-- Appointments must be created by book_appointment_slot so that two actors
-- cannot consume the same availability. Providers read only their assignment;
-- front desk reads the clinic schedule; patients read only their own bookings.
drop policy if exists appointments_insert on public.appointments;
drop policy if exists appointments_select on public.appointments;
create policy appointments_select on public.appointments
for select to authenticated
using (
  public.is_patient_self(patient_id, organization_id)
  or public.has_organization_role(organization_id, array['front_desk', 'admin', 'owner'])
  or exists (
    select 1
    from public.practitioner_roles role
    join public.practitioners practitioner on practitioner.id = role.practitioner_id
    where role.id = appointments.practitioner_role_id
      and role.active
      and practitioner.active
      and practitioner.auth_user_id = auth.uid()
  )
);

create or replace function public.book_appointment_slot(
  p_slot_id uuid,
  p_patient_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller_id uuid := auth.uid();
  selected_slot public.appointment_slots%rowtype;
  selected_patient public.patients%rowtype;
  new_appointment_id uuid;
begin
  if caller_id is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select * into selected_slot
  from public.appointment_slots
  where id = p_slot_id
  for update;

  if selected_slot.id is null then
    raise exception 'Appointment slot not found.' using errcode = 'P0002';
  end if;
  if selected_slot.status <> 'free' or selected_slot.appointment_id is not null then
    raise exception 'This appointment slot is no longer available.' using errcode = '23505';
  end if;
  if selected_slot.start_at <= now() then
    raise exception 'Past appointment slots cannot be booked.' using errcode = '22007';
  end if;

  if p_patient_id is null then
    select * into selected_patient
    from public.patients
    where organization_id = selected_slot.organization_id
      and auth_user_id = caller_id
      and active;
  else
    select * into selected_patient
    from public.patients
    where id = p_patient_id
      and organization_id = selected_slot.organization_id
      and active;
  end if;

  if selected_patient.id is null then
    raise exception 'An active patient at this clinic is required.' using errcode = '23503';
  end if;

  if selected_patient.auth_user_id is distinct from caller_id
    and not public.has_organization_role(
      selected_slot.organization_id,
      array['front_desk', 'admin', 'owner']
    ) then
    raise exception 'You cannot book for this patient.' using errcode = '42501';
  end if;

  insert into public.appointments (
    organization_id,
    patient_id,
    practitioner_role_id,
    status,
    service_type,
    appointment_type,
    start_at,
    end_at,
    minutes_duration
  ) values (
    selected_slot.organization_id,
    selected_patient.id,
    selected_slot.practitioner_role_id,
    'booked',
    selected_slot.service_type,
    'ROUTINE',
    selected_slot.start_at,
    selected_slot.end_at,
    greatest(1, floor(extract(epoch from (selected_slot.end_at - selected_slot.start_at)) / 60)::integer)
  ) returning id into new_appointment_id;

  update public.appointment_slots
  set status = 'busy', appointment_id = new_appointment_id
  where id = selected_slot.id;

  return new_appointment_id;
end;
$$;

revoke all on function public.book_appointment_slot(uuid, uuid) from public;
grant execute on function public.book_appointment_slot(uuid, uuid) to authenticated;

-- Encounter creation is deliberately available only through this assignment-
-- checked function; direct browser writes to Encounter have no RLS policy.
drop policy if exists encounters_manage on public.encounters;

create or replace function public.start_appointment_encounter(p_appointment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller_id uuid := auth.uid();
  selected_appointment public.appointments%rowtype;
  existing_encounter public.encounters%rowtype;
  new_encounter_id uuid;
begin
  if caller_id is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select appointment.* into selected_appointment
  from public.appointments appointment
  join public.practitioner_roles role on role.id = appointment.practitioner_role_id
  join public.practitioners practitioner on practitioner.id = role.practitioner_id
  where appointment.id = p_appointment_id
    and role.active
    and role.role_code in ('doctor', 'specialist')
    and practitioner.active
    and practitioner.auth_user_id = caller_id
  for update of appointment;

  if selected_appointment.id is null then
    raise exception 'Assigned appointment not found.' using errcode = 'P0002';
  end if;
  if selected_appointment.status not in ('booked', 'arrived') then
    raise exception 'Only a booked or arrived appointment can be started.' using errcode = '23514';
  end if;

  select * into existing_encounter
  from public.encounters
  where appointment_id = selected_appointment.id;

  if existing_encounter.id is not null then
    if existing_encounter.status <> 'in_progress' then
      raise exception 'This appointment already has an encounter.' using errcode = '23505';
    end if;
    return existing_encounter.id;
  end if;

  insert into public.encounters (
    organization_id,
    patient_id,
    appointment_id,
    practitioner_role_id,
    status,
    class_code,
    service_type,
    period_start
  ) values (
    selected_appointment.organization_id,
    selected_appointment.patient_id,
    selected_appointment.id,
    selected_appointment.practitioner_role_id,
    'in_progress',
    'AMB',
    selected_appointment.service_type,
    now()
  ) returning id into new_encounter_id;

  update public.appointments
  set status = 'arrived'
  where id = selected_appointment.id;

  return new_encounter_id;
end;
$$;

revoke all on function public.start_appointment_encounter(uuid) from public;
grant execute on function public.start_appointment_encounter(uuid) to authenticated;

-- Patient registration metadata is converted into a Patient row inside the
-- Auth transaction. This also works when staging requires email confirmation,
-- because the row exists before the first confirmed session.
create or replace function public.create_patient_after_auth_signup()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  requested_organization_id uuid;
  requested_name text;
begin
  if coalesce((new.raw_user_meta_data ->> 'odyssey_patient_registration')::boolean, false) is not true then
    return new;
  end if;

  requested_organization_id := (new.raw_user_meta_data ->> 'organization_id')::uuid;
  requested_name := btrim(new.raw_user_meta_data ->> 'display_name');

  if requested_name is null or length(requested_name) < 2 or length(requested_name) > 120 then
    raise exception 'A patient display name between 2 and 120 characters is required.'
      using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.organizations organization
    where organization.id = requested_organization_id and organization.active
  ) then
    raise exception 'The selected clinic is not accepting registrations.'
      using errcode = '22023';
  end if;

  insert into public.patients (organization_id, auth_user_id, name)
  values (requested_organization_id, new.id, jsonb_build_object('text', requested_name))
  on conflict (organization_id, auth_user_id) where auth_user_id is not null do nothing;

  return new;
end;
$$;

revoke all on function public.create_patient_after_auth_signup() from public;

create trigger create_patient_after_auth_signup
  after insert on auth.users
  for each row execute function public.create_patient_after_auth_signup();

-- Postgres Changes applies the Appointment SELECT policy to each subscriber,
-- so the provider receives only appointments assigned to their practitioner.
alter table public.appointments replica identity full;
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'appointments'
    ) then
    alter publication supabase_realtime add table public.appointments;
  end if;
end;
$$;

comment on table public.appointment_slots is
  'FHIR Slot resources for the Phase 4 single-clinic scheduling flow.';
comment on function public.book_appointment_slot(uuid, uuid) is
  'Atomically consumes a free Slot and creates its FHIR Appointment.';
comment on function public.start_appointment_encounter(uuid) is
  'Starts the assigned provider appointment and creates one FHIR Encounter.';
