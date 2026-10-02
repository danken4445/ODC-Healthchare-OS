-- DOH PIDSR releases are the sole patient-level surveillance path. The RPC
-- authorizes the caller, writes the immutable audit event, then returns a CIF
-- payload in one transaction so a failed audit can never release a file.

alter table public.roles drop constraint if exists roles_name_check;
alter table public.roles add constraint roles_name_check check (name in (
  'patient', 'doctor', 'nurse', 'lab_staff', 'specialist', 'front_desk',
  'inventory_staff', 'admin', 'owner', 'disease_surveillance_officer'
));

insert into public.roles (name)
select 'disease_surveillance_officer'
where not exists (select 1 from public.roles where name = 'disease_surveillance_officer');

insert into public.role_permissions (role_id, organization_id, permission)
select role.id, null, 'can_export_epidemiology_records'
from public.roles role
where role.name = 'disease_surveillance_officer'
  and not exists (
    select 1 from public.role_permissions existing
    where existing.role_id = role.id
      and existing.organization_id is null
      and existing.permission = 'can_export_epidemiology_records'
  );

create or replace function public.export_doh_pidsr_cases(
  p_organization_id uuid,
  p_purpose text,
  p_epi_year smallint,
  p_epi_week smallint
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_cases jsonb := '[]'::jsonb;
  v_row_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_purpose, ''))) not between 10 and 1000 then
    raise exception 'A specific statutory reporting purpose is required.' using errcode = '22023';
  end if;
  if p_epi_year is null or p_epi_week not between 1 and 53 then
    raise exception 'A valid epidemiological period is required.' using errcode = '22023';
  end if;
  -- Do not substitute broad organization access or superadmin status for this
  -- explicit DSO permission.
  if not public.has_organization_permission(p_organization_id, 'can_export_epidemiology_records') then
    raise exception 'Disease Surveillance Officer permission is required.' using errcode = '42501';
  end if;

  with notifiable_codes(icd10_code, doh_notifiable_category) as (
    values
      ('A00.9', 'category_i'), ('A01.0', 'category_ii'), ('A09', 'category_ii'),
      ('A15.0', 'category_ii'), ('A15.9', 'category_ii'), ('A27.9', 'category_ii'),
      ('A37.9', 'category_ii'), ('A82.9', 'category_i'), ('A90', 'category_ii'),
      ('A91', 'category_ii'), ('B01.9', 'category_ii'), ('B04', 'category_i'),
      ('B05.9', 'category_i'), ('B15.9', 'category_ii'), ('B26.9', 'category_ii'),
      ('B54', 'category_ii'), ('J11.1', 'category_ii'), ('U07.1', 'category_ii')
  ), eligible as (
    select jsonb_build_object(
      'schema', 'DOH-CIF-v1',
      'case_reference', c.id,
      'disease', jsonb_build_object(
        'icd10_code', c.code,
        'name', c.code_display,
        'notifiable_category', n.doh_notifiable_category
      ),
      'investigation', jsonb_build_object(
        'date_of_onset', c.onset_date,
        'date_reported', coalesce(e.period_start, c.created_at)
      ),
      'patient', jsonb_build_object(
        'full_name', coalesce(nullif(p.name ->> 'text', ''), 'Not recorded'),
        'date_of_birth', p.birth_date,
        'sex', p.gender,
        'address', coalesce(p.address, '[]'::jsonb),
        'telecom', coalesce(p.telecom, '[]'::jsonb)
      )
    ) as cif_case
    from public.conditions c
    join notifiable_codes n on n.icd10_code = c.code
    join public.patients p on p.id = c.patient_id and p.organization_id = p_organization_id
    left join public.encounters e on e.id = c.encounter_id and e.organization_id = p_organization_id
    where c.organization_id = p_organization_id
      and extract(isoyear from coalesce(e.period_start, c.created_at))::smallint = p_epi_year
      and public.calculate_epi_week(coalesce(e.period_start, c.created_at)) = p_epi_week
      and c.is_sensitive = false
      and coalesce(c.sensitive_category, '') not in ('infectious_disease_hiv', 'mental_health', 'substance_use', 'reproductive_health')
      and lower(concat_ws(' ', c.code, c.code_display)) !~ '(hiv|aids|psychiatr|mental health|substance|drug use|reproductive|pregnan|abortion|sti|sexually transmitted)'
  )
  select coalesce(jsonb_agg(cif_case order by cif_case ->> 'case_reference'), '[]'::jsonb)
  into v_cases
  from eligible;

  v_row_count := jsonb_array_length(v_cases);
  -- This INSERT is deliberately before the return. Its immutable trigger and
  -- the enclosing transaction make an audit failure abort the release.
  insert into public.disease_surveillance_audit_log
    (organization_id, actor_id, action, purpose, resource_ref, metadata)
  values (
    p_organization_id,
    auth.uid(),
    'doh_release',
    btrim(p_purpose),
    format('doh-pidsr/%s/%s', p_epi_year, p_epi_week),
    jsonb_build_object(
      'disease_categories', jsonb_build_array('category_i', 'category_ii'),
      'row_count', v_row_count,
      'schema', 'DOH-CIF-v1'
    )
  );

  return jsonb_build_object(
    'schema', 'DOH-CIF-v1',
    'organization_id', p_organization_id,
    'epi_year', p_epi_year,
    'epi_week', p_epi_week,
    'cases', v_cases
  );
end;
$$;

revoke all on function public.export_doh_pidsr_cases(uuid, text, smallint, smallint) from public, anon;
grant execute on function public.export_doh_pidsr_cases(uuid, text, smallint, smallint) to authenticated;

comment on function public.export_doh_pidsr_cases(uuid, text, smallint, smallint) is
  'DSO-only, audit-before-release DOH CIF payload. Excludes HIV, mental health, substance use, and reproductive-health records.';
