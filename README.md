# Odyssey Healthcare OS

Foundation monorepo for the patient, provider, and admin applications.

## Local setup

1. Install Node 20+ and pnpm 9+.
2. Copy `.env.example` to each app (`apps/*/.env.local`) and fill in the **development** Supabase URL and anon key.
3. Run `pnpm install`, then `pnpm dev`.
4. Apply database migrations with `pnpm supabase db push` after linking only the development project.

The homepage uses `public.hello_world` to verify the client can read and write to Supabase. This is an intentionally non-clinical smoke-test table; all clinical records will use FHIR-aligned resources and patient-scoped RLS.

## Local auth and RLS verification

After `pnpm.cmd supabase db reset`, local synthetic accounts are available for the Phase 2 check: `doctor@synthetic.odyssey.test`, `nurse@synthetic.odyssey.test`, `front-desk@synthetic.odyssey.test`, `admin@synthetic.odyssey.test`, `lab@synthetic.odyssey.test`, and `patient@synthetic.odyssey.test`. They share the deliberately public local-only password `LocalOnly-2026!`; it is never valid outside a reset local database. Run `supabase/validation/phase2_auth_rls.sql` as a database administrator to verify RLS directly.

Staff access requires an active `practitioners` record and active `practitioner_roles` record at the organization. Registered patients use normal Supabase email/password or magic-link Auth. Front desk staff must call `create_walk_in_patient`; it returns a human-friendly ID and four-digit PIN once, storing only a bcrypt hash. The `issue-walk-in-token` Edge Function validates those credentials and returns a 15-minute patient-scoped JWT. Pass that token to `createWalkInSupabaseClient` rather than creating an Auth session. Configure `WALK_IN_JWT_PRIVATE_JWK` as an Edge Function secret containing a P-256 private JWK imported into Supabase JWT Signing Keys; its `kid` must match the imported key. A registered patient claims their existing history with `claim_walk_in_patient`, which attaches `auth.uid()` to the existing patient row instead of creating another record.

For the hosted Phase 2 test UI, create the synthetic Email/Password users in Dashboard > Authentication > Users, then run `supabase/validation/phase2_hosted_test_accounts.sql` in the SQL Editor. It safely links those Auth users to the synthetic organization roles and patient record; it does not contain or create passwords.

## Required cloud setup

Create three separate Supabase projects (`odyssey-healthcare-os-dev`, `-staging`, `-prod`) and three Vercel projects, one per app. Add the matching environment values in Vercel. Never use production credentials locally.

Enable GitHub branch protection on `main` with required pull requests and the `CI / quality` check. Store non-public keys in Doppler or 1Password, then sync them to GitHub/Vercel secrets; do not place service-role keys in any browser environment variable.
