-- Standalone pharmacy inventory orders do not create or require a patient
-- account, clinical encounter, billing event, or invoice. Legacy linked
-- orders remain valid and retain their original completion behavior.

alter table public.pharmacy_prescription_orders
  alter column patient_id drop not null,
  alter column encounter_id drop not null,
  add column if not exists patient_reference text,
  add column if not exists ward_reference text;

update public.pharmacy_prescription_orders
set patient_reference = coalesce(
  nullif(btrim(physical_prescription_reference), ''),
  'Legacy linked order ' || id::text
)
where patient_reference is null;

alter table public.inventory_usages
  alter column encounter_id drop not null,
  alter column patient_id drop not null,
  add column if not exists reference_text text;

create or replace function public.create_standalone_pharmacy_inventory_order(
  p_organization_id uuid,
  p_patient_reference text,
  p_ward_reference text,
  p_prescription_reference text,
  p_prescriber_name text,
  p_items jsonb,
  p_priority text default 'routine'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_item jsonb;
  v_item_id uuid;
  v_inventory_item public.inventory_items%rowtype;
  v_qty numeric;
  v_available numeric;
  v_status text;
begin
  if auth.uid() is null
    or not public.has_organization_permission(p_organization_id, 'can_encode_pharmacy_prescriptions') then
    raise exception 'Pharmacy prescription encoder permission is required.' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_patient_reference, '')), '') is null then
    raise exception 'A patient or encounter reference is required.' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_prescription_reference, '')), '') is null then
    raise exception 'A physical prescription reference is required.' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_prescriber_name, '')), '') is null then
    raise exception 'The prescriber name is required.' using errcode = '22023';
  end if;
  if p_priority not in ('routine', 'urgent', 'emergency') then
    raise exception 'Invalid prescription priority.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one inventory medicine is required.' using errcode = '22023';
  end if;

  insert into public.pharmacy_prescription_orders (
    organization_id, patient_reference, ward_reference, physical_prescription_reference,
    prescriber_name, priority, status, submitted_by
  ) values (
    p_organization_id, btrim(p_patient_reference), nullif(btrim(coalesce(p_ward_reference, '')), ''),
    btrim(p_prescription_reference), btrim(p_prescriber_name), p_priority, 'submitted', auth.uid()
  ) returning id into v_order_id;

  insert into public.pharmacy_prescription_order_events (
    organization_id, order_id, status, actor_id, metadata
  ) values (
    p_organization_id, v_order_id, 'submitted', auth.uid(),
    jsonb_build_object('source', 'standalone_inventory', 'patient_reference', btrim(p_patient_reference))
  );

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_item_id := nullif(v_item ->> 'item_id', '')::uuid;
    v_qty := (v_item ->> 'quantity')::numeric;
    if v_item_id is null or v_qty is null or v_qty <= 0 then
      raise exception 'Every medicine requires an active inventory item and a positive quantity.' using errcode = '22023';
    end if;

    select * into v_inventory_item
    from public.inventory_items item
    where item.id = v_item_id
      and item.organization_id = p_organization_id
      and item.active;
    if not found then
      raise exception 'The selected Pharmacy item is not available.' using errcode = '22023';
    end if;

    select coalesce(sum(stock.quantity), 0) into v_available
    from public.department_stock stock
    join public.departments department
      on department.id = stock.department_id
      and department.organization_id = stock.organization_id
    where stock.organization_id = p_organization_id
      and stock.item_id = v_item_id
      and department.active
      and (lower(department.code) in ('pharmacy', 'pharm') or lower(department.name) like '%pharmacy%');

    v_status := case when v_available >= v_qty then 'available' else 'unavailable' end;
    insert into public.pharmacy_prescription_order_lines (
      organization_id, order_id, item_id, original_medication, dosage_instruction,
      requested_quantity, unit_of_measure, status, notes
    ) values (
      p_organization_id, v_order_id, v_item_id, v_inventory_item.name,
      nullif(btrim(v_item ->> 'dosage_instruction'), ''), v_qty,
      coalesce(nullif(btrim(v_item ->> 'unit_of_measure'), ''), v_inventory_item.unit_of_measure),
      v_status, nullif(btrim(v_item ->> 'notes'), '')
    );
  end loop;

  return v_order_id;
end;
$$;

create or replace function public.record_standalone_pharmacy_inventory_usage(
  p_order_id uuid,
  p_stock_id uuid,
  p_quantity numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.pharmacy_prescription_orders%rowtype;
  v_stock public.department_stock%rowtype;
  v_item public.inventory_items%rowtype;
  v_usage_id uuid;
  v_alloc record;
  v_reference_text text;
begin
  select * into v_order
  from public.pharmacy_prescription_orders
  where id = p_order_id
  for update;
  if not found then
    raise exception 'Pharmacy prescription order not found.' using errcode = 'P0002';
  end if;
  if auth.uid() is null
    or not public.has_organization_permission(v_order.organization_id, 'can_dispense_pharmacy_prescriptions')
    or not public.has_organization_permission(v_order.organization_id, 'can_tag_inventory_usage') then
    raise exception 'Pharmacy dispensing and inventory tagging permissions are required.' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.staff_department_assignments assignment
    join public.departments department
      on department.id = assignment.department_id
      and department.organization_id = assignment.organization_id
    where assignment.organization_id = v_order.organization_id
      and assignment.user_id = auth.uid()
      and department.active
      and (lower(department.code) in ('pharmacy', 'pharm') or lower(department.name) like '%pharmacy%')
  ) then
    raise exception 'Pharmacy Department assignment is required.' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Dispense quantity must be positive.' using errcode = '22023';
  end if;

  select * into v_stock
  from public.department_stock stock
  where stock.id = p_stock_id
    and stock.organization_id = v_order.organization_id
  for update;
  if not found then
    raise exception 'The selected Pharmacy stock is not available for this clinic.' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.departments department
    where department.id = v_stock.department_id
      and department.organization_id = v_order.organization_id
      and department.active
      and (lower(department.code) in ('pharmacy', 'pharm') or lower(department.name) like '%pharmacy%')
  ) then
    raise exception 'Standalone prescription dispensing must use Pharmacy stock.' using errcode = '22023';
  end if;

  select * into v_item
  from public.inventory_items item
  where item.id = v_stock.item_id
    and item.organization_id = v_order.organization_id
    and item.active;
  if not found then
    raise exception 'The inventory item is inactive.' using errcode = '22023';
  end if;

  v_reference_text := concat_ws(' · ', v_order.patient_reference, v_order.ward_reference, v_order.physical_prescription_reference);
  insert into public.inventory_usages (
    organization_id, stock_id, item_id, department_id, encounter_id, patient_id,
    reference_text, quantity, unit_price, unit_cost, currency, tagged_by
  ) values (
    v_order.organization_id, v_stock.id, v_item.id, v_stock.department_id, null, null,
    v_reference_text, p_quantity, v_item.selling_price, v_item.unit_cost, v_item.currency, auth.uid()
  ) returning id into v_usage_id;

  if v_item.is_perishable then
    for v_alloc in select * from public.allocate_perishable_stock_fefo(v_stock.id, p_quantity, false) loop
      insert into public.inventory_usage_batch_consumptions (organization_id, usage_id, batch_id, quantity)
      values (v_order.organization_id, v_usage_id, v_alloc.allocated_batch_id, v_alloc.allocated_quantity);
      insert into public.inventory_stock_movements (
        organization_id, stock_id, item_id, department_id, batch_id,
        movement_type, quantity_delta, reason, usage_id, recorded_by
      ) values (
        v_order.organization_id, v_stock.id, v_item.id, v_stock.department_id, v_alloc.allocated_batch_id,
        'usage', -v_alloc.allocated_quantity, 'Standalone Pharmacy prescription dispense', v_usage_id, auth.uid()
      );
    end loop;
  end if;

  update public.department_stock
  set quantity = quantity - p_quantity
  where id = v_stock.id
    and quantity >= p_quantity;
  if not found then
    raise exception 'Insufficient stock in the selected Pharmacy department.' using errcode = '22023';
  end if;

  if not v_item.is_perishable then
    insert into public.inventory_stock_movements (
      organization_id, stock_id, item_id, department_id,
      movement_type, quantity_delta, reason, usage_id, recorded_by
    ) values (
      v_order.organization_id, v_stock.id, v_item.id, v_stock.department_id,
      'usage', -p_quantity, 'Standalone Pharmacy prescription dispense', v_usage_id, auth.uid()
    );
  end if;

  return v_usage_id;
end;
$$;

create or replace function public.list_pharmacy_prescription_queue(
  p_organization_id uuid,
  p_status text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_can_dispense boolean := public.has_organization_permission(p_organization_id, 'can_dispense_pharmacy_prescriptions');
begin
  if auth.uid() is null or not (
    v_can_dispense or public.has_organization_permission(p_organization_id, 'can_encode_pharmacy_prescriptions')
  ) then
    raise exception 'Pharmacy prescription access is required.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', order_row.id,
    'organization_id', order_row.organization_id,
    'patient_id', order_row.patient_id,
    'encounter_id', order_row.encounter_id,
    'patient_reference', order_row.patient_reference,
    'ward_reference', order_row.ward_reference,
    'physical_prescription_reference', order_row.physical_prescription_reference,
    'prescriber_name', order_row.prescriber_name,
    'priority', order_row.priority,
    'status', order_row.status,
    'submitted_by', order_row.submitted_by,
    'submitted_at', order_row.submitted_at,
    'reviewed_at', order_row.reviewed_at,
    'completed_at', order_row.completed_at,
    'lines', (select coalesce(jsonb_agg(to_jsonb(line_row) order by line_row.created_at), '[]'::jsonb)
      from public.pharmacy_prescription_order_lines line_row where line_row.order_id = order_row.id),
    'events', (select coalesce(jsonb_agg(to_jsonb(event_row) order by event_row.created_at), '[]'::jsonb)
      from public.pharmacy_prescription_order_events event_row where event_row.order_id = order_row.id)
  ) order by order_row.submitted_at)
  from public.pharmacy_prescription_orders order_row
  where order_row.organization_id = p_organization_id
    and (p_status is null or p_status = '' or order_row.status = p_status)
    and (v_can_dispense or order_row.submitted_by = auth.uid())), '[]'::jsonb);
end;
$$;

create or replace function public.complete_pharmacy_prescription_order(
  p_order_id uuid,
  p_outcomes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.pharmacy_prescription_orders%rowtype;
  v_line public.pharmacy_prescription_order_lines%rowtype;
  v_outcome jsonb;
  v_action text;
  v_qty numeric;
  v_usage_id uuid;
  v_pharmacy_dept_id uuid;
  v_stock_id uuid;
  v_all_terminal boolean;
  v_any_dispensed boolean;
  v_next_status text;
begin
  select * into v_order from public.pharmacy_prescription_orders where id = p_order_id for update;
  if not found then raise exception 'Pharmacy prescription order not found.' using errcode = 'P0002'; end if;
  if not public.has_organization_permission(v_order.organization_id, 'can_dispense_pharmacy_prescriptions') then
    raise exception 'Pharmacy dispensing permission is required.' using errcode = '42501';
  end if;
  if not public.has_organization_permission(v_order.organization_id, 'can_tag_inventory_usage') then
    raise exception 'Pharmacy inventory tagging permission is required.' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.staff_department_assignments assignment
    join public.departments department
      on department.id = assignment.department_id
      and department.organization_id = assignment.organization_id
    where assignment.organization_id = v_order.organization_id
      and assignment.user_id = auth.uid()
      and department.active
      and (lower(department.code) in ('pharmacy', 'pharm') or lower(department.name) like '%pharmacy%')
  ) then
    raise exception 'Pharmacy Department assignment is required.' using errcode = '42501';
  end if;
  if v_order.status in ('completed', 'cancelled', 'rejected') then
    raise exception 'This prescription order is already terminal.' using errcode = '22023';
  end if;

  select department.id into v_pharmacy_dept_id
  from public.departments department
  where department.organization_id = v_order.organization_id
    and department.active
    and (lower(department.code) in ('pharmacy', 'pharm') or lower(department.name) like '%pharmacy%')
  order by department.created_at
  limit 1;

  for v_outcome in select value from jsonb_array_elements(coalesce(p_outcomes, '[]'::jsonb)) loop
    select * into v_line
    from public.pharmacy_prescription_order_lines
    where id = (v_outcome ->> 'line_id')::uuid
      and order_id = v_order.id
    for update;
    if not found then raise exception 'Prescription line not found.' using errcode = 'P0002'; end if;
    v_action := coalesce(v_outcome ->> 'action', '');
    if v_action = 'dispense' then
      if v_line.item_id is null or v_line.status not in ('available', 'pharmacist_verified', 'partially_dispensed') then
        raise exception 'Only verified available lines can be dispensed.' using errcode = '22023';
      end if;
      v_qty := coalesce((v_outcome ->> 'quantity')::numeric, v_line.requested_quantity - v_line.dispensed_quantity);
      if v_qty <= 0 or v_qty > (v_line.requested_quantity - v_line.dispensed_quantity) then
        raise exception 'Invalid dispense quantity.' using errcode = '22023';
      end if;
      select stock.id into v_stock_id
      from public.department_stock stock
      where stock.organization_id = v_order.organization_id
        and stock.item_id = v_line.item_id
        and stock.department_id = v_pharmacy_dept_id
      for update;
      if v_stock_id is null then raise exception 'Pharmacy stock is unavailable.' using errcode = '22023'; end if;

      if v_order.patient_id is null or v_order.encounter_id is null then
        v_usage_id := public.record_standalone_pharmacy_inventory_usage(v_order.id, v_stock_id, v_qty);
      else
        v_usage_id := public.tag_inventory_usage(v_order.encounter_id, v_stock_id, v_qty, v_pharmacy_dept_id);
      end if;

      update public.pharmacy_prescription_order_lines
      set dispensed_quantity = dispensed_quantity + v_qty,
          usage_id = v_usage_id,
          status = case when dispensed_quantity + v_qty >= requested_quantity then 'dispensed' else 'partially_dispensed' end,
          updated_at = now()
      where id = v_line.id;
      insert into public.pharmacy_prescription_order_events (organization_id, order_id, line_id, status, actor_id, metadata)
      select v_order.organization_id, v_order.id, v_line.id, updated.status, auth.uid(),
        jsonb_build_object('usage_id', v_usage_id, 'quantity', v_qty)
      from public.pharmacy_prescription_order_lines updated
      where updated.id = v_line.id;
    elsif v_action in ('cancel', 'external_referral') then
      if nullif(btrim(coalesce(v_outcome ->> 'reason', '')), '') is null then
        raise exception 'A reason is required for an undispensed line.' using errcode = '22023';
      end if;
      update public.pharmacy_prescription_order_lines
      set status = case when v_action = 'cancel' then 'cancelled' else 'external_referral' end,
          pharmacist_reason = btrim(v_outcome ->> 'reason'),
          updated_at = now()
      where id = v_line.id;
      insert into public.pharmacy_prescription_order_events (organization_id, order_id, line_id, status, reason, actor_id)
      values (v_order.organization_id, v_order.id, v_line.id,
        case when v_action = 'cancel' then 'cancelled' else 'external_referral' end,
        btrim(v_outcome ->> 'reason'), auth.uid());
    else
      raise exception 'Unsupported dispense outcome.' using errcode = '22023';
    end if;
  end loop;

  select
    not exists (
      select 1 from public.pharmacy_prescription_order_lines line
      where line.order_id = v_order.id
        and line.status not in ('dispensed', 'cancelled', 'external_referral')
    ),
    exists (
      select 1 from public.pharmacy_prescription_order_lines line
      where line.order_id = v_order.id
        and line.status in ('dispensed', 'partially_dispensed')
    ) into v_all_terminal, v_any_dispensed;
  v_next_status := case when v_all_terminal then 'completed' when v_any_dispensed then 'partially_dispensed' else 'under_pharmacist_review' end;
  update public.pharmacy_prescription_orders
  set status = v_next_status,
      completed_by = case when v_all_terminal then auth.uid() else completed_by end,
      completed_at = case when v_all_terminal then now() else completed_at end,
      updated_at = now()
  where id = v_order.id;
  insert into public.pharmacy_prescription_order_events (organization_id, order_id, status, actor_id)
  values (v_order.organization_id, v_order.id, v_next_status, auth.uid());
  return jsonb_build_object('order_id', v_order.id, 'status', v_next_status, 'completed', v_all_terminal);
end;
$$;

revoke all on function public.create_standalone_pharmacy_inventory_order(uuid, text, text, text, text, jsonb, text) from public, anon;
revoke all on function public.record_standalone_pharmacy_inventory_usage(uuid, uuid, numeric) from public, anon;
grant execute on function public.create_standalone_pharmacy_inventory_order(uuid, text, text, text, text, jsonb, text) to authenticated;
grant execute on function public.record_standalone_pharmacy_inventory_usage(uuid, uuid, numeric) to authenticated;
