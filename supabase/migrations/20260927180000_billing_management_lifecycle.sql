-- Billing management lifecycle
-- Extends the existing financial loop in place. Appointment reservations,
-- charges, inventory usage, invoices, and payment confirmation remain
-- organization-scoped and auditable.

create type public.billing_mode as enum ('standard', 'nbb');
create type public.billing_line_payment_status as enum ('unpaid', 'paid', 'written_off', 'voided');
create type public.inventory_financial_state as enum ('tagged', 'paid', 'written_off', 'voided');

alter table public.clinic_services
  add column if not exists nbb_eligible boolean;

alter table public.appointments
  add column if not exists billing_mode public.billing_mode,
  add column if not exists billing_mode_source text,
  add column if not exists billing_coverage_id uuid references public.coverages(id),
  add column if not exists payment_due_at timestamptz,
  add column if not exists slot_confirmed_at timestamptz;

alter table public.encounters
  add column if not exists billing_mode public.billing_mode,
  add column if not exists billing_mode_source text,
  add column if not exists billing_coverage_id uuid references public.coverages(id);

alter table public.billing_events
  add column if not exists appointment_id uuid references public.appointments(id),
  add column if not exists billing_mode public.billing_mode,
  add column if not exists billing_mode_source text;

alter table public.billing_line_items
  add column if not exists invoice_id uuid references public.invoices(id),
  add column if not exists billing_mode public.billing_mode,
  add column if not exists payor_type public.payor_type,
  add column if not exists payment_status public.billing_line_payment_status not null default 'unpaid',
  add column if not exists tagged_by uuid references auth.users(id),
  add column if not exists tagged_at timestamptz,
  add column if not exists voided_by uuid references auth.users(id),
  add column if not exists voided_at timestamptz,
  add column if not exists void_reason text;

create unique index if not exists billing_events_one_active_per_appointment
  on public.billing_events (appointment_id)
  where appointment_id is not null and status <> 'cancelled';
create index if not exists appointments_payment_due_idx
  on public.appointments (status, payment_due_at)
  where status = 'pending';
create index if not exists billing_line_items_invoice_idx
  on public.billing_line_items (invoice_id, payment_status);

create table public.inventory_usage_financial_ledger (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  usage_id uuid not null unique references public.inventory_usages(id),
  billing_line_item_id uuid not null unique references public.billing_line_items(id),
  state public.inventory_financial_state not null default 'tagged',
  quantity numeric(14,3) not null check (quantity > 0),
  unbilled_qty numeric(14,3) not null check (unbilled_qty >= 0),
  paid_qty numeric(14,3) not null default 0 check (paid_qty >= 0),
  tagged_by uuid not null references auth.users(id),
  tagged_at timestamptz not null default now(),
  settled_by uuid references auth.users(id),
  settled_at timestamptz,
  voided_by uuid references auth.users(id),
  voided_at timestamptz,
  void_reason text,
  check (unbilled_qty + paid_qty <= quantity)
);

create table public.invoice_qr_tokens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  appointment_id uuid references public.appointments(id),
  encounter_id uuid references public.encounters(id),
  invoice_id uuid not null references public.invoices(id),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create table public.billing_state_transitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  entity_type text not null check (entity_type in ('appointment', 'billing_event', 'invoice', 'payment', 'line_item', 'inventory_usage')),
  entity_id uuid not null,
  from_state text,
  to_state text not null,
  reason text,
  actor_user_id uuid references auth.users(id),
  occurred_at timestamptz not null default now()
);

create index inventory_usage_financial_ledger_org_state_idx
  on public.inventory_usage_financial_ledger (organization_id, state, tagged_at desc);
create index invoice_qr_tokens_invoice_idx
  on public.invoice_qr_tokens (invoice_id, expires_at desc);
create index billing_state_transitions_entity_idx
  on public.billing_state_transitions (organization_id, entity_type, entity_id, occurred_at desc);

alter table public.inventory_usage_financial_ledger enable row level security;
alter table public.invoice_qr_tokens enable row level security;
alter table public.billing_state_transitions enable row level security;

create policy inventory_usage_financial_ledger_select on public.inventory_usage_financial_ledger
  for select to authenticated using (
    public.has_organization_permission(organization_id, 'can_view_billing')
    or public.has_organization_permission(organization_id, 'can_manage_billing')
    or public.has_organization_permission(organization_id, 'can_manage_inventory')
  );
create policy invoice_qr_tokens_select on public.invoice_qr_tokens
  for select to authenticated using (
    public.has_organization_permission(organization_id, 'can_view_billing')
    or public.has_organization_permission(organization_id, 'can_manage_billing')
  );
create policy billing_state_transitions_select on public.billing_state_transitions
  for select to authenticated using (
    public.has_organization_permission(organization_id, 'can_view_billing')
    or public.has_organization_permission(organization_id, 'can_manage_billing')
  );

revoke all on public.inventory_usage_financial_ledger, public.invoice_qr_tokens, public.billing_state_transitions from anon, authenticated;
grant select on public.inventory_usage_financial_ledger, public.invoice_qr_tokens, public.billing_state_transitions to authenticated;

create or replace function public.log_billing_transition(
  p_organization_id uuid, p_entity_type text, p_entity_id uuid,
  p_from_state text, p_to_state text, p_reason text default null,
  p_actor_user_id uuid default auth.uid()
) returns void language sql security definer set search_path = public, auth as $$
  insert into public.billing_state_transitions (
    organization_id, entity_type, entity_id, from_state, to_state, reason, actor_user_id
  ) values (
    p_organization_id, p_entity_type, p_entity_id, p_from_state, p_to_state,
    nullif(btrim(p_reason), ''), p_actor_user_id
  );
$$;

create or replace function public.resolve_billing_mode(
  p_organization_id uuid, p_patient_id uuid, p_clinic_service_id uuid default null
) returns table (
  billing_mode public.billing_mode,
  payor_type public.payor_type,
  coverage_id uuid,
  resolution_source text
) language plpgsql stable security definer set search_path = public, auth as $$
declare
  v_coverage public.coverages%rowtype;
  v_override boolean;
  v_default public.payor_type;
begin
  select * into v_coverage
  from public.coverages coverage
  where coverage.organization_id = p_organization_id
    and coverage.patient_id = p_patient_id
    and coverage.status = 'active'
    and (coverage.period_start is null or coverage.period_start <= current_date)
    and (coverage.period_end is null or coverage.period_end >= current_date)
    and lower(coverage.coverage_type) in ('philhealth_nbb', 'government_subsidized', 'nbb')
  order by coverage.updated_at desc limit 1;

  if v_coverage.id is not null then
    return query select 'nbb'::public.billing_mode,
      case when lower(v_coverage.coverage_type) = 'government_subsidized'
        then 'government_subsidized'::public.payor_type
        else 'philhealth_nbb'::public.payor_type end,
      v_coverage.id, 'active_coverage'::text;
    return;
  end if;

  if p_clinic_service_id is not null then
    select service.nbb_eligible into v_override
    from public.clinic_services service
    where service.id = p_clinic_service_id and service.organization_id = p_organization_id;
    if v_override is true then
      return query select 'nbb'::public.billing_mode, 'philhealth_nbb'::public.payor_type,
        null::uuid, 'service_override'::text;
      return;
    elsif v_override is false then
      return query select 'standard'::public.billing_mode, 'self_pay'::public.payor_type,
        null::uuid, 'service_override'::text;
      return;
    end if;
  end if;

  select organization.default_payor_type into v_default
  from public.organizations organization where organization.id = p_organization_id;
  return query select
    case when v_default in ('philhealth_nbb', 'government_subsidized')
      then 'nbb'::public.billing_mode else 'standard'::public.billing_mode end,
    coalesce(v_default, 'self_pay'::public.payor_type), null::uuid, 'organization_default'::text;
end;
$$;

create or replace function public.issue_billing_invoice(p_billing_event_id uuid)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  v_event public.billing_events%rowtype;
  v_invoice_id uuid;
  v_subtotal numeric(14,2);
  v_raw_token text;
  v_invoice_status public.invoice_status;
  v_total_due numeric(14,2);
begin
  select * into v_event from public.billing_events where id = p_billing_event_id for update;
  if not found then raise exception 'Billing event not found.' using errcode = 'P0002'; end if;
  select coalesce(sum(line_total), 0) into v_subtotal from public.billing_line_items
  where billing_event_id = p_billing_event_id and payment_status <> 'voided';

  select id into v_invoice_id from public.invoices where billing_event_id = p_billing_event_id order by created_at desc limit 1 for update;
  if v_invoice_id is not null then
    return jsonb_build_object('invoice_id', v_invoice_id, 'billing_mode', v_event.billing_mode);
  end if;

  v_invoice_status := case when v_event.billing_mode = 'nbb' then 'paid' else 'issued' end;
  v_total_due := case when v_event.billing_mode = 'nbb' then 0 else v_subtotal end;
  insert into public.invoices (
    organization_id, billing_event_id, patient_id, invoice_number, status,
    subtotal, total_due, amount_paid, balance_due, issued_at, paid_at
  ) values (
    v_event.organization_id, v_event.id, v_event.patient_id,
    public.generate_invoice_number(v_event.organization_id), v_invoice_status,
    v_subtotal, v_total_due, 0, v_total_due, now(),
    case when v_event.billing_mode = 'nbb' then now() else null end
  ) returning id into v_invoice_id;

  update public.billing_line_items set
    invoice_id = v_invoice_id,
    payment_status = case when v_event.billing_mode = 'nbb'
      then 'written_off'::public.billing_line_payment_status else 'unpaid'::public.billing_line_payment_status end
  where billing_event_id = v_event.id and payment_status <> 'voided';

  update public.inventory_usage_financial_ledger ledger set
    state = case when v_event.billing_mode = 'nbb' then 'written_off'::public.inventory_financial_state else ledger.state end,
    unbilled_qty = case when v_event.billing_mode = 'nbb' then 0 else ledger.unbilled_qty end,
    settled_at = case when v_event.billing_mode = 'nbb' then now() else ledger.settled_at end,
    settled_by = case when v_event.billing_mode = 'nbb' then auth.uid() else ledger.settled_by end
  from public.billing_line_items line
  where line.billing_event_id = v_event.id and ledger.billing_line_item_id = line.id;

  update public.billing_events set status = 'finalized', finalized_at = now(), finalized_by = auth.uid()
  where id = v_event.id;
  perform public.log_billing_transition(v_event.organization_id, 'billing_event', v_event.id, v_event.status::text, 'finalized', 'Invoice issued');
  perform public.log_billing_transition(v_event.organization_id, 'invoice', v_invoice_id, null, v_invoice_status::text,
    case when v_event.billing_mode = 'nbb' then 'NBB write-off' else 'Awaiting full payment' end);

  v_raw_token := encode(gen_random_bytes(24), 'hex');
  insert into public.invoice_qr_tokens (
    organization_id, appointment_id, encounter_id, invoice_id, token_hash,
    expires_at, created_by
  ) values (
    v_event.organization_id, v_event.appointment_id, v_event.encounter_id, v_invoice_id,
    encode(digest(v_raw_token, 'sha256'), 'hex'),
    coalesce((select appointment.end_at + interval '24 hours' from public.appointments appointment where appointment.id = v_event.appointment_id), now() + interval '30 days'),
    auth.uid()
  );

  if v_event.appointment_id is not null and v_event.billing_mode = 'nbb' then
    update public.appointments set status = 'booked', slot_confirmed_at = now(), payment_due_at = null
    where id = v_event.appointment_id and status = 'pending';
    perform public.log_billing_transition(v_event.organization_id, 'appointment', v_event.appointment_id, 'pending', 'booked', 'NBB eligibility confirmed');
  end if;

  return jsonb_build_object(
    'invoice_id', v_invoice_id,
    'billing_mode', v_event.billing_mode,
    'qr_token', 'ODYSSEY-INVOICE|' || v_raw_token,
    'total_due', v_total_due
  );
end;
$$;

create or replace function public.generate_appointment_bill(p_appointment_id uuid)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  v_appointment public.appointments%rowtype;
  v_patient public.patients%rowtype;
  v_service public.clinic_services%rowtype;
  v_resolution record;
  v_event_id uuid;
begin
  select * into v_appointment from public.appointments where id = p_appointment_id for update;
  if not found then raise exception 'Appointment not found.' using errcode = 'P0002'; end if;
  select * into v_patient from public.patients where id = v_appointment.patient_id;
  if v_patient.auth_user_id is distinct from auth.uid()
    and not public.has_organization_permission(v_appointment.organization_id, 'can_manage_billing') then
    raise exception 'Billing management permission is required.' using errcode = '42501';
  end if;
  select * into v_service from public.clinic_services where id = v_appointment.clinic_service_id;
  if v_service.id is null or v_service.base_price is null then
    raise exception 'The appointment service does not have a billable price.' using errcode = '22023';
  end if;
  select * into v_resolution from public.resolve_billing_mode(v_appointment.organization_id, v_appointment.patient_id, v_appointment.clinic_service_id);

  select id into v_event_id from public.billing_events
  where appointment_id = v_appointment.id and status <> 'cancelled' limit 1;
  if v_event_id is null then
    insert into public.billing_events (
      organization_id, appointment_id, patient_id, payor_type, coverage_id,
      billing_mode, billing_mode_source, status, notes
    ) values (
      v_appointment.organization_id, v_appointment.id, v_appointment.patient_id,
      v_resolution.payor_type, v_resolution.coverage_id, v_resolution.billing_mode,
      v_resolution.resolution_source, 'draft', 'Appointment reservation charge'
    ) returning id into v_event_id;
    insert into public.billing_line_items (
      organization_id, billing_event_id, source_type, source_id, description,
      quantity, unit_price, currency, billing_mode, payor_type, tagged_by, tagged_at
    ) values (
      v_appointment.organization_id, v_event_id, 'clinic_service', v_service.id,
      v_service.name, 1, v_service.base_price, v_service.currency,
      v_resolution.billing_mode, v_resolution.payor_type, auth.uid(), now()
    );
  end if;
  update public.appointments set billing_mode = v_resolution.billing_mode,
    billing_mode_source = v_resolution.resolution_source,
    billing_coverage_id = v_resolution.coverage_id
  where id = v_appointment.id;
  return public.issue_billing_invoice(v_event_id);
end;
$$;

-- A reservation holds the selected slot immediately, but STANDARD appointments
-- are not confirmed until their invoice is paid in full. NBB appointments are
-- confirmed by generate_appointment_bill in the same transaction.
drop function if exists public.book_appointment_slot(uuid, uuid, public.appointment_delivery_mode);
create function public.book_appointment_slot(
  p_slot_id uuid,
  p_patient_id uuid default null,
  p_delivery_mode public.appointment_delivery_mode default 'in_person'
) returns uuid language plpgsql security definer set search_path = public, auth as $$
declare
  caller_id uuid := auth.uid();
  selected_slot public.appointment_slots%rowtype;
  selected_patient public.patients%rowtype;
  selected_service public.clinic_services%rowtype;
  new_appointment_id uuid;
begin
  if caller_id is null then raise exception 'Authentication is required.' using errcode = '28000'; end if;
  select * into selected_slot from public.appointment_slots where id = p_slot_id for update;
  if selected_slot.id is null then raise exception 'Appointment slot not found.' using errcode = 'P0002'; end if;
  if selected_slot.status <> 'free' or selected_slot.appointment_id is not null then
    raise exception 'This appointment slot is no longer available.' using errcode = '23505';
  end if;
  if selected_slot.start_at <= now() then raise exception 'Past appointment slots cannot be booked.' using errcode = '22007'; end if;
  select * into selected_service from public.clinic_services where id = selected_slot.clinic_service_id;
  if selected_service.id is null or not (p_delivery_mode = any(selected_service.delivery_modes)) then
    raise exception 'The selected delivery mode is not offered for this service.' using errcode = '22023';
  end if;
  if p_patient_id is null then
    select * into selected_patient from public.patients
    where organization_id = selected_slot.organization_id and auth_user_id = caller_id and active;
  else
    select * into selected_patient from public.patients
    where id = p_patient_id and organization_id = selected_slot.organization_id and active;
  end if;
  if selected_patient.id is null then raise exception 'An active patient at this clinic is required.' using errcode = '23503'; end if;
  if selected_patient.auth_user_id is distinct from caller_id
    and not public.has_organization_permission(selected_slot.organization_id, 'can_manage_appointments') then
    raise exception 'You cannot book for this patient.' using errcode = '42501';
  end if;

  insert into public.appointments (
    organization_id, patient_id, practitioner_role_id, status, service_type,
    appointment_type, start_at, end_at, minutes_duration, clinic_service_id,
    delivery_mode, patient_instruction, payment_due_at
  ) values (
    selected_slot.organization_id, selected_patient.id, selected_slot.practitioner_role_id,
    'pending', selected_slot.service_type,
    case when p_delivery_mode = 'virtual' then 'TELECONSULT' else 'ROUTINE' end,
    selected_slot.start_at, selected_slot.end_at,
    greatest(1, floor(extract(epoch from (selected_slot.end_at - selected_slot.start_at)) / 60)::integer),
    selected_slot.clinic_service_id, p_delivery_mode,
    case when p_delivery_mode = 'virtual' then 'Join from your patient portal up to 30 minutes before the scheduled time.' else null end,
    least(selected_slot.start_at, now() + interval '15 minutes')
  ) returning id into new_appointment_id;
  update public.appointment_slots set status = 'busy', appointment_id = new_appointment_id where id = selected_slot.id;
  perform public.log_billing_transition(selected_slot.organization_id, 'appointment', new_appointment_id, null, 'pending', 'Slot reserved pending billing resolution');
  perform public.generate_appointment_bill(new_appointment_id);
  return new_appointment_id;
end;
$$;

create or replace function public.create_payment_attempt(
  p_invoice_id uuid, p_method public.payment_method, p_reference text default null
) returns uuid language plpgsql security definer set search_path = public, auth as $$
declare v_invoice public.invoices%rowtype; v_payment_id uuid;
begin
  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found.' using errcode = 'P0002'; end if;
  if not public.has_organization_permission(v_invoice.organization_id, 'can_manage_billing') then
    raise exception 'Billing management permission is required.' using errcode = '42501';
  end if;
  if v_invoice.status <> 'issued' or v_invoice.balance_due <= 0 then
    raise exception 'Only an unpaid issued invoice can accept payment.' using errcode = '22023';
  end if;
  if exists (select 1 from public.payments where invoice_id = p_invoice_id and status = 'pending') then
    raise exception 'A payment attempt is already pending for this invoice.' using errcode = '23505';
  end if;
  insert into public.payments (
    organization_id, invoice_id, amount, currency, method, status, reference_number, recorded_by
  ) values (
    v_invoice.organization_id, v_invoice.id, v_invoice.balance_due, 'PHP', p_method, 'pending', nullif(btrim(p_reference), ''), auth.uid()
  ) returning id into v_payment_id;
  perform public.log_billing_transition(v_invoice.organization_id, 'payment', v_payment_id, null, 'pending', 'Full-balance payment attempt created');
  return v_payment_id;
end;
$$;

create or replace function public.confirm_payment_attempt(p_payment_id uuid)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare
  v_payment public.payments%rowtype;
  v_invoice public.invoices%rowtype;
  v_event public.billing_events%rowtype;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then raise exception 'Payment attempt not found.' using errcode = 'P0002'; end if;
  select * into v_invoice from public.invoices where id = v_payment.invoice_id for update;
  if not public.has_organization_permission(v_payment.organization_id, 'can_manage_billing') then
    raise exception 'Billing management permission is required.' using errcode = '42501';
  end if;
  if v_payment.status <> 'pending' or v_invoice.status <> 'issued' then
    raise exception 'The payment attempt is no longer confirmable.' using errcode = '22023';
  end if;
  if v_payment.amount <> v_invoice.balance_due or v_payment.amount <> v_invoice.total_due then
    raise exception 'Partial payments are not accepted; the full invoice balance is required.' using errcode = '22023';
  end if;
  update public.payments set status = 'confirmed', confirmed_at = now(), updated_at = now() where id = v_payment.id;
  update public.invoices set status = 'paid', amount_paid = total_due, balance_due = 0, paid_at = now(), updated_at = now() where id = v_invoice.id;
  update public.billing_line_items set payment_status = 'paid' where invoice_id = v_invoice.id and payment_status = 'unpaid';
  update public.inventory_usage_financial_ledger ledger set
    state = 'paid', paid_qty = ledger.quantity, unbilled_qty = 0,
    settled_at = now(), settled_by = auth.uid()
  from public.billing_line_items line
  where line.invoice_id = v_invoice.id and ledger.billing_line_item_id = line.id and ledger.state = 'tagged';
  select * into v_event from public.billing_events where id = v_invoice.billing_event_id;
  if v_event.appointment_id is not null then
    update public.appointments set status = 'booked', slot_confirmed_at = now(), payment_due_at = null
    where id = v_event.appointment_id and status = 'pending';
    perform public.log_billing_transition(v_event.organization_id, 'appointment', v_event.appointment_id, 'pending', 'booked', 'Invoice paid in full');
  end if;
  perform public.log_billing_transition(v_payment.organization_id, 'payment', v_payment.id, 'pending', 'confirmed', 'Payment confirmed');
  perform public.log_billing_transition(v_payment.organization_id, 'invoice', v_invoice.id, 'issued', 'paid', 'Invoice paid in full');
  return v_payment.id;
end;
$$;

create or replace function public.record_payment(
  p_invoice_id uuid, p_amount numeric, p_method public.payment_method, p_reference text default null
) returns uuid language plpgsql security definer set search_path = public, auth as $$
declare v_invoice public.invoices%rowtype; v_payment_id uuid;
begin
  select * into v_invoice from public.invoices where id = p_invoice_id;
  if not found then raise exception 'Invoice not found.' using errcode = 'P0002'; end if;
  if p_amount is distinct from v_invoice.balance_due or p_amount is distinct from v_invoice.total_due then
    raise exception 'Partial payments are not accepted; the full invoice balance is required.' using errcode = '22023';
  end if;
  v_payment_id := public.create_payment_attempt(p_invoice_id, p_method, p_reference);
  return public.confirm_payment_attempt(v_payment_id);
end;
$$;

create or replace function public.expire_unpaid_appointment_reservations(p_organization_id uuid default null)
returns integer language plpgsql security definer set search_path = public, auth as $$
declare v_appointment record; v_count integer := 0;
begin
  if p_organization_id is not null and not public.has_organization_permission(p_organization_id, 'can_manage_appointments') then
    raise exception 'Appointment management permission is required.' using errcode = '42501';
  end if;
  for v_appointment in
    select appointment.id, appointment.organization_id from public.appointments appointment
    where appointment.status = 'pending' and appointment.payment_due_at <= now()
      and (p_organization_id is null or appointment.organization_id = p_organization_id)
      and (p_organization_id is not null or public.can_access_organization(appointment.organization_id))
    for update
  loop
    update public.appointments set status = 'cancelled', cancellation_reason = 'Payment window expired' where id = v_appointment.id;
    update public.appointment_slots set status = 'free', appointment_id = null where appointment_id = v_appointment.id;
    update public.invoices invoice set status = 'cancelled', updated_at = now()
      from public.billing_events event where invoice.billing_event_id = event.id and event.appointment_id = v_appointment.id and invoice.status = 'issued';
    update public.billing_events set status = 'cancelled', updated_at = now() where appointment_id = v_appointment.id and status <> 'cancelled';
    update public.invoice_qr_tokens token set revoked_at = now()
      from public.invoices invoice join public.billing_events event on event.id = invoice.billing_event_id
      where token.invoice_id = invoice.id and event.appointment_id = v_appointment.id and token.revoked_at is null;
    perform public.log_billing_transition(v_appointment.organization_id, 'appointment', v_appointment.id, 'pending', 'cancelled', 'Payment window expired; slot released');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.resolve_invoice_qr(p_qr_payload text)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_token text; v_row record; v_status text;
begin
  v_token := nullif(split_part(coalesce(p_qr_payload, ''), '|', 2), '');
  if split_part(coalesce(p_qr_payload, ''), '|', 1) <> 'ODYSSEY-INVOICE' or v_token is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  select token.*, invoice.invoice_number, invoice.status invoice_status,
    invoice.total_due, invoice.amount_paid, invoice.balance_due,
    patient.name ->> 'text' patient_name, event.billing_mode, event.payor_type
  into v_row
  from public.invoice_qr_tokens token
  join public.invoices invoice on invoice.id = token.invoice_id
  join public.billing_events event on event.id = invoice.billing_event_id
  left join public.patients patient on patient.id = invoice.patient_id
  where token.token_hash = encode(digest(v_token, 'sha256'), 'hex');
  if not found or not (
    public.has_organization_permission(v_row.organization_id, 'can_view_billing')
    or public.has_organization_permission(v_row.organization_id, 'can_manage_billing')
  ) then return jsonb_build_object('status', 'not_found'); end if;
  v_status := case
    when v_row.revoked_at is not null or v_row.expires_at <= now() then 'expired'
    when v_row.invoice_status = 'paid' then 'paid'
    when v_row.invoice_status = 'issued' then 'active'
    else 'not_found' end;
  if v_status in ('active', 'paid') and v_row.used_at is null then
    update public.invoice_qr_tokens set used_at = now() where id = v_row.id;
  end if;
  return jsonb_build_object(
    'status', v_status, 'invoice_id', v_row.invoice_id,
    'invoice_number', v_row.invoice_number, 'patient_name', coalesce(v_row.patient_name, 'Walk-in'),
    'billing_mode', v_row.billing_mode, 'payor_type', v_row.payor_type,
    'total_due', v_row.total_due, 'amount_paid', v_row.amount_paid,
    'balance_due', v_row.balance_due, 'expires_at', v_row.expires_at
  );
end;
$$;

create or replace function public.ensure_encounter_draft_bill(p_encounter_id uuid)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare
  v_encounter public.encounters%rowtype;
  v_appointment public.appointments%rowtype;
  v_resolution record;
  v_event_id uuid;
begin
  select * into v_encounter from public.encounters where id = p_encounter_id;
  if not found then raise exception 'Encounter not found.' using errcode = 'P0002'; end if;
  select * into v_appointment from public.appointments where id = v_encounter.appointment_id;
  select * into v_resolution from public.resolve_billing_mode(
    v_encounter.organization_id, v_encounter.patient_id, v_appointment.clinic_service_id
  );
  perform pg_advisory_xact_lock(hashtextextended(v_encounter.id::text || ':draft-bill', 0));
  select id into v_event_id from public.billing_events
  where encounter_id = v_encounter.id and status = 'draft'
  order by created_at desc limit 1 for update;
  if v_event_id is null then
    insert into public.billing_events (
      organization_id, encounter_id, patient_id, payor_type, coverage_id,
      billing_mode, billing_mode_source, status, notes
    ) values (
      v_encounter.organization_id, v_encounter.id, v_encounter.patient_id,
      v_resolution.payor_type, v_resolution.coverage_id, v_resolution.billing_mode,
      v_resolution.resolution_source, 'draft',
      case when exists (select 1 from public.billing_events where encounter_id = v_encounter.id and status = 'finalized')
        then 'Supplemental encounter charges' else 'Encounter charges' end
    ) returning id into v_event_id;
  end if;
  update public.encounters set billing_mode = v_resolution.billing_mode,
    billing_mode_source = v_resolution.resolution_source,
    billing_coverage_id = v_resolution.coverage_id
  where id = v_encounter.id;
  return v_event_id;
end;
$$;

create or replace function public.sync_inventory_usage_to_billing(p_usage_id uuid)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare
  v_usage public.inventory_usages%rowtype;
  v_item public.inventory_items%rowtype;
  v_event public.billing_events%rowtype;
  v_line_id uuid;
begin
  select * into v_usage from public.inventory_usages where id = p_usage_id;
  if not found then raise exception 'Inventory usage not found.' using errcode = 'P0002'; end if;
  select * into v_item from public.inventory_items where id = v_usage.item_id and organization_id = v_usage.organization_id;
  select * into v_event from public.billing_events where id = public.ensure_encounter_draft_bill(v_usage.encounter_id);
  insert into public.billing_line_items (
    organization_id, billing_event_id, source_type, source_id, description,
    quantity, unit_price, unit_cost, currency, billing_mode, payor_type,
    payment_status, tagged_by, tagged_at
  ) values (
    v_usage.organization_id, v_event.id, 'inventory_usage', v_usage.id, v_item.name,
    v_usage.quantity, v_usage.unit_price, v_usage.unit_cost, v_usage.currency,
    v_event.billing_mode, v_event.payor_type, 'unpaid', v_usage.tagged_by, v_usage.used_at
  ) on conflict (billing_event_id, source_type, source_id) where source_id is not null
  do update set description = excluded.description returning id into v_line_id;
  insert into public.inventory_usage_financial_ledger (
    organization_id, usage_id, billing_line_item_id, state, quantity,
    unbilled_qty, paid_qty, tagged_by, tagged_at
  ) values (
    v_usage.organization_id, v_usage.id, v_line_id, 'tagged', v_usage.quantity,
    v_usage.quantity, 0, v_usage.tagged_by, v_usage.used_at
  ) on conflict (usage_id) do nothing;
  return v_event.id;
end;
$$;

create or replace function public.tag_inventory_usage(
  p_encounter_id uuid, p_stock_id uuid, p_quantity numeric, p_department_id uuid
) returns uuid language plpgsql security definer set search_path = public, auth as $$
declare
  v_encounter public.encounters%rowtype;
  v_stock public.department_stock%rowtype;
  v_item public.inventory_items%rowtype;
  v_usage_id uuid;
  v_assigned_department_id uuid;
  v_department_id uuid;
begin
  select * into v_encounter from public.encounters where id = p_encounter_id;
  if not found or v_encounter.status <> 'in_progress' then raise exception 'An in-progress encounter is required.' using errcode = '22023'; end if;
  if not public.has_organization_permission(v_encounter.organization_id, 'can_tag_inventory_usage') then
    raise exception 'Inventory usage tagging permission is required.' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Usage quantity must be positive.' using errcode = '22023'; end if;
  select assignment.department_id into v_assigned_department_id
  from public.staff_department_assignments assignment
  join public.departments department on department.id = assignment.department_id and department.active
  where assignment.organization_id = v_encounter.organization_id and assignment.user_id = auth.uid();
  if v_assigned_department_id is not null and p_department_id is not null
    and v_assigned_department_id is distinct from p_department_id then
    raise exception 'Your inventory tagging is assigned to a different department.' using errcode = '42501';
  end if;
  v_department_id := coalesce(v_assigned_department_id, p_department_id);
  select * into v_stock from public.department_stock
  where id = p_stock_id and organization_id = v_encounter.organization_id
    and (v_department_id is null or department_id = v_department_id) for update;
  if not found then raise exception 'The selected department stock is not available for this clinic or department.' using errcode = '22023'; end if;
  select * into v_item from public.inventory_items where id = v_stock.item_id and organization_id = v_encounter.organization_id and active;
  if not found then raise exception 'The inventory item is inactive.' using errcode = '22023'; end if;
  update public.department_stock set quantity = quantity - p_quantity where id = v_stock.id and quantity >= p_quantity;
  if not found then raise exception 'Insufficient stock in the selected department.' using errcode = '22023'; end if;
  insert into public.inventory_usages (
    organization_id, stock_id, item_id, department_id, encounter_id, patient_id,
    quantity, unit_price, unit_cost, currency, tagged_by
  ) values (
    v_encounter.organization_id, v_stock.id, v_item.id, v_stock.department_id,
    v_encounter.id, v_encounter.patient_id, p_quantity, v_item.selling_price,
    v_item.unit_cost, v_item.currency, auth.uid()
  ) returning id into v_usage_id;
  insert into public.inventory_stock_movements (
    organization_id, stock_id, item_id, department_id, movement_type,
    quantity_delta, reason, usage_id, recorded_by
  ) values (
    v_encounter.organization_id, v_stock.id, v_item.id, v_stock.department_id,
    'usage', -p_quantity, 'Encounter usage tagged and billed', v_usage_id, auth.uid()
  );
  perform public.sync_inventory_usage_to_billing(v_usage_id);
  perform public.log_billing_transition(v_encounter.organization_id, 'inventory_usage', v_usage_id, null, 'tagged', 'Physical stock deducted immediately');
  return v_usage_id;
end;
$$;

create or replace function public.tag_inventory_usage(p_encounter_id uuid, p_stock_id uuid, p_quantity numeric)
returns uuid language plpgsql security definer set search_path = public, auth as $$
begin return public.tag_inventory_usage(p_encounter_id, p_stock_id, p_quantity, null); end;
$$;

alter table public.inventory_stock_movements
  drop constraint if exists inventory_stock_movements_movement_type_check;
alter table public.inventory_stock_movements
  add constraint inventory_stock_movements_movement_type_check check (
    movement_type in ('opening', 'receipt', 'adjustment', 'transfer_in', 'transfer_out', 'usage', 'usage_reversal')
  );

create or replace function public.void_billing_line_item(p_line_item_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public, auth as $$
declare
  v_line public.billing_line_items%rowtype;
  v_ledger public.inventory_usage_financial_ledger%rowtype;
  v_usage public.inventory_usages%rowtype;
  v_invoice public.invoices%rowtype;
begin
  select * into v_line from public.billing_line_items where id = p_line_item_id for update;
  if not found then raise exception 'Billing line item not found.' using errcode = 'P0002'; end if;
  if not public.has_organization_permission(v_line.organization_id, 'can_manage_billing') then
    raise exception 'Billing management permission is required.' using errcode = '42501';
  end if;
  if length(coalesce(btrim(p_reason), '')) < 3 then raise exception 'A void reason is required.' using errcode = '22023'; end if;
  if v_line.payment_status in ('paid', 'written_off', 'voided') then
    raise exception 'Settled or already voided charges cannot be voided.' using errcode = '22023';
  end if;
  if v_line.invoice_id is not null then
    select * into v_invoice from public.invoices where id = v_line.invoice_id for update;
    if v_invoice.status <> 'issued' then raise exception 'Only an open invoice charge can be voided.' using errcode = '22023'; end if;
  end if;
  select * into v_ledger from public.inventory_usage_financial_ledger where billing_line_item_id = v_line.id for update;
  if v_ledger.id is not null and v_ledger.state = 'tagged' then
    select * into v_usage from public.inventory_usages where id = v_ledger.usage_id;
    update public.department_stock set quantity = quantity + v_usage.quantity where id = v_usage.stock_id;
    insert into public.inventory_stock_movements (
      organization_id, stock_id, item_id, department_id, movement_type,
      quantity_delta, reason, usage_id, recorded_by
    ) values (
      v_usage.organization_id, v_usage.stock_id, v_usage.item_id, v_usage.department_id,
      'usage_reversal', v_usage.quantity, 'Voided patient charge: ' || btrim(p_reason), v_usage.id, auth.uid()
    );
    update public.inventory_usage_financial_ledger set state = 'voided', unbilled_qty = 0,
      voided_by = auth.uid(), voided_at = now(), void_reason = btrim(p_reason) where id = v_ledger.id;
  end if;
  update public.billing_line_items set payment_status = 'voided', voided_by = auth.uid(),
    voided_at = now(), void_reason = btrim(p_reason) where id = v_line.id;
  if v_line.invoice_id is not null then
    update public.invoices invoice set
      subtotal = totals.total, total_due = totals.total,
      balance_due = greatest(0, totals.total - invoice.amount_paid), updated_at = now()
    from (select coalesce(sum(line_total), 0) total from public.billing_line_items
      where invoice_id = v_line.invoice_id and payment_status <> 'voided') totals
    where invoice.id = v_line.invoice_id;
  end if;
  perform public.log_billing_transition(v_line.organization_id, 'line_item', v_line.id, v_line.payment_status::text, 'voided', btrim(p_reason));
end;
$$;

-- Convert any legacy held rows once. New tagging never creates inventory_holds.
do $$
declare v_hold public.inventory_holds%rowtype; v_usage_id uuid; v_line_id uuid;
begin
  for v_hold in select * from public.inventory_holds where status = 'held' order by held_at for update loop
    update public.department_stock set quantity = quantity - v_hold.quantity
    where id = v_hold.stock_id and quantity >= v_hold.quantity;
    if not found then raise exception 'Legacy held stock is unavailable for migration (hold %).', v_hold.id; end if;
    insert into public.inventory_usages (
      organization_id, stock_id, item_id, department_id, encounter_id, patient_id,
      quantity, unit_price, unit_cost, currency, tagged_by, used_at
    ) values (
      v_hold.organization_id, v_hold.stock_id, v_hold.item_id, v_hold.department_id,
      v_hold.encounter_id, v_hold.patient_id, v_hold.quantity, v_hold.unit_price,
      v_hold.unit_cost, v_hold.currency, v_hold.held_by, v_hold.held_at
    ) returning id into v_usage_id;
    insert into public.inventory_stock_movements (
      organization_id, stock_id, item_id, department_id, movement_type,
      quantity_delta, reason, usage_id, recorded_by
    ) values (
      v_hold.organization_id, v_hold.stock_id, v_hold.item_id, v_hold.department_id,
      'usage', -v_hold.quantity, 'Migrated legacy patient hold', v_usage_id, v_hold.held_by
    );
    update public.billing_line_items set source_id = v_usage_id, tagged_by = v_hold.held_by,
      tagged_at = v_hold.held_at where source_type = 'inventory_usage' and source_id = v_hold.id
      returning id into v_line_id;
    if v_line_id is null then perform public.sync_inventory_usage_to_billing(v_usage_id); else
      insert into public.inventory_usage_financial_ledger (
        organization_id, usage_id, billing_line_item_id, state, quantity, unbilled_qty, paid_qty, tagged_by, tagged_at
      ) values (
        v_hold.organization_id, v_usage_id, v_line_id, 'tagged', v_hold.quantity, v_hold.quantity, 0, v_hold.held_by, v_hold.held_at
      );
    end if;
    update public.inventory_holds set status = 'dispensed', dispensed_at = now() where id = v_hold.id;
  end loop;
end;
$$;

create or replace function public.sync_laboratory_request_to_billing(p_service_request_id uuid)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare
  v_request public.service_requests%rowtype;
  v_service public.laboratory_services%rowtype;
  v_event public.billing_events%rowtype;
  v_line_id uuid;
begin
  select * into v_request from public.service_requests where id = p_service_request_id;
  if not found or v_request.category <> 'laboratory' then raise exception 'Laboratory request not found.' using errcode = 'P0002'; end if;
  select * into v_service from public.laboratory_services
  where organization_id = v_request.organization_id and code = v_request.code;
  if not found then raise exception 'Laboratory catalog service not found.' using errcode = 'P0002'; end if;
  select * into v_event from public.billing_events where id = public.ensure_encounter_draft_bill(v_request.encounter_id);
  insert into public.billing_line_items (
    organization_id, billing_event_id, source_type, source_id, description,
    quantity, unit_price, currency, billing_mode, payor_type, payment_status,
    tagged_by, tagged_at
  ) values (
    v_request.organization_id, v_event.id, 'laboratory_service', v_request.id,
    v_service.name, 1, v_service.lab_cost, 'PHP', v_event.billing_mode,
    v_event.payor_type, 'unpaid', auth.uid(), now()
  ) on conflict (billing_event_id, source_type, source_id) where source_id is not null
  do update set description = excluded.description returning id into v_line_id;
  return v_event.id;
end;
$$;

create or replace function public.create_diagnostic_service_request(
  p_encounter_id uuid, p_category text, p_code text, p_code_display text,
  p_priority text default 'routine', p_note text default null,
  p_performer_practitioner_role_id uuid default null, p_laboratory_service_id uuid default null
) returns uuid language plpgsql security definer set search_path = public, auth as $$
declare
  v_encounter public.encounters%rowtype;
  v_requester_id uuid;
  v_request_id uuid;
  v_code text;
  v_display text;
begin
  select * into v_encounter from public.encounters where id = p_encounter_id;
  if not found or v_encounter.status not in ('in_progress', 'finished') then raise exception 'An active or completed encounter is required.' using errcode = '22023'; end if;
  if not public.has_organization_permission(v_encounter.organization_id, 'can_order_diagnostics') then raise exception 'Diagnostic ordering permission is required.' using errcode = '42501'; end if;
  if p_category not in ('laboratory', 'referral') or p_priority not in ('routine', 'urgent', 'asap', 'stat') then raise exception 'A valid category and priority are required.' using errcode = '22023'; end if;
  if p_category = 'laboratory' then
    select code, name into v_code, v_display from public.laboratory_services
    where id = p_laboratory_service_id and organization_id = v_encounter.organization_id and active;
    if v_code is null then raise exception 'Select an active laboratory service.' using errcode = '22023'; end if;
    if p_performer_practitioner_role_id is not null then raise exception 'Laboratory orders route to the clinic lab worklist.' using errcode = '22023'; end if;
  else
    if p_performer_practitioner_role_id is null or not exists (
      select 1 from public.practitioner_roles role where role.id = p_performer_practitioner_role_id
        and role.organization_id = v_encounter.organization_id and role.role_code = 'specialist' and role.active
    ) then raise exception 'Referrals require an active specialist in the same clinic.' using errcode = '22023'; end if;
    v_code := public.system_generated_code('REF');
    v_display := 'Specialist referral';
  end if;
  select practitioner.id into v_requester_id
  from public.practitioners practitioner
  join public.practitioner_roles role on role.practitioner_id = practitioner.id
  where practitioner.auth_user_id = auth.uid() and practitioner.active and role.active
    and role.organization_id = v_encounter.organization_id limit 1;
  if v_requester_id is null then raise exception 'An active clinic practitioner is required.' using errcode = '42501'; end if;
  insert into public.service_requests (
    organization_id, patient_id, encounter_id, requester_practitioner_id,
    status, category, priority, code, code_display, performer_organization_id,
    performer_practitioner_role_id, note
  ) values (
    v_encounter.organization_id, v_encounter.patient_id, v_encounter.id, v_requester_id,
    'active', p_category, p_priority, v_code, v_display,
    case when p_category = 'laboratory' then v_encounter.organization_id else null end,
    p_performer_practitioner_role_id, nullif(btrim(p_note), '')
  ) returning id into v_request_id;
  if p_category = 'laboratory' then perform public.sync_laboratory_request_to_billing(v_request_id); end if;
  return v_request_id;
end;
$$;

create or replace function public.generate_billing_event(
  p_organization_id uuid, p_encounter_id uuid,
  p_payor_type_override public.payor_type default null
) returns uuid language plpgsql security definer set search_path = public, auth as $$
declare
  v_encounter public.encounters%rowtype;
  v_event public.billing_events%rowtype;
  v_usage record;
  v_request record;
begin
  if not public.has_organization_permission(p_organization_id, 'can_manage_billing') then
    raise exception 'Billing management permission is required.' using errcode = '42501';
  end if;
  select * into v_encounter from public.encounters where id = p_encounter_id and organization_id = p_organization_id;
  if not found or v_encounter.status not in ('in_progress', 'finished') then
    raise exception 'Encounter must be finished or in progress to bill.' using errcode = '22023';
  end if;
  select * into v_event from public.billing_events where id = public.ensure_encounter_draft_bill(p_encounter_id);
  if p_payor_type_override is not null then
    update public.billing_events set payor_type = p_payor_type_override,
      billing_mode = case when p_payor_type_override in ('philhealth_nbb', 'government_subsidized') then 'nbb' else 'standard' end,
      billing_mode_source = 'billing_override'
    where id = v_event.id returning * into v_event;
  end if;
  for v_usage in select id from public.inventory_usages where encounter_id = p_encounter_id loop
    perform public.sync_inventory_usage_to_billing(v_usage.id);
  end loop;
  for v_request in select id from public.service_requests where encounter_id = p_encounter_id and category = 'laboratory' loop
    perform public.sync_laboratory_request_to_billing(v_request.id);
  end loop;
  return v_event.id;
end;
$$;

create or replace function public.finalize_billing_event(p_billing_event_id uuid)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_event public.billing_events%rowtype;
begin
  select * into v_event from public.billing_events where id = p_billing_event_id;
  if not found then raise exception 'Billing event not found.' using errcode = 'P0002'; end if;
  if v_event.status <> 'draft' then raise exception 'Only draft billing events can be finalized.' using errcode = '22023'; end if;
  if not public.has_organization_permission(v_event.organization_id, 'can_manage_billing') then
    raise exception 'Billing management permission is required.' using errcode = '42501';
  end if;
  if v_event.encounter_id is not null then perform public.generate_billing_event(v_event.organization_id, v_event.encounter_id, null); end if;
  return public.issue_billing_invoice(p_billing_event_id);
end;
$$;

create or replace function public.finish_clinical_encounter(p_encounter_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_encounter public.encounters%rowtype; v_event_id uuid;
begin
  select * into v_encounter from public.encounters where id = p_encounter_id for update;
  if not found or v_encounter.status <> 'in_progress' then raise exception 'An in-progress encounter is required.' using errcode = '22023'; end if;
  if public.get_current_practitioner(v_encounter.organization_id, array['doctor', 'specialist']) is null then
    raise exception 'Only a doctor may complete an encounter.' using errcode = '42501';
  end if;
  update public.encounters set status = 'finished', period_end = now() where id = v_encounter.id;
  update public.appointments set status = 'fulfilled' where id = v_encounter.appointment_id;
  select id into v_event_id from public.billing_events where encounter_id = v_encounter.id and status = 'draft' order by created_at desc limit 1;
  if v_event_id is not null then perform public.issue_billing_invoice(v_event_id); end if;
end;
$$;

create or replace function public.get_billing_workspace(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare v_result jsonb;
begin
  if not (
    public.has_organization_permission(p_organization_id, 'can_view_billing')
    or public.has_organization_permission(p_organization_id, 'can_manage_billing')
  ) then raise exception 'Billing view permission is required.' using errcode = '42501'; end if;
  select jsonb_build_object(
    'billing_events', coalesce((select jsonb_agg(jsonb_build_object(
      'id', event.id, 'organization_id', event.organization_id,
      'appointment_id', event.appointment_id, 'encounter_id', event.encounter_id,
      'patient_id', event.patient_id, 'patient_name', coalesce(patient.name ->> 'text', 'Walk-in'),
      'payor_type', event.payor_type, 'billing_mode', event.billing_mode,
      'billing_mode_source', event.billing_mode_source, 'status', event.status,
      'coverage_id', event.coverage_id, 'finalized_at', event.finalized_at,
      'notes', event.notes, 'created_at', event.created_at,
      'line_item_count', (select count(*) from public.billing_line_items line where line.billing_event_id = event.id and line.payment_status <> 'voided'),
      'total', (select coalesce(sum(line.line_total), 0) from public.billing_line_items line where line.billing_event_id = event.id and line.payment_status <> 'voided')
    ) order by event.created_at desc) from public.billing_events event left join public.patients patient on patient.id = event.patient_id
      where event.organization_id = p_organization_id), '[]'::jsonb),
    'invoices', coalesce((select jsonb_agg(jsonb_build_object(
      'id', invoice.id, 'organization_id', invoice.organization_id,
      'billing_event_id', invoice.billing_event_id, 'patient_id', invoice.patient_id,
      'invoice_number', invoice.invoice_number, 'status', invoice.status,
      'subtotal', invoice.subtotal, 'discount_amount', invoice.discount_amount,
      'tax_amount', invoice.tax_amount, 'total_due', invoice.total_due,
      'amount_paid', invoice.amount_paid, 'balance_due', invoice.balance_due,
      'issued_at', invoice.issued_at, 'paid_at', invoice.paid_at,
      'patient_name', coalesce(patient.name ->> 'text', 'Walk-in'),
      'billing_mode', event.billing_mode, 'payor_type', event.payor_type,
      'appointment_id', event.appointment_id, 'encounter_id', event.encounter_id
    ) order by invoice.created_at desc) from public.invoices invoice
      join public.billing_events event on event.id = invoice.billing_event_id
      left join public.patients patient on patient.id = invoice.patient_id
      where invoice.organization_id = p_organization_id), '[]'::jsonb),
    'recent_payments', coalesce((select jsonb_agg(jsonb_build_object(
      'id', payment.id, 'invoice_id', payment.invoice_id, 'amount', payment.amount,
      'method', payment.method, 'status', payment.status,
      'reference_number', payment.reference_number, 'confirmed_at', payment.confirmed_at,
      'created_at', payment.created_at
    ) order by payment.created_at desc) from public.payments payment where payment.organization_id = p_organization_id), '[]'::jsonb),
    'pos_sales', coalesce((select jsonb_agg(jsonb_build_object(
      'id', sale.id, 'billing_event_id', sale.billing_event_id, 'status', sale.status,
      'customer_name', sale.customer_name, 'receipt_number', sale.receipt_number,
      'completed_at', sale.completed_at, 'total', (select coalesce(sum(line.line_total), 0)
        from public.billing_line_items line where line.billing_event_id = sale.billing_event_id and line.payment_status <> 'voided')
    ) order by sale.created_at desc) from public.pos_sales sale where sale.organization_id = p_organization_id), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.get_billing_line_items(p_billing_event_id uuid)
returns table (
  id uuid, source_type text, source_id uuid, description text, quantity numeric,
  unit_price numeric, currency text, line_total numeric,
  payment_status public.billing_line_payment_status, billing_mode public.billing_mode,
  payor_type public.payor_type, tagged_at timestamptz, void_reason text
) language sql stable security definer set search_path = public, auth as $$
  select line.id, line.source_type, line.source_id, line.description, line.quantity,
    line.unit_price, line.currency, line.line_total, line.payment_status,
    line.billing_mode, line.payor_type, line.tagged_at, line.void_reason
  from public.billing_line_items line
  join public.billing_events event on event.id = line.billing_event_id
  where line.billing_event_id = p_billing_event_id and (
    public.can_access_organization(event.organization_id)
    or exists (select 1 from public.patients patient where patient.id = event.patient_id and patient.auth_user_id = auth.uid())
  ) order by line.created_at;
$$;

create or replace function public.get_invoice_detail(p_invoice_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare v_result jsonb;
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
    'line_items', coalesce((select jsonb_agg(jsonb_build_object(
      'id', line.id, 'source_type', line.source_type, 'description', line.description,
      'quantity', line.quantity, 'unit_price', line.unit_price, 'line_total', line.line_total,
      'payment_status', line.payment_status, 'tagged_at', line.tagged_at,
      'void_reason', line.void_reason
    ) order by line.created_at) from public.billing_line_items line where line.invoice_id = invoice.id), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object(
      'id', payment.id, 'amount', payment.amount, 'method', payment.method,
      'status', payment.status, 'reference_number', payment.reference_number,
      'created_at', payment.created_at, 'confirmed_at', payment.confirmed_at
    ) order by payment.created_at desc) from public.payments payment where payment.invoice_id = invoice.id), '[]'::jsonb)
  ) into v_result
  from public.invoices invoice
  join public.billing_events event on event.id = invoice.billing_event_id
  left join public.patients patient on patient.id = invoice.patient_id
  where invoice.id = p_invoice_id and (
    public.has_organization_permission(invoice.organization_id, 'can_view_billing')
    or public.has_organization_permission(invoice.organization_id, 'can_manage_billing')
  );
  if v_result is null then raise exception 'Invoice not found or access denied.' using errcode = 'P0002'; end if;
  return v_result;
end;
$$;

create or replace function public.get_visit_invoice_qr(p_invoice_id uuid)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  v_invoice public.invoices%rowtype;
  v_event public.billing_events%rowtype;
  v_patient public.patients%rowtype;
  v_raw_token text;
  v_expires_at timestamptz;
begin
  select * into v_invoice from public.invoices where id = p_invoice_id;
  if not found then raise exception 'Invoice not found.' using errcode = 'P0002'; end if;
  select * into v_event from public.billing_events where id = v_invoice.billing_event_id;
  select * into v_patient from public.patients where id = v_invoice.patient_id;
  if v_patient.auth_user_id is distinct from auth.uid() and not (
    public.has_organization_permission(v_invoice.organization_id, 'can_view_billing')
    or public.has_organization_permission(v_invoice.organization_id, 'can_manage_billing')
  ) then raise exception 'Invoice access is denied.' using errcode = '42501'; end if;
  update public.invoice_qr_tokens set revoked_at = now()
  where invoice_id = v_invoice.id and revoked_at is null and expires_at > now();
  v_raw_token := encode(gen_random_bytes(24), 'hex');
  v_expires_at := coalesce((select appointment.end_at + interval '24 hours'
    from public.appointments appointment where appointment.id = v_event.appointment_id), now() + interval '30 days');
  if v_expires_at <= now() then v_expires_at := now() + interval '24 hours'; end if;
  insert into public.invoice_qr_tokens (
    organization_id, appointment_id, encounter_id, invoice_id, token_hash,
    expires_at, created_by
  ) values (
    v_invoice.organization_id, v_event.appointment_id, v_event.encounter_id,
    v_invoice.id, encode(digest(v_raw_token, 'sha256'), 'hex'), v_expires_at, auth.uid()
  );
  return jsonb_build_object(
    'payload', 'ODYSSEY-INVOICE|' || v_raw_token,
    'expires_at', v_expires_at, 'invoice_id', v_invoice.id
  );
end;
$$;

create or replace function public.get_patient_invoices(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare v_patient_id uuid; v_result jsonb;
begin
  select patient.id into v_patient_id from public.patients patient
  where patient.auth_user_id = auth.uid() and patient.organization_id = p_organization_id;
  if v_patient_id is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', invoice.id, 'invoice_number', invoice.invoice_number,
    'status', invoice.status, 'subtotal', invoice.subtotal,
    'total_due', invoice.total_due, 'amount_paid', invoice.amount_paid,
    'balance_due', invoice.balance_due, 'issued_at', invoice.issued_at,
    'paid_at', invoice.paid_at, 'qr_payment_token', null,
    'payor_type', event.payor_type, 'billing_mode', event.billing_mode,
    'billing_mode_source', event.billing_mode_source,
    'appointment_id', event.appointment_id,
    'appointment_status', appointment.status,
    'payment_due_at', appointment.payment_due_at,
    'line_items', coalesce((select jsonb_agg(jsonb_build_object(
      'id', line.id, 'description', line.description, 'quantity', line.quantity,
      'unit_price', line.unit_price, 'line_total', line.line_total,
      'payment_status', line.payment_status
    ) order by line.created_at) from public.billing_line_items line
      where line.invoice_id = invoice.id and line.payment_status <> 'voided'), '[]'::jsonb)
  ) order by invoice.created_at desc), '[]'::jsonb) into v_result
  from public.invoices invoice
  join public.billing_events event on event.id = invoice.billing_event_id
  left join public.appointments appointment on appointment.id = event.appointment_id
  where invoice.patient_id = v_patient_id and invoice.organization_id = p_organization_id;
  return v_result;
end;
$$;

-- Backfill lifecycle fields for financial records created by the earlier loop.
update public.billing_events event set
  billing_mode = coalesce(event.billing_mode, case when event.payor_type in ('philhealth_nbb', 'government_subsidized') then 'nbb' else 'standard' end),
  billing_mode_source = coalesce(event.billing_mode_source, 'historical_payor')
from public.encounters encounter
where encounter.id = event.encounter_id;
update public.billing_events event set
  billing_mode = coalesce(event.billing_mode, case when event.payor_type in ('philhealth_nbb', 'government_subsidized') then 'nbb' else 'standard' end),
  billing_mode_source = coalesce(event.billing_mode_source, 'historical_payor')
where event.billing_mode is null;
update public.encounters encounter set
  billing_mode = event.billing_mode, billing_mode_source = event.billing_mode_source,
  billing_coverage_id = event.coverage_id
from public.billing_events event where event.encounter_id = encounter.id and encounter.billing_mode is null;
update public.appointments appointment set
  billing_mode = event.billing_mode, billing_mode_source = event.billing_mode_source,
  billing_coverage_id = event.coverage_id,
  slot_confirmed_at = case when appointment.status <> 'pending' then coalesce(appointment.slot_confirmed_at, appointment.created_at) else appointment.slot_confirmed_at end
from public.billing_events event where event.appointment_id = appointment.id and appointment.billing_mode is null;
update public.billing_line_items line set
  invoice_id = invoice.id, billing_mode = event.billing_mode, payor_type = event.payor_type,
  payment_status = case
    when line.payment_status = 'voided' then line.payment_status
    when invoice.status = 'paid' and event.billing_mode = 'nbb' then 'written_off'::public.billing_line_payment_status
    when invoice.status = 'paid' then 'paid'::public.billing_line_payment_status
    else 'unpaid'::public.billing_line_payment_status end,
  tagged_at = coalesce(line.tagged_at, line.created_at)
from public.billing_events event
left join public.invoices invoice on invoice.billing_event_id = event.id
where event.id = line.billing_event_id;
insert into public.inventory_usage_financial_ledger (
  organization_id, usage_id, billing_line_item_id, state, quantity,
  unbilled_qty, paid_qty, tagged_by, tagged_at, settled_at
)
select usage.organization_id, usage.id, line.id,
  case line.payment_status when 'paid' then 'paid'::public.inventory_financial_state
    when 'written_off' then 'written_off'::public.inventory_financial_state
    when 'voided' then 'voided'::public.inventory_financial_state
    else 'tagged'::public.inventory_financial_state end,
  usage.quantity,
  case when line.payment_status = 'unpaid' then usage.quantity else 0 end,
  case when line.payment_status = 'paid' then usage.quantity else 0 end,
  usage.tagged_by, usage.used_at,
  case when line.payment_status in ('paid', 'written_off') then coalesce(invoice.paid_at, invoice.issued_at) else null end
from public.inventory_usages usage
join public.billing_line_items line on line.source_type = 'inventory_usage' and line.source_id = usage.id
left join public.invoices invoice on invoice.id = line.invoice_id
on conflict (usage_id) do nothing;

alter table public.billing_events alter column billing_mode set not null;

comment on column public.appointments.billing_mode is 'Resolved billing behavior: STANDARD requires full payment; NBB writes off patient charges.';
comment on table public.inventory_usage_financial_ledger is 'Financial state for immutable physical inventory usage; never used as the physical stock ledger.';
comment on table public.invoice_qr_tokens is 'Short-lived per-visit billing QR tokens stored only as SHA-256 digests.';
comment on table public.billing_state_transitions is 'Append-only audit trail for billing lifecycle state transitions.';

revoke all on function public.log_billing_transition(uuid, text, uuid, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.resolve_billing_mode(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.issue_billing_invoice(uuid) from public, anon, authenticated;
revoke all on function public.ensure_encounter_draft_bill(uuid) from public, anon, authenticated;
revoke all on function public.sync_inventory_usage_to_billing(uuid) from public, anon, authenticated;
revoke all on function public.sync_laboratory_request_to_billing(uuid) from public, anon, authenticated;
revoke all on function public.confirm_inventory_holds_for_billing_event(uuid) from public, anon, authenticated;
revoke all on function public.sync_inventory_hold_to_billing(uuid) from public, anon, authenticated;

revoke all on function public.book_appointment_slot(uuid, uuid, public.appointment_delivery_mode) from public, anon, authenticated;
revoke all on function public.generate_appointment_bill(uuid) from public, anon, authenticated;
revoke all on function public.create_payment_attempt(uuid, public.payment_method, text) from public, anon, authenticated;
revoke all on function public.confirm_payment_attempt(uuid) from public, anon, authenticated;
revoke all on function public.record_payment(uuid, numeric, public.payment_method, text) from public, anon, authenticated;
revoke all on function public.expire_unpaid_appointment_reservations(uuid) from public, anon, authenticated;
revoke all on function public.resolve_invoice_qr(text) from public, anon, authenticated;
revoke all on function public.get_visit_invoice_qr(uuid) from public, anon, authenticated;
revoke all on function public.void_billing_line_item(uuid, text) from public, anon, authenticated;
revoke all on function public.generate_billing_event(uuid, uuid, public.payor_type) from public, anon, authenticated;
revoke all on function public.finalize_billing_event(uuid) from public, anon, authenticated;
revoke all on function public.finish_clinical_encounter(uuid) from public, anon, authenticated;
revoke all on function public.create_diagnostic_service_request(uuid, text, text, text, text, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_billing_workspace(uuid) from public, anon, authenticated;
revoke all on function public.get_billing_line_items(uuid) from public, anon, authenticated;
revoke all on function public.get_invoice_detail(uuid) from public, anon, authenticated;
revoke all on function public.get_patient_invoices(uuid) from public, anon, authenticated;

grant execute on function public.book_appointment_slot(uuid, uuid, public.appointment_delivery_mode) to authenticated;
grant execute on function public.generate_appointment_bill(uuid) to authenticated;
grant execute on function public.create_payment_attempt(uuid, public.payment_method, text) to authenticated;
grant execute on function public.confirm_payment_attempt(uuid) to authenticated;
grant execute on function public.record_payment(uuid, numeric, public.payment_method, text) to authenticated;
grant execute on function public.expire_unpaid_appointment_reservations(uuid) to authenticated;
grant execute on function public.resolve_invoice_qr(text) to authenticated;
grant execute on function public.get_visit_invoice_qr(uuid) to authenticated;
grant execute on function public.void_billing_line_item(uuid, text) to authenticated;
grant execute on function public.tag_inventory_usage(uuid, uuid, numeric, uuid) to authenticated;
grant execute on function public.tag_inventory_usage(uuid, uuid, numeric) to authenticated;
grant execute on function public.generate_billing_event(uuid, uuid, public.payor_type) to authenticated;
grant execute on function public.finalize_billing_event(uuid) to authenticated;
grant execute on function public.finish_clinical_encounter(uuid) to authenticated;
grant execute on function public.create_diagnostic_service_request(uuid, text, text, text, text, text, uuid, uuid) to authenticated;
grant execute on function public.get_billing_workspace(uuid) to authenticated;
grant execute on function public.get_billing_line_items(uuid) to authenticated;
grant execute on function public.get_invoice_detail(uuid) to authenticated;
grant execute on function public.get_patient_invoices(uuid) to authenticated;

-- The inventory workspace reads reconciliation labels from the financial
-- ledger; finalizing a bill alone must never be interpreted as payment.
create or replace function public.get_inventory_usage_billing_statuses(p_organization_id uuid)
returns table (usage_id uuid, billing_status text)
language sql security definer set search_path = public, auth stable as $$
  select ledger.usage_id,
    case ledger.state
      when 'written_off' then 'no-balance-billing'
      when 'paid' then 'paid'
      when 'voided' then 'voided'
      else 'unbilled'
    end
  from public.inventory_usage_financial_ledger ledger
  where ledger.organization_id = p_organization_id
    and (public.has_organization_permission(p_organization_id, 'can_view_inventory')
      or public.has_organization_permission(p_organization_id, 'can_manage_inventory')
      or public.has_organization_permission(p_organization_id, 'can_tag_inventory_usage'));
$$;
revoke all on function public.get_inventory_usage_billing_statuses(uuid) from public, anon, authenticated;
grant execute on function public.get_inventory_usage_billing_statuses(uuid) to authenticated;
