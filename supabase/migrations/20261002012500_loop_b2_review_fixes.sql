-- Loop B-2 review fixes: preserve zero declared-fee payouts, keep fee-model
-- changes auditable, and restrict professional-fee invoice detail to parties
-- with a legitimate billing, service-management, patient, or practitioner role.
-- Rollback: restore the prior payout function and billing-line policy only if
-- professional-fee line visibility is intentionally widened again.

create or replace function public.audit_organization_fee_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.organization_settings%rowtype;
begin
  v_settings := coalesce(new, old);

  insert into public.audit_log (
    organization_id, actor_id, actor_type, action, table_name, record_id, metadata
  ) values (
    v_settings.organization_id,
    auth.uid(),
    case when auth.uid() is null then 'system' else 'registered_user' end,
    lower(tg_op),
    tg_table_name,
    v_settings.organization_id,
    jsonb_build_object(
      'fee_model', v_settings.fee_model,
      'previous_fee_model', case when tg_op = 'UPDATE' then old.fee_model else null end
    )
  );

  return coalesce(new, old);
end;
$$;

drop trigger if exists organization_settings_fee_model_audit on public.organization_settings;
create trigger organization_settings_fee_model_audit
  after insert or update on public.organization_settings
  for each row execute function public.audit_organization_fee_settings();

create or replace function public.can_view_professional_fee_line(
  p_organization_id uuid,
  p_billing_event_id uuid,
  p_service_practitioner_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    public.has_organization_permission(p_organization_id, 'can_manage_billing')
    or public.has_organization_permission(p_organization_id, 'can_manage_services')
    or exists (
      select 1
      from public.billing_events as event
      join public.patients as patient on patient.id = event.patient_id
      where event.id = p_billing_event_id
        and patient.auth_user_id = auth.uid()
    )
    or exists (
      select 1
      from public.service_practitioners as membership
      join public.practitioner_roles as practitioner_role
        on practitioner_role.id = membership.practitioner_role_id
      join public.practitioners as practitioner
        on practitioner.id = practitioner_role.practitioner_id
      where membership.id = p_service_practitioner_id
        and membership.organization_id = p_organization_id
        and practitioner.auth_user_id = auth.uid()
    )
  );
$$;

revoke all on function public.can_view_professional_fee_line(uuid, uuid, uuid)
  from public, anon;
grant execute on function public.can_view_professional_fee_line(uuid, uuid, uuid)
  to authenticated;

drop policy if exists billing_line_items_select on public.billing_line_items;
create policy billing_line_items_select on public.billing_line_items
  for select to authenticated
  using (
    (
      source_type <> 'professional_fee'
      and public.can_access_organization(organization_id)
    )
    or (
      source_type = 'professional_fee'
      and public.can_view_professional_fee_line(
        organization_id, billing_event_id, source_id
      )
    )
    or exists (
      select 1
      from public.billing_events as event
      join public.patients as patient on patient.id = event.patient_id
      where event.id = billing_event_id
        and patient.auth_user_id = auth.uid()
    )
  );

create or replace function public.get_billing_line_items(p_billing_event_id uuid)
returns table (
  id uuid, source_type text, source_id uuid, description text,
  quantity numeric, unit_price numeric, currency text, line_total numeric,
  payment_status public.billing_line_payment_status,
  billing_mode public.billing_mode,
  payor_type public.payor_type,
  tagged_at timestamptz,
  void_reason text
)
language sql stable security definer set search_path = '' as $$
  select li.id, li.source_type, li.source_id, li.description,
    li.quantity, li.unit_price, li.currency, li.line_total,
    li.payment_status, li.billing_mode, li.payor_type, li.tagged_at, li.void_reason
  from public.billing_line_items as li
  join public.billing_events as event on event.id = li.billing_event_id
  where li.billing_event_id = p_billing_event_id
    and (
      (li.source_type <> 'professional_fee' and public.can_access_organization(event.organization_id))
      or (li.source_type = 'professional_fee' and public.can_view_professional_fee_line(
        li.organization_id, li.billing_event_id, li.source_id
      ))
      or exists (
        select 1 from public.patients as patient
        where patient.id = event.patient_id and patient.auth_user_id = auth.uid()
      )
    )
  order by li.created_at;
$$;

create or replace function public.get_invoice_detail(p_invoice_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'invoice', jsonb_build_object(
      'id', invoice.id, 'invoice_number', invoice.invoice_number, 'status', invoice.status,
      'patient_name', coalesce(patient.name ->> 'text', 'Walk-in'),
      'subtotal', invoice.subtotal, 'total_due', invoice.total_due,
      'amount_paid', invoice.amount_paid, 'balance_due', invoice.balance_due,
      'issued_at', invoice.issued_at, 'paid_at', invoice.paid_at,
      'billing_mode', event.billing_mode, 'payor_type', event.payor_type,
      'billing_mode_source', event.billing_mode_source, 'billing_event_id', event.id
    ),
    'line_items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', line.id, 'source_type', line.source_type, 'description', line.description,
        'quantity', line.quantity, 'unit_price', line.unit_price, 'line_total', line.line_total,
        'payment_status', line.payment_status, 'tagged_at', line.tagged_at,
        'void_reason', line.void_reason
      ) order by line.created_at)
      from public.billing_line_items as line
      where line.invoice_id = invoice.id
        and (
          line.source_type <> 'professional_fee'
          or public.can_view_professional_fee_line(
            line.organization_id, line.billing_event_id, line.source_id
          )
        )
    ), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object(
      'id', payment.id, 'amount', payment.amount, 'method', payment.method,
      'status', payment.status, 'reference_number', payment.reference_number,
      'created_at', payment.created_at, 'confirmed_at', payment.confirmed_at
    ) order by payment.created_at desc) from public.payments as payment where payment.invoice_id = invoice.id), '[]'::jsonb)
  ) into v_result
  from public.invoices as invoice
  join public.billing_events as event on event.id = invoice.billing_event_id
  left join public.patients as patient on patient.id = invoice.patient_id
  where invoice.id = p_invoice_id
    and (
      public.has_organization_permission(invoice.organization_id, 'can_view_billing')
      or public.has_organization_permission(invoice.organization_id, 'can_manage_billing')
    );

  if v_result is null then
    raise exception 'Invoice not found or access denied.' using errcode = 'P0002';
  end if;

  return v_result;
end;
$$;

create or replace function public.refresh_doctor_payout(p_encounter_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_encounter public.encounters%rowtype;
  selected_event public.billing_events%rowtype;
  payout_total numeric(14,2);
  payout_currency text;
  has_professional_fee boolean;
  share_bps integer;
begin
  select * into selected_encounter
  from public.encounters
  where id = p_encounter_id;
  if selected_encounter.id is null or selected_encounter.practitioner_role_id is null then
    return;
  end if;

  select * into selected_event
  from public.billing_events
  where encounter_id = p_encounter_id
    and status <> 'cancelled'
  order by finalized_at desc nulls last, created_at desc
  limit 1;
  if selected_encounter.status <> 'finished'
    or selected_event.id is null
    or selected_event.status <> 'finalized' then
    return;
  end if;

  select
    exists (
      select 1 from public.billing_line_items
      where billing_event_id = selected_event.id
        and source_type = 'professional_fee'
    ),
    coalesce(sum(line_total) filter (where source_type = 'professional_fee'), 0),
    coalesce(min(currency) filter (where source_type = 'professional_fee'), 'PHP')
  into has_professional_fee, payout_total, payout_currency
  from public.billing_line_items
  where billing_event_id = selected_event.id;

  -- Fixed-rate and historical invoices lack a professional-fee line. A present
  -- zero fee is deliberate and must not fall back to the facility service price.
  if not has_professional_fee then
    select coalesce(sum(line_total), 0), coalesce(min(currency), 'PHP')
    into payout_total, payout_currency
    from public.billing_line_items
    where billing_event_id = selected_event.id
      and source_type = 'clinic_service';
    if payout_total <= 0 then
      return;
    end if;
  elsif payout_total < 0 then
    return;
  end if;

  select coalesce((
    select setting.share_basis_points
    from public.practitioner_payout_settings as setting
    where setting.organization_id = selected_encounter.organization_id
      and setting.practitioner_role_id = selected_encounter.practitioner_role_id
      and setting.active
  ), 10000) into share_bps;

  insert into public.doctor_payouts (
    organization_id, practitioner_role_id, encounter_id, billing_event_id,
    gross_service_amount, share_basis_points, payout_amount, currency
  ) values (
    selected_encounter.organization_id, selected_encounter.practitioner_role_id,
    selected_encounter.id, selected_event.id, payout_total, share_bps,
    round(payout_total * share_bps / 10000.0, 2), payout_currency
  ) on conflict (encounter_id) do update set
    billing_event_id = excluded.billing_event_id,
    gross_service_amount = excluded.gross_service_amount,
    share_basis_points = excluded.share_basis_points,
    payout_amount = excluded.payout_amount,
    currency = excluded.currency,
    status = 'pending',
    paid_at = null,
    paid_by = null,
    payment_reference = null
  where public.doctor_payouts.status in ('pending', 'void');
end;
$$;

revoke all on function public.refresh_doctor_payout(uuid) from public, anon, authenticated;
