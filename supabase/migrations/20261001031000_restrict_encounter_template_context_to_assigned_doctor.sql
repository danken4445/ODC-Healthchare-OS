-- Restrict encounter template context to the doctor assigned to the encounter's
-- appointment while preserving the existing JSON response contract.
-- Rollback: restore get_encounter_template_context(uuid) from migration
-- 20260930130000 and reapply its authenticated EXECUTE grant.

create or replace function public.get_encounter_template_context(p_encounter_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  encounter_row public.encounters%rowtype;
  patient_row public.patients%rowtype;
  practitioner_row public.practitioners%rowtype;
  organization_row public.organizations%rowtype;
  assigned_practitioner_role_id uuid;
  diagnosis_row jsonb := '{}'::jsonb;
  condition_row jsonb := '{}'::jsonb;
  coding_row jsonb := '{}'::jsonb;
  doctor_name text;
  clinic_address text;
begin
  if caller_id is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select encounter.*
  into encounter_row
  from public.encounters as encounter
  where encounter.id = p_encounter_id;

  if encounter_row.id is null
    or not public.has_organization_permission(
      encounter_row.organization_id,
      'can_start_consultation'
    ) then
    raise exception 'Consultation permission is required.' using errcode = '42501';
  end if;

  select appointment.practitioner_role_id
  into assigned_practitioner_role_id
  from public.appointments as appointment
  where appointment.id = encounter_row.appointment_id
    and appointment.organization_id = encounter_row.organization_id;

  select practitioner.*
  into practitioner_row
  from public.practitioner_roles as role
  join public.practitioners as practitioner
    on practitioner.id = role.practitioner_id
  where role.id = assigned_practitioner_role_id
    and role.organization_id = encounter_row.organization_id
    and role.role_code in ('doctor', 'specialist')
    and role.active
    and practitioner.active
    and practitioner.auth_user_id = caller_id;

  -- TODO(Loop E): add explicit reassignment/coverage exceptions here.
  if practitioner_row.id is null then
    raise exception 'Only the active doctor assigned to this encounter may use clinical document templates.'
      using errcode = '42501';
  end if;

  select patient.*
  into patient_row
  from public.patients as patient
  where patient.id = encounter_row.patient_id
    and patient.organization_id = encounter_row.organization_id;

  select organization.*
  into organization_row
  from public.organizations as organization
  where organization.id = encounter_row.organization_id;

  diagnosis_row := coalesce(encounter_row.diagnosis -> -1, '{}'::jsonb);
  condition_row := coalesce(diagnosis_row -> 'condition', '{}'::jsonb);
  coding_row := coalesce(condition_row -> 'coding' -> 0, '{}'::jsonb);
  doctor_name := coalesce(nullif(practitioner_row.name ->> 'text', ''), 'Assigned clinician');
  clinic_address := coalesce(
    nullif(organization_row.address -> 0 ->> 'text', ''),
    nullif(organization_row.address ->> 'text', ''),
    'Clinic address not recorded'
  );

  return jsonb_build_object(
    'values', jsonb_build_object(
      'patient.name', coalesce(nullif(patient_row.name ->> 'text', ''), 'Patient'),
      'patient.age', case when patient_row.birth_date is null then 'Not recorded' else extract(year from age(current_date, patient_row.birth_date))::text end,
      'patient.dob', coalesce(patient_row.birth_date::text, 'Not recorded'),
      'doctor.name', doctor_name,
      'doctor.license_no', coalesce(practitioner_row.identifier -> 0 ->> 'value', ''),
      'doctor.prc_no', coalesce(practitioner_row.identifier -> 1 ->> 'value', ''),
      'clinic.name', organization_row.name,
      'clinic.address', clinic_address,
      'encounter.date', coalesce(encounter_row.period_start::date::text, current_date::text),
      'diagnosis.summary', coalesce(nullif(condition_row ->> 'text', ''), 'Diagnosis not recorded'),
      'rest_days', '',
      'medication.name', '',
      'medication.dosage', '',
      'medication.directions', ''
    ),
    'diagnosisSystem', nullif(coding_row ->> 'system', ''),
    'diagnosisCode', nullif(coding_row ->> 'code', ''),
    'diagnosisDisplay', coalesce(nullif(coding_row ->> 'display', ''), nullif(condition_row ->> 'text', ''))
  );
end;
$$;

revoke all on function public.get_encounter_template_context(uuid)
  from public, anon, authenticated;
grant execute on function public.get_encounter_template_context(uuid)
  to authenticated;
