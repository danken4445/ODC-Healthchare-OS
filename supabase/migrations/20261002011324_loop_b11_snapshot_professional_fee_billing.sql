-- Loop B11: derive a distinct, immutable professional-fee invoice line from
-- the effective declaration at bill generation. Rollback: remove the trigger
-- only after all bill generators stop relying on it; keep historical lines.

alter table public.billing_line_items
  drop constraint if exists billing_line_items_source_type_check;
alter table public.billing_line_items
  add constraint billing_line_items_source_type_check check (source_type in (
    'clinic_service', 'professional_fee', 'inventory_usage', 'laboratory_service', 'pos_item'
  ));

create or replace function public.add_professional_fee_billing_line()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fee_model text;
  v_practitioner_role_id uuid;
  v_service_practitioner public.service_practitioners%rowtype;
  v_fee numeric(12,2);
begin
  if new.source_type <> 'clinic_service' then
    return new;
  end if;

  select settings.fee_model
  into v_fee_model
  from public.organization_settings as settings
  where settings.organization_id = new.organization_id;

  if coalesce(v_fee_model, 'fixed_rate') <> 'practitioner_declared' then
    return new;
  end if;

  select appointment.practitioner_role_id
  into v_practitioner_role_id
  from public.billing_events as event
  left join public.encounters as encounter on encounter.id = event.encounter_id
  left join public.appointments as appointment
    on appointment.id = coalesce(event.appointment_id, encounter.appointment_id)
  where event.id = new.billing_event_id
    and event.organization_id = new.organization_id;

  if v_practitioner_role_id is null then
    raise exception 'A practitioner assignment is required to bill a declared professional fee.'
      using errcode = '22023';
  end if;

  select membership.*
  into v_service_practitioner
  from public.service_practitioners as membership
  where membership.organization_id = new.organization_id
    and membership.clinic_service_id = new.source_id
    and membership.practitioner_role_id = v_practitioner_role_id
    and membership.is_active;

  if v_service_practitioner.id is null then
    raise exception 'The assigned practitioner is not active for this service.' using errcode = '22023';
  end if;

  select fee.amount
  into v_fee
  from public.practitioner_service_fees as fee
  where fee.service_practitioner_id = v_service_practitioner.id
    and fee.effective_from <= new.created_at
  order by fee.effective_from desc, fee.created_at desc, fee.id desc
  limit 1;

  if v_fee is null then
    raise exception 'The assigned practitioner is not bookable because no professional fee is effective.'
      using errcode = '22023';
  end if;

  insert into public.billing_line_items (
    organization_id, billing_event_id, source_type, source_id, description,
    quantity, unit_price, currency, billing_mode, payor_type, tagged_by, tagged_at
  ) values (
    new.organization_id, new.billing_event_id, 'professional_fee', v_service_practitioner.id,
    'Professional fee - ' || new.description,
    1, v_fee, new.currency, new.billing_mode, new.payor_type, new.tagged_by, new.tagged_at
  );

  return new;
end;
$$;

create trigger billing_line_items_add_professional_fee
  after insert on public.billing_line_items
  for each row execute function public.add_professional_fee_billing_line();

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

  select coalesce(sum(line_total), 0), coalesce(min(currency), 'PHP')
  into payout_total, payout_currency
  from public.billing_line_items
  where billing_event_id = selected_event.id
    and source_type = 'professional_fee';

  -- Existing fixed-rate and historical invoices have no professional-fee line.
  -- Retain their pre-B11 payout basis so the default organization behavior is unchanged.
  if payout_total <= 0 then
    select coalesce(sum(line_total), 0), coalesce(min(currency), 'PHP')
    into payout_total, payout_currency
    from public.billing_line_items
    where billing_event_id = selected_event.id
      and source_type = 'clinic_service';
  end if;
  if payout_total <= 0 then
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

comment on function public.add_professional_fee_billing_line() is
  'Creates the separate professional-fee billing line at service-line insertion and snapshots the effective fee at that instant.';
comment on function public.refresh_doctor_payout(uuid) is
  'Declared-fee payouts use professional_fee lines. Historical and fixed-rate invoices retain clinic_service as a compatibility fallback; coverage splitting remains TODO.';
