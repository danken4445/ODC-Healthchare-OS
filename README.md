# Odyssey Healthcare OS

Foundation monorepo for the patient, provider, and admin applications.

## Local setup

1. Install Node 20+ and pnpm 9+.
2. Copy `.env.example` to each app (`apps/*/.env.local`) and fill in the **development** Supabase URL and anon key.
3. Run `pnpm install`, then `pnpm dev`.
4. Apply database migrations with `pnpm supabase db push` after linking only the development project.

The homepage uses `public.hello_world` to verify the client can read and write to Supabase. This is an intentionally non-clinical smoke-test table; all clinical records will use FHIR-aligned resources and patient-scoped RLS.

## Required cloud setup

Create three separate Supabase projects (`odyssey-healthcare-os-dev`, `-staging`, `-prod`) and three Vercel projects, one per app. Add the matching environment values in Vercel. Never use production credentials locally.

Enable GitHub branch protection on `main` with required pull requests and the `CI / quality` check. Store non-public keys in Doppler or 1Password, then sync them to GitHub/Vercel secrets; do not place service-role keys in any browser environment variable.
