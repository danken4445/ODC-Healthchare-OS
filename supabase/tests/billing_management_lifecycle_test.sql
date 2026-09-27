begin;
select plan(12);

select ok(exists (select 1 from pg_type where typname = 'billing_mode'), 'billing mode enum exists');
select ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'appointments' and column_name = 'payment_due_at'), 'appointments carry payment expiry');
select ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'billing_line_items' and column_name = 'payment_status'), 'line items carry settlement state');
select ok((select relrowsecurity from pg_class where oid = 'public.inventory_usage_financial_ledger'::regclass), 'inventory financial ledger has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.invoice_qr_tokens'::regclass), 'invoice QR tokens have RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.billing_state_transitions'::regclass), 'billing transition audit has RLS');
select ok(not has_table_privilege('anon', 'public.invoice_qr_tokens', 'select'), 'anonymous callers cannot read QR token digests');
select ok(not has_table_privilege('authenticated', 'public.invoice_qr_tokens', 'insert, update, delete'), 'QR token writes are RPC-only');
select ok(not has_function_privilege('authenticated', 'public.issue_billing_invoice(uuid)', 'execute'), 'invoice issuing helper is not directly callable');
select ok(has_function_privilege('authenticated', 'public.create_payment_attempt(uuid,public.payment_method,text)', 'execute'), 'billing managers can create payment attempts through RPC');
select ok(has_function_privilege('authenticated', 'public.confirm_payment_attempt(uuid)', 'execute'), 'billing managers can confirm payment attempts through RPC');
select ok(has_function_privilege('authenticated', 'public.resolve_invoice_qr(text)', 'execute'), 'billing staff can resolve opaque visit QR tokens');

select * from finish();
rollback;
