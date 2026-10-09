-- Include the human-readable inventory SKU with each queue line while keeping
-- the internal item UUID available for the review and dispense transactions.
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
    'lines', (
      select coalesce(jsonb_agg(
        to_jsonb(line_row) || jsonb_build_object('item_sku', item.sku)
        order by line_row.created_at
      ), '[]'::jsonb)
      from public.pharmacy_prescription_order_lines line_row
      left join public.inventory_items item
        on item.id = line_row.item_id
        and item.organization_id = line_row.organization_id
      where line_row.order_id = order_row.id
    ),
    'events', (
      select coalesce(jsonb_agg(to_jsonb(event_row) order by event_row.created_at), '[]'::jsonb)
      from public.pharmacy_prescription_order_events event_row
      where event_row.order_id = order_row.id
    )
  ) order by order_row.submitted_at)
  from public.pharmacy_prescription_orders order_row
  where order_row.organization_id = p_organization_id
    and (p_status is null or p_status = '' or order_row.status = p_status)
    and (v_can_dispense or order_row.submitted_by = auth.uid())), '[]'::jsonb);
end;
$$;

revoke all on function public.list_pharmacy_prescription_queue(uuid, text) from public, anon;
grant execute on function public.list_pharmacy_prescription_queue(uuid, text) to authenticated;
