-- Structured musculoskeletal diagnoses and provider-scoped encounter UI preferences.
-- The diagnosis payload remains on Encounter.diagnosis so patient/provider reads
-- continue to use the existing encounter RLS boundary.

alter table public.patients
  add column if not exists photo_url text,
  add column if not exists blood_type text
    check (blood_type is null or blood_type in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'));

create table if not exists public.provider_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  encounter_view_mode text not null default 'visual'
    check (encounter_view_mode in ('visual', 'simple')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.provider_preferences enable row level security;

-- Preferences are only exposed through the two checked RPCs below. This also
-- keeps the table safe on projects where new public tables are Data API exposed.
revoke all on table public.provider_preferences from public, anon, authenticated;

create or replace function public.get_my_encounter_view_mode()
returns text
language plpgsql
security definer
set search_path = public, auth
stable
as $$
declare
  caller_id uuid := auth.uid();
  selected_mode text;
begin
  if caller_id is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  if not exists (
    select 1
    from public.practitioners practitioner
    join public.practitioner_roles practitioner_role
      on practitioner_role.practitioner_id = practitioner.id
    where practitioner.auth_user_id = caller_id
      and practitioner.active
      and practitioner_role.active
      and public.has_organization_permission(
        practitioner_role.organization_id,
        'can_access_provider_portal'
      )
  ) then
    raise exception 'Provider portal access is required.' using errcode = '42501';
  end if;

  select preference.encounter_view_mode into selected_mode
  from public.provider_preferences preference
  where preference.user_id = caller_id;

  return coalesce(selected_mode, 'visual');
end;
$$;

create or replace function public.save_my_encounter_view_mode(p_mode text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller_id uuid := auth.uid();
  normalized_mode text := lower(btrim(p_mode));
begin
  if caller_id is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;
  if normalized_mode is null or normalized_mode not in ('visual', 'simple') then
    raise exception 'Encounter view mode must be visual or simple.' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.practitioners practitioner
    join public.practitioner_roles practitioner_role
      on practitioner_role.practitioner_id = practitioner.id
    where practitioner.auth_user_id = caller_id
      and practitioner.active
      and practitioner_role.active
      and public.has_organization_permission(
        practitioner_role.organization_id,
        'can_access_provider_portal'
      )
  ) then
    raise exception 'Provider portal access is required.' using errcode = '42501';
  end if;

  insert into public.provider_preferences (user_id, encounter_view_mode)
  values (caller_id, normalized_mode)
  on conflict (user_id) do update
    set encounter_view_mode = excluded.encounter_view_mode,
        updated_at = now();
end;
$$;

create or replace function public.record_encounter_region_diagnosis(
  p_encounter_id uuid,
  p_region_code text,
  p_region_display text,
  p_anatomy_view text,
  p_diagnosis_text text,
  p_code_system text default null,
  p_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller_id uuid := auth.uid();
  selected_encounter public.encounters%rowtype;
  recorder_id uuid;
  diagnosis_id uuid := gen_random_uuid();
  normalized_region text := lower(btrim(p_region_code));
  normalized_view text := lower(btrim(p_anatomy_view));
  diagnosis_text text := btrim(p_diagnosis_text);
  diagnosis_record jsonb;
begin
  if caller_id is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select encounter.* into selected_encounter
  from public.encounters encounter
  where encounter.id = p_encounter_id
  for update;

  if selected_encounter.id is null or selected_encounter.status <> 'in_progress' then
    raise exception 'An in-progress encounter is required.' using errcode = '22023';
  end if;
  if normalized_region is null or normalized_region not in (
    'head', 'neck', 'chest', 'abdomen', 'pelvis', 'upper-back', 'lower-back',
    'left-shoulder', 'right-shoulder', 'left-upper-arm', 'right-upper-arm',
    'left-elbow', 'right-elbow', 'left-forearm-hand', 'right-forearm-hand',
    'left-hip', 'right-hip', 'left-thigh', 'right-thigh', 'left-knee',
    'right-knee', 'left-lower-leg-foot', 'right-lower-leg-foot'
  ) then
    raise exception 'Unsupported musculoskeletal body region.' using errcode = '22023';
  end if;
  if normalized_view is null or normalized_view not in ('front', 'back', 'left', 'right') then
    raise exception 'Anatomy view must be front, back, left, or right.' using errcode = '22023';
  end if;
  if diagnosis_text is null or length(diagnosis_text) < 2 or length(diagnosis_text) > 1000 then
    raise exception 'Diagnosis text must be between 2 and 1,000 characters.' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_region_display, '')), '') is null
    or length(btrim(p_region_display)) < 2
    or length(btrim(p_region_display)) > 120 then
    raise exception 'A valid body region display name is required.' using errcode = '22023';
  end if;
  if length(coalesce(p_code_system, '')) > 500 or length(coalesce(p_code, '')) > 120 then
    raise exception 'Diagnosis coding values are too long.' using errcode = '22023';
  end if;

  select practitioner.id into recorder_id
  from public.practitioners practitioner
  join public.practitioner_roles practitioner_role
    on practitioner_role.practitioner_id = practitioner.id
  where practitioner.auth_user_id = caller_id
    and practitioner.active
    and practitioner_role.active
    and practitioner_role.organization_id = selected_encounter.organization_id
    and practitioner_role.id = selected_encounter.practitioner_role_id
    and public.has_organization_permission(
      selected_encounter.organization_id,
      'can_start_consultation'
    )
  limit 1;

  if recorder_id is null then
    raise exception 'Only the assigned clinician may record a diagnosis.' using errcode = '42501';
  end if;

  diagnosis_record := jsonb_strip_nulls(jsonb_build_object(
    'id', diagnosis_id,
    'condition', jsonb_build_object(
      'text', diagnosis_text,
      'coding', case
        when nullif(btrim(p_code_system), '') is not null and nullif(btrim(p_code), '') is not null
          then jsonb_build_array(jsonb_build_object(
            'system', btrim(p_code_system),
            'code', btrim(p_code),
            'display', diagnosis_text
          ))
        else '[]'::jsonb
      end
    ),
    'bodySite', jsonb_build_object(
      'coding', jsonb_build_array(jsonb_build_object(
        'system', 'urn:odyssey:musculoskeletal-region',
        'code', normalized_region,
        'display', btrim(p_region_display)
      ))
    ),
    'regionCode', normalized_region,
    'regionDisplay', btrim(p_region_display),
    'anatomyView', normalized_view,
    'recordedAt', now(),
    'recorderPractitionerId', recorder_id
  ));

  update public.encounters
  set diagnosis = coalesce(diagnosis, '[]'::jsonb) || jsonb_build_array(diagnosis_record)
  where id = selected_encounter.id;

  return diagnosis_record;
end;
$$;

create or replace function public.get_patient_coverages(
  p_organization_id uuid,
  p_patient_id uuid
)
returns table (
  id uuid,
  organization_id uuid,
  patient_id uuid,
  status text,
  coverage_type text,
  subscriber_id text,
  payor jsonb,
  period_start date,
  period_end date,
  class_values jsonb
)
language plpgsql
security definer
set search_path = public, auth
stable
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;
  if not (
    public.is_patient_self(p_patient_id, p_organization_id)
    or public.has_organization_permission(p_organization_id, 'can_start_consultation')
    or public.has_organization_permission(p_organization_id, 'can_manage_billing')
    or public.has_organization_permission(p_organization_id, 'can_view_billing')
  ) then
    raise exception 'Coverage access is not permitted.' using errcode = '42501';
  end if;

  return query
  select coverage.id, coverage.organization_id, coverage.patient_id,
    coverage.status, coverage.coverage_type, coverage.subscriber_id,
    coverage.payor, coverage.period_start, coverage.period_end,
    coverage.class_values
  from public.coverages coverage
  where coverage.organization_id = p_organization_id
    and coverage.patient_id = p_patient_id
  order by (coverage.status = 'active') desc, coverage.updated_at desc;
end;
$$;

revoke all on function public.get_my_encounter_view_mode() from public, anon;
revoke all on function public.save_my_encounter_view_mode(text) from public, anon;
revoke all on function public.record_encounter_region_diagnosis(uuid, text, text, text, text, text, text) from public, anon;
revoke all on function public.get_patient_coverages(uuid, uuid) from public, anon;

grant execute on function public.get_my_encounter_view_mode() to authenticated;
grant execute on function public.save_my_encounter_view_mode(text) to authenticated;
grant execute on function public.record_encounter_region_diagnosis(uuid, text, text, text, text, text, text) to authenticated;
grant execute on function public.get_patient_coverages(uuid, uuid) to authenticated;

comment on table public.provider_preferences is
  'Account-scoped provider UI preferences. Access is restricted to checked RPCs.';
comment on function public.record_encounter_region_diagnosis(uuid, text, text, text, text, text, text) is
  'Appends an assigned clinician-authored body-region diagnosis to the FHIR-aligned Encounter diagnosis array.';
