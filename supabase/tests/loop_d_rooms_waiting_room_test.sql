begin;
select plan(20);

select has_table('public', 'clinic_rooms', 'clinic rooms table exists');
select has_table('public', 'room_assignments', 'room assignments table exists');
select has_column('public', 'waiting_room_queue', 'room_label', 'queue stores room labels');
select has_column('public', 'waiting_room_queue', 'practitioner_display_name', 'queue stores practitioner display names');
select ok(to_regclass('public.room_assignments_room_id_tsrange_excl') is not null,
  'room overlap exclusion constraint exists');
select ok(has_table_privilege('authenticated', 'public.clinic_rooms', 'select'),
  'authenticated staff can read clinic rooms');
select ok(has_table_privilege('authenticated', 'public.room_assignments', 'select'),
  'authenticated staff can read room assignments');
select ok(not has_table_privilege('anon', 'public.room_assignments', 'select'),
  'anonymous callers cannot read room assignments');
select ok(
  not has_table_privilege('anon', 'public.room_assignments', 'insert')
  and not has_table_privilege('anon', 'public.room_assignments', 'update')
  and not has_table_privilege('anon', 'public.room_assignments', 'delete'),
  'anonymous callers cannot insert, update, or delete room assignments'
);

insert into public.clinic_rooms (id, organization_id, label)
values ('d3200000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Room D1');

insert into public.room_assignments (
  id, organization_id, practitioner_role_id, room_id, date, shift_start, shift_end
) values (
  'd3200000-0000-0000-0000-000000000011',
  '10000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000101',
  'd3200000-0000-0000-0000-000000000001',
  '2099-03-01', '09:00', '12:00'
);

select throws_ok(
  $$ insert into public.room_assignments (
       organization_id, practitioner_role_id, room_id, date, shift_start, shift_end
     ) values (
       '10000000-0000-0000-0000-000000000001',
       '30000000-0000-0000-0000-000000000109',
       'd3200000-0000-0000-0000-000000000001',
       '2099-03-01', '11:00', '13:00'
     ) $$,
  '23P01',
  'conflicting key value violates exclusion constraint "room_assignments_room_id_tsrange_excl"',
  'two doctors cannot occupy one room during overlapping shifts'
);

insert into public.appointments (
  id, organization_id, patient_id, practitioner_role_id, status,
  service_type, start_at, end_at, delivery_mode
) values (
  'd3200000-0000-0000-0000-000000000021',
  '10000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000101',
  'booked', 'Room test', '2099-03-01 10:00+00', '2099-03-01 10:30+00', 'in_person'
);

select is(
  (select room_label from public.waiting_room_queue where appointment_id = 'd3200000-0000-0000-0000-000000000021'),
  'Room D1',
  'assigned appointment receives its room label'
);
select is(
  (select practitioner_display_name from public.waiting_room_queue where appointment_id = 'd3200000-0000-0000-0000-000000000021'),
  (select practitioner.name ->> 'text'
   from public.practitioners practitioner
   join public.practitioner_roles practitioner_role on practitioner_role.practitioner_id = practitioner.id
   where practitioner_role.id = '30000000-0000-0000-0000-000000000101'),
  'assigned appointment receives its practitioner display name'
);

insert into public.appointments (
  id, organization_id, patient_id, practitioner_role_id, status,
  service_type, start_at, end_at, delivery_mode
) values (
  'd3200000-0000-0000-0000-000000000022',
  '10000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000109',
  'booked', 'No room test', '2099-03-01 14:00+00', '2099-03-01 14:30+00', 'in_person'
);

select ok(
  exists (select 1 from public.waiting_room_queue where appointment_id = 'd3200000-0000-0000-0000-000000000022' and room_label is null),
  'a doctor with no room remains in the queue with a null room label'
);

select ok(
  (select practitioner_display_name is not null
   from public.waiting_room_queue
   where appointment_id = '50000000-0000-0000-0000-000000000001'),
  'backfill populates practitioner display names for existing queue rows'
);

select ok(has_table_privilege('anon', 'public.waiting_room_queue', 'select'),
  'existing public queue read remains available');
select ok(
  exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'waiting_room_queue'),
  'waiting-room queue remains in the Realtime publication'
);
select ok(
  (select relreplident = 'f' from pg_class where oid = 'public.waiting_room_queue'::regclass),
  'queue keeps full replica identity for Realtime updates'
);

select is(
  (select queue_label from public.waiting_room_queue where appointment_id = 'd3200000-0000-0000-0000-000000000021'),
  (select queue_label from public.appointments where id = 'd3200000-0000-0000-0000-000000000021'),
  'queue label remains the durable appointment label'
);
select ok(
  (select stage from public.waiting_room_queue where appointment_id = 'd3200000-0000-0000-0000-000000000021') = 'scheduled',
  'queue stage remains compatible with existing encounter synchronization'
);
select ok(
  not exists (select 1 from public.waiting_room_queue where appointment_id = 'd3200000-0000-0000-0000-000000000021' and room_label is null),
  'room metadata is not lost during queue synchronization'
);

select * from finish();
rollback;
