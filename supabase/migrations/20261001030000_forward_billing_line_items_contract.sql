-- Forward the expanded billing-line RPC contract to environments where the
-- billing lifecycle migration was recorded before its clean-replay repair.
-- Rollback: restore the preceding eight-column get_billing_line_items(uuid)
-- definition and reapply its intended EXECUTE grants in a controlled migration.

drop function if exists public.get_billing_line_items(uuid);

create function public.get_billing_line_items(p_billing_event_id uuid)
returns table (
  id uuid,
  source_type text,
  source_id uuid,
  description text,
  quantity numeric,
  unit_price numeric,
  currency text,
  line_total numeric,
  payment_status public.billing_line_payment_status,
  billing_mode public.billing_mode,
  payor_type public.payor_type,
  tagged_at timestamptz,
  void_reason text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    line.id,
    line.source_type,
    line.source_id,
    line.description,
    line.quantity,
    line.unit_price,
    line.currency,
    line.line_total,
    line.payment_status,
    line.billing_mode,
    line.payor_type,
    line.tagged_at,
    line.void_reason
  from public.billing_line_items as line
  join public.billing_events as event
    on event.id = line.billing_event_id
  where line.billing_event_id = p_billing_event_id
    and auth.uid() is not null
    and (
      public.can_access_organization(event.organization_id)
      or exists (
        select 1
        from public.patients as patient
        where patient.id = event.patient_id
          and patient.organization_id = event.organization_id
          and patient.auth_user_id = auth.uid()
      )
    )
  order by line.created_at;
$$;

revoke all on function public.get_billing_line_items(uuid)
  from public, anon, authenticated;
grant execute on function public.get_billing_line_items(uuid)
  to authenticated;
