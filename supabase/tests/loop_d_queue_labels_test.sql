begin;
select plan(21);

select has_column('public', 'organization_settings', 'queue_mode', 'organization settings expose queue mode');
select has_column('public', 'practitioner_roles', 'queue_prefix', 'practitioner roles expose queue prefix');
select has_column('public', 'appointments', 'queue_label', 'appointments store a durable queue label');
select has_column('public', 'waiting_room_queue', 'queue_label', 'waiting-room projection stores the durable label');
select ok(
  (select queue_mode from public.organization_settings where organization_id = '10000000-0000-0000-0000-000000000001') = 'clinic_wide',
  'existing organizations default to clinic-wide queues'
);
select ok(
  to_regclass('public.waiting_room_queue_organization_id_queue_date_queue_label_key') is not null,
  'waiting-room uniqueness follows queue label rather than queue number'
);
select ok(has_table_privilege('anon', 'public.waiting_room_queue', 'select'), 'existing public queue read remains available');
select ok(not has_table_privilege('anon', 'public.organization_settings', 'update'), 'queue settings are not directly writable by anon');
select ok(not has_function_privilege('anon', 'public.set_organization_queue_mode(uuid,text)', 'execute'), 'queue mode changes are authenticated-only');
select ok(has_function_privilege('authenticated', 'public.set_organization_queue_mode(uuid,text)', 'execute'), 'authenticated callers can reach the permission-gated queue mode RPC');

select ok(
  (select queue_label = 'A-' || lpad(queue_number::text, 3, '0')
   from public.appointments
   where id = '50000000-0000-0000-0000-000000000001'),
  'existing appointment labels preserve clinic-wide display formatting'
);

update public.organization_settings
set queue_mode = 'per_practitioner'
where organization_id = '10000000-0000-0000-0000-000000000001';
update public.practitioner_roles
set queue_prefix = null
where id in (
  '30000000-0000-0000-0000-000000000101',
  '30000000-0000-0000-0000-000000000109'
);

insert into public.appointments (
  id, organization_id, patient_id, practitioner_role_id, status,
  service_type, start_at, end_at, delivery_mode
) values
  ('d3000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000101', 'booked', 'D queue A', '2099-02-01 09:00+00', '2099-02-01 09:30+00', 'in_person'),
  ('d3000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000109', 'booked', 'D queue B', '2099-02-01 09:30+00', '2099-02-01 10:00+00', 'in_person');

select is(
  (select queue_number from public.appointments where id = 'd3000000-0000-0000-0000-000000000001'),
  1,
  'per-practitioner doctor A sequence starts at 001'
);
select is(
  (select queue_number from public.appointments where id = 'd3000000-0000-0000-0000-000000000002'),
  1,
  'per-practitioner doctor B sequence starts at 001'
);
select ok(
  (select queue_label from public.appointments where id = 'd3000000-0000-0000-0000-000000000001') <>
  (select queue_label from public.appointments where id = 'd3000000-0000-0000-0000-000000000002'),
  'independent doctor sequences have distinct labels'
);
select is(
  (select queue_prefix from public.practitioner_roles where id = '30000000-0000-0000-0000-000000000101'),
  'A',
  'first unprefixed practitioner receives the next free letter'
);
select is(
  (select queue_prefix from public.practitioner_roles where id = '30000000-0000-0000-0000-000000000109'),
  'B',
  'second unprefixed practitioner receives a distinct free letter'
);
select is(
  (select queue_label from public.waiting_room_queue where appointment_id = 'd3000000-0000-0000-0000-000000000001'),
  (select queue_label from public.appointments where id = 'd3000000-0000-0000-0000-000000000001'),
  'waiting-room projection copies appointment queue_label'
);

select throws_ok(
  $$ update public.practitioner_roles set queue_prefix = 'A' where id = '30000000-0000-0000-0000-000000000109' $$,
  '23505',
  'duplicate key value violates unique constraint "practitioner_roles_active_queue_prefix_key"',
  'prefix uniqueness is enforced within the organization'
);

update public.organization_settings
set queue_mode = 'clinic_wide'
where organization_id = '10000000-0000-0000-0000-000000000001';
insert into public.appointments (
  id, organization_id, patient_id, practitioner_role_id, status,
  service_type, start_at, end_at, delivery_mode
) values (
  'd3000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000101', 'booked', 'D queue switch', '2099-02-01 10:00+00', '2099-02-01 10:30+00', 'in_person'
);
select ok(
  (select queue_label from public.appointments where id = 'd3000000-0000-0000-0000-000000000003') = 'A-002',
  'switching back to clinic-wide advances rather than duplicating a same-day label'
);
select is(
  (select queue_label from public.appointments where id = 'd3000000-0000-0000-0000-000000000001'),
  (select queue_label from public.waiting_room_queue where appointment_id = 'd3000000-0000-0000-0000-000000000001'),
  'switching modes does not rewrite existing labels'
);

update public.organization_settings
set queue_mode = 'per_practitioner'
where organization_id = '10000000-0000-0000-0000-000000000001';
insert into public.appointments (
  id, organization_id, patient_id, practitioner_role_id, status,
  service_type, start_at, end_at, delivery_mode
) values (
  'd3000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000101', 'booked', 'D queue new day', '2099-02-02 09:00+00', '2099-02-02 09:30+00', 'in_person'
);
select is(
  (select queue_number from public.appointments where id = 'd3000000-0000-0000-0000-000000000004'),
  1,
  'a new queue day starts each practitioner sequence at 001'
);

select * from finish();
rollback;
