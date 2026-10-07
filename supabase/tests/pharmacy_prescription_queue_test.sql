\set ON_ERROR_STOP on

begin;
select plan(18);

select has_table('public', 'pharmacy_prescription_orders', 'prescription order table exists');
select has_table('public', 'pharmacy_prescription_order_lines', 'prescription line table exists');
select has_table('public', 'pharmacy_prescription_order_events', 'prescription event table exists');

select has_function('public', 'create_pharmacy_prescription_transcription', array['uuid', 'uuid', 'uuid', 'text', 'text', 'jsonb', 'text'], 'nurse transcription RPC exists');
select has_function('public', 'get_pharmacy_prescription_availability', array['uuid', 'jsonb'], 'availability RPC exists');
select has_function('public', 'list_pharmacy_prescription_queue', array['uuid', 'text'], 'Pharmacy queue RPC exists');
select has_function('public', 'review_pharmacy_prescription_order', array['uuid', 'jsonb', 'text'], 'pharmacist review RPC exists');
select has_function('public', 'complete_pharmacy_prescription_order', array['uuid', 'jsonb'], 'dispense completion RPC exists');

select ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pharmacy_prescription_orders' and column_name = 'status'), 'order status column exists');
select ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pharmacy_prescription_order_lines' and column_name = 'status'), 'line status column exists');
select ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pharmacy_prescription_order_events' and column_name = 'status'), 'event status column exists');

select ok(not has_function_privilege('anon', 'public.create_pharmacy_prescription_transcription(uuid,uuid,uuid,text,text,jsonb,text)', 'execute'), 'anon cannot create transcriptions');
select ok(not has_function_privilege('anon', 'public.complete_pharmacy_prescription_order(uuid,jsonb)', 'execute'), 'anon cannot complete dispensing');
select ok(has_function_privilege('authenticated', 'public.create_pharmacy_prescription_transcription(uuid,uuid,uuid,text,text,jsonb,text)', 'execute'), 'authenticated can create transcriptions');
select ok(has_function_privilege('authenticated', 'public.complete_pharmacy_prescription_order(uuid,jsonb)', 'execute'), 'authenticated can complete dispensing');

select ok(exists (select 1 from pg_constraint where conname = 'pharmacy_prescription_orders_status_check'), 'order status is constrained');
select ok(exists (select 1 from pg_constraint where conname = 'pharmacy_prescription_order_lines_status_check'), 'line status is constrained');
select ok(exists (select 1 from pg_trigger where tgname = 'pharmacy_prescription_order_events_immutable'), 'events are immutable');

select * from finish();
rollback;
