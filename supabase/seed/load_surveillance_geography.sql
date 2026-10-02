-- Documented loader for official PSA/NAMRIA geography and PSA population data.
-- This file contains no boundary or patient data and is not included in the
-- default seed path. Run as service_role/admin after staging the official files.
--
-- 1. Load a GeoPackage/Shapefile with ogr2ogr into staging.psa_barangays with:
--    psgc_code, barangay_name, municipality_code, municipality_name,
--    province_name, region_name, geom (EPSG:4326).
-- 2. Load the PSA census CSV into staging.psa_population with:
--    psgc_code, census_year, population, source.
-- 3. Run this script with psql. It rejects non-polygon input and simplifies
--    only after transforming to WGS84. Verify the row counts and validity before
--    making the reference tables available to application clients.

begin;

insert into public.geo_barangays (
  psgc_code, barangay_name, municipality_code, municipality_name,
  province_name, region_name, geom, geom_simplified
)
select
  trim(s.psgc_code), trim(s.barangay_name), trim(s.municipality_code),
  trim(s.municipality_name), trim(s.province_name), trim(s.region_name),
  extensions.ST_Multi(extensions.ST_Force2D(extensions.ST_Transform(s.geom, 4326)))::extensions.geometry(MultiPolygon, 4326),
  extensions.ST_Multi(extensions.ST_SimplifyPreserveTopology(
    extensions.ST_Force2D(extensions.ST_Transform(s.geom, 4326)), 0.00002
  ))::extensions.geometry(MultiPolygon, 4326)
from staging.psa_barangays s
where extensions.ST_GeometryType(s.geom) in ('ST_Polygon', 'ST_MultiPolygon')
  and trim(s.psgc_code) ~ '^[0-9]{10}$'
on conflict (psgc_code) do update set
  barangay_name = excluded.barangay_name,
  municipality_code = excluded.municipality_code,
  municipality_name = excluded.municipality_name,
  province_name = excluded.province_name,
  region_name = excluded.region_name,
  geom = excluded.geom,
  geom_simplified = excluded.geom_simplified;

insert into public.geo_population_denominators (psgc_code, census_year, population, source)
select trim(psgc_code), census_year, population, source
from staging.psa_population
where trim(psgc_code) in (select psgc_code from public.geo_barangays)
  and population > 0
on conflict (psgc_code, census_year) do update set
  population = excluded.population,
  source = excluded.source;

commit;
