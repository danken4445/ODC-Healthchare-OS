-- Fix save_provider_weekly_availability so slots remaining later today are generated
-- even if the day window's start_time has already passed.
-- Also backfills appointment slots for current active weekly schedules.

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
      if slot_end <= now() then continue; end if;
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
      where series.slot_start_at > now()
        and not exists (
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

revoke all on function public.save_provider_weekly_availability(uuid, jsonb) from public;
grant execute on function public.save_provider_weekly_availability(uuid, jsonb) to authenticated;

-- Backfill slots for existing saved weekly schedules that have remaining hours today or future days
do $$
declare
  window_row record;
  local_day date;
  slot_start timestamptz;
  slot_end timestamptz;
  schedule_end date := (timezone('Asia/Manila', now())::date + 41);
begin
  for window_row in
    select pwa.*, cs.name as service_name, cs.duration_minutes,
      coalesce(pwa.organization_id, cs.organization_id) as resolved_org_id
    from public.provider_weekly_availability pwa
    join public.clinic_services cs on cs.id = pwa.clinic_service_id
    where cs.active and cs.booking_enabled
  loop
    for local_day in
      select generate_series(timezone('Asia/Manila', now())::date, schedule_end, interval '1 day')::date
    loop
      if extract(dow from local_day)::smallint <> window_row.day_of_week then continue; end if;
      slot_start := (local_day + window_row.start_time) at time zone 'Asia/Manila';
      slot_end := (local_day + window_row.end_time) at time zone 'Asia/Manila';
      if slot_end <= now() then continue; end if;
      insert into public.appointment_slots (
        organization_id, practitioner_role_id, clinic_service_id,
        service_type, start_at, end_at
      )
      select window_row.resolved_org_id, window_row.practitioner_role_id, window_row.clinic_service_id,
        window_row.service_name, series.slot_start_at,
        series.slot_start_at + make_interval(mins => window_row.duration_minutes)
      from generate_series(
        slot_start,
        slot_end - make_interval(mins => window_row.duration_minutes),
        make_interval(mins => window_row.duration_minutes)
      ) as series(slot_start_at)
      where series.slot_start_at > now()
        and not exists (
          select 1 from public.appointment_slots slot
          where slot.practitioner_role_id = window_row.practitioner_role_id
            and slot.status <> 'entered_in_error'
            and tstzrange(slot.start_at, slot.end_at, '[)') && tstzrange(
              series.slot_start_at,
              series.slot_start_at + make_interval(mins => window_row.duration_minutes),
              '[)'
            )
        );
    end loop;
  end loop;
end;
$$;
