-- Validation suite for Root Supply Room & Inventory Requisition Lifecycle
-- Run against local Supabase PostgreSQL. All checks must pass; mutations roll back.
\set ON_ERROR_STOP on

do $$
begin
  -- 1. Schema Surface Checks
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'departments'
      and column_name = 'is_root_supply'
  ) then
    raise exception 'departments.is_root_supply column is missing.';
  end if;

  if to_regclass('public.inventory_requisitions') is null
    or to_regclass('public.inventory_requisition_items') is null then
    raise exception 'inventory_requisitions or inventory_requisition_items table is missing.';
  end if;

  -- 2. RPC Surface Checks
  if to_regprocedure('public.get_root_supply_department(uuid)') is null
    or to_regprocedure('public.set_root_supply_department(uuid,uuid)') is null
    or to_regprocedure('public.submit_inventory_requisition(uuid,uuid,jsonb,text,boolean,text,date)') is null
    or to_regprocedure('public.disperse_inventory_requisition_item(uuid,numeric)') is null then
    raise exception 'Root supply / requisition RPC surface is incomplete.';
  end if;

  -- 3. Anonymous execution must be revoked
  if has_function_privilege('anon', 'public.submit_inventory_requisition(uuid,uuid,jsonb,text,boolean,text,date)', 'EXECUTE')
    or has_function_privilege('anon', 'public.disperse_inventory_requisition_item(uuid,numeric)', 'EXECUTE')
    or has_function_privilege('anon', 'public.set_root_supply_department(uuid,uuid)', 'EXECUTE') then
    raise exception 'Anonymous users must not execute requisition RPCs.';
  end if;
end $$;

begin;

-- Setup test identities:
-- Org: 10000000-0000-0000-0000-000000000001
-- Admin user: 00000000-0000-0000-0000-0000000106
-- Inventory/Supply user: 00000000-0000-0000-0000-0000000108
-- Doctor/Clinical user: 00000000-0000-0000-0000-0000000101

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000106', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000106"}', true);
set local role authenticated;

-- Designate Supply Department (90000000-0000-0000-0000-000000000001) as Root Supply
select public.set_root_supply_department(
  '10000000-0000-0000-0000-000000000001',
  '90000000-0000-0000-0000-000000000001'
);

select public.get_root_supply_department('10000000-0000-0000-0000-000000000001')
  = '90000000-0000-0000-0000-000000000001'::uuid as root_supply_resolved_correctly;

-- Test Requisition Submission:
-- Pharmacy/Requesting Dept is 90000000-0000-0000-0000-000000000002 (ER / Department)
-- Request 10 units of Syringe 5mL (91000000-0000-0000-0000-000000000001)
-- Supply room has 100 units on hand
do $$
declare
  v_req_id uuid;
  v_item_record record;
begin
  -- Submit on simulated Tuesday (ISODOW = 2, valid window)
  v_req_id := public.submit_inventory_requisition(
    p_organization_id := '10000000-0000-0000-0000-000000000001',
    p_requesting_department_id := '90000000-0000-0000-0000-000000000002',
    p_items := jsonb_build_array(
      jsonb_build_object(
        'item_id', '91000000-0000-0000-0000-000000000001',
        'requested_quantity', 10
      )
    ),
    p_notes := 'Routine weekly department restock',
    p_is_emergency := false,
    p_emergency_justification := null,
    p_simulated_date := date '2026-10-06' -- Tuesday
  );

  if v_req_id is null then
    raise exception 'Failed to submit requisition on valid Tuesday window.';
  end if;

  select * into v_item_record
  from public.inventory_requisition_items
  where requisition_id = v_req_id
  limit 1;

  -- Since item is in stock at root supply, status should be 'ready_for_dispersal' or 'pending'
  if v_item_record.status <> 'ready_for_dispersal' then
    raise exception 'Expected ready_for_dispersal status for in-stock item, got: %', v_item_record.status;
  end if;

  -- Execute Dispersal
  perform public.disperse_inventory_requisition_item(
    p_requisition_item_id := v_item_record.id,
    p_quantity := 10
  );

  -- Assert requisition item is fulfilled
  select * into v_item_record
  from public.inventory_requisition_items
  where id = v_item_record.id;

  if v_item_record.status <> 'dispersed' or v_item_record.dispersed_quantity <> 10 then
    raise exception 'Dispersal did not update item to dispersed.';
  end if;
end $$;

-- Test Requisition Submission outside Mon-Wed window (simulated Thursday):
-- Should throw REQUISITION_WINDOW_CLOSED when not emergency
do $$
declare
  v_caught boolean := false;
begin
  begin
    perform public.submit_inventory_requisition(
      p_organization_id := '10000000-0000-0000-0000-000000000001',
      p_requesting_department_id := '90000000-0000-0000-0000-000000000002',
      p_items := jsonb_build_array(
        jsonb_build_object(
          'item_id', '91000000-0000-0000-0000-000000000001',
          'requested_quantity', 5
        )
      ),
      p_notes := 'Off-schedule request',
      p_is_emergency := false,
      p_emergency_justification := null,
      p_simulated_date := date '2026-10-08' -- Thursday
    );
  exception when others then
    if sqlerrm like '%REQUISITION_WINDOW_CLOSED%' then
      v_caught := true;
    else
      raise;
    end if;
  end;

  if not v_caught then
    raise exception 'Routine requisition on Thursday should have been rejected with REQUISITION_WINDOW_CLOSED.';
  end if;
end $$;

-- Test Emergency Requisition on Thursday:
-- Should succeed with emergency flag and justification
do $$
declare
  v_req_id uuid;
begin
  v_req_id := public.submit_inventory_requisition(
    p_organization_id := '10000000-0000-0000-0000-000000000001',
    p_requesting_department_id := '90000000-0000-0000-0000-000000000002',
    p_items := jsonb_build_array(
      jsonb_build_object(
        'item_id', '91000000-0000-0000-0000-000000000001',
        'requested_quantity', 5
      )
    ),
    p_notes := 'Emergency patient surge stock',
    p_is_emergency := true,
    p_emergency_justification := 'Mass casualty incident in ER',
    p_simulated_date := date '2026-10-08' -- Thursday
  );

  if v_req_id is null then
    raise exception 'Emergency requisition on Thursday should have succeeded.';
  end if;
end $$;

reset role;
rollback;
