-- Hosted Supabase installs pgcrypto functions in the extensions schema. The
-- billing lifecycle migration fixed the older finalization function but its
-- invoice-token functions still used a restricted search_path, so patient
-- bookings could not resolve gen_random_bytes(integer).
alter function public.issue_billing_invoice(uuid)
  set search_path = public, auth, extensions;

alter function public.get_visit_invoice_qr(uuid)
  set search_path = public, auth, extensions;

notify pgrst, 'reload schema';
