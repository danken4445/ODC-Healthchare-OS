-- Loop C: patient-safe doctor-first booking projections and atomic reservation.
-- Rollback: restore book_appointment_slot from the billing lifecycle migration,
-- revoke these RPCs, and remove the additive constraint only after patient-web
-- no longer calls the Loop C contract. Do not alter historical appointments.

alter table public.appointment_slots
  add constraint appointment_slots_busy_requires_appointment
  check (status <> 'busy' or appointment_id is not null) not valid;
alter table public.appointment_slots
  validate constraint appointment_slots_busy_requires_appointment;

create or replace function public.is_service_practitioner_bookable(
  p_service_practitioner_id uuid,
  p_at timestamptz default now()
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_membership public.service_practitioners%rowtype;
  v_fee_model text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;
  if p_at is null then
    raise exception 'Bookability lookup time is required.' using errcode = '22023';
  end if;

  select membership.* into v_membership
  from public.service_practitioners as membership
  where membership.id = p_service_practitioner_id;
  if v_membership.id is null then
    return false;
  end if;
  if not public.can_access_organization(v_membership.organization_id)
    and not exists (
      select 1 from public.patients as patient
      where patient.organization_id = v_membership.organization_id
        and patient.active
        and public.is_patient_self(patient.id, patient.organization_id)
    ) then
    return false;
  end if;

  select settings.fee_model into v_fee_model
  from public.organization_settings as settings
  where settings.organization_id = v_membership.organization_id;
  if not v_membership.is_active then
    return false;
  end if;
  if v_fee_model = 'fixed_rate' then
    return true;
  end if;

  return exists (
    select 1 from public.practitioner_service_fees as fee
    where fee.service_practitioner_id = v_membership.id
      and fee.effective_from <= p_at
  );
end;
$$;

create or replace function public.bookable_practitioners(p_service_id uuid)
returns table (
  practitioner_role_id uuid,
  display_name text,
  specialty text,
  title text,
  photo_url text,
  total_price numeric,
  currency text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_service public.clinic_services%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select service.* into v_service
  from public.clinic_services as service
  where service.id = p_service_id
    and service.active
    and service.booking_enabled;

  if v_service.id is null then
    raise exception 'Bookable service not found.' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.patients as patient
    where patient.organization_id = v_service.organization_id
      and patient.active
      and public.is_patient_self(patient.id, patient.organization_id)
  ) then
    raise exception 'Patient access to this clinic is required.' using errcode = '42501';
  end if;

  return query
  select
    membership.practitioner_role_id,
    coalesce(practitioner.name ->> 'text', 'Practitioner'),
    nullif(practitioner_role.specialty_codes ->> 0, ''),
    nullif(practitioner.qualification ->> 'title', ''),
    nullif(practitioner.qualification ->> 'photo_url', ''),
    case
      when settings.fee_model = 'practitioner_declared'
        then service.base_price + fee.amount
      else service.base_price
    end,
    service.currency
  from public.service_practitioners as membership
  join public.clinic_services as service
    on service.id = membership.clinic_service_id
   and service.organization_id = membership.organization_id
  join public.practitioner_roles as practitioner_role
    on practitioner_role.id = membership.practitioner_role_id
   and practitioner_role.organization_id = membership.organization_id
  join public.practitioners as practitioner
    on practitioner.id = practitioner_role.practitioner_id
   and practitioner.organization_id = membership.organization_id
  join public.organization_settings as settings
    on settings.organization_id = membership.organization_id
  left join lateral (
    select declaration.amount
    from public.practitioner_service_fees as declaration
    where declaration.service_practitioner_id = membership.id
      and declaration.effective_from <= now()
    order by declaration.effective_from desc, declaration.created_at desc, declaration.id desc
    limit 1
  ) as fee on true
  where membership.organization_id = v_service.organization_id
    and membership.clinic_service_id = v_service.id
    and membership.is_active
    and practitioner_role.active
    and practitioner.active
    and practitioner_role.role_code in ('doctor', 'specialist')
    and public.is_service_practitioner_bookable(membership.id)
  order by practitioner.name ->> 'text', membership.created_at;
end;
$$;

create or replace function public.get_available_slots(
  p_service_id uuid,
  p_date_range tstzrange,
  p_practitioner_role_id uuid
)
returns table (
  id uuid,
  practitioner_role_id uuid,
  clinic_service_id uuid,
  service_type text,
  start_at timestamptz,
  end_at timestamptz,
  display_name text,
  specialty text,
  title text,
  photo_url text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_service public.clinic_services%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;
  if p_date_range is null or isempty(p_date_range) then
    raise exception 'A non-empty date range is required.' using errcode = '22023';
  end if;

  select service.* into v_service
  from public.clinic_services as service
  where service.id = p_service_id
    and service.active
    and service.booking_enabled;
  if v_service.id is null then
    raise exception 'Bookable service not found.' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.patients as patient
    where patient.organization_id = v_service.organization_id
      and patient.active
      and public.is_patient_self(patient.id, patient.organization_id)
  ) then
    raise exception 'Patient access to this clinic is required.' using errcode = '42501';
  end if;

  return query
  select
    slot.id,
    slot.practitioner_role_id,
    slot.clinic_service_id,
    slot.service_type,
    slot.start_at,
    slot.end_at,
    coalesce(practitioner.name ->> 'text', 'Practitioner'),
    nullif(practitioner_role.specialty_codes ->> 0, ''),
    nullif(practitioner.qualification ->> 'title', ''),
    nullif(practitioner.qualification ->> 'photo_url', '')
  from public.appointment_slots as slot
  join public.service_practitioners as membership
    on membership.organization_id = slot.organization_id
   and membership.clinic_service_id = slot.clinic_service_id
   and membership.practitioner_role_id = slot.practitioner_role_id
  join public.practitioner_roles as practitioner_role
    on practitioner_role.id = slot.practitioner_role_id
   and practitioner_role.organization_id = slot.organization_id
  join public.practitioners as practitioner
    on practitioner.id = practitioner_role.practitioner_id
   and practitioner.organization_id = slot.organization_id
  where slot.organization_id = v_service.organization_id
    and slot.clinic_service_id = v_service.id
    and slot.practitioner_role_id = p_practitioner_role_id
    and slot.status = 'free'
    and slot.appointment_id is null
    and slot.start_at <@ p_date_range
    and membership.is_active
    and practitioner_role.active
    and practitioner.active
    and public.is_service_practitioner_bookable(membership.id)
  order by slot.start_at;
end;
$$;

create or replace function public.book_appointment(
  p_slot_id uuid,
  p_delivery_mode public.appointment_delivery_mode default 'in_person'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_slot public.appointment_slots%rowtype;
  v_patient public.patients%rowtype;
  v_service public.clinic_services%rowtype;
  v_appointment_id uuid;
begin
  if v_caller_id is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select slot.* into v_slot
  from public.appointment_slots as slot
  where slot.id = p_slot_id
  for update;
  if v_slot.id is null then
    raise exception 'Appointment slot not found.' using errcode = 'P0002';
  end if;
  if v_slot.status <> 'free' or v_slot.appointment_id is not null then
    raise sqlstate 'PT409'
      using message = 'SLOT_TAKEN', detail = 'This appointment time was just reserved by another patient.';
  end if;
  if v_slot.start_at <= now() then
    raise exception 'Past appointment slots cannot be booked.' using errcode = '22007';
  end if;

  select service.* into v_service
  from public.clinic_services as service
  where service.id = v_slot.clinic_service_id
    and service.organization_id = v_slot.organization_id
    and service.active
    and service.booking_enabled;
  if v_service.id is null or not (p_delivery_mode = any(v_service.delivery_modes)) then
    raise exception 'The selected delivery mode is not offered for this service.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.service_practitioners as membership
    where membership.organization_id = v_slot.organization_id
      and membership.clinic_service_id = v_slot.clinic_service_id
      and membership.practitioner_role_id = v_slot.practitioner_role_id
      and membership.is_active
      and public.is_service_practitioner_bookable(membership.id)
  ) then
    raise exception 'The selected practitioner is no longer bookable for this service.' using errcode = '22023';
  end if;

  select patient.* into v_patient
  from public.patients as patient
  where patient.organization_id = v_slot.organization_id
    and patient.auth_user_id = v_caller_id
    and patient.active;
  if v_patient.id is null or not public.is_patient_self(v_patient.id, v_slot.organization_id) then
    raise exception 'An active patient at this clinic is required.' using errcode = '23503';
  end if;

  insert into public.appointments (
    organization_id, patient_id, practitioner_role_id, status, service_type,
    appointment_type, start_at, end_at, minutes_duration, clinic_service_id,
    delivery_mode, patient_instruction, payment_due_at
  ) values (
    v_slot.organization_id, v_patient.id, v_slot.practitioner_role_id, 'pending', v_slot.service_type,
    case when p_delivery_mode = 'virtual' then 'TELECONSULT' else 'ROUTINE' end,
    v_slot.start_at, v_slot.end_at,
    greatest(1, floor(extract(epoch from (v_slot.end_at - v_slot.start_at)) / 60)::integer),
    v_slot.clinic_service_id, p_delivery_mode,
    case when p_delivery_mode = 'virtual' then 'Join from your patient portal up to 30 minutes before the scheduled time.' else null end,
    least(v_slot.start_at, now() + interval '15 minutes')
  ) returning id into v_appointment_id;

  update public.appointment_slots as slot
  set status = 'busy', appointment_id = v_appointment_id
  where slot.id = v_slot.id
    and slot.status = 'free'
    and slot.appointment_id is null;
  if not found then
    raise sqlstate 'PT409'
      using message = 'SLOT_TAKEN', detail = 'This appointment time was just reserved by another patient.';
  end if;

  perform public.log_billing_transition(v_slot.organization_id, 'appointment', v_appointment_id, null, 'pending', 'Slot reserved pending billing resolution');
  perform public.generate_appointment_bill(v_appointment_id);
  return v_appointment_id;
end;
$$;

revoke all on function public.bookable_practitioners(uuid) from public, anon;
revoke all on function public.get_available_slots(uuid, tstzrange, uuid) from public, anon;
revoke all on function public.book_appointment(uuid, public.appointment_delivery_mode) from public, anon;
grant execute on function public.bookable_practitioners(uuid) to authenticated;
grant execute on function public.get_available_slots(uuid, tstzrange, uuid) to authenticated;
grant execute on function public.book_appointment(uuid, public.appointment_delivery_mode) to authenticated;

comment on function public.bookable_practitioners(uuid) is
  'Patient booking projection: only practitioner display fields plus the service total; excludes licenses and email addresses.';
comment on function public.get_available_slots(uuid, tstzrange, uuid) is
  'Patient booking projection for one required practitioner and service; excludes licenses and email addresses.';
comment on function public.book_appointment(uuid, public.appointment_delivery_mode) is
  'Atomically locks and reserves one free slot, then creates its bill. PT409/SLOT_TAKEN is the retryable booking conflict.';
