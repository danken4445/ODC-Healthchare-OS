-- Creates one appointment Slot per service duration, allowing a provider to
-- open an intuitive availability window (for example 10:00–17:00) safely.
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
  caller_role public.practitioner_roles%rowtype;
  selected_service public.clinic_services%rowtype;
  slot_count integer;
begin
  if p_start_at <= now() or p_end_at <= p_start_at then
    raise exception 'Availability must be a future period with a valid end time.' using errcode = '22007';
  end if;

  select * into selected_service from public.clinic_services service
  where service.id = p_clinic_service_id and service.active and service.booking_enabled;
  if selected_service.id is null then
    raise exception 'The selected service is not bookable.' using errcode = '23503';
  end if;

  if extract(epoch from p_end_at - p_start_at)::integer % (selected_service.duration_minutes * 60) <> 0 then
    raise exception 'Availability end time must align with the service duration.' using errcode = '22007';
  end if;

  select role.* into caller_role
  from public.practitioner_roles role
  join public.practitioners practitioner on practitioner.id = role.practitioner_id
  where practitioner.auth_user_id = auth.uid() and practitioner.active and role.active
    and role.organization_id = selected_service.organization_id
    and role.role_code in ('doctor', 'specialist')
  order by role.created_at limit 1;
  if caller_role.id is null then
    raise exception 'An active doctor role at this clinic is required.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(caller_role.id::text, 0));
  if exists (
    select 1 from public.appointment_slots slot
    where slot.practitioner_role_id = caller_role.id and slot.status <> 'entered_in_error'
      and tstzrange(slot.start_at, slot.end_at, '[)') && tstzrange(p_start_at, p_end_at, '[)')
  ) then
    raise exception 'Availability overlaps an existing slot.' using errcode = '23P01';
  end if;

  insert into public.appointment_slots (organization_id, practitioner_role_id, clinic_service_id, service_type, start_at, end_at)
  select caller_role.organization_id, caller_role.id, selected_service.id, selected_service.name,
    start_at, start_at + make_interval(mins => selected_service.duration_minutes)
  from generate_series(p_start_at, p_end_at - make_interval(mins => selected_service.duration_minutes), make_interval(mins => selected_service.duration_minutes)) as start_at;
  get diagnostics slot_count = row_count;
  return slot_count;
end;
$$;

revoke all on function public.create_appointment_slot_range(timestamptz, timestamptz, uuid) from public;
grant execute on function public.create_appointment_slot_range(timestamptz, timestamptz, uuid) to authenticated;
