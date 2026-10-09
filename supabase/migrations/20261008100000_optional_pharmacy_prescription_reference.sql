-- A ward may not have an Rx/ward-slip number at encoding time. Preserve the
-- field when supplied, but do not block submission when it is blank.

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
    nullif(btrim(coalesce(p_prescription_reference, '')), ''), btrim(p_prescriber_name),
    p_priority, 'submitted', auth.uid()
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

revoke all on function public.create_standalone_pharmacy_inventory_order(uuid, text, text, text, text, jsonb, text) from public, anon;
grant execute on function public.create_standalone_pharmacy_inventory_order(uuid, text, text, text, text, jsonb, text) to authenticated;
