-- verify_walk_in_patient also uses pgcrypto's crypt() function. Hosted
-- Supabase commonly installs pgcrypto in extensions, so its fixed search_path
-- must include that schema just like the walk-in creator does.

create extension if not exists pgcrypto;

alter function public.verify_walk_in_patient(uuid, text, text)
  set search_path = public, extensions;
