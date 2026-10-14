-- Rollback: drop audit_log_organization_occurred_idx, the two audit triggers,
-- and restore the preceding audit_log_select policy after Operations Log clients retire.
-- Migration: Add clinic operations log performance index, missing audit triggers, and refined select policy

-- 1. Performance index for organization audit lookups ordered by occurrence time
create index if not exists audit_log_organization_occurred_idx
  on public.audit_log (organization_id, occurred_at desc);

-- 2. Audit trigger for pharmacy prescription queue movements
drop trigger if exists pharmacy_prescription_orders_audit on public.pharmacy_prescription_orders;
create trigger pharmacy_prescription_orders_audit
  after insert or update or delete on public.pharmacy_prescription_orders
  for each row execute function public.write_audit_log();

-- 3. Audit trigger for inventory department requisitions
drop trigger if exists inventory_requisitions_audit on public.inventory_requisitions;
create trigger inventory_requisitions_audit
  after insert or update or delete on public.inventory_requisitions
  for each row execute function public.write_audit_log();

-- 4. Ensure RLS select policy permits clinic admins and users with can_view_audit_log permission
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log for select to authenticated
  using (
    public.is_superadmin()
    or (
      organization_id is not null
      and (
        public.has_organization_role(organization_id, array['admin', 'owner'])
        or public.has_organization_permission(organization_id, 'can_view_audit_log')
      )
    )
  );
