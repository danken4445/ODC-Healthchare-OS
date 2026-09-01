-- Run after `supabase db reset`. Every result must be true; writes roll back.
\set ON_ERROR_STOP on

begin;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- A universal patient can explicitly enroll at clinic B, but direct RLS reads
-- are limited to the one clinic context selected through the guarded RPC.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000103', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000103"}', true);
set local role authenticated;
select public.set_patient_clinic_context('10000000-0000-0000-0000-000000000001') is null
  as patient_selects_clinic_a;
select count(*) = 1 as patient_sees_one_clinic_a_patient_row from public.patients;
select count(*) = 1 as patient_sees_one_clinic_a_appointment from public.appointments;
select public.enroll_patient_at_clinic(
  '10000000-0000-0000-0000-000000000002',
  'Synthetic Universal Patient B'
) is not null as patient_explicitly_enrolls_at_clinic_b;
select public.set_patient_clinic_context('10000000-0000-0000-0000-000000000002') is null
  as patient_switches_to_clinic_b;
select count(*) = 1 as patient_sees_only_clinic_b_patient_row from public.patients;
select count(*) = 0 as patient_cannot_read_clinic_a_appointments_while_at_b from public.appointments;
reset role;

-- Operational staff are restricted to the clinic of their active practitioner role.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000101"}', true);
set local role authenticated;
select public.get_current_staff_organization() = '10000000-0000-0000-0000-000000000001'::uuid
  as staff_has_one_assigned_clinic;
select count(*) = 1 as staff_sees_only_clinic_a_appointments from public.appointments;
select count(*) = 0 as staff_cannot_read_clinic_b_appointments
from public.appointments
where organization_id = '10000000-0000-0000-0000-000000000002';
reset role;

select exists (
  select 1 from pg_trigger where tgname = 'user_roles_staff_clinic_boundary'
) as staff_membership_cross_clinic_guard_exists;

rollback;
