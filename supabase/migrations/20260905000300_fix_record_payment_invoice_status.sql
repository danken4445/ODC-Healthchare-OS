-- A CASE expression over string literals resolves to text. Cast the result to
-- the invoice_status enum before assigning it to invoices.status.
create or replace function public.record_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_method public.payment_method,
  p_reference text default null
)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare
  v_invoice public.invoices%rowtype;
  v_payment_id uuid;
  v_new_paid numeric(14,2);
  v_new_balance numeric(14,2);
begin
  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found.' using errcode = 'P0002'; end if;
  if v_invoice.status not in ('issued', 'partially_paid') then
    raise exception 'Invoice must be issued or partially paid to accept payment.' using errcode = '22023';
  end if;
  if not public.has_organization_permission(v_invoice.organization_id, 'can_manage_billing') then
    raise exception 'Billing management permission is required.' using errcode = '42501';
  end if;
  if p_amount <= 0 or p_amount > v_invoice.balance_due then
    raise exception 'Payment amount must be between 0 and the balance due.' using errcode = '22023';
  end if;

  insert into public.payments (
    organization_id, invoice_id, amount, currency, method, status,
    reference_number, confirmed_at, recorded_by
  ) values (
    v_invoice.organization_id, p_invoice_id, p_amount, 'PHP', p_method,
    'confirmed', p_reference, now(), auth.uid()
  ) returning id into v_payment_id;

  v_new_paid := v_invoice.amount_paid + p_amount;
  v_new_balance := v_invoice.total_due - v_new_paid;

  update public.invoices
  set amount_paid = v_new_paid,
      balance_due = v_new_balance,
      status = (
        case when v_new_balance <= 0 then 'paid' else 'partially_paid' end
      )::public.invoice_status,
      paid_at = case when v_new_balance <= 0 then now() else null end
  where id = p_invoice_id;

  return v_payment_id;
end;
$$;
