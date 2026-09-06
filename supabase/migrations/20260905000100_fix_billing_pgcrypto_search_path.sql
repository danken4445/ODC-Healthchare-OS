-- Hosted Supabase installs pgcrypto functions in the extensions schema.
-- Billing finalization creates QR payment tokens with gen_random_bytes(), but
-- its fixed search_path previously omitted extensions.
alter function public.finalize_billing_event(uuid)
  set search_path = public, auth, extensions;

notify pgrst, 'reload schema';
