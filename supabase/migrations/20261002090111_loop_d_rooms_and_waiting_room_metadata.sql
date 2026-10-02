-- Loop D3/D4: physical clinic rooms, doctor room assignments, and the
-- privacy-safe waiting-room metadata projection.
-- Rollback: stop room assignment clients, then drop the assignment policies,
-- trigger, tables, and additive queue columns after dependent clients retire.

create extension if not exists btree_gist;

alter table public.clinic_role_permission_overrides
  drop constraint if exists clinic_role_permission_overrides_permission_check;
alter table public.clinic_role_permission_overrides
  add constraint clinic_role_permission_overrides_permission_check check (permission in (
    'can_access_admin_portal', 'can_access_provider_portal', 'can_manage_appointments',
    'can_record_triage', 'can_start_consultation', 'can_manage_provider_schedule',
    'can_manage_staff_roles', 'can_view_inventory', 'can_manage_inventory',
    'can_tag_inventory_usage', 'can_order_diagnostics', 'can_view_diagnostics',
    'can_view_lab_worklist', 'can_record_lab_results', 'can_view_referrals',
    'can_update_referrals', 'can_manage_laboratory_services', 'role_permissions_configured',
    'can_manage_billing', 'can_view_billing', 'can_manage_pos', 'can_manage_claims',
    'can_view_claims', 'can_view_payouts', 'can_manage_payouts', 'can_view_analytics',
    'can_manage_patients', 'can_view_audit_log', 'can_identify_patients',
    'can_manage_clinic_branding', 'can_manage_service_catalog',
    'can_manage_document_templates', 'can_manage_feature_modules', 'can_manage_services',
    'can_manage_professional_fees', 'can_view_clinic_queue', 'can_manage_rooms'
  ));

insert into public.role_permissions (role_id, organization_id, permission)
select role.id, null, permission.permission
from public.roles as role
cross join (values ('can_view_clinic_queue'::text), ('can_manage_rooms'::text)) as permission(permission)
where role.name in ('admin', 'owner')
on conflict (role_id, organization_id, permission) do nothing;

insert into public.clinic_role_permission_overrides (organization_id, role_code, permission)
select organization.id, grant_row.role_code, grant_row.permission
from public.organizations as organization
cross join (values
  ('admin'::text, 'can_view_clinic_queue'::text),
  ('admin'::text, 'can_manage_rooms'::text),
  ('owner'::text, 'can_view_clinic_queue'::text),
  ('owner'::text, 'can_manage_rooms'::text)
) as grant_row(role_code, permission)
on conflict (organization_id, role_code, permission) do nothing;

create table public.clinic_rooms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  label text not null check (length(btrim(label)) between 1 and 80),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);

create table public.room_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  practitioner_role_id uuid not null references public.practitioner_roles(id) on delete cascade,
  room_id uuid not null references public.clinic_rooms(id) on delete cascade,
  date date not null,
  shift_start time without time zone not null,
  shift_end time without time zone not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (shift_end > shift_start),
  unique (organization_id, id),
  exclude using gist (
    room_id with =,
    tsrange(
      (date + shift_start)::timestamp,
      (date + shift_end)::timestamp,
      '[)'
    ) with &&
  )
);

create index room_assignments_practitioner_date_idx
  on public.room_assignments (organization_id, practitioner_role_id, date);
create index room_assignments_room_date_idx
  on public.room_assignments (organization_id, room_id, date);

create trigger clinic_rooms_set_updated_at
  before update on public.clinic_rooms
  for each row execute function public.set_updated_at();
create trigger room_assignments_set_updated_at
  before update on public.room_assignments
  for each row execute function public.set_updated_at();

create or replace function public.enforce_room_assignment_tenant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.clinic_rooms as room
    where room.id = new.room_id
      and room.organization_id = new.organization_id
  ) then
    raise exception 'Room assignment must use a room in the same organization.' using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.practitioner_roles as practitioner_role
    where practitioner_role.id = new.practitioner_role_id
      and practitioner_role.organization_id = new.organization_id
      and practitioner_role.active
  ) then
    raise exception 'Room assignment must use an active practitioner in the same organization.' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger room_assignments_tenant_integrity
  before insert or update on public.room_assignments
  for each row execute function public.enforce_room_assignment_tenant();

alter table public.clinic_rooms enable row level security;
alter table public.room_assignments enable row level security;

create policy clinic_rooms_staff_select on public.clinic_rooms
  for select to authenticated
  using (public.can_access_organization(organization_id));
create policy clinic_rooms_manage on public.clinic_rooms
  for all to authenticated
  using (public.has_organization_permission(organization_id, 'can_manage_rooms'))
  with check (public.has_organization_permission(organization_id, 'can_manage_rooms'));

create policy room_assignments_staff_select on public.room_assignments
  for select to authenticated
  using (
    public.has_organization_permission(organization_id, 'can_view_clinic_queue')
    or public.has_organization_permission(organization_id, 'can_manage_rooms')
    or exists (
      select 1
      from public.practitioner_roles as practitioner_role
      join public.practitioners as practitioner on practitioner.id = practitioner_role.practitioner_id
      where practitioner_role.id = room_assignments.practitioner_role_id
        and practitioner.auth_user_id = auth.uid()
    )
  );
create policy room_assignments_manage on public.room_assignments
  for all to authenticated
  using (public.has_organization_permission(organization_id, 'can_manage_rooms'))
  with check (public.has_organization_permission(organization_id, 'can_manage_rooms'));

grant select on public.clinic_rooms, public.room_assignments to authenticated;
revoke all on public.clinic_rooms, public.room_assignments from anon;

alter table public.waiting_room_queue
  add column if not exists room_label text,
  add column if not exists practitioner_display_name text;

create or replace function public.sync_waiting_room_from_appointment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_stage public.waiting_queue_stage;
  assigned_room_label text;
  assigned_practitioner_display_name text;
begin
  if tg_op = 'DELETE' then
    delete from public.waiting_room_queue where appointment_id = old.id;
    return old;
  end if;

  if new.start_at is null or new.queue_date is null or new.queue_number is null then
    delete from public.waiting_room_queue where appointment_id = new.id;
    return new;
  end if;

  if new.practitioner_role_id is not null then
    select coalesce(nullif(practitioner.name ->> 'text', ''), 'Practitioner')
    into assigned_practitioner_display_name
    from public.practitioner_roles as practitioner_role
    join public.practitioners as practitioner on practitioner.id = practitioner_role.practitioner_id
    where practitioner_role.id = new.practitioner_role_id
      and practitioner_role.organization_id = new.organization_id;

    select room.label
    into assigned_room_label
    from public.room_assignments as assignment
    join public.clinic_rooms as room on room.id = assignment.room_id
    where assignment.organization_id = new.organization_id
      and assignment.practitioner_role_id = new.practitioner_role_id
      and assignment.date = new.queue_date
      and tsrange(
        (assignment.date + assignment.shift_start)::timestamp,
        (assignment.date + assignment.shift_end)::timestamp,
        '[)'
      ) && tsrange(
        (new.start_at at time zone 'UTC')::timestamp,
        (coalesce(new.end_at, new.start_at + interval '1 minute') at time zone 'UTC')::timestamp,
        '[)'
      )
    order by assignment.shift_start
    limit 1;
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
    practitioner_display_name, room_label, service_name, scheduled_at, stage, updated_at
  ) values (
    new.id, new.organization_id, new.queue_date, new.queue_number, new.queue_label,
    assigned_practitioner_display_name, assigned_room_label,
    coalesce(new.service_type, 'Consultation'), new.start_at, next_stage, now()
  )
  on conflict (appointment_id) do update set
    organization_id = excluded.organization_id,
    queue_date = excluded.queue_date,
    queue_number = excluded.queue_number,
    queue_label = excluded.queue_label,
    practitioner_display_name = excluded.practitioner_display_name,
    room_label = excluded.room_label,
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

drop trigger if exists appointments_sync_waiting_room on public.appointments;
create trigger appointments_sync_waiting_room
  after insert or update of organization_id, practitioner_role_id, start_at, end_at, status, delivery_mode
  on public.appointments
  for each row execute function public.sync_waiting_room_from_appointment();

update public.waiting_room_queue as waiting_queue
set
  practitioner_display_name = coalesce(nullif(practitioner.name ->> 'text', ''), 'Practitioner'),
  room_label = room.label
from public.appointments as appointment
left join public.practitioner_roles as practitioner_role
  on practitioner_role.id = appointment.practitioner_role_id
left join public.practitioners as practitioner
  on practitioner.id = practitioner_role.practitioner_id
left join lateral (
  select assignment.room_id
  from public.room_assignments as assignment
  where assignment.organization_id = appointment.organization_id
    and assignment.practitioner_role_id = appointment.practitioner_role_id
    and assignment.date = appointment.queue_date
    and tsrange((assignment.date + assignment.shift_start)::timestamp,
      (assignment.date + assignment.shift_end)::timestamp, '[)') &&
      tsrange((appointment.start_at at time zone 'UTC')::timestamp,
        (coalesce(appointment.end_at, appointment.start_at + interval '1 minute') at time zone 'UTC')::timestamp, '[)')
  order by assignment.shift_start
  limit 1
) assigned_room on true
left join public.clinic_rooms as room on room.id = assigned_room.room_id
where waiting_queue.appointment_id = appointment.id;

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

comment on column public.waiting_room_queue.room_label is
  'Privacy-safe physical room label; null when no room assignment covers the appointment.';
comment on column public.waiting_room_queue.practitioner_display_name is
  'Privacy-safe assigned practitioner display name; contains no patient identity.';
