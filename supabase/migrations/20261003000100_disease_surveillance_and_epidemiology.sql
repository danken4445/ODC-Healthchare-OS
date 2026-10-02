-- Privacy-preserving disease trend surveillance foundation.
-- Rollups contain no direct patient identifiers and are the only analytics read surface.

create table if not exists public.disease_surveillance_rollups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  epi_year smallint not null,
  epi_week smallint not null check (epi_week between 1 and 53),
  icd10_code text not null,
  disease_name text not null,
  doh_category text not null,
  age_bracket text not null check (age_bracket in ('infant_under_1', 'child_1_to_4', 'school_5_to_14', 'reproductive_15_to_49', 'middle_50_to_64', 'senior_65_plus', 'unknown')),
  gender text check (gender in ('male', 'female', 'other', 'unknown')),
  municipality text,
  barangay text,
  case_count integer not null check (case_count >= 0),
  is_suppressed boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists disease_surveillance_rollups_key
  on public.disease_surveillance_rollups (
    organization_id, epi_year, epi_week, icd10_code, age_bracket, gender,
    coalesce(municipality, ''), coalesce(barangay, '')
  );
create index if not exists disease_surveillance_rollups_org_week_idx
  on public.disease_surveillance_rollups (organization_id, epi_year, epi_week);
create index if not exists disease_surveillance_rollups_org_icd10_idx
  on public.disease_surveillance_rollups (organization_id, icd10_code);

create table if not exists public.disease_surveillance_audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('view', 'export', 'doh_release')),
  purpose text not null,
  resource_ref text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists disease_surveillance_audit_org_created_idx
  on public.disease_surveillance_audit_log (organization_id, created_at desc);

create or replace function public.calculate_epi_week(p_at timestamptz)
returns smallint
language sql
stable
strict
set search_path = ''
as $$
  -- PostgreSQL's week field is the ISO-8601 week number.
  select extract(week from p_at)::smallint;
$$;

create or replace function public.categorize_age_bracket(p_birth_date date)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_birth_date is null then 'unknown'
    when extract(year from age(current_date, p_birth_date)) < 1 then 'infant_under_1'
    when extract(year from age(current_date, p_birth_date)) between 1 and 4 then 'child_1_to_4'
    when extract(year from age(current_date, p_birth_date)) between 5 and 14 then 'school_5_to_14'
    when extract(year from age(current_date, p_birth_date)) between 15 and 49 then 'reproductive_15_to_49'
    when extract(year from age(current_date, p_birth_date)) between 50 and 64 then 'middle_50_to_64'
    else 'senior_65_plus'
  end;
$$;

create or replace function public.prohibit_disease_surveillance_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Disease surveillance audit log is append-only' using errcode = '55006';
end;
$$;

drop trigger if exists disease_surveillance_audit_immutable
  on public.disease_surveillance_audit_log;
create trigger disease_surveillance_audit_immutable
  before update or delete on public.disease_surveillance_audit_log
  for each row execute function public.prohibit_disease_surveillance_audit_mutation();

create or replace function public.record_disease_surveillance_audit(
  p_organization_id uuid,
  p_action text,
  p_purpose text,
  p_resource_ref text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_action not in ('view', 'export', 'doh_release') then
    raise exception 'Invalid disease surveillance audit action' using errcode = '22023';
  end if;
  if session_user <> 'postgres'
     and coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role'
     and not public.is_superadmin()
     and not public.has_organization_permission(p_organization_id, 'can_view_audit_log') then
    raise exception 'Organization access denied' using errcode = '42501';
  end if;
  insert into public.disease_surveillance_audit_log
    (organization_id, actor_id, action, purpose, resource_ref, metadata)
  values
    (p_organization_id, auth.uid(), p_action, p_purpose, p_resource_ref, coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.refresh_disease_surveillance_rollups(
  p_organization_id uuid,
  p_start_date timestamptz,
  p_end_date timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_end_date <= p_start_date then
    raise exception 'End date must be after start date' using errcode = '22023';
  end if;
  if session_user <> 'postgres'
     and coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role'
     and not public.is_superadmin()
     and not public.can_access_organization(p_organization_id) then
    raise exception 'Organization access denied' using errcode = '42501';
  end if;

  insert into public.disease_surveillance_rollups (
    organization_id, epi_year, epi_week, icd10_code, disease_name, doh_category,
    age_bracket, gender, municipality, barangay, case_count, is_suppressed
  )
  select
    p_organization_id,
    extract(isoyear from event_at)::smallint,
    public.calculate_epi_week(event_at),
    source.code,
    source.code_display,
    case
      when source.code ilike 'J%' then 'Acute Respiratory'
      when source.code ilike 'A9%' or source.code ilike 'A0%' then 'Diarrheal'
      when source.code ilike 'A90%' or source.code ilike 'A91%' or source.code ilike 'A92%' then 'Vector-borne'
      when source.code ilike 'I%' then 'Cardiovascular'
      else 'Syndromic'
    end,
    public.categorize_age_bracket(source.birth_date),
    coalesce(nullif(lower(source.gender), ''), 'unknown'),
    nullif(source.municipality, ''),
    nullif(source.barangay, ''),
    count(distinct source.patient_id)::integer,
    count(distinct source.patient_id) < 5
  from (
    select
      c.code,
      c.code_display,
      c.patient_id,
      p.birth_date,
      p.gender,
      event_data.event_at,
      event_data.municipality,
      event_data.barangay
    from public.conditions c
    join public.encounters e on e.id = c.encounter_id
    join public.patients p on p.id = c.patient_id and p.organization_id = p_organization_id
    cross join lateral (
      select
        coalesce(e.period_start, c.created_at) as event_at,
        coalesce(address_item->>'municipality', address_item->>'city', address_item->>'city_name') as municipality,
        coalesce(address_item->>'barangay', address_item->>'district') as barangay
      from jsonb_array_elements(
        case when jsonb_typeof(p.address) = 'array' then p.address else '[]'::jsonb end
      ) as address_item
      union all
      select coalesce(e.period_start, c.created_at), null, null
      where not exists (
        select 1 from jsonb_array_elements(
          case when jsonb_typeof(p.address) = 'array' then p.address else '[]'::jsonb end
        ) as existing_address
      )
      limit 1
    ) event_data
    where c.organization_id = p_organization_id
      and e.organization_id = p_organization_id
      and event_data.event_at >= p_start_date
      and event_data.event_at < p_end_date
      and c.is_sensitive = false
      and coalesce(c.sensitive_category, '') not in ('infectious_disease_hiv', 'mental_health', 'substance_use', 'reproductive_health')
      and lower(concat_ws(' ', c.code, c.code_display)) !~ '(hiv|aids|psychiatr|mental health|substance|drug use|reproductive|pregnan|abortion|sti|sexually transmitted)'
  ) source
  group by extract(isoyear from event_at)::smallint, public.calculate_epi_week(event_at), source.code,
    source.code_display, public.categorize_age_bracket(source.birth_date),
    coalesce(nullif(lower(source.gender), ''), 'unknown'), nullif(source.municipality, ''), nullif(source.barangay, '')
  on conflict (organization_id, epi_year, epi_week, icd10_code, age_bracket, gender,
               (coalesce(municipality, '')), (coalesce(barangay, '')))
  do update set
    disease_name = excluded.disease_name,
    doh_category = excluded.doh_category,
    case_count = excluded.case_count,
    is_suppressed = excluded.is_suppressed;
end;
$$;

create or replace function public.read_disease_surveillance_rollups_safe()
returns table (
  id uuid,
  organization_id uuid,
  epi_year smallint,
  epi_week smallint,
  icd10_code text,
  disease_name text,
  doh_category text,
  age_bracket text,
  gender text,
  municipality text,
  barangay text,
  case_count integer,
  is_suppressed boolean,
  created_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select r.id, r.organization_id, r.epi_year, r.epi_week, r.icd10_code,
    r.disease_name, r.doh_category, r.age_bracket, r.gender, r.municipality,
    r.barangay, case when r.is_suppressed then null else r.case_count end,
    r.is_suppressed, r.created_at
  from public.disease_surveillance_rollups r
  where public.is_superadmin() or public.can_access_organization(r.organization_id);
$$;

create or replace view public.disease_surveillance_rollups_safe
with (security_invoker = true)
as
select * from public.read_disease_surveillance_rollups_safe();

alter table public.disease_surveillance_rollups enable row level security;
alter table public.disease_surveillance_audit_log enable row level security;

drop policy if exists disease_surveillance_rollups_select on public.disease_surveillance_rollups;
create policy disease_surveillance_rollups_select
  on public.disease_surveillance_rollups for select to authenticated
  using (public.is_superadmin() or public.can_access_organization(organization_id));
drop policy if exists disease_surveillance_audit_select on public.disease_surveillance_audit_log;
create policy disease_surveillance_audit_select
  on public.disease_surveillance_audit_log for select to authenticated
  using (public.is_superadmin() or public.has_organization_permission(organization_id, 'can_view_audit_log'));

revoke all on public.disease_surveillance_rollups from anon, authenticated;
revoke all on public.disease_surveillance_audit_log from anon, authenticated;
revoke insert, update, delete on public.disease_surveillance_audit_log from anon, authenticated;
grant select on public.disease_surveillance_audit_log to authenticated;
revoke all on public.disease_surveillance_rollups_safe from anon, authenticated;
grant select on public.disease_surveillance_rollups_safe to authenticated;
revoke execute on function public.read_disease_surveillance_rollups_safe() from public, anon;
grant execute on function public.read_disease_surveillance_rollups_safe() to authenticated;
revoke execute on function public.refresh_disease_surveillance_rollups(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.refresh_disease_surveillance_rollups(uuid, timestamptz, timestamptz) to authenticated, service_role;
revoke execute on function public.record_disease_surveillance_audit(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.record_disease_surveillance_audit(uuid, text, text, text, jsonb) to authenticated, service_role;

comment on view public.disease_surveillance_rollups_safe is
  'SDK read surface. Use this view only; suppressed cells intentionally return NULL case_count.';
