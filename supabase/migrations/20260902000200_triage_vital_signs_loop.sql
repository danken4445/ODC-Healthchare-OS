-- Triage is a clinical phase between front-desk arrival and the physician's
-- consultation.  The vital-sign set is one immutable FHIR Observation, so a
-- correction retains a complete audit trail through supersedes_id.

create or replace function public.record_triage_vital_signs(
  p_appointment_id uuid,
  p_systolic_bp integer,
  p_diastolic_bp integer,
  p_pulse_bpm integer,
  p_respiratory_rate integer,
  p_temperature_c numeric,
  p_oxygen_saturation integer,
  p_weight_kg numeric default null,
  p_height_cm numeric default null,
  p_pain_score integer default null,
  p_acuity text default 'routine',
  p_chief_complaint text default null,
  p_notes text default null,
  p_supersedes_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  selected_appointment public.appointments%rowtype;
  selected_encounter public.encounters%rowtype;
  nurse_id uuid;
  latest_observation_id uuid;
  new_observation_id uuid;
  normalized_acuity text := lower(btrim(p_acuity));
  normalized_complaint text := nullif(btrim(p_chief_complaint), '');
  normalized_notes text := nullif(btrim(p_notes), '');
begin
  select appointment.* into selected_appointment
  from public.appointments appointment
  where appointment.id = p_appointment_id
  for update;

  if selected_appointment.id is null or selected_appointment.status <> 'arrived' then
    raise exception 'Only checked-in appointments can be triaged.' using errcode = '22023';
  end if;

  nurse_id := public.get_current_practitioner(
    selected_appointment.organization_id, array['nurse']
  );
  if nurse_id is null then
    raise exception 'An active nurse role is required to record triage.' using errcode = '42501';
  end if;

  if p_systolic_bp not between 40 and 300
    or p_diastolic_bp not between 20 and 200
    or p_diastolic_bp >= p_systolic_bp
    or p_pulse_bpm not between 20 and 300
    or p_respiratory_rate not between 4 and 100
    or p_temperature_c not between 25 and 45
    or p_oxygen_saturation not between 0 and 100
    or (p_weight_kg is not null and p_weight_kg not between 0.1 and 700)
    or (p_height_cm is not null and p_height_cm not between 20 and 300)
    or (p_pain_score is not null and p_pain_score not between 0 and 10)
    or normalized_acuity not in ('routine', 'urgent', 'emergency')
    or (normalized_complaint is not null and length(normalized_complaint) > 2000)
    or (normalized_notes is not null and length(normalized_notes) > 5000)
  then
    raise exception 'Triage vital signs or assessment details are invalid.' using errcode = '22023';
  end if;

  select * into selected_encounter
  from public.encounters encounter
  where encounter.appointment_id = selected_appointment.id
  for update;

  if selected_encounter.id is null then
    insert into public.encounters (
      organization_id, patient_id, appointment_id, practitioner_role_id,
      status, class_code, service_type, period_start
    ) values (
      selected_appointment.organization_id, selected_appointment.patient_id,
      selected_appointment.id, selected_appointment.practitioner_role_id,
      'arrived', 'AMB', selected_appointment.service_type, now()
    ) returning * into selected_encounter;
  elsif selected_encounter.status <> 'arrived' then
    raise exception 'Triage cannot be changed after the consultation has started.' using errcode = '22023';
  end if;

  select observation.id into latest_observation_id
  from public.observations observation
  where observation.encounter_id = selected_encounter.id
    and observation.code = 'TRIAGE-VITALS'
  order by observation.created_at desc
  limit 1;

  if latest_observation_id is distinct from p_supersedes_id then
    raise exception 'A triage correction must supersede the latest vital-sign record.' using errcode = '40001';
  end if;

  insert into public.observations (
    organization_id, patient_id, encounter_id, performer_practitioner_id,
    status, category_codes, code_system, code, code_display, effective_at,
    issued_at, value, supersedes_id
  ) values (
    selected_encounter.organization_id, selected_encounter.patient_id,
    selected_encounter.id, nurse_id, 'final',
    '[{"coding":[{"code":"vital-signs","display":"Vital Signs"}]}]'::jsonb,
    'urn:odyssey:triage', 'TRIAGE-VITALS', 'Triage vital signs', now(), now(),
    jsonb_build_object(
      'blood_pressure', jsonb_build_object('systolic', p_systolic_bp, 'diastolic', p_diastolic_bp, 'unit', 'mmHg'),
      'pulse_bpm', p_pulse_bpm,
      'respiratory_rate', p_respiratory_rate,
      'temperature_c', p_temperature_c,
      'oxygen_saturation_percent', p_oxygen_saturation,
      'weight_kg', p_weight_kg,
      'height_cm', p_height_cm,
      'pain_score', p_pain_score,
      'acuity', normalized_acuity,
      'chief_complaint', normalized_complaint,
      'notes', normalized_notes
    ), p_supersedes_id
  ) returning id into new_observation_id;

  return new_observation_id;
end;
$$;

-- Doctors own the consultation transition.  It deliberately requires an
-- immutable triage Observation produced by the nurse first.
create or replace function public.start_appointment_encounter(p_appointment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller_id uuid := auth.uid();
  selected_appointment public.appointments%rowtype;
  selected_encounter public.encounters%rowtype;
begin
  if caller_id is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select appointment.* into selected_appointment
  from public.appointments appointment
  join public.practitioner_roles role on role.id = appointment.practitioner_role_id
  join public.practitioners practitioner on practitioner.id = role.practitioner_id
  where appointment.id = p_appointment_id
    and role.active
    and role.role_code in ('doctor', 'specialist')
    and practitioner.active
    and practitioner.auth_user_id = caller_id
  for update of appointment;

  if selected_appointment.id is null then
    raise exception 'Assigned appointment not found.' using errcode = 'P0002';
  end if;
  if selected_appointment.status <> 'arrived' then
    raise exception 'Only a checked-in appointment can be started.' using errcode = '23514';
  end if;

  select * into selected_encounter
  from public.encounters encounter
  where encounter.appointment_id = selected_appointment.id
  for update;

  if selected_encounter.id is null
    or not exists (
      select 1 from public.observations observation
      where observation.encounter_id = selected_encounter.id
        and observation.code = 'TRIAGE-VITALS'
        and observation.status = 'final'
    )
  then
    raise exception 'Completed nurse triage is required before the consultation can start.' using errcode = '23514';
  end if;

  if selected_encounter.status = 'in_progress' then
    return selected_encounter.id;
  end if;
  if selected_encounter.status <> 'arrived' then
    raise exception 'This appointment already has an encounter.' using errcode = '23505';
  end if;

  update public.encounters
  set status = 'in_progress', period_start = coalesce(period_start, now())
  where id = selected_encounter.id;

  return selected_encounter.id;
end;
$$;

revoke all on function public.record_triage_vital_signs(uuid, integer, integer, integer, integer, numeric, integer, numeric, numeric, integer, text, text, text, uuid) from public;
grant execute on function public.record_triage_vital_signs(uuid, integer, integer, integer, integer, numeric, integer, numeric, numeric, integer, text, text, text, uuid) to authenticated;
revoke all on function public.start_appointment_encounter(uuid) from public;
grant execute on function public.start_appointment_encounter(uuid) to authenticated;

comment on function public.record_triage_vital_signs(uuid, integer, integer, integer, integer, numeric, integer, numeric, numeric, integer, text, text, text, uuid) is
  'Records immutable nurse-performed triage vital signs and prepares the appointment encounter for the assigned doctor.';
