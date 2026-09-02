-- Run after `supabase db reset`. Every result must be true; writes roll back.
\set ON_ERROR_STOP on

do $$
begin
  if to_regclass('public.inventory_items') is null
    or to_regclass('public.departments') is null
    or to_regclass('public.department_stock') is null
    or to_regclass('public.inventory_usages') is null
    or to_regclass('public.inventory_stock_movements') is null
    or to_regclass('public.staff_department_assignments') is null then
    raise exception 'Loop 3 table surface is incomplete.';
  end if;
  if to_regprocedure('public.adjust_department_stock(uuid,uuid,numeric,text,text)') is null
    or to_regprocedure('public.transfer_department_stock(uuid,uuid,uuid,numeric,text)') is null
    or to_regprocedure('public.tag_inventory_usage(uuid,uuid,numeric)') is null
    or to_regprocedure('public.tag_inventory_usage(uuid,uuid,numeric,uuid)') is null
    or to_regprocedure('public.assign_staff_department(uuid,uuid,uuid)') is null
    or to_regprocedure('public.has_organization_permission(uuid,text)') is null then
    raise exception 'Loop 3 RPC surface is incomplete.';
  end if;
  if has_function_privilege('anon', 'public.tag_inventory_usage(uuid,uuid,numeric)', 'EXECUTE')
    or has_function_privilege('anon', 'public.adjust_department_stock(uuid,uuid,numeric,text,text)', 'EXECUTE') then
    raise exception 'Anonymous users must not execute inventory mutation RPCs.';
  end if;
  if has_function_privilege('anon', 'public.tag_inventory_usage(uuid,uuid,numeric,uuid)', 'EXECUTE') then
    raise exception 'Anonymous users must not execute department-aware inventory mutation RPCs.';
  end if;
  if not exists (
    select 1 from pg_trigger where tgrelid = 'public.inventory_usages'::regclass
      and tgname = 'inventory_usages_audit'
  ) or not exists (
    select 1 from pg_trigger where tgrelid = 'public.inventory_usages'::regclass
      and tgname = 'inventory_usages_are_immutable'
  ) then raise exception 'Patient-linked usage audit/immutability coverage is incomplete.'; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'department_stock'
  ) then raise exception 'Department stock is not published to Realtime.'; end if;
end $$;

begin;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- A patient cannot infer logistics or patient-linked usage rows.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000103', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000103"}', true);
set local role authenticated;
select count(*) = 0 as patient_cannot_read_item_master from public.inventory_items;
select count(*) = 0 as patient_cannot_read_stock from public.department_stock;
select count(*) = 0 as patient_cannot_read_usage from public.inventory_usages;
reset role;

-- Inventory staff can manage inventory but do not inherit broad clinical-table reads.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000108', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000108"}', true);
set local role authenticated;
select public.has_organization_permission('10000000-0000-0000-0000-000000000001', 'can_manage_inventory')
  as inventory_staff_can_manage;
select public.has_organization_permission('10000000-0000-0000-0000-000000000001', 'can_tag_inventory_usage')
  as inventory_staff_can_tag;
select count(*) = 0 as inventory_staff_has_no_direct_clinical_read from public.encounters;
select count(*) = 1 as inventory_staff_gets_minimal_encounter_picker
from public.list_inventory_encounters('10000000-0000-0000-0000-000000000001');
select public.adjust_department_stock(
  '91000000-0000-0000-0000-000000000001',
  '90000000-0000-0000-0000-000000000001',
  10, 'Validation receipt', 'receipt'
) = '92000000-0000-0000-0000-000000000001'::uuid as receipt_returns_ledger_row;
select quantity = 110 as receipt_updates_one_source_of_truth
from public.department_stock where id = '92000000-0000-0000-0000-000000000001';
select public.transfer_department_stock(
  '91000000-0000-0000-0000-000000000001',
  '90000000-0000-0000-0000-000000000001',
  '90000000-0000-0000-0000-000000000002',
  5, 'Validation allocation'
) is not null as transfer_is_atomic;
select (
  select quantity from public.department_stock where id = '92000000-0000-0000-0000-000000000001'
) = 105 and (
  select quantity from public.department_stock where id = '92000000-0000-0000-0000-000000000002'
) = 45 as transfer_preserves_clinic_total;
select count(*) = 0 as inventory_staff_cannot_read_other_clinic_stock
from public.department_stock where organization_id = '10000000-0000-0000-0000-000000000002';
reset role;

-- A doctor receives tagging through role_permissions, not an application role check.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000101"}', true);
set local role authenticated;
select public.has_organization_permission('10000000-0000-0000-0000-000000000001', 'can_tag_inventory_usage')
  as doctor_can_tag_from_permission_data;
select public.tag_inventory_usage(
  '60000000-0000-0000-0000-000000000001',
  '92000000-0000-0000-0000-000000000002',
  1,
  '90000000-0000-0000-0000-000000000002'
) is not null as unassigned_doctor_can_choose_department;
select quantity = 44 as chosen_department_decrements_exact_stock
from public.department_stock where id = '92000000-0000-0000-0000-000000000002';
select public.tag_inventory_usage(
  '60000000-0000-0000-0000-000000000001',
  '92000000-0000-0000-0000-000000000001',
  2
) is not null as doctor_tags_usage;
select quantity = 103 as usage_decrements_exact_department
from public.department_stock where id = '92000000-0000-0000-0000-000000000001';
select count(*) = 1 as usage_links_item_encounter_and_patient
from public.inventory_usages
where item_id = '91000000-0000-0000-0000-000000000001'
  and encounter_id = '60000000-0000-0000-0000-000000000001'
  and patient_id = '40000000-0000-0000-0000-000000000001'
  and quantity = 2 and unit_price = 15 and currency = 'PHP';
select count(*) = 0 as doctor_cannot_read_other_clinic_inventory
from public.department_stock where organization_id = '10000000-0000-0000-0000-000000000002';
reset role;

rollback;
