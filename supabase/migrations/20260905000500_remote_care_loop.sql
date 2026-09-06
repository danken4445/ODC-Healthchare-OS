-- Loop 6: Remote Care Loop.
-- Virtual care is an Appointment delivery mode. The resulting clinical visit
-- remains the same FHIR Encounter used by in-person care. Room secrets and
-- payout mutations are exposed only through tenant-checked RPCs.

create type public.appointment_delivery_mode as enum ('in_person', 'virtual');
create type public.teleconsult_provider as enum ('jitsi', 'daily', 'twilio');
create type public.teleconsult_room_status as enum ('scheduled', 'open', 'closed', 'cancelled');
create type public.doctor_payout_status as enum ('pending', 'paid', 'void');

alter table public.clinic_services
  add column delivery_modes public.appointment_delivery_mode[] not null
  default array['in_person'::public.appointment_delivery_mode];

alter table public.clinic_services
  add constraint clinic_services_delivery_modes_not_empty
  check (cardinality(delivery_modes) > 0);

-- Existing consultation services are suitable for either delivery mode.
update public.clinic_services
set delivery_modes = array[
  'in_person'::public.appointment_delivery_mode,
  'virtual'::public.appointment_delivery_mode
]
where code in ('GENERAL-CONSULT', 'FOLLOW-UP');

alter table public.appointments
  add column delivery_mode public.appointment_delivery_mode not null default 'in_person';

create table public.teleconsult_rooms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  appointment_id uuid not null unique references public.appointments(id) on delete cascade,
  provider public.teleconsult_provider not null default 'jitsi',
  room_name text not null,
  status public.teleconsult_room_status not null default 'scheduled',
  opened_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, room_name),
  check (room_name ~ '^[a-zA-Z0-9_-]{24,160}$'),
  check (closed_at is null or opened_at is null or closed_at >= opened_at)
);

create index teleconsult_rooms_org_status_idx
  on public.teleconsult_rooms (organization_id, status, created_at desc);

create table public.practitioner_payout_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  practitioner_role_id uuid not null references public.practitioner_roles(id),
  share_basis_points integer not null default 10000
    check (share_basis_points between 0 and 10000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, practitioner_role_id)
);

create table public.doctor_payouts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  practitioner_role_id uuid not null references public.practitioner_roles(id),
  encounter_id uuid not null unique references public.encounters(id),
  billing_event_id uuid not null unique references public.billing_events(id),
  gross_service_amount numeric(14,2) not null check (gross_service_amount >= 0),
  share_basis_points integer not null check (share_basis_points between 0 and 10000),
  payout_amount numeric(14,2) not null check (payout_amount >= 0),
  currency text not null default 'PHP' check (currency ~ '^[A-Z]{3}$'),
  status public.doctor_payout_status not null default 'pending',
  paid_at timestamptz,
  paid_by uuid references auth.users(id),
  payment_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'paid' or (paid_at is not null and paid_by is not null))
);

create index doctor_payouts_org_status_idx
  on public.doctor_payouts (organization_id, status, created_at desc);
create index doctor_payouts_role_status_idx
  on public.doctor_payouts (practitioner_role_id, status, created_at desc);

create or replace function public.enforce_remote_care_tenant_integrity()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_table_name = 'teleconsult_rooms' and not exists (
    select 1 from public.appointments appointment
    where appointment.id = new.appointment_id
      and appointment.organization_id = new.organization_id
      and appointment.delivery_mode = 'virtual'
  ) then
    raise exception 'Teleconsult room appointment must be virtual and belong to the same organization.' using errcode = '23514';
  elsif tg_table_name = 'practitioner_payout_settings' and not exists (
    select 1 from public.practitioner_roles practitioner_role
    where practitioner_role.id = new.practitioner_role_id
      and practitioner_role.organization_id = new.organization_id
  ) then
    raise exception 'Payout setting practitioner must belong to the same organization.' using errcode = '23514';
  elsif tg_table_name = 'doctor_payouts' and not exists (
    select 1
    from public.encounters encounter
    join public.billing_events billing_event
      on billing_event.id = new.billing_event_id
      and billing_event.encounter_id = encounter.id
    join public.practitioner_roles practitioner_role
      on practitioner_role.id = new.practitioner_role_id
    where encounter.id = new.encounter_id
      and encounter.practitioner_role_id = new.practitioner_role_id
      and encounter.organization_id = new.organization_id
      and billing_event.organization_id = new.organization_id
      and practitioner_role.organization_id = new.organization_id
  ) then
    raise exception 'Payout links must all belong to the same organization and encounter.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger teleconsult_rooms_tenant_integrity before insert or update on public.teleconsult_rooms
  for each row execute function public.enforce_remote_care_tenant_integrity();
create trigger practitioner_payout_settings_tenant_integrity before insert or update on public.practitioner_payout_settings
  for each row execute function public.enforce_remote_care_tenant_integrity();
create trigger doctor_payouts_tenant_integrity before insert or update on public.doctor_payouts
  for each row execute function public.enforce_remote_care_tenant_integrity();

create trigger teleconsult_rooms_set_updated_at before update on public.teleconsult_rooms
  for each row execute function public.set_updated_at();
create trigger practitioner_payout_settings_set_updated_at before update on public.practitioner_payout_settings
  for each row execute function public.set_updated_at();
create trigger doctor_payouts_set_updated_at before update on public.doctor_payouts
  for each row execute function public.set_updated_at();

create trigger teleconsult_rooms_audit after insert or update or delete on public.teleconsult_rooms
  for each row execute function public.write_audit_log();
create trigger practitioner_payout_settings_audit after insert or update or delete on public.practitioner_payout_settings
  for each row execute function public.write_audit_log();
create trigger doctor_payouts_audit after insert or update or delete on public.doctor_payouts
  for each row execute function public.write_audit_log();

alter table public.teleconsult_rooms enable row level security;
alter table public.practitioner_payout_settings enable row level security;
alter table public.doctor_payouts enable row level security;

-- The room secret is queryable directly only by the assigned participants and
-- only while joining is allowed. The participant-safe listing RPC remains
-- available outside this window but masks room_name.
create policy teleconsult_rooms_participant_select on public.teleconsult_rooms
for select to authenticated using (
  exists (
    select 1
    from public.appointments appointment
    left join public.patients patient on patient.id = appointment.patient_id
    left join public.practitioner_roles practitioner_role on practitioner_role.id = appointment.practitioner_role_id
    left join public.practitioners practitioner on practitioner.id = practitioner_role.practitioner_id
    where appointment.id = teleconsult_rooms.appointment_id
      and appointment.organization_id = teleconsult_rooms.organization_id
      and appointment.status in ('booked', 'arrived')
      and teleconsult_rooms.status in ('scheduled', 'open')
      and now() >= appointment.start_at - interval '30 minutes'
      and now() <= appointment.end_at + interval '2 hours'
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

create policy practitioner_payout_settings_select on public.practitioner_payout_settings
for select to authenticated using (
  public.has_organization_permission(organization_id, 'can_view_payouts')
  or exists (
    select 1 from public.practitioner_roles practitioner_role
    join public.practitioners practitioner on practitioner.id = practitioner_role.practitioner_id
    where practitioner_role.id = practitioner_payout_settings.practitioner_role_id
      and practitioner_role.organization_id = practitioner_payout_settings.organization_id
      and practitioner_role.active and practitioner.active
      and practitioner.auth_user_id = auth.uid()
  )
);

create policy doctor_payouts_select on public.doctor_payouts
for select to authenticated using (
  public.has_organization_permission(organization_id, 'can_view_payouts')
  or exists (
    select 1 from public.practitioner_roles practitioner_role
    join public.practitioners practitioner on practitioner.id = practitioner_role.practitioner_id
    where practitioner_role.id = doctor_payouts.practitioner_role_id
      and practitioner_role.organization_id = doctor_payouts.organization_id
      and practitioner_role.active and practitioner.active
      and practitioner.auth_user_id = auth.uid()
  )
);

-- Clients may not create room identifiers or mutate payout ledgers directly.
revoke insert, update, delete on public.teleconsult_rooms from authenticated;
revoke insert, update, delete on public.practitioner_payout_settings from authenticated;
revoke insert, update, delete on public.doctor_payouts from authenticated;

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

create trigger appointments_sync_virtual_room
  after insert or update of delivery_mode, status on public.appointments
  for each row execute function public.sync_virtual_appointment_room();

-- Virtual appointments never consume a physical waiting-room queue number.
create or replace function public.assign_appointment_queue_number()
returns trigger language plpgsql set search_path = public, pg_catalog as $$
begin
  if new.delivery_mode = 'virtual' or new.start_at is null then
    new.queue_date := null;
    new.queue_number := null;
    return new;
  end if;
  if tg_op = 'UPDATE'
    and new.organization_id = old.organization_id
    and new.start_at = old.start_at
    and new.delivery_mode = old.delivery_mode
    and new.queue_number is not null then
    return new;
  end if;
  new.queue_date := (new.start_at at time zone 'UTC')::date;
  perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text || ':' || new.queue_date::text, 0));
  select coalesce(max(appointment.queue_number), 0) + 1 into new.queue_number
  from public.appointments appointment
  where appointment.organization_id = new.organization_id
    and appointment.queue_date = new.queue_date
    and appointment.delivery_mode = 'in_person'
    and appointment.id is distinct from new.id;
  return new;
end;
$$;

drop trigger appointments_assign_queue_number on public.appointments;
create trigger appointments_assign_queue_number
  before insert or update of organization_id, start_at, delivery_mode on public.appointments
  for each row execute function public.assign_appointment_queue_number();

-- Existing booked slots remain API compatible; callers may now choose virtual.
drop function public.book_appointment_slot(uuid, uuid);
create function public.book_appointment_slot(
  p_slot_id uuid,
  p_patient_id uuid default null,
  p_delivery_mode public.appointment_delivery_mode default 'in_person'
)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare
  caller_id uuid := auth.uid();
  selected_slot public.appointment_slots%rowtype;
  selected_patient public.patients%rowtype;
  selected_service public.clinic_services%rowtype;
  new_appointment_id uuid;
begin
  if caller_id is null then raise exception 'Authentication is required.' using errcode = '28000'; end if;
  select * into selected_slot from public.appointment_slots where id = p_slot_id for update;
  if selected_slot.id is null then raise exception 'Appointment slot not found.' using errcode = 'P0002'; end if;
  if selected_slot.status <> 'free' or selected_slot.appointment_id is not null then
    raise exception 'This appointment slot is no longer available.' using errcode = '23505';
  end if;
  if selected_slot.start_at <= now() then raise exception 'Past appointment slots cannot be booked.' using errcode = '22007'; end if;

  select * into selected_service from public.clinic_services where id = selected_slot.clinic_service_id;
  if selected_service.id is null or not (p_delivery_mode = any(selected_service.delivery_modes)) then
    raise exception 'The selected delivery mode is not offered for this service.' using errcode = '22023';
  end if;

  if p_patient_id is null then
    select * into selected_patient from public.patients
    where organization_id = selected_slot.organization_id and auth_user_id = caller_id and active;
  else
    select * into selected_patient from public.patients
    where id = p_patient_id and organization_id = selected_slot.organization_id and active;
  end if;
  if selected_patient.id is null then raise exception 'An active patient at this clinic is required.' using errcode = '23503'; end if;
  if selected_patient.auth_user_id is distinct from caller_id
    and not public.has_organization_permission(selected_slot.organization_id, 'can_manage_appointments') then
    raise exception 'You cannot book for this patient.' using errcode = '42501';
  end if;

  insert into public.appointments (
    organization_id, patient_id, practitioner_role_id, status, service_type,
    appointment_type, start_at, end_at, minutes_duration, clinic_service_id,
    delivery_mode, patient_instruction
  ) values (
    selected_slot.organization_id, selected_patient.id, selected_slot.practitioner_role_id,
    'booked', selected_slot.service_type,
    case when p_delivery_mode = 'virtual' then 'TELECONSULT' else 'ROUTINE' end,
    selected_slot.start_at, selected_slot.end_at,
    greatest(1, floor(extract(epoch from (selected_slot.end_at - selected_slot.start_at)) / 60)::integer),
    selected_slot.clinic_service_id, p_delivery_mode,
    case when p_delivery_mode = 'virtual'
      then 'Join from your patient portal up to 30 minutes before the scheduled time.'
      else null end
  ) returning id into new_appointment_id;

  update public.appointment_slots set status = 'busy', appointment_id = new_appointment_id
  where id = selected_slot.id;
  return new_appointment_id;
end;
$$;

revoke all on function public.book_appointment_slot(uuid, uuid, public.appointment_delivery_mode) from public;
grant execute on function public.book_appointment_slot(uuid, uuid, public.appointment_delivery_mode) to authenticated;

-- Virtual visits create the ordinary Encounter directly; in-person visits keep
-- the existing checked-in + immutable nurse triage gate.
create or replace function public.start_appointment_encounter(p_appointment_id uuid)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare
  selected_appointment public.appointments%rowtype;
  selected_encounter public.encounters%rowtype;
begin
  select appointment.* into selected_appointment
  from public.appointments appointment
  join public.practitioner_roles practitioner_role on practitioner_role.id = appointment.practitioner_role_id
  join public.practitioners practitioner on practitioner.id = practitioner_role.practitioner_id
  where appointment.id = p_appointment_id
    and practitioner.active and practitioner_role.active
    and practitioner.auth_user_id = auth.uid()
  for update of appointment;
  if selected_appointment.id is null then raise exception 'Assigned appointment not found.' using errcode = 'P0002'; end if;
  if not public.has_organization_permission(selected_appointment.organization_id, 'can_start_consultation') then
    raise exception 'Consultation permission is required.' using errcode = '42501';
  end if;

  select * into selected_encounter from public.encounters encounter
  where encounter.appointment_id = selected_appointment.id for update;

  if selected_appointment.delivery_mode = 'virtual' then
    if selected_appointment.status not in ('booked', 'arrived') then
      raise exception 'Only an active virtual appointment can be started.' using errcode = '23514';
    end if;
    if selected_encounter.id is null then
      insert into public.encounters (
        organization_id, patient_id, appointment_id, practitioner_role_id,
        status, class_code, service_type, period_start
      ) values (
        selected_appointment.organization_id, selected_appointment.patient_id,
        selected_appointment.id, selected_appointment.practitioner_role_id,
        'in_progress', 'VR', selected_appointment.service_type, now()
      ) returning * into selected_encounter;
    elsif selected_encounter.status = 'arrived' then
      update public.encounters set status = 'in_progress', period_start = coalesce(period_start, now())
      where id = selected_encounter.id returning * into selected_encounter;
    elsif selected_encounter.status <> 'in_progress' then
      raise exception 'This appointment already has an encounter.' using errcode = '23505';
    end if;
    update public.teleconsult_rooms set status = 'open', opened_at = coalesce(opened_at, now())
    where appointment_id = selected_appointment.id and status = 'scheduled';
    return selected_encounter.id;
  end if;

  if selected_appointment.status <> 'arrived' then
    raise exception 'Only a checked-in appointment can be started.' using errcode = '23514';
  end if;
  if selected_encounter.id is null or not exists (
    select 1 from public.observations observation
    where observation.encounter_id = selected_encounter.id
      and observation.code = 'TRIAGE-VITALS' and observation.status = 'final'
  ) then
    raise exception 'Completed triage is required before the consultation can start.' using errcode = '23514';
  end if;
  if selected_encounter.status = 'in_progress' then return selected_encounter.id; end if;
  if selected_encounter.status <> 'arrived' then raise exception 'This appointment already has an encounter.' using errcode = '23505'; end if;
  update public.encounters set status = 'in_progress', period_start = coalesce(period_start, now())
  where id = selected_encounter.id;
  return selected_encounter.id;
end;
$$;

create or replace function public.list_teleconsult_appointments(p_organization_id uuid)
returns table (
  appointment_id uuid, organization_id uuid, provider public.teleconsult_provider,
  room_name text, room_status public.teleconsult_room_status,
  appointment_status public.appointment_status, start_at timestamptz, end_at timestamptz,
  service_type text, patient_name text, practitioner_name text,
  can_join boolean, encounter_id uuid, encounter_status public.encounter_status
)
language sql stable security definer set search_path = public, auth as $$
  select
    appointment.id, appointment.organization_id, room.provider,
    case when now() between appointment.start_at - interval '30 minutes'
      and appointment.end_at + interval '2 hours'
      and appointment.status in ('booked', 'arrived')
      and room.status in ('scheduled', 'open') then room.room_name else null end,
    room.status, appointment.status, appointment.start_at, appointment.end_at,
    appointment.service_type, coalesce(patient.name ->> 'text', 'Patient'),
    coalesce(practitioner.name ->> 'text', 'Clinician'),
    now() between appointment.start_at - interval '30 minutes'
      and appointment.end_at + interval '2 hours'
      and appointment.status in ('booked', 'arrived')
      and room.status in ('scheduled', 'open'),
    encounter.id, encounter.status
  from public.appointments appointment
  join public.teleconsult_rooms room on room.appointment_id = appointment.id
  join public.patients patient on patient.id = appointment.patient_id
  join public.practitioner_roles practitioner_role on practitioner_role.id = appointment.practitioner_role_id
  join public.practitioners practitioner on practitioner.id = practitioner_role.practitioner_id
  left join public.encounters encounter on encounter.appointment_id = appointment.id
  where appointment.organization_id = p_organization_id
    and appointment.delivery_mode = 'virtual'
    and (
      (patient.auth_user_id = auth.uid() and patient.active)
      or (practitioner.auth_user_id = auth.uid() and practitioner.active and practitioner_role.active)
    )
  order by appointment.start_at desc;
$$;

create or replace function public.save_provider_clinic_service_with_delivery(
  p_service_id uuid, p_organization_id uuid, p_code text, p_name text,
  p_description text, p_duration_minutes integer, p_base_price numeric,
  p_booking_enabled boolean, p_delivery_modes public.appointment_delivery_mode[]
)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare saved_id uuid;
begin
  if cardinality(p_delivery_modes) is null or cardinality(p_delivery_modes) = 0 then
    raise exception 'Select at least one service delivery mode.' using errcode = '22023';
  end if;
  saved_id := public.save_provider_clinic_service(
    p_service_id, p_organization_id, p_code, p_name, p_description,
    p_duration_minutes, p_base_price, p_booking_enabled
  );
  update public.clinic_services
  set delivery_modes = p_delivery_modes
  where id = saved_id and organization_id = p_organization_id;
  return saved_id;
end;
$$;

create or replace function public.close_teleconsult_room(p_appointment_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
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

-- Default payout permissions. Custom roles remain opt-in through the role CMS.
insert into public.role_permissions (role_id, organization_id, permission)
select role.id, null, permission.permission
from public.roles role
join (values
  ('doctor', 'can_view_payouts'),
  ('admin', 'can_view_payouts'), ('admin', 'can_manage_payouts'),
  ('owner', 'can_view_payouts'), ('owner', 'can_manage_payouts')
) as permission(role_name, permission) on permission.role_name = role.name
on conflict (role_id, organization_id, permission) do nothing;

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
    'can_manage_billing', 'can_view_billing', 'can_manage_pos',
    'can_manage_claims', 'can_view_claims', 'can_view_payouts', 'can_manage_payouts'
  ));

insert into public.clinic_role_permission_overrides (organization_id, role_code, permission)
select organization.id, grant_row.role_code, grant_row.permission
from public.organizations organization
cross join (values
  ('doctor', 'can_view_payouts'),
  ('admin', 'can_view_payouts'), ('admin', 'can_manage_payouts'),
  ('owner', 'can_view_payouts'), ('owner', 'can_manage_payouts')
) as grant_row(role_code, permission)
on conflict (organization_id, role_code, permission) do nothing;

create or replace function public.save_clinic_role_definition(
  p_organization_id uuid, p_code text, p_name text, p_permissions text[]
) returns void language plpgsql security definer set search_path = public, auth as $$
declare
  normalized_code text := coalesce(nullif(lower(btrim(p_code)), ''), lower(replace(public.system_generated_code('role'), '-', '_')));
  normalized_name text := btrim(p_name);
  allowed_permissions text[] := array[
    'can_access_admin_portal', 'can_access_provider_portal', 'can_manage_appointments',
    'can_record_triage', 'can_start_consultation', 'can_manage_provider_schedule',
    'can_manage_staff_roles', 'can_view_inventory', 'can_manage_inventory',
    'can_tag_inventory_usage', 'can_order_diagnostics', 'can_view_diagnostics',
    'can_view_lab_worklist', 'can_record_lab_results', 'can_view_referrals',
    'can_update_referrals', 'can_manage_laboratory_services',
    'can_manage_billing', 'can_view_billing', 'can_manage_pos',
    'can_manage_claims', 'can_view_claims', 'can_view_payouts', 'can_manage_payouts'
  ];
begin
  if not public.can_manage_organization_accounts(p_organization_id) then
    raise exception 'Role management permission is required.' using errcode = '42501';
  end if;
  if normalized_code !~ '^[a-z][a-z0-9_]{1,39}$'
    or length(normalized_name) not between 2 and 80
    or exists (
      select 1 from unnest(coalesce(p_permissions, '{}'::text[])) permission
      where permission <> all(allowed_permissions)
    ) then
    raise exception 'Role details or permissions are invalid.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.roles role where role.name = normalized_code) then
    insert into public.clinic_role_definitions (organization_id, code, name)
    values (p_organization_id, normalized_code, normalized_name)
    on conflict (organization_id, code) do update set name = excluded.name, active = true;
  end if;
  delete from public.clinic_role_permission_overrides
  where organization_id = p_organization_id and role_code = normalized_code;
  insert into public.clinic_role_permission_overrides (organization_id, role_code, permission)
  select p_organization_id, normalized_code, permission
  from unnest(array_append(coalesce(p_permissions, '{}'::text[]), 'role_permissions_configured')) permission;
end;
$$;

create or replace function public.refresh_doctor_payout(p_encounter_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare
  selected_encounter public.encounters%rowtype;
  selected_event public.billing_events%rowtype;
  service_total numeric(14,2);
  service_currency text;
  share_bps integer;
begin
  select * into selected_encounter from public.encounters where id = p_encounter_id;
  if selected_encounter.id is null or selected_encounter.practitioner_role_id is null then return; end if;
  select * into selected_event from public.billing_events
  where encounter_id = p_encounter_id and status <> 'cancelled'
  order by finalized_at desc nulls last, created_at desc limit 1;
  if selected_encounter.status <> 'finished' or selected_event.id is null or selected_event.status <> 'finalized' then return; end if;

  select coalesce(sum(line_total), 0), coalesce(min(currency), 'PHP')
  into service_total, service_currency
  from public.billing_line_items
  where billing_event_id = selected_event.id and source_type = 'clinic_service';
  if service_total <= 0 then return; end if;
  select coalesce((select setting.share_basis_points
    from public.practitioner_payout_settings setting
    where setting.organization_id = selected_encounter.organization_id
      and setting.practitioner_role_id = selected_encounter.practitioner_role_id
      and setting.active), 10000) into share_bps;

  insert into public.doctor_payouts (
    organization_id, practitioner_role_id, encounter_id, billing_event_id,
    gross_service_amount, share_basis_points, payout_amount, currency
  ) values (
    selected_encounter.organization_id, selected_encounter.practitioner_role_id,
    selected_encounter.id, selected_event.id, service_total, share_bps,
    round(service_total * share_bps / 10000.0, 2), service_currency
  ) on conflict (encounter_id) do update set
    billing_event_id = excluded.billing_event_id,
    gross_service_amount = excluded.gross_service_amount,
    share_basis_points = excluded.share_basis_points,
    payout_amount = excluded.payout_amount,
    currency = excluded.currency,
    status = 'pending',
    paid_at = null,
    paid_by = null,
    payment_reference = null
  where public.doctor_payouts.status in ('pending', 'void');
end;
$$;

create or replace function public.sync_doctor_payout_from_encounter()
returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.refresh_doctor_payout(new.id); return new; end;
$$;
create trigger encounters_sync_doctor_payout
  after insert or update of status on public.encounters
  for each row execute function public.sync_doctor_payout_from_encounter();

create or replace function public.sync_doctor_payout_from_billing()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.encounter_id is not null then perform public.refresh_doctor_payout(new.encounter_id); end if;
  if new.status = 'cancelled' then
    update public.doctor_payouts set status = 'void'
    where billing_event_id = new.id and status = 'pending';
  end if;
  return new;
end;
$$;
create trigger billing_events_sync_doctor_payout
  after insert or update of status on public.billing_events
  for each row execute function public.sync_doctor_payout_from_billing();

create or replace function public.list_doctor_payouts(p_organization_id uuid)
returns table (
  id uuid, encounter_id uuid, billing_event_id uuid, practitioner_role_id uuid,
  practitioner_name text, delivery_mode public.appointment_delivery_mode,
  service_type text, encounter_finished_at timestamptz,
  gross_service_amount numeric, share_basis_points integer, payout_amount numeric,
  currency text, status public.doctor_payout_status, paid_at timestamptz,
  payment_reference text, created_at timestamptz
)
language sql stable security definer set search_path = public, auth as $$
  select payout.id, payout.encounter_id, payout.billing_event_id,
    payout.practitioner_role_id, coalesce(practitioner.name ->> 'text', 'Clinician'),
    coalesce(appointment.delivery_mode, 'in_person'), encounter.service_type,
    encounter.period_end, payout.gross_service_amount, payout.share_basis_points,
    payout.payout_amount, payout.currency, payout.status, payout.paid_at,
    payout.payment_reference, payout.created_at
  from public.doctor_payouts payout
  join public.practitioner_roles practitioner_role on practitioner_role.id = payout.practitioner_role_id
  join public.practitioners practitioner on practitioner.id = practitioner_role.practitioner_id
  join public.encounters encounter on encounter.id = payout.encounter_id
  left join public.appointments appointment on appointment.id = encounter.appointment_id
  where payout.organization_id = p_organization_id
    and (
      public.has_organization_permission(p_organization_id, 'can_view_payouts')
      or (practitioner.auth_user_id = auth.uid() and practitioner.active and practitioner_role.active)
    )
  order by payout.created_at desc;
$$;

create or replace function public.set_practitioner_payout_rate(
  p_practitioner_role_id uuid, p_share_basis_points integer
)
returns void language plpgsql security definer set search_path = public, auth as $$
declare selected_role public.practitioner_roles%rowtype;
begin
  select * into selected_role from public.practitioner_roles where id = p_practitioner_role_id;
  if selected_role.id is null then raise exception 'Practitioner role not found.' using errcode = 'P0002'; end if;
  if not public.has_organization_permission(selected_role.organization_id, 'can_manage_payouts') then
    raise exception 'Payout management permission is required.' using errcode = '42501';
  end if;
  if p_share_basis_points not between 0 and 10000 then
    raise exception 'Payout share must be between 0 and 100 percent.' using errcode = '22023';
  end if;
  insert into public.practitioner_payout_settings (
    organization_id, practitioner_role_id, share_basis_points
  ) values (selected_role.organization_id, selected_role.id, p_share_basis_points)
  on conflict (organization_id, practitioner_role_id) do update
    set share_basis_points = excluded.share_basis_points, active = true;
end;
$$;

create or replace function public.settle_doctor_payouts(
  p_organization_id uuid, p_payout_ids uuid[], p_payment_reference text
)
returns integer language plpgsql security definer set search_path = public, auth as $$
declare updated_count integer;
begin
  if not public.has_organization_permission(p_organization_id, 'can_manage_payouts') then
    raise exception 'Payout management permission is required.' using errcode = '42501';
  end if;
  if cardinality(p_payout_ids) is null or cardinality(p_payout_ids) = 0 then
    raise exception 'Select at least one payout.' using errcode = '22023';
  end if;
  if nullif(btrim(p_payment_reference), '') is null then
    raise exception 'A payment reference is required.' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(p_payout_ids) requested_id
    left join public.doctor_payouts payout on payout.id = requested_id
    where payout.id is null or payout.organization_id <> p_organization_id or payout.status <> 'pending'
  ) then
    raise exception 'Every selected payout must be pending at this clinic.' using errcode = '22023';
  end if;
  update public.doctor_payouts set
    status = 'paid', paid_at = now(), paid_by = auth.uid(),
    payment_reference = btrim(p_payment_reference)
  where organization_id = p_organization_id and id = any(p_payout_ids) and status = 'pending';
  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

revoke all on function public.list_teleconsult_appointments(uuid) from public;
revoke all on function public.close_teleconsult_room(uuid) from public;
revoke all on function public.save_provider_clinic_service_with_delivery(uuid, uuid, text, text, text, integer, numeric, boolean, public.appointment_delivery_mode[]) from public;
revoke all on function public.list_doctor_payouts(uuid) from public;
revoke all on function public.set_practitioner_payout_rate(uuid, integer) from public;
revoke all on function public.settle_doctor_payouts(uuid, uuid[], text) from public;
revoke all on function public.refresh_doctor_payout(uuid) from public, anon, authenticated;
grant execute on function public.list_teleconsult_appointments(uuid) to authenticated;
grant execute on function public.close_teleconsult_room(uuid) to authenticated;
grant execute on function public.save_provider_clinic_service_with_delivery(uuid, uuid, text, text, text, integer, numeric, boolean, public.appointment_delivery_mode[]) to authenticated;
grant execute on function public.list_doctor_payouts(uuid) to authenticated;
grant execute on function public.set_practitioner_payout_rate(uuid, integer) to authenticated;
grant execute on function public.settle_doctor_payouts(uuid, uuid[], text) to authenticated;

grant select on public.teleconsult_rooms, public.practitioner_payout_settings, public.doctor_payouts to authenticated;

comment on column public.appointments.delivery_mode is
  'FHIR Appointment virtualService delivery discriminator; virtual visits still produce ordinary Encounters.';
comment on table public.teleconsult_rooms is
  'Tenant-scoped, participant-only video room metadata for virtual Appointments.';
comment on table public.doctor_payouts is
  'Immutable financial entitlement snapshot derived from a finished Encounter and finalized billing event.';
