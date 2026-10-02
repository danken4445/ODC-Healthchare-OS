-- Privacy-safe reference geography for disease surveillance.
-- Boundary and population data are reference data only; never load patient data here.

create extension if not exists postgis with schema extensions;

create table if not exists public.geo_barangays (
  psgc_code text primary key,
  barangay_name text not null,
  municipality_code text not null,
  municipality_name text not null,
  province_name text not null,
  region_name text not null,
  geom extensions.geometry(MultiPolygon, 4326) not null,
  geom_simplified extensions.geometry(MultiPolygon, 4326) not null,
  constraint geo_barangays_psgc_code_format
    check (psgc_code ~ '^[0-9]{10}$'),
  constraint geo_barangays_geom_polygonal
    check (extensions.ST_GeometryType(geom) in ('ST_Polygon', 'ST_MultiPolygon')),
  constraint geo_barangays_geom_simplified_polygonal
    check (extensions.ST_GeometryType(geom_simplified) in ('ST_Polygon', 'ST_MultiPolygon'))
);

create index if not exists geo_barangays_geom_simplified_gist
  on public.geo_barangays using gist (geom_simplified);

create table if not exists public.geo_population_denominators (
  psgc_code text not null references public.geo_barangays(psgc_code) on delete cascade,
  census_year smallint not null,
  population integer not null check (population > 0),
  source text not null,
  primary key (psgc_code, census_year)
);

alter table public.disease_surveillance_rollups
  add column if not exists psgc_code text references public.geo_barangays(psgc_code);

create index if not exists disease_surveillance_rollups_psgc_idx
  on public.disease_surveillance_rollups (organization_id, psgc_code, epi_year, epi_week);

-- Keep the original unique index intact. This additional key makes the geography
-- association explicit for future rollup writers without changing old conflicts.
create unique index if not exists disease_surveillance_rollups_geography_key
  on public.disease_surveillance_rollups (
    organization_id, epi_year, epi_week, icd10_code, age_bracket, gender,
    coalesce(municipality, ''), coalesce(barangay, ''), coalesce(psgc_code, '')
  );

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
    age_bracket, gender, municipality, barangay, psgc_code, case_count, is_suppressed
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
    source.psgc_code,
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
      event_data.barangay,
      geo.psgc_code
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
    left join lateral (
      -- Resolve only an unambiguous name pair. Never guess between duplicate names.
      select min(g.psgc_code) as psgc_code
      from public.geo_barangays g
      where lower(trim(g.barangay_name)) = lower(trim(event_data.barangay))
        and lower(trim(g.municipality_name)) = lower(trim(event_data.municipality))
      having count(*) = 1
    ) geo on true
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
    coalesce(nullif(lower(source.gender), ''), 'unknown'), nullif(source.municipality, ''),
    nullif(source.barangay, ''), source.psgc_code
  on conflict (organization_id, epi_year, epi_week, icd10_code, age_bracket, gender,
               (coalesce(municipality, '')), (coalesce(barangay, '')))
  do update set
    disease_name = excluded.disease_name,
    doh_category = excluded.doh_category,
    psgc_code = excluded.psgc_code,
    case_count = excluded.case_count,
    is_suppressed = excluded.is_suppressed;
end;
$$;

-- Recreate the existing safe function/view so the new nullable geography key is
-- available to downstream SQL while preserving all prior suppression behavior.
drop view if exists public.disease_surveillance_rollups_safe;
drop function if exists public.read_disease_surveillance_rollups_safe();

create function public.read_disease_surveillance_rollups_safe()
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
  created_at timestamptz,
  psgc_code text
)
language sql
security definer
set search_path = ''
as $$
  select r.id, r.organization_id, r.epi_year, r.epi_week, r.icd10_code,
    r.disease_name, r.doh_category, r.age_bracket, r.gender, r.municipality,
    r.barangay, case when r.is_suppressed then null else r.case_count end,
    r.is_suppressed, r.created_at, r.psgc_code
  from public.disease_surveillance_rollups r
  where public.is_superadmin() or public.can_access_organization(r.organization_id);
$$;

create view public.disease_surveillance_rollups_safe
with (security_invoker = true)
as
select * from public.read_disease_surveillance_rollups_safe();

revoke execute on function public.read_disease_surveillance_rollups_safe() from public, anon;
grant execute on function public.read_disease_surveillance_rollups_safe() to authenticated;
revoke all on public.disease_surveillance_rollups_safe from anon, authenticated;
grant select on public.disease_surveillance_rollups_safe to authenticated;

alter table public.geo_barangays enable row level security;
alter table public.geo_population_denominators enable row level security;

drop policy if exists geo_barangays_authenticated_select on public.geo_barangays;
create policy geo_barangays_authenticated_select
  on public.geo_barangays for select to authenticated
  using (true);
drop policy if exists geo_population_denominators_authenticated_select on public.geo_population_denominators;
create policy geo_population_denominators_authenticated_select
  on public.geo_population_denominators for select to authenticated
  using (true);

revoke all on public.geo_barangays from anon, authenticated;
grant select on public.geo_barangays to authenticated;
revoke all on public.geo_population_denominators from anon, authenticated;
grant select on public.geo_population_denominators to authenticated;

create or replace function public.get_barangay_choropleth(
  p_organization_id uuid,
  p_icd10_code text,
  p_epi_year smallint,
  p_epi_week smallint
)
returns table (
  psgc_code text,
  barangay_name text,
  municipality_name text,
  province_name text,
  region_name text,
  geometry jsonb,
  population integer,
  case_count integer,
  is_suppressed boolean,
  rate_per_10k numeric
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with latest_denominators as (
    select d.psgc_code, d.population
    from public.geo_population_denominators d
    where d.census_year = (
      select max(newest.census_year)
      from public.geo_population_denominators newest
      where newest.psgc_code = d.psgc_code
    )
  ), aggregated as (
    select
      s.psgc_code,
      bool_or(s.is_suppressed) as has_suppressed_cell,
      coalesce(sum(s.case_count) filter (where not s.is_suppressed and s.case_count is not null), 0)::integer as visible_case_count
    from public.disease_surveillance_rollups_safe s
    where s.organization_id = p_organization_id
      and s.icd10_code = p_icd10_code
      and s.epi_year = p_epi_year
      and s.epi_week = p_epi_week
      and s.psgc_code is not null
    group by s.psgc_code
  )
  select
    g.psgc_code,
    g.barangay_name,
    g.municipality_name,
    g.province_name,
    g.region_name,
    extensions.ST_AsGeoJSON(g.geom_simplified)::jsonb,
    d.population,
    case when a.has_suppressed_cell or a.visible_case_count < 5 then null else a.visible_case_count end,
    (a.has_suppressed_cell or a.visible_case_count < 5),
    case
      when a.has_suppressed_cell or a.visible_case_count < 5 or d.population is null then null
      else round((a.visible_case_count::numeric * 10000) / d.population, 4)
    end
  from aggregated a
  join public.geo_barangays g on g.psgc_code = a.psgc_code
  left join latest_denominators d on d.psgc_code = g.psgc_code
  where g.geom_simplified is not null
    and extensions.ST_GeometryType(g.geom_simplified) in ('ST_Polygon', 'ST_MultiPolygon');
$$;

revoke execute on function public.get_barangay_choropleth(uuid, text, smallint, smallint) from public, anon;
grant execute on function public.get_barangay_choropleth(uuid, text, smallint, smallint) to authenticated;

comment on function public.get_barangay_choropleth(uuid, text, smallint, smallint) is
  'Privacy-safe polygon-only choropleth. Null PSGC rollups are excluded; suppressed counts and rates are NULL.';
