-- Loop F4: preserve one immutable audit row per professional-fee change while
-- recording the administrator actor and the target doctor explicitly.
-- Rollback: restore practitioner_service_fees_audit to public.write_audit_log.

create or replace function public.audit_practitioner_service_fee_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target_role_id uuid;
begin
  select membership.practitioner_role_id
  into v_target_role_id
  from public.service_practitioners membership
  where membership.id = new.service_practitioner_id
    and membership.organization_id = new.organization_id;

  insert into public.audit_log (
    organization_id, actor_id, actor_type, action, table_name, record_id, metadata
  ) values (
    new.organization_id,
    auth.uid(),
    case when auth.uid() is null then 'system' else 'registered_user' end,
    'insert',
    'practitioner_service_fees',
    new.id,
    jsonb_build_object(
      'target_practitioner_role_id', v_target_role_id,
      'service_practitioner_id', new.service_practitioner_id,
      'amount', new.amount,
      'effective_from', new.effective_from
    )
  );
  return new;
end;
$$;

drop trigger if exists practitioner_service_fees_audit on public.practitioner_service_fees;
create trigger practitioner_service_fees_audit
  after insert on public.practitioner_service_fees
  for each row execute function public.audit_practitioner_service_fee_change();
