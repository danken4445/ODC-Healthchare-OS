-- Loop 1: complete the core visit lifecycle across the public portal, patient,
-- front desk, and assigned doctor. Public waiting-room data is deliberately
-- projected into a table that contains no patient identity fields.

create type public.waiting_queue_stage as enum (
  'scheduled',
  'waiting',
  'in_progress',
  'completed',
  'cancelled',
  'noshow'
);

-- FHIR HealthcareService. Pricing is included now so later financial work can
-- reference a stable service identifier instead of changing Slot/Appointment.
create table public.clinic_services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  code text not null,
  name text not null,
  description text,
  duration_minutes integer not null default 30 check (duration_minutes > 0),
  base_price numeric(12, 2) check (base_price is null or base_price >= 0),
  currency text not null default 'PHP' check (currency ~ '^[A-Z]{3}$'),
  active boolean not null default true,
  booking_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

alter table public.appointments
  add column clinic_service_id uuid references public.clinic_services(id),
  add column queue_date date,
  add column queue_number integer check (queue_number is null or queue_number > 0);

alter table public.appointment_slots
  add column clinic_service_id uuid references public.clinic_services(id);

create or replace function public.sync_appointment_service_from_slot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.appointment_id is not null and new.clinic_service_id is not null then
    update public.appointments
    set clinic_service_id = new.clinic_service_id
    where id = new.appointment_id
      and clinic_service_id is distinct from new.clinic_service_id;
  end if;
  return new;
end;
$$;

create trigger appointment_slots_sync_service
  after insert or update of appointment_id, clinic_service_id on public.appointment_slots
  for each row execute function public.sync_appointment_service_from_slot();

create unique index appointments_daily_queue_number_key
  on public.appointments (organization_id, queue_date, queue_number)
  where queue_date is not null and queue_number is not null;

create or replace function public.assign_appointment_queue_number()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if new.start_at is null then
    new.queue_date := null;
    new.queue_number := null;
    return new;
  end if;

  if tg_op = 'UPDATE'
    and new.organization_id = old.organization_id
    and new.start_at = old.start_at
    and new.queue_number is not null then
    return new;
  end if;

  new.queue_date := (new.start_at at time zone 'UTC')::date;
  perform pg_advisory_xact_lock(
    hashtextextended(new.organization_id::text || ':' || new.queue_date::text, 0)
  );
  select coalesce(max(appointment.queue_number), 0) + 1
    into new.queue_number
  from public.appointments appointment
  where appointment.organization_id = new.organization_id
    and appointment.queue_date = new.queue_date
    and appointment.id is distinct from new.id;
  return new;
end;
$$;

create trigger appointments_assign_queue_number
  before insert or update of organization_id, start_at on public.appointments
  for each row execute function public.assign_appointment_queue_number();

-- Backfill appointments created by earlier phases in deterministic order.
with numbered as (
  select
    appointment.id,
    (appointment.start_at at time zone 'UTC')::date as queue_date,
    row_number() over (
      partition by appointment.organization_id, (appointment.start_at at time zone 'UTC')::date
      order by appointment.start_at, appointment.created_at, appointment.id
    ) as queue_number
  from public.appointments appointment
  where appointment.start_at is not null
)
update public.appointments appointment
set queue_date = numbered.queue_date,
    queue_number = numbered.queue_number
from numbered
where numbered.id = appointment.id;

create table public.waiting_room_queue (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references public.appointments(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  queue_date date not null,
  queue_number integer not null check (queue_number > 0),
  service_name text not null,
  scheduled_at timestamptz not null,
  stage public.waiting_queue_stage not null default 'scheduled',
  updated_at timestamptz not null default now(),
  unique (organization_id, queue_date, queue_number)
);

create index waiting_room_queue_display_idx
  on public.waiting_room_queue (organization_id, queue_date, stage, queue_number);

create or replace function public.sync_waiting_room_from_appointment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_stage public.waiting_queue_stage;
begin
  if tg_op = 'DELETE' then
    delete from public.waiting_room_queue where appointment_id = old.id;
    return old;
  end if;

  if new.start_at is null or new.queue_date is null or new.queue_number is null then
    delete from public.waiting_room_queue where appointment_id = new.id;
    return new;
  end if;

  next_stage := case new.status
    when 'arrived' then 'waiting'::public.waiting_queue_stage
    when 'fulfilled' then 'completed'::public.waiting_queue_stage
    when 'cancelled' then 'cancelled'::public.waiting_queue_stage
    when 'noshow' then 'noshow'::public.waiting_queue_stage
    else 'scheduled'::public.waiting_queue_stage
  end;

  insert into public.waiting_room_queue (
    appointment_id, organization_id, queue_date, queue_number,
    service_name, scheduled_at, stage, updated_at
  ) values (
    new.id, new.organization_id, new.queue_date, new.queue_number,
    coalesce(new.service_type, 'Consultation'), new.start_at, next_stage, now()
  )
  on conflict (appointment_id) do update set
    organization_id = excluded.organization_id,
    queue_date = excluded.queue_date,
    queue_number = excluded.queue_number,
    service_name = excluded.service_name,
    scheduled_at = excluded.scheduled_at,
    stage = case
      when public.waiting_room_queue.stage = 'in_progress'
        and excluded.stage = 'waiting' then public.waiting_room_queue.stage
      else excluded.stage
    end,
    updated_at = now();
  return new;
end;
$$;

create trigger appointments_sync_waiting_room
  after insert or update or delete on public.appointments
  for each row execute function public.sync_waiting_room_from_appointment();

create or replace function public.sync_waiting_room_from_encounter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.appointment_id is null then return new; end if;
  update public.waiting_room_queue
  set stage = case
      when new.status = 'in_progress' then 'in_progress'::public.waiting_queue_stage
      when new.status = 'finished' then 'completed'::public.waiting_queue_stage
      when new.status in ('cancelled', 'entered_in_error') then 'cancelled'::public.waiting_queue_stage
      else stage
    end,
    updated_at = now()
  where appointment_id = new.appointment_id;
  return new;
end;
$$;

create trigger encounters_sync_waiting_room
  after insert or update of status on public.encounters
  for each row execute function public.sync_waiting_room_from_encounter();

-- Seed the public queue projection for appointments predating this migration.
insert into public.waiting_room_queue (
  appointment_id, organization_id, queue_date, queue_number,
  service_name, scheduled_at, stage
)
select
  appointment.id,
  appointment.organization_id,
  appointment.queue_date,
  appointment.queue_number,
  coalesce(appointment.service_type, 'Consultation'),
  appointment.start_at,
  case
    when encounter.status = 'in_progress' then 'in_progress'::public.waiting_queue_stage
    when encounter.status = 'finished' then 'completed'::public.waiting_queue_stage
    when appointment.status = 'arrived' then 'waiting'::public.waiting_queue_stage
    when appointment.status = 'fulfilled' then 'completed'::public.waiting_queue_stage
    when appointment.status = 'cancelled' then 'cancelled'::public.waiting_queue_stage
    when appointment.status = 'noshow' then 'noshow'::public.waiting_queue_stage
    else 'scheduled'::public.waiting_queue_stage
  end
from public.appointments appointment
left join public.encounters encounter on encounter.appointment_id = appointment.id
where appointment.start_at is not null;

create trigger clinic_services_set_updated_at
  before update on public.clinic_services
  for each row execute function public.set_updated_at();
create trigger clinic_services_audit
  after insert or update or delete on public.clinic_services
  for each row execute function public.write_audit_log();
create trigger waiting_room_queue_audit
  after insert or update or delete on public.waiting_room_queue
  for each row execute function public.write_audit_log();

alter table public.clinic_services enable row level security;
alter table public.waiting_room_queue enable row level security;

create policy organizations_public_select on public.organizations
for select to anon
using (active);

create policy clinic_services_public_select on public.clinic_services
for select to anon, authenticated
using (active);

create policy clinic_services_manage on public.clinic_services
for all to authenticated
using (public.has_organization_role(organization_id, array['admin', 'owner']))
with check (public.has_organization_role(organization_id, array['admin', 'owner']));

drop policy if exists appointment_slots_select on public.appointment_slots;
create policy appointment_slots_select on public.appointment_slots
for select to authenticated
using (
  exists (
    select 1 from public.patients patient
    where patient.organization_id = appointment_slots.organization_id
      and patient.auth_user_id = auth.uid()
      and patient.active
      and (
        appointment_slots.status = 'free'
        or exists (
          select 1 from public.appointments appointment
          where appointment.id = appointment_slots.appointment_id
            and appointment.patient_id = patient.id
        )
      )
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
      and role.active and practitioner.active
      and practitioner.auth_user_id = auth.uid()
  )
);

create policy appointment_slots_public_select on public.appointment_slots
for select to anon
using (
  status = 'free'
  and appointment_id is null
  and start_at > now()
);

create policy waiting_room_queue_public_select on public.waiting_room_queue
for select to anon, authenticated
using (queue_date between (now() at time zone 'UTC')::date - 1 and (now() at time zone 'UTC')::date + 1);

-- Doctors create and withdraw only their own unconsumed availability. Admins
-- retain the same capability for operational recovery.
create policy appointment_slots_doctor_insert on public.appointment_slots
for insert to authenticated
with check (
  public.has_organization_role(organization_id, array['admin', 'owner'])
  or exists (
    select 1
    from public.practitioner_roles role
    join public.practitioners practitioner on practitioner.id = role.practitioner_id
    where role.id = appointment_slots.practitioner_role_id
      and role.role_code in ('doctor', 'specialist')
      and role.active and practitioner.active
      and practitioner.auth_user_id = auth.uid()
  )
);

create policy appointment_slots_doctor_update on public.appointment_slots
for update to authenticated
using (
  appointment_id is null and (
    public.has_organization_role(organization_id, array['admin', 'owner'])
    or exists (
      select 1
      from public.practitioner_roles role
      join public.practitioners practitioner on practitioner.id = role.practitioner_id
      where role.id = appointment_slots.practitioner_role_id
        and role.role_code in ('doctor', 'specialist')
        and role.active and practitioner.active
        and practitioner.auth_user_id = auth.uid()
    )
  )
)
with check (appointment_id is null);

create or replace function public.create_appointment_slot(
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_clinic_service_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller_role public.practitioner_roles%rowtype;
  selected_service public.clinic_services%rowtype;
  new_slot_id uuid;
begin
  if p_start_at <= now() or p_end_at <= p_start_at then
    raise exception 'Availability must be a future period with a valid end time.' using errcode = '22007';
  end if;

  select * into selected_service from public.clinic_services service
  where service.id = p_clinic_service_id
    and service.active and service.booking_enabled;
  if selected_service.id is null then
    raise exception 'The selected service is not bookable.' using errcode = '23503';
  end if;

  select role.* into caller_role
  from public.practitioner_roles role
  join public.practitioners practitioner on practitioner.id = role.practitioner_id
  where practitioner.auth_user_id = auth.uid()
    and practitioner.active and role.active
    and role.organization_id = selected_service.organization_id
    and role.role_code in ('doctor', 'specialist')
  order by role.created_at
  limit 1;

  if caller_role.id is null then
    raise exception 'An active doctor role at this clinic is required.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(caller_role.id::text, 0));
  if exists (
    select 1 from public.appointment_slots slot
    where slot.practitioner_role_id = caller_role.id
      and slot.status <> 'entered_in_error'
      and tstzrange(slot.start_at, slot.end_at, '[)') && tstzrange(p_start_at, p_end_at, '[)')
  ) then
    raise exception 'Availability overlaps an existing slot.' using errcode = '23P01';
  end if;

  insert into public.appointment_slots (
    organization_id, practitioner_role_id, clinic_service_id,
    service_type, start_at, end_at
  ) values (
    caller_role.organization_id, caller_role.id, selected_service.id,
    selected_service.name, p_start_at, p_end_at
  ) returning id into new_slot_id;
  return new_slot_id;
end;
$$;

create or replace function public.set_appointment_slot_unavailable(
  p_slot_id uuid,
  p_unavailable boolean
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  update public.appointment_slots
  set status = case when p_unavailable then 'busy_unavailable'::public.slot_status else 'free'::public.slot_status end
  where id = p_slot_id
    and appointment_id is null
    and (
      public.has_organization_role(organization_id, array['admin', 'owner'])
      or exists (
        select 1
        from public.practitioner_roles role
        join public.practitioners practitioner on practitioner.id = role.practitioner_id
        where role.id = appointment_slots.practitioner_role_id
          and role.role_code in ('doctor', 'specialist')
          and role.active and practitioner.active
          and practitioner.auth_user_id = auth.uid()
      )
    );
  if not found then
    raise exception 'Editable appointment slot not found.' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.update_appointment_status(
  p_appointment_id uuid,
  p_status public.appointment_status
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_appointment public.appointments%rowtype;
begin
  select * into current_appointment
  from public.appointments appointment
  where appointment.id = p_appointment_id
  for update;

  if current_appointment.id is null
    or not public.has_organization_role(
      current_appointment.organization_id,
      array['front_desk', 'admin', 'owner']
    ) then
    raise exception 'Appointment not found.' using errcode = 'P0002';
  end if;

  if not (
    (current_appointment.status = 'booked' and p_status in ('arrived', 'cancelled', 'noshow'))
    or (current_appointment.status = 'arrived' and p_status in ('cancelled', 'noshow'))
    or current_appointment.status = p_status
  ) then
    raise exception 'Invalid appointment status transition.' using errcode = '23514';
  end if;

  update public.appointments set status = p_status where id = p_appointment_id;
end;
$$;

revoke all on function public.create_appointment_slot(timestamptz, timestamptz, uuid) from public;
revoke all on function public.set_appointment_slot_unavailable(uuid, boolean) from public;
revoke all on function public.update_appointment_status(uuid, public.appointment_status) from public;
grant execute on function public.create_appointment_slot(timestamptz, timestamptz, uuid) to authenticated;
grant execute on function public.set_appointment_slot_unavailable(uuid, boolean) to authenticated;
grant execute on function public.update_appointment_status(uuid, public.appointment_status) to authenticated;

-- Scheduling mutations are RPC-only. This prevents browser callers from
-- bypassing overlap checks, catalog linkage, or lifecycle transition rules.
revoke insert, update, delete on public.appointment_slots from authenticated;
revoke update on public.appointments from authenticated;

grant select on public.organizations, public.clinic_services,
  public.appointment_slots, public.waiting_room_queue to anon;
grant select on public.clinic_services, public.waiting_room_queue to authenticated;

alter table public.waiting_room_queue replica identity full;
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'waiting_room_queue'
    ) then
    alter publication supabase_realtime add table public.waiting_room_queue;
  end if;
end;
$$;

comment on table public.clinic_services is
  'FHIR HealthcareService catalog used by public browsing and stable scheduling references.';
comment on table public.waiting_room_queue is
  'Privacy-safe public projection of the visit queue; contains no patient identity fields.';
