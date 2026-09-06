-- Loop 6 follow-up: custom peer-to-peer WebRTC with Supabase Broadcast
-- signaling. Room names are high-entropy secrets, and Realtime authorizes the
-- assigned patient or clinician against the exact private channel topic.

alter table public.teleconsult_rooms
  alter column provider set default 'custom_webrtc';

update public.teleconsult_rooms
set provider = 'custom_webrtc'
where provider = 'jitsi';

create or replace function public.sync_virtual_appointment_room()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
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
      'custom_webrtc',
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

drop policy if exists teleconsult_webrtc_broadcast_receive on realtime.messages;
drop policy if exists teleconsult_webrtc_broadcast_send on realtime.messages;

create policy teleconsult_webrtc_broadcast_receive on realtime.messages
for select to authenticated using (
  realtime.messages.extension = 'broadcast'
  and exists (
    select 1
    from public.teleconsult_rooms room
    join public.appointments appointment on appointment.id = room.appointment_id
    left join public.patients patient on patient.id = appointment.patient_id
    left join public.practitioner_roles practitioner_role
      on practitioner_role.id = appointment.practitioner_role_id
    left join public.practitioners practitioner
      on practitioner.id = practitioner_role.practitioner_id
    where realtime.topic() = 'teleconsult:' || room.room_name
      and appointment.organization_id = room.organization_id
      and appointment.status in ('booked', 'arrived')
      and room.status in ('scheduled', 'open')
      and now() between appointment.start_at - interval '30 minutes'
        and appointment.end_at + interval '2 hours'
      and (
        (patient.auth_user_id = auth.uid() and patient.active)
        or (
          practitioner.auth_user_id = auth.uid()
          and practitioner.active
          and practitioner_role.active
        )
      )
  )
);

create policy teleconsult_webrtc_broadcast_send on realtime.messages
for insert to authenticated with check (
  realtime.messages.extension = 'broadcast'
  and exists (
    select 1
    from public.teleconsult_rooms room
    join public.appointments appointment on appointment.id = room.appointment_id
    left join public.patients patient on patient.id = appointment.patient_id
    left join public.practitioner_roles practitioner_role
      on practitioner_role.id = appointment.practitioner_role_id
    left join public.practitioners practitioner
      on practitioner.id = practitioner_role.practitioner_id
    where realtime.topic() = 'teleconsult:' || room.room_name
      and appointment.organization_id = room.organization_id
      and appointment.status in ('booked', 'arrived')
      and room.status in ('scheduled', 'open')
      and now() between appointment.start_at - interval '30 minutes'
        and appointment.end_at + interval '2 hours'
      and (
        (patient.auth_user_id = auth.uid() and patient.active)
        or (
          practitioner.auth_user_id = auth.uid()
          and practitioner.active
          and practitioner_role.active
        )
      )
  )
);

comment on table public.teleconsult_rooms is
  'Tenant-scoped, participant-authorized WebRTC signaling rooms for virtual Appointments.';
