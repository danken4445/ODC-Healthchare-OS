-- Grant select, insert, update on photo_url and blood_type to authenticated
-- public.patients enforces column-level privilege lists from 20260830000100_auth_access_control.sql.
-- When photo_url and blood_type were added in 20260925175058, authenticated was not granted access to them,
-- causing PostgREST queries selecting photo_url or blood_type to fail with 403 / "permission denied for table patients".

grant select (photo_url, blood_type) on public.patients to authenticated;
grant insert (photo_url, blood_type) on public.patients to authenticated;
grant update (photo_url, blood_type) on public.patients to authenticated;
