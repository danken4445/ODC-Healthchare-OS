-- Walk-in record access is performed by a server-side proxy because walk-in
-- patients have no auth.users identity. Record the successful access as a
-- first-class audit event. The original Phase 1 constraint only covered
-- mutation triggers (insert/update/delete), which caused this audit insert to
-- fail and surfaced to clients as a 503 response.
alter table public.audit_log
  drop constraint if exists audit_log_action_check;

alter table public.audit_log
  add constraint audit_log_action_check
  check (action in ('insert', 'update', 'delete', 'read'));
