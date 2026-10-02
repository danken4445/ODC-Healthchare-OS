-- Loop D1/D2/D5: scoped, advisory-lock queue allocation and durable labels.
-- Rollback: stop callers using the queue settings/prefix RPCs, then remove the
-- additive columns and restore the former queue uniqueness only after all
-- per-practitioner appointments and labels have been retired.

alter table public.organization_settings
  add column if not exists queue_mode text not null default 'clinic_wide'
    check (queue_mode in ('clinic_wide', 'per_practitioner'));

alter table public.practitioner_roles
  add column if not exists queue_prefix text
    check (queue_prefix is null or queue_prefix ~ '^[A-Z]$');

create unique index if not exists practitioner_roles_active_queue_prefix_key
  on public.practitioner_roles (organization_id, queue_prefix)
  where active and queue_prefix is not null;

alter table public.appointments
  add column if not exists queue_label text;

update public.appointments
set queue_label = 'A-' || lpad(queue_number::text, 3, '0')
where queue_number is not null
  and queue_date is not null
  and queue_label is null;

alter table public.appointments
  add constraint appointments_queue_label_present
  check (
    (queue_number is null and queue_date is null and queue_label is null)
    or (queue_number is not null and queue_date is not null and queue_label is not null)
  ) not valid;

alter table public.appointments
  validate constraint appointments_queue_label_present;

drop index if exists public.appointments_daily_queue_number_key;
create unique index appointments_daily_queue_label_key
  on public.appointments (organization_id, queue_date, queue_label)
  where queue_date is not null and queue_label is not null;

alter table public.waiting_room_queue
  add column if not exists queue_label text;

update public.waiting_room_queue as waiting_queue
set queue_label = appointment.queue_label
from public.appointments as appointment
where appointment.id = waiting_queue.appointment_id
  and waiting_queue.queue_label is null;

alter table public.waiting_room_queue
  alter column queue_label set not null;

alter table public.waiting_room_queue
  drop constraint if exists waiting_room_queue_organization_id_queue_date_queue_number_key;
alter table public.waiting_room_queue
  add constraint waiting_room_queue_organization_id_queue_date_queue_label_key
  unique (organization_id, queue_date, queue_label);

create or replace function public.assign_appointment_queue_number()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  v_queue_mode text;
  v_scope_key text;
  v_prefix text;
  v_candidate_prefix text;
  v_queue_date date;
begin
  if new.delivery_mode = 'virtual' or new.start_at is null then
    new.queue_date := null;
    new.queue_number := null;
    new.queue_label := null;
    return new;
  end if;

  if tg_op = 'UPDATE'
    and new.organization_id = old.organization_id
    and new.start_at = old.start_at
    and new.delivery_mode = old.delivery_mode
    and new.queue_number is not null
    and new.queue_label is not null then
    return new;
  end if;

  select coalesce(settings.queue_mode, 'clinic_wide')
  into v_queue_mode
  from public.organization_settings as settings
  where settings.organization_id = new.organization_id;

  if not found then
    v_queue_mode := 'clinic_wide';
  end if;

  v_queue_date := (new.start_at at time zone 'UTC')::date;
  new.queue_date := v_queue_date;

  if v_queue_mode = 'per_practitioner' then
    if new.practitioner_role_id is null then
      raise exception 'A practitioner is required for per-practitioner queues.'
        using errcode = '22023';
    end if;

    perform pg_advisory_xact_lock(
      hashtextextended('queue-prefix:' || new.organization_id::text, 0)
    );

    select practitioner_role.queue_prefix
    into v_prefix
    from public.practitioner_roles as practitioner_role
    where practitioner_role.id = new.practitioner_role_id
      and practitioner_role.organization_id = new.organization_id
      and practitioner_role.active;

    if not found then
      raise exception 'Practitioner role not found or inactive.' using errcode = '22023';
    end if;

    if v_prefix is null then
      for v_candidate_prefix in
        select chr(codepoint)
        from generate_series(ascii('A'), ascii('Z')) as codepoint
      loop
        if not exists (
          select 1
          from public.practitioner_roles as existing_role
          where existing_role.organization_id = new.organization_id
            and existing_role.active
            and existing_role.queue_prefix = v_candidate_prefix
        ) then
          v_prefix := v_candidate_prefix;
          update public.practitioner_roles
          set queue_prefix = v_prefix
          where id = new.practitioner_role_id;
          exit;
        end if;
      end loop;

      if v_prefix is null then
        raise exception 'No unused queue prefix remains for this organization.'
          using errcode = '22023';
      end if;
    end if;

    v_scope_key := new.practitioner_role_id::text;
  else
    v_scope_key := 'clinic_wide';
    v_prefix := 'A';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      new.organization_id::text || ':' || v_queue_date::text || ':' || v_scope_key,
      0
    )
  );

  select coalesce(max(appointment.queue_number), 0) + 1
  into new.queue_number
  from public.appointments as appointment
  where appointment.organization_id = new.organization_id
    and appointment.queue_date = v_queue_date
    and appointment.delivery_mode = 'in_person'
    and appointment.id is distinct from new.id
    and (
      v_queue_mode = 'clinic_wide'
      or appointment.practitioner_role_id = new.practitioner_role_id
    );

  -- A clinic-wide A-### label may predate a same-day switch to practitioner A.
  -- Preserve historic labels and advance only this new scoped sequence as needed.
  while exists (
    select 1
    from public.appointments as appointment
    where appointment.organization_id = new.organization_id
      and appointment.queue_date = v_queue_date
      and appointment.queue_label = v_prefix || '-' || lpad(new.queue_number::text, 3, '0')
      and appointment.id is distinct from new.id
  ) loop
    new.queue_number := new.queue_number + 1;
  end loop;

  new.queue_label := v_prefix || '-' || lpad(new.queue_number::text, 3, '0');
  return new;
end;
$$;

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
    appointment_id, organization_id, queue_date, queue_number, queue_label,
    service_name, scheduled_at, stage, updated_at
  ) values (
    new.id, new.organization_id, new.queue_date, new.queue_number, new.queue_label,
    coalesce(new.service_type, 'Consultation'), new.start_at, next_stage, now()
  )
  on conflict (appointment_id) do update set
    organization_id = excluded.organization_id,
    queue_date = excluded.queue_date,
    queue_number = excluded.queue_number,
    queue_label = excluded.queue_label,
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

create or replace function public.get_organization_queue_settings(
  p_organization_id uuid
)
returns table (
  organization_id uuid,
  queue_mode text,
  can_manage_queue_mode boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;
  if not public.can_access_organization(p_organization_id) then
    raise exception 'Organization not found or access denied.' using errcode = '42501';
  end if;

  return query
  select settings.organization_id, settings.queue_mode,
    public.has_organization_permission(settings.organization_id, 'can_manage_appointments')
  from public.organization_settings as settings
  where settings.organization_id = p_organization_id;
end;
$$;

create or replace function public.set_organization_queue_mode(
  p_organization_id uuid,
  p_queue_mode text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;
  if p_queue_mode not in ('clinic_wide', 'per_practitioner') then
    raise exception 'queue_mode must be clinic_wide or per_practitioner.' using errcode = '22023';
  end if;
  if not public.has_organization_permission(p_organization_id, 'can_manage_appointments') then
    raise exception 'Appointment management permission is required.' using errcode = '42501';
  end if;

  insert into public.organization_settings (organization_id, queue_mode)
  values (p_organization_id, p_queue_mode)
  on conflict (organization_id) do update
    set queue_mode = excluded.queue_mode,
        updated_at = now();
  return p_queue_mode;
end;
$$;

create or replace function public.list_practitioner_queue_prefixes(
  p_organization_id uuid
)
returns table (
  practitioner_role_id uuid,
  display_name text,
  role_code text,
  queue_prefix text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;
  if not public.has_organization_permission(p_organization_id, 'can_manage_appointments') then
    raise exception 'Appointment management permission is required.' using errcode = '42501';
  end if;

  return query
  select role.id,
    coalesce(practitioner.name ->> 'text', 'Practitioner'),
    role.role_code,
    role.queue_prefix
  from public.practitioner_roles as role
  join public.practitioners as practitioner
    on practitioner.id = role.practitioner_id
   and practitioner.organization_id = role.organization_id
  where role.organization_id = p_organization_id
    and role.active
    and role.role_code in ('doctor', 'specialist')
  order by coalesce(practitioner.name ->> 'text', 'Practitioner'), role.id;
end;
$$;

create or replace function public.set_practitioner_queue_prefix(
  p_practitioner_role_id uuid,
  p_queue_prefix text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.practitioner_roles%rowtype;
  v_prefix text := nullif(upper(trim(p_queue_prefix)), '');
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;
  select role.* into v_role
  from public.practitioner_roles as role
  where role.id = p_practitioner_role_id
    and role.active
    and role.role_code in ('doctor', 'specialist');
  if not found then
    raise exception 'Active practitioner role not found.' using errcode = 'P0002';
  end if;
  if not public.has_organization_permission(v_role.organization_id, 'can_manage_appointments') then
    raise exception 'Appointment management permission is required.' using errcode = '42501';
  end if;
  if v_prefix is not null and v_prefix !~ '^[A-Z]$' then
    raise exception 'Queue prefix must be one letter A-Z.' using errcode = '22023';
  end if;

  update public.practitioner_roles
  set queue_prefix = v_prefix
  where id = v_role.id;
  return v_prefix;
end;
$$;

revoke all on function public.get_organization_queue_settings(uuid) from public, anon, authenticated;
revoke all on function public.set_organization_queue_mode(uuid, text) from public, anon, authenticated;
revoke all on function public.list_practitioner_queue_prefixes(uuid) from public, anon, authenticated;
revoke all on function public.set_practitioner_queue_prefix(uuid, text) from public, anon, authenticated;
grant execute on function public.get_organization_queue_settings(uuid) to authenticated;
grant execute on function public.set_organization_queue_mode(uuid, text) to authenticated;
grant execute on function public.list_practitioner_queue_prefixes(uuid) to authenticated;
grant execute on function public.set_practitioner_queue_prefix(uuid, text) to authenticated;

comment on column public.organization_settings.queue_mode is
  'clinic_wide preserves the legacy A-### queue; per_practitioner uses the assigned practitioner prefix and an independent daily sequence.';
comment on column public.practitioner_roles.queue_prefix is
  'One uppercase queue letter per active organization practitioner role; assigned automatically on first per-practitioner queue entry when unset.';
comment on column public.appointments.queue_label is
  'Durable display label. Consumers must render this value rather than format queue_number.';
comment on column public.waiting_room_queue.queue_label is
  'Compatibility projection of appointments.queue_label; doctor and room fields are intentionally deferred to Loop D-2.';
