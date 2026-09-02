-- Hosted Phase 2 test-account setup (synthetic data only).
--
-- First create these confirmed Email/Password users in Dashboard > Authentication
-- > Users. Use the same local-only password for each: LocalOnly-2026!
--   doctor@odc.com
--   nurse@odc.com
--   frontdesk@odc.com
--   admin@odc.com
--   lab@odc.com
--   inventory@odc.com
--   patient@synthetic.odyssey.test
--
-- Then run this file in Dashboard > SQL Editor. It only links the already
-- existing Auth users to synthetic clinical identities; it never stores a
-- password in this repository or creates an Auth user directly.

begin;

insert into public.organizations (id, name)
values ('10000000-0000-0000-0000-000000000001', 'Synthetic Access Control Clinic')
on conflict (id) do nothing;

with staff(email, role_code, display_name) as (
  values
    ('doctor@odc.com', 'doctor', 'Synthetic Doctor'),
    ('nurse@odc.com', 'nurse', 'Synthetic Nurse'),
    ('frontdesk@odc.com', 'front_desk', 'Synthetic Front Desk'),
    ('admin@odc.com', 'admin', 'Synthetic Administrator'),
    ('lab@odc.com', 'lab_staff', 'Synthetic Lab Staff'),
    ('inventory@odc.com', 'inventory_staff', 'Synthetic Inventory Staff')
), linked_practitioners as (
  insert into public.practitioners (organization_id, auth_user_id, name)
  select '10000000-0000-0000-0000-000000000001', user_account.id,
    jsonb_build_object('text', staff.display_name)
  from staff join auth.users user_account on user_account.email = staff.email
  on conflict (auth_user_id) do update
    set organization_id = excluded.organization_id, name = excluded.name, active = true
  returning id, auth_user_id
)
insert into public.practitioner_roles (organization_id, practitioner_id, role_code)
select '10000000-0000-0000-0000-000000000001', practitioner.id, staff.role_code
from linked_practitioners practitioner
join staff on staff.email = (select email from auth.users where id = practitioner.auth_user_id)
where not exists (
  select 1 from public.practitioner_roles role
  where role.practitioner_id = practitioner.id and role.role_code = staff.role_code and role.active
);

insert into public.patients (organization_id, auth_user_id, name)
select '10000000-0000-0000-0000-000000000001', id,
  '{"text":"Synthetic Registered Patient"}'::jsonb
from auth.users
where email = 'patient@synthetic.odyssey.test'
  and not exists (
    select 1 from public.patients patient
    where patient.organization_id = '10000000-0000-0000-0000-000000000001'
      and patient.auth_user_id = auth.users.id
  );

-- Bookable staging-only availability for the Phase 4 vertical slice. Re-running
-- the script only fills still-missing periods for the linked synthetic doctor.
insert into public.appointment_slots (
  organization_id,
  practitioner_role_id,
  status,
  service_type,
  start_at,
  end_at
)
select
  '10000000-0000-0000-0000-000000000001',
  role.id,
  'free',
  'General consultation',
  date_trunc('hour', now()) + make_interval(hours => period.number),
  date_trunc('hour', now()) + make_interval(hours => period.number, mins => 30)
from public.practitioner_roles role
join public.practitioners practitioner on practitioner.id = role.practitioner_id
cross join generate_series(1, 6) as period(number)
where practitioner.auth_user_id = (
  select id from auth.users where email = 'doctor@odc.com'
)
  and role.role_code = 'doctor'
on conflict (practitioner_role_id, start_at) do nothing;

commit;
