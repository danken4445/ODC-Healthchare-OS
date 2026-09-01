-- A provider-owned recurring schedule. Saving it atomically refreshes future
-- free slots, while booked and manually blocked slots remain untouched.
create table public.provider_weekly_availability (
  id uuid primary key default gen_random_uuid(),
  practitioner_role_id uuid not null references public.practitioner_roles(id) on delete cascade,
  clinic_service_id uuid not null references public.clinic_services(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null check (end_time > start_time),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (practitioner_role_id, clinic_service_id, day_of_week)
);

alter table public.provider_weekly_availability enable row level security;

create policy provider_weekly_availability_select on public.provider_weekly_availability for select to authenticated
  using (exists (
    select 1 from public.practitioner_roles role join public.practitioners practitioner on practitioner.id = role.practitioner_id
    where role.id = provider_weekly_availability.practitioner_role_id and practitioner.auth_user_id = auth.uid()
  ));

create or replace function public.save_provider_weekly_availability(
  p_clinic_service_id uuid,
  p_windows jsonb
) returns integer language plpgsql security definer set search_path = public, auth as $$
declare
  caller_role public.practitioner_roles%rowtype;
  service public.clinic_services%rowtype;
  window_row record;
  local_day date;
  slot_start timestamptz;
  slot_end timestamptz;
  created_count integer := 0;
  inserted_count integer := 0;
  schedule_end date := (timezone('Asia/Manila', now())::date + 41);
begin
  if jsonb_typeof(p_windows) <> 'array' then raise exception 'Weekly availability must be a list of days.' using errcode = '22023'; end if;
  select * into service from public.clinic_services where id = p_clinic_service_id and active and booking_enabled;
  if service.id is null then raise exception 'The selected service is not bookable.' using errcode = '23503'; end if;
  select role.* into caller_role from public.practitioner_roles role join public.practitioners practitioner on practitioner.id = role.practitioner_id
    where practitioner.auth_user_id = auth.uid() and practitioner.active and role.active and role.organization_id = service.organization_id and role.role_code in ('doctor', 'specialist')
    order by role.created_at limit 1;
  if caller_role.id is null then raise exception 'An active doctor role at this clinic is required.' using errcode = '42501'; end if;

  for window_row in select * from jsonb_to_recordset(p_windows) as x(day_of_week smallint, start_time time, end_time time) loop
    if window_row.day_of_week not between 0 and 6 or window_row.end_time <= window_row.start_time
      or (extract(epoch from window_row.end_time - window_row.start_time)::integer % (service.duration_minutes * 60)) <> 0 then
      raise exception 'Each day needs a valid time range in service-duration increments.' using errcode = '22007';
    end if;
  end loop;

  perform pg_advisory_xact_lock(hashtextextended(caller_role.id::text, 0));
  delete from public.provider_weekly_availability where practitioner_role_id = caller_role.id and clinic_service_id = service.id;
  insert into public.provider_weekly_availability (practitioner_role_id, clinic_service_id, day_of_week, start_time, end_time)
  select caller_role.id, service.id, x.day_of_week, x.start_time, x.end_time
  from jsonb_to_recordset(p_windows) as x(day_of_week smallint, start_time time, end_time time);

  delete from public.appointment_slots where practitioner_role_id = caller_role.id and clinic_service_id = service.id and status = 'free' and start_at > now();
  for window_row in select * from public.provider_weekly_availability where practitioner_role_id = caller_role.id and clinic_service_id = service.id loop
    for local_day in select generate_series(timezone('Asia/Manila', now())::date, schedule_end, interval '1 day')::date loop
      if extract(dow from local_day)::smallint <> window_row.day_of_week then continue; end if;
      slot_start := (local_day + window_row.start_time) at time zone 'Asia/Manila';
      slot_end := (local_day + window_row.end_time) at time zone 'Asia/Manila';
      if slot_start <= now() then continue; end if;
      if exists (select 1 from public.appointment_slots slot where slot.practitioner_role_id = caller_role.id and slot.status <> 'entered_in_error' and tstzrange(slot.start_at, slot.end_at, '[)') && tstzrange(slot_start, slot_end, '[)')) then continue; end if;
      insert into public.appointment_slots (organization_id, practitioner_role_id, clinic_service_id, service_type, start_at, end_at)
      select caller_role.organization_id, caller_role.id, service.id, service.name, series.slot_start_at, series.slot_start_at + make_interval(mins => service.duration_minutes)
      from generate_series(slot_start, slot_end - make_interval(mins => service.duration_minutes), make_interval(mins => service.duration_minutes)) as series(slot_start_at);
      get diagnostics inserted_count = row_count;
      created_count := created_count + inserted_count;
    end loop;
  end loop;
  return created_count;
end;
$$;

revoke all on function public.save_provider_weekly_availability(uuid, jsonb) from public;
grant execute on function public.save_provider_weekly_availability(uuid, jsonb) to authenticated;
