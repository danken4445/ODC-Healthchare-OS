-- Legacy teleconsult SECURITY DEFINER hardening.
-- Rollback: restore the prior function definitions with their historical search_path
-- only during an emergency rollback; the room authorization contract is unchanged.

create or replace function public.sync_virtual_appointment_room()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.delivery_mode = 'virtual' and new.status in ('cancelled', 'noshow') then
    update public.teleconsult_rooms
    set status = 'cancelled', closed_at = coalesce(closed_at, now())
    where appointment_id = new.id and status <> 'closed';
  elsif new.delivery_mode = 'virtual' and new.status = 'fulfilled' then
    update public.teleconsult_rooms
    set status = 'closed', closed_at = coalesce(closed_at, now())
    where appointment_id = new.id and status <> 'cancelled';
  elsif new.delivery_mode = 'virtual' then
    insert into public.teleconsult_rooms (
      organization_id, appointment_id, provider, room_name, status
    ) values (
      new.organization_id,
      new.id,
      'jitsi',
      'odyssey-' || replace(new.organization_id::text, '-', '') || '-' || encode(extensions.gen_random_bytes(24), 'hex'),
      'scheduled'
    ) on conflict (appointment_id) do nothing;
  elsif new.delivery_mode = 'in_person' then
    delete from public.teleconsult_rooms
    where appointment_id = new.id and status = 'scheduled';
  end if;
  return new;
end;
$$;

create or replace function public.close_teleconsult_room(p_appointment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  update public.teleconsult_rooms room
  set status = 'closed', closed_at = coalesce(closed_at, now())
  from public.appointments appointment
  join public.practitioner_roles practitioner_role on practitioner_role.id = appointment.practitioner_role_id
  join public.practitioners practitioner on practitioner.id = practitioner_role.practitioner_id
  where room.appointment_id = p_appointment_id
    and appointment.id = room.appointment_id
    and room.organization_id = appointment.organization_id
    and practitioner.auth_user_id = auth.uid()
    and practitioner.active and practitioner_role.active;
  if not found then raise exception 'Assigned teleconsult room not found.' using errcode = 'P0002'; end if;
end;
$$;
