\set ON_ERROR_STOP on

begin;
select plan(30);

-- 1. Schema & Privilege assertions
select has_function('public', 'list_nbb_pharmacy_pos_catalog', array['uuid'], 'list_nbb_pharmacy_pos_catalog RPC exists');
select has_function('public', 'create_nbb_pharmacy_pos_sale', array['uuid', 'jsonb', 'text'], 'create_nbb_pharmacy_pos_sale RPC exists');

select ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pos_sales' and column_name = 'standard_total_in_centavos'), 'pos_sales has standard_total_in_centavos');
select ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'billing_line_items' and column_name = 'standard_unit_price_in_centavos'), 'billing_line_items has standard_unit_price_in_centavos');
select ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'billing_line_items' and column_name = 'standard_line_total_in_centavos'), 'billing_line_items has standard_line_total_in_centavos');
select ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'invoices' and column_name = 'standard_total_in_centavos'), 'invoices has standard_total_in_centavos');
select ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'invoices' and column_name = 'patient_balance_due_in_centavos'), 'invoices has patient_balance_due_in_centavos');

select ok(not has_function_privilege('anon', 'public.list_nbb_pharmacy_pos_catalog(uuid)', 'execute'), 'anon cannot execute list_nbb_pharmacy_pos_catalog');
select ok(not has_function_privilege('anon', 'public.create_nbb_pharmacy_pos_sale(uuid,jsonb,text)', 'execute'), 'anon cannot execute create_nbb_pharmacy_pos_sale');
select ok(has_function_privilege('authenticated', 'public.list_nbb_pharmacy_pos_catalog(uuid)', 'execute'), 'authenticated can execute list_nbb_pharmacy_pos_catalog');
select ok(has_function_privilege('authenticated', 'public.create_nbb_pharmacy_pos_sale(uuid,jsonb,text)', 'execute'), 'authenticated can execute create_nbb_pharmacy_pos_sale');

-- 2. Setup Fixtures
-- Org 1: NBB facility
update public.organizations
set default_payor_type = 'philhealth_nbb'
where id = '10000000-0000-0000-0000-000000000001';

-- Org 2: Self-pay facility
update public.organizations
set default_payor_type = 'self_pay'
where id = '10000000-0000-0000-0000-000000000002';

-- Pharmacy Department in Org 1
insert into public.departments (id, organization_id, code, name, description, active)
values ('90000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000001', 'PHARM', 'Pharmacy', 'Main Pharmacy Department', true)
on conflict (id) do update set code = 'PHARM', name = 'Pharmacy', active = true;

insert into public.inventory_categories (id, organization_id, department_id, name, description, active)
values ('94000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000009', 'Department stock', 'Pharmacy category', true)
on conflict (department_id, name) do nothing;

-- Cashier 1: Pharmacy-assigned front desk user
-- 00000000-0000-0000-0000-000000000105 already has front_desk role (can_manage_pos) in Org 1
insert into public.staff_department_assignments (organization_id, user_id, department_id)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000105', '90000000-0000-0000-0000-000000000009')
on conflict (organization_id, user_id) do update set department_id = '90000000-0000-0000-0000-000000000009';

-- Cashier 2: Admin user 00000000-0000-0000-0000-000000000106 (has can_manage_pos in Org 1) assigned to OPD (non-pharmacy)
insert into public.staff_department_assignments (organization_id, user_id, department_id)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000106', '90000000-0000-0000-0000-000000000001')
on conflict (organization_id, user_id) do update set department_id = '90000000-0000-0000-0000-000000000001';

-- Cashier 3: Front desk in Org 2 (self-pay)
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000121', 'authenticated', 'authenticated', 'org2-cashier@synthetic.odyssey.test', crypt('LocalOnly-2026!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do nothing;

insert into public.practitioners (id, organization_id, auth_user_id, name)
values ('20000000-0000-0000-0000-000000000121', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000121', '{"text":"Org 2 Cashier"}'::jsonb)
on conflict (id) do nothing;

insert into public.practitioner_roles (id, organization_id, practitioner_id, role_code)
values ('30000000-0000-0000-0000-000000000121', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000121', 'front_desk')
on conflict (id) do nothing;

insert into public.user_roles (organization_id, user_id, role_id)
values ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000121', (select id from public.roles where name = 'front_desk'))
on conflict do nothing;

-- Pharmacy department in Org 2 for cashier 3
insert into public.departments (id, organization_id, code, name, description, active)
values ('90000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000002', 'PHARM', 'Pharmacy', 'Org 2 Pharmacy', true)
on conflict (id) do update set code = 'PHARM', name = 'Pharmacy', active = true;

insert into public.staff_department_assignments (organization_id, user_id, department_id)
values ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000121', '90000000-0000-0000-0000-000000000010')
on conflict (organization_id, user_id) do update set department_id = '90000000-0000-0000-0000-000000000010';

-- Stock Setup: Item 1 in Org 1 has stock in BOTH Pharmacy and OPD
-- Item 1: 91000000-0000-0000-0000-000000000001, unit_price = 15.00 (1500 centavos)
-- Pharmacy stock: 10 units
insert into public.department_stock (id, organization_id, item_id, department_id, category_id, quantity, reorder_level)
values ('92000000-0000-0000-0000-000000000099', '10000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000009', '94000000-0000-0000-0000-000000000009', 10, 2)
on conflict (id) do update set quantity = 10;

-- OPD stock for same item: 20 units
update public.department_stock
set quantity = 20
where organization_id = '10000000-0000-0000-0000-000000000001'
  and item_id = '91000000-0000-0000-0000-000000000001'
  and department_id = '90000000-0000-0000-0000-000000000001';

-- Set auth context to Pharmacy Cashier (00000000-0000-0000-0000-000000000105)
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000105', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000105"}', true);
set local role authenticated;

-- Test 3: Catalog returns only Pharmacy stock with standard unit price in centavos
select is(
  (select count(*) from public.list_nbb_pharmacy_pos_catalog('10000000-0000-0000-0000-000000000001') where item_id = '91000000-0000-0000-0000-000000000001'),
  1::bigint,
  'catalog returns exactly one row for Item 1 from Pharmacy stock'
);

select is(
  (select available_quantity from public.list_nbb_pharmacy_pos_catalog('10000000-0000-0000-0000-000000000001') where item_id = '91000000-0000-0000-0000-000000000001'),
  10::numeric,
  'catalog returns pharmacy available quantity (10), excluding OPD stock (20)'
);

select is(
  (select standard_unit_price_in_centavos from public.list_nbb_pharmacy_pos_catalog('10000000-0000-0000-0000-000000000001') where item_id = '91000000-0000-0000-0000-000000000001'),
  1500::bigint,
  'catalog returns standard unit price in integer centavos (1500 for 15.00)'
);

-- Test 4: Rejection cases
-- 4a: Self-pay org direct invocation rejected with NBB_FACILITY_REQUIRED
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000121', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000121"}', true);
set local role authenticated;

select throws_ok(
  $$ select public.create_nbb_pharmacy_pos_sale('10000000-0000-0000-0000-000000000002', '[{"item_id":"91000000-0000-0000-0000-000000000001","quantity":1}]'::jsonb, 'Patient Test') $$,
  'NBB_FACILITY_REQUIRED',
  'self-pay organization direct RPC call is rejected with NBB_FACILITY_REQUIRED'
);

-- 4b: Non-Pharmacy cashier in NBB org rejected with PHARMACY_ASSIGNMENT_REQUIRED
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000106', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000106"}', true);
set local role authenticated;

select throws_ok(
  $$ select public.create_nbb_pharmacy_pos_sale('10000000-0000-0000-0000-000000000001', '[{"item_id":"91000000-0000-0000-0000-000000000001","quantity":1}]'::jsonb, 'Patient Test') $$,
  'PHARMACY_ASSIGNMENT_REQUIRED',
  'cashier without Pharmacy assignment is rejected with PHARMACY_ASSIGNMENT_REQUIRED'
);

-- 4c: Blank / whitespace patient name rejected with PATIENT_NAME_REQUIRED
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000105', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000105"}', true);
set local role authenticated;

select throws_ok(
  $$ select public.create_nbb_pharmacy_pos_sale('10000000-0000-0000-0000-000000000001', '[{"item_id":"91000000-0000-0000-0000-000000000001","quantity":1}]'::jsonb, '   ') $$,
  'PATIENT_NAME_REQUIRED',
  'blank patient name is rejected with PATIENT_NAME_REQUIRED'
);

-- 4d: Invalid cart items: non-positive or fractional quantities rejected with INVALID_CART_ITEM
select throws_ok(
  $$ select public.create_nbb_pharmacy_pos_sale('10000000-0000-0000-0000-000000000001', '[{"item_id":"91000000-0000-0000-0000-000000000001","quantity":1.5}]'::jsonb, 'Patient Test') $$,
  'INVALID_CART_ITEM',
  'fractional quantity is rejected with INVALID_CART_ITEM'
);

select throws_ok(
  $$ select public.create_nbb_pharmacy_pos_sale('10000000-0000-0000-0000-000000000001', '[{"item_id":"91000000-0000-0000-0000-000000000001","quantity":0}]'::jsonb, 'Patient Test') $$,
  'INVALID_CART_ITEM',
  'zero quantity is rejected with INVALID_CART_ITEM'
);

-- 4e: Cross-tenant / invalid item ID rejected with INVALID_CART_ITEM
select throws_ok(
  $$ select public.create_nbb_pharmacy_pos_sale('10000000-0000-0000-0000-000000000001', '[{"item_id":"00000000-0000-0000-0000-000000000000","quantity":1}]'::jsonb, 'Patient Test') $$,
  'INVALID_CART_ITEM',
  'non-existent item is rejected with INVALID_CART_ITEM'
);

-- 4f: Insufficient stock rejected with INSUFFICIENT_PHARMACY_STOCK
select throws_ok(
  $$ select public.create_nbb_pharmacy_pos_sale('10000000-0000-0000-0000-000000000001', '[{"item_id":"91000000-0000-0000-0000-000000000001","quantity":50}]'::jsonb, 'Patient Test') $$,
  'INSUFFICIENT_PHARMACY_STOCK',
  'excess quantity is rejected with INSUFFICIENT_PHARMACY_STOCK'
);

-- 5. Successful NBB sale execution
-- Cart repeats item ID: 2 units + 3 units = 5 units total
-- Standard price: 15.00 * 5 = 75.00 (7500 centavos)
create temp table sale_result on commit drop as
select public.create_nbb_pharmacy_pos_sale(
  '10000000-0000-0000-0000-000000000001',
  '[{"item_id":"91000000-0000-0000-0000-000000000001","quantity":2},{"item_id":"91000000-0000-0000-0000-000000000001","quantity":3}]'::jsonb,
  'Maria Santos'
) as res;

select is(
  (select (res->>'patient_balance_due_in_centavos')::bigint from sale_result),
  0::bigint,
  'sale result patient_balance_due_in_centavos is 0'
);

select is(
  (select (res->>'standard_total_in_centavos')::bigint from sale_result),
  7500::bigint,
  'sale result standard_total_in_centavos is 7500'
);

-- 6. Verification of Billing, Invoice, Payment, and Stock states
reset role;

-- 6a: Payments table must have ZERO rows for this invoice
select is(
  (select count(*) from public.payments where invoice_id = (select (res->>'invoice_id')::uuid from sale_result)),
  0::bigint,
  'no payment row was inserted in payments table'
);

-- 6b: Invoice patient balance is 0 and standard total in centavos recorded
select is(
  (select balance_due from public.invoices where id = (select (res->>'invoice_id')::uuid from sale_result)),
  0::numeric,
  'invoice balance_due numeric is 0'
);

select is(
  (select patient_balance_due_in_centavos from public.invoices where id = (select (res->>'invoice_id')::uuid from sale_result)),
  0::bigint,
  'invoice patient_balance_due_in_centavos is 0'
);

select is(
  (select standard_total_in_centavos from public.invoices where id = (select (res->>'invoice_id')::uuid from sale_result)),
  7500::bigint,
  'invoice standard_total_in_centavos is 7500'
);

-- 6c: Stock decremented ONLY from Pharmacy row
select is(
  (select quantity from public.department_stock where id = '92000000-0000-0000-0000-000000000099'),
  5::numeric,
  'pharmacy department stock decremented from 10 to 5'
);

select is(
  (select quantity from public.department_stock
   where organization_id = '10000000-0000-0000-0000-000000000001'
     and item_id = '91000000-0000-0000-0000-000000000001'
     and department_id = '90000000-0000-0000-0000-000000000001'),
  20::numeric,
  'OPD department stock remains unchanged at 20'
);

-- 6d: Stock movement recorded with negative delta and usage type
select is(
  (select quantity_delta from public.inventory_stock_movements
   where stock_id = '92000000-0000-0000-0000-000000000099'
   order by created_at desc limit 1),
  -5::numeric,
  'inventory stock movement delta is -5'
);

select * from finish();
rollback;
