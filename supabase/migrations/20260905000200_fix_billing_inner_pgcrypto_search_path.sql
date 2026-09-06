-- The public RPC is a wrapper. The QR payment token is created by this
-- inner function, which has its own fixed search_path and therefore does not
-- inherit the wrapper's extensions schema.
alter function public.finalize_billing_event_without_catalog_sync(uuid)
  set search_path = public, auth, extensions;
