-- Rollback: revoke authenticated execution and restore the preceding RPC only
-- after all Operations Log clients using this contract have retired.
-- Migration: Create list_clinic_operations_logs RPC for clinic-wide administrative monitoring

create or replace function public.list_clinic_operations_logs(
  p_organization_id uuid,
  p_module text default null,
  p_action text default null,
  p_actor_id uuid default null,
  p_start_time timestamptz default null,
  p_end_time timestamptz default null,
  p_search text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  id bigint,
  occurred_at timestamptz,
  actor_id uuid,
  actor_name text,
  actor_type text,
  module text,
  action text,
  table_name text,
  record_id uuid,
  description text,
  metadata jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if p_organization_id is null then
    raise exception 'Organization is required.' using errcode = '22023';
  end if;

  -- Enforce permission gate: must be superadmin, admin/owner, or have can_view_audit_log permission
  if not (
    public.is_superadmin()
    or public.has_organization_role(p_organization_id, array['admin', 'owner'])
    or public.has_organization_permission(p_organization_id, 'can_view_audit_log')
  ) then
    raise exception 'Permission denied: can_view_audit_log required.' using errcode = '42501';
  end if;

  return query
  with categorized_logs as (
    select
      log.id,
      log.occurred_at,
      log.actor_id,
      coalesce(
        nullif(practitioner.name ->> 'text', ''),
        nullif(user_account.raw_user_meta_data ->> 'display_name', ''),
        nullif(user_account.raw_user_meta_data ->> 'name', ''),
        user_account.email,
        case when log.actor_type = 'system' then 'System' else 'Unknown Operator' end
      ) as actor_name,
      log.actor_type,
      case
        when log.table_name in ('invoices', 'payments', 'payment_allocations', 'billing_events', 'billing_line_items', 'pos_sales', 'claims', 'coverages', 'practitioner_service_fees', 'practitioner_payout_settings', 'doctor_payouts') then 'billing'
        when log.table_name in ('appointments', 'appointment_slots', 'encounters', 'room_assignments', 'clinic_rooms', 'teleconsult_rooms') then 'appointments'
        when log.table_name in ('pharmacy_prescription_orders', 'pharmacy_prescription_order_lines', 'pharmacy_prescription_order_events', 'medication_requests', 'inventory_pos_settings') then 'pharmacy'
        when log.table_name in ('observations', 'pmr_document_snapshots', 'pmr_share_links', 'conditions', 'procedures', 'allergy_intolerances', 'immunizations') then 'clinical'
        when log.table_name in ('diagnostic_reports', 'service_requests', 'laboratory_services') then 'diagnostics'
        when log.table_name in ('inventory_items', 'inventory_batches', 'inventory_lots', 'inventory_movements', 'inventory_adjustments', 'inventory_requisitions', 'inventory_requisition_items', 'inventory_usage_batch_consumptions', 'inventory_categories', 'inventory_holds') then 'inventory'
        else 'governance'
      end as computed_module,
      log.action,
      log.table_name,
      log.record_id,
      case
        when log.table_name = 'appointments' and log.action = 'insert' then 'Appointment booked'
        when log.table_name = 'appointments' and log.action = 'update' then 'Appointment updated / rescheduled'
        when log.table_name = 'appointments' and log.action = 'delete' then 'Appointment cancelled'
        when log.table_name = 'invoices' and log.action = 'insert' then 'Invoice generated'
        when log.table_name = 'invoices' and log.action = 'update' then 'Invoice updated'
        when log.table_name = 'payments' and log.action = 'insert' then 'Cashier payment received'
        when log.table_name = 'pos_sales' and log.action = 'insert' then 'Pharmacy POS sale processed'
        when log.table_name = 'pharmacy_prescription_orders' and log.action = 'insert' then 'Prescription queued for pharmacy'
        when log.table_name = 'pharmacy_prescription_orders' and log.action = 'update' then 'Prescription order updated / dispensed'
        when log.table_name = 'medication_requests' and log.action = 'insert' then 'Prescription written by provider'
        when log.table_name = 'observations' and log.action = 'insert' then 'Vital signs / triage observation recorded'
        when log.table_name = 'encounters' and log.action = 'insert' then 'Consultation encounter started'
        when log.table_name = 'encounters' and log.action = 'update' then 'Consultation encounter finalized'
        when log.table_name = 'diagnostic_reports' and log.action = 'insert' then 'Laboratory result uploaded'
        when log.table_name = 'service_requests' and log.action = 'insert' then 'Diagnostic test ordered'
        when log.table_name = 'inventory_movements' and log.action = 'insert' then 'Stock movement logged'
        when log.table_name = 'inventory_adjustments' and log.action = 'insert' then 'Inventory adjustment recorded'
        when log.table_name = 'inventory_requisitions' and log.action = 'insert' then 'Department supply requisition submitted'
        when log.table_name = 'patients' and log.action = 'insert' then 'Patient registered'
        when log.table_name = 'patients' and log.action = 'update' then 'Patient demographic record updated'
        when log.table_name = 'claims' and log.action = 'insert' then 'HMO / PhilHealth claim filed'
        when log.table_name = 'claims' and log.action = 'update' then 'HMO claim updated'
        else initcap(log.action) || ' on ' || replace(log.table_name, '_', ' ')
      end as computed_description,
      log.metadata
    from public.audit_log log
    left join auth.users user_account on user_account.id = log.actor_id and log.actor_type = 'registered_user'
    left join public.practitioners practitioner on practitioner.auth_user_id = log.actor_id and practitioner.organization_id = p_organization_id
    where log.organization_id = p_organization_id
  )
  select
    c.id,
    c.occurred_at,
    c.actor_id,
    c.actor_name,
    c.actor_type,
    c.computed_module as module,
    c.action,
    c.table_name,
    c.record_id,
    c.computed_description as description,
    c.metadata
  from categorized_logs c
  where (p_module is null or c.computed_module = p_module)
    and (p_action is null or c.action = lower(p_action))
    and (p_actor_id is null or c.actor_id = p_actor_id)
    and (p_start_time is null or c.occurred_at >= p_start_time)
    and (p_end_time is null or c.occurred_at <= p_end_time)
    and (
      p_search is null
      or c.actor_name ilike ('%' || p_search || '%')
      or c.computed_description ilike ('%' || p_search || '%')
      or c.table_name ilike ('%' || p_search || '%')
      or cast(c.record_id as text) ilike ('%' || p_search || '%')
    )
  order by c.occurred_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.list_clinic_operations_logs(uuid, text, text, uuid, timestamptz, timestamptz, text, integer, integer) from public;
grant execute on function public.list_clinic_operations_logs(uuid, text, text, uuid, timestamptz, timestamptz, text, integer, integer) to authenticated;
