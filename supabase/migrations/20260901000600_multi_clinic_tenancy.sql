-- Multi-clinic tenancy hardening. Every operational actor is bound to one
-- clinic; a patient Auth identity can deliberately enroll at multiple clinics,
-- creating one isolated Patient resource per clinic.

create table public.patient_clinic_contexts (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger patient_clinic_contexts_set_updated_at
  before update on public.patient_clinic_contexts
  for each row execute function public.set_updated_at();
create trigger patient_clinic_contexts_audit
  after insert or update or delete on public.patient_clinic_contexts
  for each row execute function public.write_audit_log();
alter table public.patient_clinic_contexts enable row level security;

create or replace function public.enroll_patient_at_clinic(
  p_organization_id uuid,
  p_display_name text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller_id uuid := auth.uid();
  patient_id uuid;
  display_name text := btrim(p_display_name);
begin
  if caller_id is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;
  if display_name is null or length(display_name) < 2 or length(display_name) > 120 then
    raise exception 'A patient display name between 2 and 120 characters is required.'
      using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.organizations organization
    where organization.id = p_organization_id and organization.active
  ) then
    raise exception 'The selected clinic is not accepting registrations.' using errcode = '22023';
  end if;

  insert into public.patients (organization_id, auth_user_id, name)
  values (p_organization_id, caller_id, jsonb_build_object('text', display_name))
  on conflict (organization_id, auth_user_id) where auth_user_id is not null
  do update set name = public.patients.name
  returning id into patient_id;

  insert into public.patient_clinic_contexts (auth_user_id, organization_id)
  values (caller_id, p_organization_id)
  on conflict (auth_user_id) do update
  set organization_id = excluded.organization_id;

  return patient_id;
end;
$$;

-- Staff accounts do not roam between clinics. Practitioner.auth_user_id is
-- already globally unique; this closes the otherwise independent user_roles
-- catalog so it cannot imply a second staff tenancy.
create or replace function public.enforce_staff_user_clinic_boundary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned_role text;
begin
  select role.name into assigned_role from public.roles role where role.id = new.role_id;

  if assigned_role <> 'patient' and exists (
    select 1
    from public.user_roles membership
    join public.roles membership_role on membership_role.id = membership.role_id
    where membership.user_id = new.user_id
      and membership.id is distinct from new.id
      and membership.organization_id <> new.organization_id
      and membership_role.name <> 'patient'
  ) then
    raise exception 'Staff access must belong to exactly one clinic.' using errcode = '23514';
  end if;

  if assigned_role <> 'patient' and exists (
    select 1 from public.practitioners practitioner
    where practitioner.auth_user_id = new.user_id
      and practitioner.organization_id <> new.organization_id
  ) then
    raise exception 'Staff access must match the practitioner clinic.' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger user_roles_staff_clinic_boundary
  before insert or update of user_id, organization_id, role_id on public.user_roles
  for each row execute function public.enforce_staff_user_clinic_boundary();

create or replace function public.enforce_practitioner_user_clinic_boundary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.auth_user_id is not null and exists (
    select 1
    from public.user_roles membership
    join public.roles role on role.id = membership.role_id
    where membership.user_id = new.auth_user_id
      and membership.organization_id <> new.organization_id
      and role.name <> 'patient'
  ) then
    raise exception 'Practitioner access must match the staff clinic.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger practitioners_staff_clinic_boundary
  before insert or update of auth_user_id, organization_id on public.practitioners
  for each row execute function public.enforce_practitioner_user_clinic_boundary();

create or replace function public.get_current_staff_organization()
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select practitioner_role.organization_id
  from public.practitioner_roles practitioner_role
  join public.practitioners practitioner on practitioner.id = practitioner_role.practitioner_id
  where practitioner.auth_user_id = auth.uid()
    and practitioner.active
    and practitioner_role.active
  order by practitioner_role.created_at
  limit 1;
$$;

revoke all on function public.enroll_patient_at_clinic(uuid, text) from public;
revoke all on function public.get_current_staff_organization() from public;
grant execute on function public.enroll_patient_at_clinic(uuid, text) to authenticated;
grant execute on function public.get_current_staff_organization() to authenticated;

create or replace function public.set_patient_clinic_context(
  p_organization_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.patients patient
    where patient.auth_user_id = auth.uid()
      and patient.organization_id = p_organization_id
      and patient.active
  ) then
    raise exception 'You are not enrolled at the selected clinic.' using errcode = '42501';
  end if;
  insert into public.patient_clinic_contexts (auth_user_id, organization_id)
  values (auth.uid(), p_organization_id)
  on conflict (auth_user_id) do update
  set organization_id = excluded.organization_id;
end;
$$;

create or replace function public.is_patient_self(
  target_patient_id uuid,
  target_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select (
    exists (
      select 1
      from public.patients patient
      join public.patient_clinic_contexts context
        on context.auth_user_id = patient.auth_user_id
       and context.organization_id = patient.organization_id
      where patient.id = target_patient_id
        and patient.organization_id = target_organization_id
        and patient.active
        and patient.auth_user_id = auth.uid()
    )
  ) or public.is_walk_in_patient(target_patient_id, target_organization_id);
$$;

create or replace function public.book_appointment_slot(
  p_slot_id uuid,
  p_patient_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller_id uuid := auth.uid();
  selected_slot public.appointment_slots%rowtype;
  selected_patient public.patients%rowtype;
  new_appointment_id uuid;
begin
  if caller_id is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;
  select * into selected_slot from public.appointment_slots where id = p_slot_id for update;
  if selected_slot.id is null then
    raise exception 'Appointment slot not found.' using errcode = 'P0002';
  end if;
  if selected_slot.status <> 'free' or selected_slot.appointment_id is not null then
    raise exception 'This appointment slot is no longer available.' using errcode = '23505';
  end if;
  if selected_slot.start_at <= now() then
    raise exception 'Past appointment slots cannot be booked.' using errcode = '22007';
  end if;

  if p_patient_id is null then
    select * into selected_patient from public.patients
    where organization_id = selected_slot.organization_id
      and auth_user_id = caller_id and active;
  else
    select * into selected_patient from public.patients
    where id = p_patient_id
      and organization_id = selected_slot.organization_id and active;
  end if;
  if selected_patient.id is null then
    raise exception 'An active patient at this clinic is required.' using errcode = '23503';
  end if;

  if p_patient_id is null and not public.is_patient_self(
    selected_patient.id, selected_slot.organization_id
  ) then
    raise exception 'Select this clinic before booking.' using errcode = '42501';
  end if;
  if selected_patient.auth_user_id is distinct from caller_id
    and not public.has_organization_role(
      selected_slot.organization_id, array['front_desk', 'admin', 'owner']
    ) then
    raise exception 'You cannot book for this patient.' using errcode = '42501';
  end if;

  insert into public.appointments (
    organization_id, patient_id, practitioner_role_id, status, service_type,
    appointment_type, start_at, end_at, minutes_duration
  ) values (
    selected_slot.organization_id, selected_patient.id,
    selected_slot.practitioner_role_id, 'booked', selected_slot.service_type,
    'ROUTINE', selected_slot.start_at, selected_slot.end_at,
    greatest(1, floor(extract(epoch from (selected_slot.end_at - selected_slot.start_at)) / 60)::integer)
  ) returning id into new_appointment_id;
  update public.appointment_slots
  set status = 'busy', appointment_id = new_appointment_id
  where id = selected_slot.id;
  return new_appointment_id;
end;
$$;

revoke all on function public.set_patient_clinic_context(uuid) from public;
grant execute on function public.set_patient_clinic_context(uuid) to authenticated;

comment on function public.enroll_patient_at_clinic(uuid, text) is
  'Allows the universal patient Auth identity to explicitly create a separate Patient resource at one clinic.';
comment on function public.get_current_staff_organization() is
  'Returns the single active clinic for the calling staff identity.';
