-- Finalize standalone Pharmacy prescription dispensing as a reportable sale.
-- The completion RPC remains the single stock-mutating transaction: it records
-- inventory usage once, then creates the matching sale/receipt/invoice.

alter table public.pharmacy_prescription_orders
  add column if not exists pos_sale_id uuid references public.pos_sales(id),
  add column if not exists invoice_id uuid references public.invoices(id),
  add column if not exists receipt_number text;

-- Keep the sale-level zero-balance snapshot alongside the invoice snapshot.
-- This also makes the existing NBB receipt contract schema-complete.
alter table public.pos_sales
  add column if not exists patient_balance_due_in_centavos bigint
    check (patient_balance_due_in_centavos is null or patient_balance_due_in_centavos >= 0);

create unique index if not exists pharmacy_prescription_orders_pos_sale_uidx
  on public.pharmacy_prescription_orders (pos_sale_id)
  where pos_sale_id is not null;

create index if not exists pharmacy_prescription_orders_receipt_idx
  on public.pharmacy_prescription_orders (organization_id, receipt_number)
  where receipt_number is not null;

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
    'pos_sale_id', order_row.pos_sale_id,
    'invoice_id', order_row.invoice_id,
    'receipt_number', order_row.receipt_number,
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

revoke all on function public.list_pharmacy_prescription_queue(uuid, text) from public, anon;
grant execute on function public.list_pharmacy_prescription_queue(uuid, text) to authenticated;

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
  v_item public.inventory_items%rowtype;
  v_outcome jsonb;
  v_action text;
  v_qty numeric;
  v_usage_id uuid;
  v_pharmacy_dept_id uuid;
  v_stock_id uuid;
  v_all_terminal boolean;
  v_any_dispensed boolean;
  v_next_status text;
  v_payor_type public.payor_type;
  v_billing_mode public.billing_mode;
  v_event_id uuid;
  v_sale_id uuid;
  v_invoice_id uuid;
  v_receipt_number text;
  v_standard_total_cents bigint := 0;
  v_patient_balance_due_cents bigint := 0;
  v_line_price_cents bigint;
  v_line_total_cents bigint;
begin
  select * into v_order
  from public.pharmacy_prescription_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Pharmacy prescription order not found.' using errcode = 'P0002';
  end if;

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

  -- A retry after a successful completion returns the same immutable sale.
  if v_order.pos_sale_id is not null then
    select sale.billing_event_id, sale.id, sale.receipt_number,
           sale.standard_total_in_centavos,
           sale.patient_balance_due_in_centavos
    into v_event_id, v_sale_id, v_receipt_number, v_standard_total_cents,
         v_patient_balance_due_cents
    from public.pos_sales sale
    where sale.id = v_order.pos_sale_id;

    return jsonb_build_object(
      'order_id', v_order.id,
      'status', v_order.status,
      'completed', v_order.status = 'completed',
      'billing_event_id', v_event_id,
      'pos_sale_id', v_sale_id,
      'invoice_id', v_order.invoice_id,
      'receipt_number', v_receipt_number,
      'billing_mode', (select event.billing_mode from public.billing_events event where event.id = v_event_id),
      'standard_total_in_centavos', coalesce(v_standard_total_cents, 0),
      'patient_balance_due_in_centavos', coalesce(v_patient_balance_due_cents, 0)
    );
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
    if not found then
      raise exception 'Prescription line not found.' using errcode = 'P0002';
    end if;

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
      if v_stock_id is null then
        raise exception 'Pharmacy stock is unavailable.' using errcode = '22023';
      end if;

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
    )
  into v_all_terminal, v_any_dispensed;

  v_next_status := case
    when v_all_terminal then 'completed'
    when v_any_dispensed then 'partially_dispensed'
    else 'under_pharmacist_review'
  end;

  update public.pharmacy_prescription_orders
  set status = v_next_status,
      completed_by = case when v_all_terminal then auth.uid() else completed_by end,
      completed_at = case when v_all_terminal then now() else completed_at end,
      updated_at = now()
  where id = v_order.id;

  insert into public.pharmacy_prescription_order_events (organization_id, order_id, status, actor_id)
  values (v_order.organization_id, v_order.id, v_next_status, auth.uid());

  -- Only a terminal standalone prescription creates the sale. Linked legacy
  -- orders retain their established encounter billing path.
  if v_all_terminal and v_any_dispensed
     and v_order.patient_id is null and v_order.encounter_id is null then
    select org.default_payor_type into v_payor_type
    from public.organizations org
    where org.id = v_order.organization_id;

    v_billing_mode := case
      when v_payor_type in ('philhealth_nbb', 'government_subsidized') then 'nbb'::public.billing_mode
      else 'standard'::public.billing_mode
    end;

    select coalesce(sum(
      line.dispensed_quantity * coalesce(
        line.unit_price_in_centavos,
        round(coalesce(item.selling_price, item.unit_price, 0) * 100)::bigint
      )
    ), 0)::bigint
    into v_standard_total_cents
    from public.pharmacy_prescription_order_lines line
    join public.inventory_items item on item.id = line.item_id and item.organization_id = line.organization_id
    where line.order_id = v_order.id
      and line.dispensed_quantity > 0;

    v_patient_balance_due_cents := case when v_billing_mode = 'nbb' then 0 else v_standard_total_cents end;
    v_receipt_number := public.generate_receipt_number(v_order.organization_id);

    insert into public.billing_events (
      organization_id, patient_id, payor_type, billing_mode, billing_mode_source,
      status, finalized_at, finalized_by, notes
    ) values (
      v_order.organization_id, null, coalesce(v_payor_type, 'self_pay'::public.payor_type),
      v_billing_mode, 'pharmacy_prescription_completion', 'finalized', now(), auth.uid(),
      concat('Pharmacy prescription ', coalesce(v_order.physical_prescription_reference, v_order.id::text))
    ) returning id into v_event_id;

    insert into public.pos_sales (
      organization_id, billing_event_id, cashier_user_id, status, customer_name,
      receipt_number, completed_at, standard_total_in_centavos, patient_balance_due_in_centavos
    ) values (
      v_order.organization_id, v_event_id, auth.uid(), 'completed',
      coalesce(nullif(btrim(v_order.patient_reference), ''), 'Prescription patient'),
      v_receipt_number, now(), v_standard_total_cents, v_patient_balance_due_cents
    ) returning id into v_sale_id;

    insert into public.invoices (
      organization_id, billing_event_id, patient_id, invoice_number, status,
      subtotal, total_due, amount_paid, balance_due, issued_at, paid_at,
      standard_total_in_centavos, patient_balance_due_in_centavos
    ) values (
      v_order.organization_id, v_event_id, null,
      public.generate_invoice_number(v_order.organization_id),
      case when v_billing_mode = 'nbb' then 'paid'::public.invoice_status else 'issued'::public.invoice_status end,
      round(v_standard_total_cents::numeric / 100.0, 2),
      round(v_patient_balance_due_cents::numeric / 100.0, 2),
      case when v_billing_mode = 'nbb' then round(v_standard_total_cents::numeric / 100.0, 2) else 0 end,
      round(v_patient_balance_due_cents::numeric / 100.0, 2),
      now(), case when v_billing_mode = 'nbb' then now() else null end,
      v_standard_total_cents, v_patient_balance_due_cents
    ) returning id into v_invoice_id;

    for v_line in
      select line.*
      from public.pharmacy_prescription_order_lines line
      where line.order_id = v_order.id and line.dispensed_quantity > 0
      order by line.created_at
    loop
      select coalesce(
        v_line.unit_price_in_centavos,
        round(coalesce(item.selling_price, item.unit_price, 0) * 100)::bigint
      ) into v_line_price_cents
      from public.inventory_items item
      where item.id = v_line.item_id and item.organization_id = v_line.organization_id;
      v_line_total_cents := v_line_price_cents * v_line.dispensed_quantity::bigint;

      insert into public.billing_line_items (
        organization_id, billing_event_id, invoice_id, source_type, source_id,
        description, quantity, unit_price, currency, billing_mode, payor_type,
        payment_status, standard_unit_price_in_centavos, standard_line_total_in_centavos,
        tagged_by, tagged_at
      ) values (
        v_order.organization_id, v_event_id, v_invoice_id, 'pos_item', v_line.item_id,
        v_line.original_medication, v_line.dispensed_quantity,
        round(v_line_price_cents::numeric / 100.0, 2), 'PHP', v_billing_mode,
        coalesce(v_payor_type, 'self_pay'::public.payor_type),
        case when v_billing_mode = 'nbb' then 'written_off'::public.billing_line_payment_status else 'unpaid'::public.billing_line_payment_status end,
        v_line_price_cents, v_line_total_cents, auth.uid(), now()
      );
    end loop;

    update public.pharmacy_prescription_orders
    set pos_sale_id = v_sale_id,
        invoice_id = v_invoice_id,
        receipt_number = v_receipt_number,
        updated_at = now()
    where id = v_order.id;

    perform public.log_billing_transition(
      v_order.organization_id, 'billing_event', v_event_id, null, 'finalized',
      'Pharmacy prescription sale'
    );
    perform public.log_billing_transition(
      v_order.organization_id, 'invoice', v_invoice_id, null,
      case when v_billing_mode = 'nbb' then 'paid' else 'issued' end,
      case when v_billing_mode = 'nbb' then 'Pharmacy prescription NBB write-off' else 'Pharmacy prescription invoice' end
    );
  end if;

  return jsonb_build_object(
    'order_id', v_order.id,
    'status', v_next_status,
    'completed', v_all_terminal,
    'billing_event_id', v_event_id,
    'pos_sale_id', v_sale_id,
    'invoice_id', v_invoice_id,
    'receipt_number', v_receipt_number,
    'billing_mode', v_billing_mode,
    'standard_total_in_centavos', coalesce(v_standard_total_cents, 0),
    'patient_balance_due_in_centavos', coalesce(v_patient_balance_due_cents, 0)
  );
end;
$$;

revoke all on function public.complete_pharmacy_prescription_order(uuid, jsonb) from public, anon;
grant execute on function public.complete_pharmacy_prescription_order(uuid, jsonb) to authenticated;
