-- Run after `supabase db reset`. Every result must be true; writes roll back.
\set ON_ERROR_STOP on

begin;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Patient identities are admitted only to the patient portal.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000103', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000103"}', true);
set local role authenticated;
select (select is_allowed from public.get_portal_access('patient')) as patient_portal_allowed;
select not (select is_allowed from public.get_portal_access('provider')) as patient_provider_denied;
select not (select is_allowed from public.get_portal_access('admin')) as patient_admin_denied;
reset role;

-- A doctor cannot enter patient or administrative portals by reusing a valid
-- password/session from another app.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000101"}', true);
set local role authenticated;
select (select is_allowed from public.get_portal_access('provider')) as doctor_provider_allowed;
select not (select is_allowed from public.get_portal_access('patient')) as doctor_patient_denied;
select not (select is_allowed from public.get_portal_access('admin')) as doctor_admin_denied;
reset role;

-- Front desk is administrative but is not a clinical-provider identity.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000105', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000105"}', true);
set local role authenticated;
select (select is_allowed from public.get_portal_access('admin')) as front_desk_admin_allowed;
select not (select is_allowed from public.get_portal_access('provider')) as front_desk_provider_denied;
select not (select is_allowed from public.get_portal_access('patient')) as front_desk_patient_denied;
select not public.can_manage_organization_accounts('10000000-0000-0000-0000-000000000001')
  as front_desk_cannot_manage_clinic_accounts;
reset role;

-- The clinic administrator may manage accounts at its assigned clinic only.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000106', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000106"}', true);
set local role authenticated;
select public.can_manage_organization_accounts('10000000-0000-0000-0000-000000000001')
  as admin_can_manage_clinic_a_accounts;
select not public.can_manage_organization_accounts('10000000-0000-0000-0000-000000000002')
  as admin_cannot_manage_clinic_b_accounts;
reset role;

-- A platform administrator has administrative admission but cannot read the
-- Patient row that existed before this test, proving no ambient clinical bypass.
insert into public.platform_admins (user_id, granted_by)
values ('00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000104');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000104', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000104"}', true);
set local role authenticated;
select (select is_allowed and is_superadmin from public.get_portal_access('admin')) as superadmin_admin_allowed;
select not (select is_allowed from public.get_portal_access('patient')) as superadmin_patient_denied;
select (select count(*) from public.patients) = 0 as superadmin_cannot_read_clinical_patients;
reset role;

rollback;
