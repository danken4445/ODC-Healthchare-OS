-- Synthetic-only geography fixtures for local SQL tests. Never replace these
-- with real patient, household, or production boundary data.

insert into public.geo_barangays (
  psgc_code, barangay_name, municipality_code, municipality_name,
  province_name, region_name, geom, geom_simplified
) values
  ('9900000001', 'Test North', '990000000', 'Test Municipality', 'Test Province', 'Test Region',
   extensions.ST_GeomFromText('MULTIPOLYGON(((120 14,120.01 14,120.01 14.01,120 14.01,120 14)))', 4326),
   extensions.ST_GeomFromText('MULTIPOLYGON(((120 14,120.01 14,120.01 14.01,120 14.01,120 14)))', 4326)),
  ('9900000002', 'Test Central', '990000000', 'Test Municipality', 'Test Province', 'Test Region',
   extensions.ST_GeomFromText('MULTIPOLYGON(((120.02 14,120.03 14,120.03 14.01,120.02 14.01,120.02 14)))', 4326),
   extensions.ST_GeomFromText('MULTIPOLYGON(((120.02 14,120.03 14,120.03 14.01,120.02 14.01,120.02 14)))', 4326)),
  ('9900000003', 'Test South', '990000000', 'Test Municipality', 'Test Province', 'Test Region',
   extensions.ST_GeomFromText('MULTIPOLYGON(((120.04 14,120.05 14,120.05 14.01,120.04 14.01,120.04 14)))', 4326),
   extensions.ST_GeomFromText('MULTIPOLYGON(((120.04 14,120.05 14,120.05 14.01,120.04 14.01,120.04 14)))', 4326))
on conflict (psgc_code) do nothing;

insert into public.geo_population_denominators (psgc_code, census_year, population, source)
values
  ('9900000001', 2020, 1000, 'synthetic-test'),
  ('9900000002', 2020, 2000, 'synthetic-test'),
  ('9900000003', 2020, 3000, 'synthetic-test')
on conflict (psgc_code, census_year) do nothing;
