-- Hosted Supabase may install pgcrypto functions in the extensions schema.
-- The original function's fixed search_path omitted that schema, causing
-- gen_random_bytes(2) to fail at runtime when a walk-in was created.

create extension if not exists pgcrypto;

alter function public.create_walk_in_patient(uuid, jsonb, jsonb, date, text)
  set search_path = public, auth, extensions;
