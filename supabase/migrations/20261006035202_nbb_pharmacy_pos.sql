-- NBB Pharmacy POS: Dedicated catalog and checkout RPCs for No-Balance-Billing facilities.
-- Guarantees mandatory patient name, Pharmacy Department live stock deduction,
-- zero patient balance, no payment records, and standard charge audit in integer centavos.

alter table public.pos_sales
  add column if not exists standard_total_in_centavos bigint check (standard_total_in_centavos is null or standard_total_in_centavos >= 0);

alter table public.billing_line_items
  add column if not exists standard_unit_price_in_centavos bigint check (standard_unit_price_in_centavos is null or standard_unit_price_in_centavos >= 0),
  add column if not exists standard_line_total_in_centavos bigint check (standard_line_total_in_centavos is null or standard_line_total_in_centavos >= 0);

alter table public.invoices
  add column if not exists standard_total_in_centavos bigint check (standard_total_in_centavos is null or standard_total_in_centavos >= 0),
  add column if not exists patient_balance_due_in_centavos bigint check (patient_balance_due_in_centavos is null or patient_balance_due_in_centavos >= 0);

create or replace function public.list_nbb_pharmacy_pos_catalog(p_organization_id uuid)
returns table (
  stock_id uuid,
  item_id uuid,
  sku text,
  name text,
  unit_of_measure text,
  available_quantity numeric,
  standard_unit_price_in_centavos bigint,
  currency text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pharmacy_dept_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if not public.has_organization_permission(p_organization_id, 'can_manage_pos') then
    raise exception 'POS permission is required.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.organizations org
    where org.id = p_organization_id
      and org.default_payor_type in ('philhealth_nbb', 'government_subsidized')
  ) then
    raise exception 'NBB_FACILITY_REQUIRED' using errcode = '42501';
  end if;

  -- Check explicit cashier department assignment first
  select dept.id into v_pharmacy_dept_id
  from public.staff_department_assignments sda
  join public.departments dept
    on dept.id = sda.department_id and dept.organization_id = sda.organization_id
  where sda.organization_id = p_organization_id
    and sda.user_id = auth.uid()
    and dept.active
    and (
      lower(dept.code) in ('pharmacy', 'pharm')
      or lower(dept.name) in ('pharmacy', 'pharm')
      or lower(dept.name) like '%pharmacy%'
    )
  limit 1;

  -- If cashier is explicitly assigned to a non-pharmacy department, reject
  if v_pharmacy_dept_id is null and exists (
    select 1
    from public.staff_department_assignments sda
    where sda.organization_id = p_organization_id
      and sda.user_id = auth.uid()
  ) then
    raise exception 'PHARMACY_ASSIGNMENT_REQUIRED' using errcode = '42501';
  end if;

  -- If cashier is not assigned to any department, fallback to clinic active pharmacy department
  if v_pharmacy_dept_id is null then
    select dept.id into v_pharmacy_dept_id
    from public.departments dept
    where dept.organization_id = p_organization_id
      and dept.active
      and (
        lower(dept.code) in ('pharmacy', 'pharm')
        or lower(dept.name) in ('pharmacy', 'pharm')
        or lower(dept.name) like '%pharmacy%'
      )
    order by dept.created_at asc
    limit 1;
  end if;

  if v_pharmacy_dept_id is null then
    raise exception 'PHARMACY_ASSIGNMENT_REQUIRED' using errcode = '42501';
  end if;

  return query
  select
    ds.id as stock_id,
    item.id as item_id,
    item.sku,
    item.name,
    item.unit_of_measure,
    ds.quantity as available_quantity,
    round(coalesce(item.unit_price, 0) * 100)::bigint as standard_unit_price_in_centavos,
    coalesce(item.currency, 'PHP') as currency
  from public.department_stock ds
  join public.inventory_items item
    on item.id = ds.item_id and item.organization_id = ds.organization_id
  where ds.organization_id = p_organization_id
    and ds.department_id = v_pharmacy_dept_id
    and item.active
    and ds.quantity > 0
  order by item.name asc;
end;
$$;

revoke all on function public.list_nbb_pharmacy_pos_catalog(uuid) from public, anon;
grant execute on function public.list_nbb_pharmacy_pos_catalog(uuid) to authenticated;

create or replace function public.create_nbb_pharmacy_pos_sale(
  p_organization_id uuid,
  p_items jsonb,
  p_patient_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pharmacy_dept_id uuid;
  v_trimmed_patient_name text;
  v_elem jsonb;
  v_item_id_text text;
  v_qty_text text;
  v_qty numeric;
  v_event_id uuid;
  v_sale_id uuid;
  v_invoice_id uuid;
  v_receipt_number text;
  v_standard_total_cents bigint := 0;
  v_distinct_item_count int;
  v_locked_count int;
  v_stock_rec record;
  v_item_unit_price_cents bigint;
  v_item_line_total_cents bigint;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if not public.has_organization_permission(p_organization_id, 'can_manage_pos') then
    raise exception 'POS permission is required.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.organizations org
    where org.id = p_organization_id
      and org.default_payor_type in ('philhealth_nbb', 'government_subsidized')
  ) then
    raise exception 'NBB_FACILITY_REQUIRED' using errcode = '42501';
  end if;

  v_trimmed_patient_name := btrim(coalesce(p_patient_name, ''));
  if length(v_trimmed_patient_name) = 0 then
    raise exception 'PATIENT_NAME_REQUIRED' using errcode = '22023';
  end if;

  -- Check explicit cashier department assignment first
  select dept.id into v_pharmacy_dept_id
  from public.staff_department_assignments sda
  join public.departments dept
    on dept.id = sda.department_id and dept.organization_id = sda.organization_id
  where sda.organization_id = p_organization_id
    and sda.user_id = auth.uid()
    and dept.active
    and (
      lower(dept.code) in ('pharmacy', 'pharm')
      or lower(dept.name) in ('pharmacy', 'pharm')
      or lower(dept.name) like '%pharmacy%'
    )
  limit 1;

  -- If cashier is explicitly assigned to a non-pharmacy department, reject
  if v_pharmacy_dept_id is null and exists (
    select 1
    from public.staff_department_assignments sda
    where sda.organization_id = p_organization_id
      and sda.user_id = auth.uid()
  ) then
    raise exception 'PHARMACY_ASSIGNMENT_REQUIRED' using errcode = '42501';
  end if;

  -- If cashier is not assigned to any department, fallback to clinic active pharmacy department
  if v_pharmacy_dept_id is null then
    select dept.id into v_pharmacy_dept_id
    from public.departments dept
    where dept.organization_id = p_organization_id
      and dept.active
      and (
        lower(dept.code) in ('pharmacy', 'pharm')
        or lower(dept.name) in ('pharmacy', 'pharm')
        or lower(dept.name) like '%pharmacy%'
      )
    order by dept.created_at asc
    limit 1;
  end if;

  if v_pharmacy_dept_id is null then
    raise exception 'PHARMACY_ASSIGNMENT_REQUIRED' using errcode = '42501';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'INVALID_CART_ITEM' using errcode = '22023';
  end if;

  -- Validate every cart element format and positive whole integer quantity
  for v_elem in select value from jsonb_array_elements(p_items) loop
    v_item_id_text := v_elem ->> 'item_id';
    if v_item_id_text is null or v_item_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'INVALID_CART_ITEM' using errcode = '22023';
    end if;

    v_qty_text := v_elem ->> 'quantity';
    if v_qty_text is null or v_qty_text !~ '^[0-9]+(\.[0-9]+)?$' then
      raise exception 'INVALID_CART_ITEM' using errcode = '22023';
    end if;

    v_qty := v_qty_text::numeric;
    if v_qty <= 0 or v_qty <> floor(v_qty) then
      raise exception 'INVALID_CART_ITEM' using errcode = '22023';
    end if;
  end loop;

  -- Aggregate cart by item_id (normalizes duplicate cart lines)
  create temp table _nbb_cart on commit drop as
  select (elem->>'item_id')::uuid as item_id, sum((elem->>'quantity')::numeric) as quantity
  from jsonb_array_elements(p_items) elem
  group by (elem->>'item_id')::uuid;

  select count(*) into v_distinct_item_count from _nbb_cart;
  if v_distinct_item_count = 0 then
    raise exception 'INVALID_CART_ITEM' using errcode = '22023';
  end if;

  -- Lock Pharmacy department_stock rows in stable item order to eliminate deadlock risks
  create temp table _nbb_locked_items on commit drop as
  select
    ds.id as stock_id,
    ds.item_id,
    ds.quantity as available_quantity,
    cart.quantity as requested_quantity,
    item.name as item_name,
    item.unit_price,
    item.currency
  from _nbb_cart cart
  join public.department_stock ds
    on ds.item_id = cart.item_id
    and ds.department_id = v_pharmacy_dept_id
    and ds.organization_id = p_organization_id
  join public.inventory_items item
    on item.id = ds.item_id
    and item.organization_id = p_organization_id
    and item.active
  order by cart.item_id asc
  for update of ds;

  select count(*) into v_locked_count from _nbb_locked_items;
  if v_locked_count <> v_distinct_item_count then
    raise exception 'INVALID_CART_ITEM' using errcode = '22023';
  end if;

  -- Check stock sufficiency across all requested items
  if exists (
    select 1 from _nbb_locked_items
    where available_quantity < requested_quantity
  ) then
    raise exception 'INSUFFICIENT_PHARMACY_STOCK' using errcode = '22023';
  end if;

  -- Compute total standard charges in integer centavos
  select coalesce(sum(
    requested_quantity::bigint * round(coalesce(unit_price, 0) * 100)::bigint
  ), 0)::bigint
  into v_standard_total_cents
  from _nbb_locked_items;

  -- 1. Create Billing Event
  insert into public.billing_events (
    organization_id, payor_type, billing_mode, status, finalized_at, finalized_by
  ) values (
    p_organization_id, 'philhealth_nbb', 'nbb', 'finalized', now(), auth.uid()
  ) returning id into v_event_id;

  -- 2. Create POS Sale (mandatory patient name, zero payment required)
  v_receipt_number := public.generate_receipt_number(p_organization_id);
  insert into public.pos_sales (
    organization_id, billing_event_id, cashier_user_id, status,
    customer_name, receipt_number, completed_at, standard_total_in_centavos
  ) values (
    p_organization_id, v_event_id, auth.uid(), 'completed',
    v_trimmed_patient_name, v_receipt_number, now(), v_standard_total_cents
  ) returning id into v_sale_id;

  -- 3. Create Invoice (zero patient balance, fully paid/written-off status)
  insert into public.invoices (
    organization_id, billing_event_id, patient_id, invoice_number, status,
    subtotal, total_due, amount_paid, balance_due, issued_at, paid_at,
    standard_total_in_centavos, patient_balance_due_in_centavos
  ) values (
    p_organization_id, v_event_id, null,
    public.generate_invoice_number(p_organization_id),
    'paid',
    round(v_standard_total_cents::numeric / 100.0, 2),
    0, 0, 0,
    now(), now(),
    v_standard_total_cents, 0
  ) returning id into v_invoice_id;

  -- 4. Record Line Items, Decrement Pharmacy Stock, and Log Movements
  for v_stock_rec in select * from _nbb_locked_items order by item_id asc loop
    v_item_unit_price_cents := round(coalesce(v_stock_rec.unit_price, 0) * 100)::bigint;
    v_item_line_total_cents := v_item_unit_price_cents * v_stock_rec.requested_quantity::bigint;

    insert into public.billing_line_items (
      organization_id, billing_event_id, invoice_id, source_type, source_id,
      description, quantity, unit_price, currency, billing_mode, payor_type,
      payment_status, standard_unit_price_in_centavos, standard_line_total_in_centavos
    ) values (
      p_organization_id, v_event_id, v_invoice_id, 'pos_item', v_stock_rec.item_id,
      v_stock_rec.item_name, v_stock_rec.requested_quantity, v_stock_rec.unit_price,
      coalesce(v_stock_rec.currency, 'PHP'), 'nbb', 'philhealth_nbb',
      'written_off', v_item_unit_price_cents, v_item_line_total_cents
    );

    update public.department_stock
    set quantity = quantity - v_stock_rec.requested_quantity
    where id = v_stock_rec.stock_id
      and quantity >= v_stock_rec.requested_quantity;

    if not found then
      raise exception 'INSUFFICIENT_PHARMACY_STOCK' using errcode = '22023';
    end if;

    insert into public.inventory_stock_movements (
      organization_id, stock_id, item_id, department_id,
      movement_type, quantity_delta, reason, recorded_by
    ) values (
      p_organization_id, v_stock_rec.stock_id, v_stock_rec.item_id, v_pharmacy_dept_id,
      'usage', -v_stock_rec.requested_quantity, 'NBB pharmacy POS sale', auth.uid()
    );
  end loop;

  -- Audit billing transitions
  perform public.log_billing_transition(
    p_organization_id, 'billing_event', v_event_id, null, 'finalized', 'NBB pharmacy POS sale'
  );
  perform public.log_billing_transition(
    p_organization_id, 'invoice', v_invoice_id, null, 'paid', 'NBB write-off'
  );

  return jsonb_build_object(
    'billing_event_id', v_event_id,
    'pos_sale_id', v_sale_id,
    'invoice_id', v_invoice_id,
    'receipt_number', v_receipt_number,
    'standard_total_in_centavos', v_standard_total_cents,
    'patient_balance_due_in_centavos', 0
  );
end;
$$;

revoke all on function public.create_nbb_pharmacy_pos_sale(uuid, jsonb, text) from public, anon;
grant execute on function public.create_nbb_pharmacy_pos_sale(uuid, jsonb, text) to authenticated;
