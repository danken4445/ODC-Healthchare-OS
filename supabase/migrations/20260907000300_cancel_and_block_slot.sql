-- Migration: 20260907000300_cancel_and_block_slot.sql
-- 1. Front Desk cancel options: Cancel (retaining slot as free) or Cancel and Block (marking slot as busy_unavailable).
-- 2. Add appointment_slots to Supabase Realtime publication so slot changes sync live across browsers.

create or replace function public.cancel_appointment(
  p_appointment_id uuid,
  p_block_slot boolean default false
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
  where appointment.id = p_appointment_id for update;

  if current_appointment.id is null
    or not public.has_organization_permission(current_appointment.organization_id, 'can_manage_appointments') then
    raise exception 'Appointment not found or insufficient permissions.' using errcode = 'P0002';
  end if;

  if current_appointment.status not in ('booked', 'arrived') then
    raise exception 'Only booked or arrived appointments can be cancelled.' using errcode = '23514';
  end if;

  -- Cancel the appointment
  update public.appointments
  set status = 'cancelled'
  where id = p_appointment_id;

  -- Update the associated slot
  if p_block_slot then
    update public.appointment_slots
    set status = 'busy_unavailable', appointment_id = null
    where appointment_id = p_appointment_id;
  else
    update public.appointment_slots
    set status = 'free', appointment_id = null
    where appointment_id = p_appointment_id;
  end if;
end;
$$;

revoke all on function public.cancel_appointment(uuid, boolean) from public;
grant execute on function public.cancel_appointment(uuid, boolean) to authenticated;

-- Ensure appointment_slots are in supabase_realtime
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'appointment_slots'
    ) then
    alter publication supabase_realtime add table public.appointment_slots;
  end if;
end;
$$;
