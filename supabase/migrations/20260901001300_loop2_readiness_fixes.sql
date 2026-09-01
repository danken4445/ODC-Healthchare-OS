-- Readiness fixes before Loop 3.
-- Finalizes provider scheduling tenancy/audit behavior, prevents retired
-- services from being booked, and adds a single versioned SOAP-note write path.

alter table public.clinic_services
  add column if not exists owner_practitioner_role_id uuid references public.practitioner_roles(id);

-- Preserve ownership for deployments that already generated slots before this
-- column existed. If a clinic has only one doctor, that doctor safely owns its
-- remaining legacy catalog rows; multi-doctor shared rows remain admin-owned.
update public.clinic_services service
set owner_practitioner_role_id = candidate.practitioner_role_id
from (
  select slot.clinic_service_id,
    (array_agg(distinct slot.practitioner_role_id))[1] as practitioner_role_id
  from public.appointment_slots slot
  where slot.clinic_service_id is not null
  group by slot.clinic_service_id
  having count(distinct slot.practitioner_role_id) = 1
) candidate
where service.id = candidate.clinic_service_id
  and service.owner_practitioner_role_id is null;

update public.clinic_services service
set owner_practitioner_role_id = candidate.practitioner_role_id
from (
  select practitioner_role.organization_id,
    (array_agg(practitioner_role.id))[1] as practitioner_role_id
  from public.practitioner_roles practitioner_role
  join public.practitioners practitioner
    on practitioner.id = practitioner_role.practitioner_id
  where practitioner_role.role_code in ('doctor', 'specialist')
    and practitioner_role.active and practitioner.active
  group by practitioner_role.organization_id
  having count(*) = 1
) candidate
where service.organization_id = candidate.organization_id
  and service.owner_practitioner_role_id is null;

create index if not exists clinic_services_owner_idx
  on public.clinic_services (organization_id, owner_practitioner_role_id)
  where owner_practitioner_role_id is not null;

create or replace function public.get_current_provider_role_id(p_organization_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select practitioner_role.id
  from public.practitioner_roles practitioner_role
  join public.practitioners practitioner on practitioner.id = practitioner_role.practitioner_id
  where practitioner.auth_user_id = auth.uid()
    and practitioner.active and practitioner_role.active
    and practitioner_role.organization_id = p_organization_id
    and practitioner_role.role_code in ('doctor', 'specialist')
  order by practitioner_role.created_at
  limit 1;
$$;

create or replace function public.enforce_clinic_service_owner_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_practitioner_role_id is not null and not exists (
    select 1 from public.practitioner_roles practitioner_role
    where practitioner_role.id = new.owner_practitioner_role_id
      and practitioner_role.organization_id = new.organization_id
      and practitioner_role.role_code in ('doctor', 'specialist')
  ) then
    raise exception 'Service owner must be a doctor role at the same clinic.' using errcode = '23503';
  end if;
  return new;
end;
$$;

drop trigger if exists clinic_services_owner_tenant_integrity on public.clinic_services;
create trigger clinic_services_owner_tenant_integrity
  before insert or update on public.clinic_services
  for each row execute function public.enforce_clinic_service_owner_tenant();

create or replace function public.save_provider_clinic_service(
  p_service_id uuid,
  p_organization_id uuid,
  p_code text,
  p_name text,
  p_description text,
  p_duration_minutes integer,
  p_base_price numeric,
  p_booking_enabled boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller_role public.practitioner_roles%rowtype;
  existing_service public.clinic_services%rowtype;
  saved_id uuid;
begin
  select practitioner_role.* into caller_role
  from public.practitioner_roles practitioner_role
  join public.practitioners practitioner on practitioner.id = practitioner_role.practitioner_id
  where practitioner.auth_user_id = auth.uid()
    and practitioner.active and practitioner_role.active
    and practitioner_role.organization_id = p_organization_id
    and practitioner_role.role_code in ('doctor', 'specialist')
  order by practitioner_role.created_at
  limit 1;

  if caller_role.id is null then
    raise exception 'An active doctor role at this clinic is required.' using errcode = '42501';
  end if;
  if nullif(btrim(p_code), '') is null or length(btrim(p_code)) > 80
    or nullif(btrim(p_name), '') is null or length(btrim(p_name)) > 160
    or length(coalesce(p_description, '')) > 500
    or p_duration_minutes not between 5 and 480
    or p_base_price < 0 then
    raise exception 'Service values are invalid.' using errcode = '22023';
  end if;

  if p_service_id is null then
    insert into public.clinic_services (
      organization_id, owner_practitioner_role_id, code, name, description,
      duration_minutes, base_price, currency, booking_enabled
    ) values (
      p_organization_id, caller_role.id, upper(btrim(p_code)), btrim(p_name),
      nullif(btrim(p_description), ''), p_duration_minutes, p_base_price,
      'PHP', coalesce(p_booking_enabled, false)
    ) returning id into saved_id;
  else
    select service.* into existing_service
    from public.clinic_services service
    where service.id = p_service_id
      and service.organization_id = p_organization_id
      and service.owner_practitioner_role_id = caller_role.id
      and service.active
    for update;
    if existing_service.id is null then
      raise exception 'Editable provider service not found.' using errcode = 'P0002';
    end if;
    update public.clinic_services service set
      code = upper(btrim(p_code)),
      name = btrim(p_name),
      description = nullif(btrim(p_description), ''),
      duration_minutes = p_duration_minutes,
      base_price = p_base_price,
      booking_enabled = coalesce(p_booking_enabled, false)
    where service.id = p_service_id
      and service.organization_id = p_organization_id
      and service.owner_practitioner_role_id = caller_role.id
      and service.active
    returning service.id into saved_id;
    -- Scheduling changes invalidate generated free slots. Preserve booked
    -- appointments, clear the recurring rule, and require an explicit resave.
    if existing_service.duration_minutes is distinct from p_duration_minutes
      or existing_service.name is distinct from btrim(p_name)
      or existing_service.booking_enabled is distinct from coalesce(p_booking_enabled, false) then
      delete from public.provider_weekly_availability
      where clinic_service_id = saved_id and practitioner_role_id = caller_role.id;
      delete from public.appointment_slots
      where clinic_service_id = saved_id and practitioner_role_id = caller_role.id
        and appointment_id is null and status = 'free' and start_at > now();
    end if;
  end if;
  return saved_id;
end;
$$;

create or replace function public.retire_provider_clinic_service(p_service_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  selected_service public.clinic_services%rowtype;
begin
  select service.* into selected_service
  from public.clinic_services service
  join public.practitioner_roles practitioner_role
    on practitioner_role.id = service.owner_practitioner_role_id
  join public.practitioners practitioner
    on practitioner.id = practitioner_role.practitioner_id
  where service.id = p_service_id
    and service.active
    and practitioner.auth_user_id = auth.uid()
    and practitioner.active and practitioner_role.active
    and practitioner_role.role_code in ('doctor', 'specialist')
  for update of service;
  if selected_service.id is null then
    raise exception 'Editable provider service not found.' using errcode = 'P0002';
  end if;

  update public.clinic_services
  set active = false, booking_enabled = false
  where id = selected_service.id;
  delete from public.provider_weekly_availability
  where clinic_service_id = selected_service.id;
  update public.appointment_slots
  set status = 'busy_unavailable'
  where clinic_service_id = selected_service.id
    and appointment_id is null and status = 'free' and start_at > now();
end;
$$;

-- Legacy one-off scheduling RPCs follow the same provider-ownership boundary
-- as the recurring scheduler. This closes an alternate path to publishing
-- another doctor's services.
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
  selected_service public.clinic_services%rowtype;
  caller_role_id uuid;
  new_slot_id uuid;
begin
  if p_start_at <= now() or p_end_at <= p_start_at then
    raise exception 'Availability must be a future period with a valid end time.' using errcode = '22007';
  end if;
  select service.* into selected_service
  from public.clinic_services service
  where service.id = p_clinic_service_id and service.active and service.booking_enabled;
  if selected_service.id is null then
    raise exception 'The selected service is not bookable.' using errcode = '23503';
  end if;
  caller_role_id := public.get_current_provider_role_id(selected_service.organization_id);
  if caller_role_id is null
    or caller_role_id is distinct from selected_service.owner_practitioner_role_id then
    raise exception 'Only the doctor who owns this service can schedule it.' using errcode = '42501';
  end if;
  if p_end_at is distinct from
    p_start_at + make_interval(mins => selected_service.duration_minutes) then
    raise exception 'The slot must match the service duration.' using errcode = '22007';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(caller_role_id::text, 0));
  if exists (
    select 1 from public.appointment_slots slot
    where slot.practitioner_role_id = caller_role_id
      and slot.status <> 'entered_in_error'
      and tstzrange(slot.start_at, slot.end_at, '[)')
        && tstzrange(p_start_at, p_end_at, '[)')
  ) then
    raise exception 'Availability overlaps an existing slot.' using errcode = '23P01';
  end if;
  insert into public.appointment_slots (
    organization_id, practitioner_role_id, clinic_service_id,
    service_type, start_at, end_at
  ) values (
    selected_service.organization_id, caller_role_id, selected_service.id,
    selected_service.name, p_start_at, p_end_at
  ) returning id into new_slot_id;
  return new_slot_id;
end;
$$;

create or replace function public.create_appointment_slot_range(
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_clinic_service_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  selected_service public.clinic_services%rowtype;
  caller_role_id uuid;
  slot_count integer;
begin
  if p_start_at <= now() or p_end_at <= p_start_at then
    raise exception 'Availability must be a future period with a valid end time.' using errcode = '22007';
  end if;
  select service.* into selected_service
  from public.clinic_services service
  where service.id = p_clinic_service_id and service.active and service.booking_enabled;
  if selected_service.id is null then
    raise exception 'The selected service is not bookable.' using errcode = '23503';
  end if;
  caller_role_id := public.get_current_provider_role_id(selected_service.organization_id);
  if caller_role_id is null
    or caller_role_id is distinct from selected_service.owner_practitioner_role_id then
    raise exception 'Only the doctor who owns this service can schedule it.' using errcode = '42501';
  end if;
  if extract(epoch from p_end_at - p_start_at)::integer
    % (selected_service.duration_minutes * 60) <> 0 then
    raise exception 'Availability end time must align with the service duration.' using errcode = '22007';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(caller_role_id::text, 0));
  if exists (
    select 1 from public.appointment_slots slot
    where slot.practitioner_role_id = caller_role_id
      and slot.status <> 'entered_in_error'
      and tstzrange(slot.start_at, slot.end_at, '[)')
        && tstzrange(p_start_at, p_end_at, '[)')
  ) then
    raise exception 'Availability overlaps an existing slot.' using errcode = '23P01';
  end if;
  insert into public.appointment_slots (
    organization_id, practitioner_role_id, clinic_service_id,
    service_type, start_at, end_at
  )
  select selected_service.organization_id, caller_role_id, selected_service.id,
    selected_service.name, series.slot_start_at,
    series.slot_start_at + make_interval(mins => selected_service.duration_minutes)
  from generate_series(
    p_start_at,
    p_end_at - make_interval(mins => selected_service.duration_minutes),
    make_interval(mins => selected_service.duration_minutes)
  ) as series(slot_start_at);
  get diagnostics slot_count = row_count;
  return slot_count;
end;
$$;

-- A final booking guard protects against stale clients and independently
-- administered services, even if a free slot survived service retirement.
create or replace function public.reject_inactive_service_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.clinic_service_id is not null
    and new.status = 'busy' and old.status is distinct from 'busy' and not exists (
    select 1 from public.clinic_services service
    where service.id = new.clinic_service_id
      and service.organization_id = new.organization_id
      and service.active and service.booking_enabled
  ) then
    raise exception 'The service for this slot is no longer bookable.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists appointment_slots_active_service_booking on public.appointment_slots;
create trigger appointment_slots_active_service_booking
  before update of status, appointment_id on public.appointment_slots
  for each row execute function public.reject_inactive_service_booking();

-- Bring recurring availability under the same hard tenant boundary as every
-- other operational resource.
alter table public.provider_weekly_availability
  add column if not exists organization_id uuid references public.organizations(id);

update public.provider_weekly_availability availability
set organization_id = practitioner_role.organization_id
from public.practitioner_roles practitioner_role
where practitioner_role.id = availability.practitioner_role_id
  and availability.organization_id is null;

alter table public.provider_weekly_availability
  alter column organization_id set not null;

create index if not exists provider_weekly_availability_org_role_idx
  on public.provider_weekly_availability (organization_id, practitioner_role_id, day_of_week);

create or replace function public.enforce_provider_availability_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.practitioner_roles practitioner_role
    where practitioner_role.id = new.practitioner_role_id
      and practitioner_role.organization_id = new.organization_id
  ) or not exists (
    select 1 from public.clinic_services service
    where service.id = new.clinic_service_id
      and service.organization_id = new.organization_id
      and service.owner_practitioner_role_id = new.practitioner_role_id
  ) then
    raise exception 'Availability role and service must belong to the same clinic and provider.' using errcode = '23503';
  end if;
  return new;
end;
$$;

drop trigger if exists provider_weekly_availability_tenant_integrity on public.provider_weekly_availability;
create trigger provider_weekly_availability_tenant_integrity
  before insert or update on public.provider_weekly_availability
  for each row execute function public.enforce_provider_availability_tenant();
drop trigger if exists provider_weekly_availability_set_updated_at on public.provider_weekly_availability;
create trigger provider_weekly_availability_set_updated_at
  before update on public.provider_weekly_availability
  for each row execute function public.set_updated_at();
drop trigger if exists provider_weekly_availability_audit on public.provider_weekly_availability;
create trigger provider_weekly_availability_audit
  after insert or update or delete on public.provider_weekly_availability
  for each row execute function public.write_audit_log();

drop policy if exists provider_weekly_availability_select on public.provider_weekly_availability;
create policy provider_weekly_availability_select
on public.provider_weekly_availability for select to authenticated
using (
  public.has_organization_role(organization_id, array['admin', 'owner'])
  or exists (
    select 1 from public.practitioner_roles practitioner_role
    join public.practitioners practitioner on practitioner.id = practitioner_role.practitioner_id
    where practitioner_role.id = provider_weekly_availability.practitioner_role_id
      and practitioner_role.organization_id = provider_weekly_availability.organization_id
      and practitioner.auth_user_id = auth.uid()
      and practitioner.active and practitioner_role.active
  )
);

create or replace function public.save_provider_weekly_availability(
  p_clinic_service_id uuid,
  p_windows jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller_role public.practitioner_roles%rowtype;
  selected_service public.clinic_services%rowtype;
  window_row record;
  local_day date;
  slot_start timestamptz;
  slot_end timestamptz;
  created_count integer := 0;
  inserted_count integer := 0;
  schedule_end date := (timezone('Asia/Manila', now())::date + 41);
begin
  if p_windows is null or jsonb_typeof(p_windows) <> 'array'
    or jsonb_array_length(p_windows) not between 1 and 7 then
    raise exception 'Weekly availability requires one to seven day windows.' using errcode = '22023';
  end if;

  select * into selected_service from public.clinic_services service
  where service.id = p_clinic_service_id and service.active and service.booking_enabled;
  if selected_service.id is null or selected_service.owner_practitioner_role_id is null then
    raise exception 'The selected provider service is not bookable.' using errcode = '23503';
  end if;
  select practitioner_role.* into caller_role
  from public.practitioner_roles practitioner_role
  join public.practitioners practitioner on practitioner.id = practitioner_role.practitioner_id
  where practitioner_role.id = selected_service.owner_practitioner_role_id
    and practitioner.auth_user_id = auth.uid()
    and practitioner.active and practitioner_role.active
    and practitioner_role.role_code in ('doctor', 'specialist');
  if caller_role.id is null then
    raise exception 'An active owning doctor role is required.' using errcode = '42501';
  end if;

  if (select count(*) from jsonb_to_recordset(p_windows) as x(day_of_week smallint, start_time time, end_time time))
    <> (select count(distinct x.day_of_week) from jsonb_to_recordset(p_windows) as x(day_of_week smallint, start_time time, end_time time)) then
    raise exception 'Only one availability window per day is allowed.' using errcode = '22023';
  end if;
  for window_row in
    select * from jsonb_to_recordset(p_windows) as x(day_of_week smallint, start_time time, end_time time)
  loop
    if window_row.day_of_week not between 0 and 6
      or window_row.start_time is null or window_row.end_time is null
      or window_row.end_time <= window_row.start_time
      or extract(epoch from (window_row.end_time - window_row.start_time))::integer
        % (selected_service.duration_minutes * 60) <> 0 then
      raise exception 'Each day needs a valid time range in service-duration increments.' using errcode = '22007';
    end if;
  end loop;

  perform pg_advisory_xact_lock(hashtextextended(caller_role.id::text, 0));
  delete from public.provider_weekly_availability
  where practitioner_role_id = caller_role.id and clinic_service_id = selected_service.id;
  insert into public.provider_weekly_availability (
    organization_id, practitioner_role_id, clinic_service_id,
    day_of_week, start_time, end_time
  )
  select caller_role.organization_id, caller_role.id, selected_service.id,
    x.day_of_week, x.start_time, x.end_time
  from jsonb_to_recordset(p_windows) as x(day_of_week smallint, start_time time, end_time time);

  delete from public.appointment_slots
  where practitioner_role_id = caller_role.id
    and clinic_service_id = selected_service.id
    and status = 'free' and start_at > now();
  for window_row in
    select * from public.provider_weekly_availability
    where practitioner_role_id = caller_role.id and clinic_service_id = selected_service.id
  loop
    for local_day in
      select generate_series(timezone('Asia/Manila', now())::date, schedule_end, interval '1 day')::date
    loop
      if extract(dow from local_day)::smallint <> window_row.day_of_week then continue; end if;
      slot_start := (local_day + window_row.start_time) at time zone 'Asia/Manila';
      slot_end := (local_day + window_row.end_time) at time zone 'Asia/Manila';
      if slot_start <= now() then continue; end if;
      insert into public.appointment_slots (
        organization_id, practitioner_role_id, clinic_service_id,
        service_type, start_at, end_at
      )
      select caller_role.organization_id, caller_role.id, selected_service.id,
        selected_service.name, series.slot_start_at,
        series.slot_start_at + make_interval(mins => selected_service.duration_minutes)
      from generate_series(
        slot_start,
        slot_end - make_interval(mins => selected_service.duration_minutes),
        make_interval(mins => selected_service.duration_minutes)
      ) as series(slot_start_at)
      where not exists (
        select 1 from public.appointment_slots slot
        where slot.practitioner_role_id = caller_role.id
          and slot.status <> 'entered_in_error'
          and tstzrange(slot.start_at, slot.end_at, '[)') && tstzrange(
            series.slot_start_at,
            series.slot_start_at + make_interval(mins => selected_service.duration_minutes),
            '[)'
          )
      );
      get diagnostics inserted_count = row_count;
      created_count := created_count + inserted_count;
    end loop;
  end loop;
  return created_count;
end;
$$;

-- One input creates one immutable version of the complete SOAP note.
create or replace function public.add_soap_note(
  p_encounter_id uuid,
  p_text text,
  p_supersedes_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  selected_encounter public.encounters%rowtype;
  practitioner_id uuid;
  latest_id uuid;
  observation_id uuid;
  note_text text := btrim(p_text);
begin
  select * into selected_encounter from public.encounters
  where id = p_encounter_id for update;
  if selected_encounter.id is null or selected_encounter.status <> 'in_progress' then
    raise exception 'An in-progress encounter is required.' using errcode = '22023';
  end if;
  practitioner_id := public.get_current_practitioner(
    selected_encounter.organization_id, array['doctor', 'nurse', 'specialist']
  );
  if practitioner_id is null then
    raise exception 'Clinical documentation access is required.' using errcode = '42501';
  end if;
  if note_text is null or length(note_text) < 1 or length(note_text) > 20000 then
    raise exception 'SOAP note text is required and must be 20,000 characters or fewer.' using errcode = '22023';
  end if;
  select observation.id into latest_id
  from public.observations observation
  where observation.encounter_id = selected_encounter.id
    and observation.code = 'SOAP-NOTE'
  order by observation.created_at desc
  limit 1;
  if latest_id is distinct from p_supersedes_id then
    raise exception 'A SOAP revision must supersede the latest note version.' using errcode = '40001';
  end if;

  insert into public.observations (
    organization_id, patient_id, encounter_id, performer_practitioner_id,
    status, category_codes, code_system, code, code_display,
    effective_at, issued_at, value, supersedes_id
  ) values (
    selected_encounter.organization_id, selected_encounter.patient_id,
    selected_encounter.id, practitioner_id, 'final',
    '[{"coding":[{"code":"clinical-note","display":"Clinical note"}]}]'::jsonb,
    'urn:odyssey:soap', 'SOAP-NOTE', 'SOAP note', now(), now(),
    jsonb_build_object('text', note_text), p_supersedes_id
  ) returning id into observation_id;
  return observation_id;
end;
$$;

-- Nurses need the appointment context to open in-progress charts, while
-- encounter creation remains assignment-checked and doctor-only.
drop policy if exists appointments_select on public.appointments;
create policy appointments_select on public.appointments
for select to authenticated
using (
  public.is_patient_self(patient_id, organization_id)
  or public.has_organization_role(organization_id, array['front_desk', 'admin', 'owner', 'nurse'])
  or exists (
    select 1 from public.practitioner_roles practitioner_role
    join public.practitioners practitioner on practitioner.id = practitioner_role.practitioner_id
    where practitioner_role.id = appointments.practitioner_role_id
      and practitioner_role.active and practitioner.active
      and practitioner.auth_user_id = auth.uid()
  )
);

drop policy if exists clinic_services_manage on public.clinic_services;
create policy clinic_services_manage on public.clinic_services for all to authenticated
using (
  public.is_superadmin()
  or public.has_organization_role(organization_id, array['admin', 'owner'])
  or exists (
    select 1 from public.practitioner_roles practitioner_role
    join public.practitioners practitioner on practitioner.id = practitioner_role.practitioner_id
    where practitioner_role.id = clinic_services.owner_practitioner_role_id
      and practitioner_role.organization_id = clinic_services.organization_id
      and practitioner.auth_user_id = auth.uid()
      and practitioner.active and practitioner_role.active
  )
)
with check (
  public.is_superadmin()
  or public.has_organization_role(organization_id, array['admin', 'owner'])
  or exists (
    select 1 from public.practitioner_roles practitioner_role
    join public.practitioners practitioner on practitioner.id = practitioner_role.practitioner_id
    where practitioner_role.id = clinic_services.owner_practitioner_role_id
      and practitioner_role.organization_id = clinic_services.organization_id
      and practitioner.auth_user_id = auth.uid()
      and practitioner.active and practitioner_role.active
  )
);

revoke all on function public.save_provider_clinic_service(uuid, uuid, text, text, text, integer, numeric, boolean) from public;
revoke all on function public.retire_provider_clinic_service(uuid) from public;
revoke all on function public.add_soap_note(uuid, text, uuid) from public;
revoke all on function public.get_current_provider_role_id(uuid) from public;
grant execute on function public.save_provider_clinic_service(uuid, uuid, text, text, text, integer, numeric, boolean) to authenticated;
grant execute on function public.retire_provider_clinic_service(uuid) to authenticated;
grant execute on function public.add_soap_note(uuid, text, uuid) to authenticated;
grant execute on function public.get_current_provider_role_id(uuid) to authenticated;
revoke insert, update, delete on public.clinic_services from authenticated;
revoke insert, update, delete on public.provider_weekly_availability from authenticated;

comment on table public.provider_weekly_availability is
  'Organization-scoped provider scheduling configuration used to generate future FHIR Slot resources.';
comment on function public.add_soap_note(uuid, text, uuid) is
  'Creates one immutable, version-linked FHIR Observation containing the complete SOAP note.';
