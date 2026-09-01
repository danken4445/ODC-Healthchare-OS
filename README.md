# Odyssey Healthcare OS

Foundation monorepo for the patient, provider, and admin applications.

## Local setup

1. Install Node 20+ and pnpm 9+.
2. Copy `.env.example` to each app (`apps/*/.env.local`) and fill in the **development** Supabase URL and anon key.
3. Run `pnpm install`, then `pnpm dev`.
4. Apply database migrations with `pnpm supabase db push` after linking only the development project.

The homepage uses `public.hello_world` to verify the client can read and write to Supabase. This is an intentionally non-clinical smoke-test table; all clinical records will use FHIR-aligned resources and patient-scoped RLS.

## Phase 4 vertical slice

The three homepages now form one scheduling flow:

- Patient (`:3000`): register or sign in, view this clinic's free FHIR Slots, and book one.
- Admin (`:3002`): view today's appointments and create a walk-in patient plus booking.
- Provider (`:3001`): view the assigned doctor's queue, receive new bookings through Supabase Realtime, and mark one in progress to create its Encounter.

Booking and encounter creation use the `book_appointment_slot` and
`start_appointment_encounter` database functions. Do not replace them with
direct table writes: they lock availability and enforce patient/provider scope.

For a clean local verification, start Docker Desktop, run `pnpm supabase db reset`,
point every `apps/*/.env.local` at the local Supabase URL and anon key shown by
`pnpm supabase status`, then run:

```powershell
corepack pnpm exec playwright install chromium
corepack pnpm test:e2e
```

The browser suite starts all three apps and covers registration, patient
booking, front-desk walk-in booking, the provider's no-refresh Realtime update,
and Encounter creation. Run `supabase/validation/phase4_vertical_slice.sql` as
a database administrator for the matching direct RLS/RPC check.

## Loop 1 core visit

The Phase 4 slice is extended into the complete scheduling loop:

- The patient portal publicly lists active clinic services, then supports
  registration, booking, and a Realtime “My appointments” tracker.
- Front desk sees a live daily schedule, schedules existing or walk-in
  patients, and records check-in, cancellation, and no-show transitions.
- Doctors manage their own bookable availability and work an assignment-scoped
  daily queue.
- `/waiting-room` on the admin app is an unauthenticated Realtime display backed
  by a privacy-safe projection containing queue numbers and workflow stages but
  no patient identity data.

Apply `20260901000500_core_visit_loop.sql`, reset with synthetic seed data, and
run `supabase/validation/loop1_core_visit.sql` for the direct RLS/RPC checks.
The Playwright suite covers the live patient → front desk → waiting room →
doctor handoff as well as administrative and walk-in scheduling.

## Clinical documentation loop

An in-progress appointment encounter now opens a consultation chart for doctors
and nurses. SOAP sections are immutable FHIR `Observation` records; revisions
form a database-enforced chain through `supersedes_id`. Doctor-authored
prescriptions and medical certificates are stored as `MedicationRequest` and
`DocumentReference` resources attached to the same encounter. Narrow RPCs
derive the patient, clinic, and clinical author from the signed-in provider,
and direct browser writes to these clinical tables are disabled.

The patient portal subscribes to those encounter-linked resources and displays
them in medical history without a refresh. Patients can also update a bounded
set of profile demographics through a self-only database function. Apply
`20260901000900_clinical_documentation_loop.sql`, then run
`supabase/validation/loop2_clinical_documentation.sql` and the cross-role
Playwright test.

## Multi-clinic tenancy

Each clinic is an `organizations` tenant. Staff accounts resolve exactly one
active clinic from their practitioner role and cannot switch clinics in the UI
or through RLS. Patient authentication is universal, but selecting or joining a
clinic creates an isolated Patient record and a database-enforced clinic access
context; direct reads, bookings, Realtime subscriptions, and clinic data are
then scoped to that clinic only. Run
`supabase/validation/multi_clinic_tenancy.sql` after a reset to verify the
two-clinic boundary.

For staging, apply all migrations, deploy `get-walk-in-records`, create the
synthetic users, and run `phase2_hosted_test_accounts.sql` to link their roles
and create temporary synthetic slots. Set `E2E_PATIENT_*`, `E2E_PROVIDER_*`, and
`E2E_FRONT_DESK_*` when the staging test credentials differ from the local
defaults. The three apps' `NEXT_PUBLIC_SUPABASE_*` values must point to that same
staging project.

## Shared application packages

- `@odyssey/types` contains the generated Supabase schema types and FHIR-shaped summaries such as `PatientSummary`; apps should use these summaries instead of raw table rows.
- `@odyssey/supabase-client` owns public-key client configuration and typed data/auth helpers. Keep direct `.from().select()` calls inside this package.
- `@odyssey/ui` provides the shared, accessible shadcn-style primitives, data table, appointment-status badge, and CSS-variable theme contract. Set `data-odyssey-theme` on the app HTML element to select a theme.
- `@odyssey/config` provides the shared TypeScript baseline, ESLint configuration, and Tailwind-compatible token preset (`@odyssey/config/tailwind-preset`).

After a schema migration, start the local Supabase stack (Docker Desktop is required) and run `pnpm db:types`. This regenerates `packages/types/src/database.ts`; do not hand-edit that generated file.

## Local auth and RLS verification

After `pnpm.cmd supabase db reset`, local synthetic accounts are available for the Phase 2 check: `doctor@synthetic.odyssey.test`, `nurse@synthetic.odyssey.test`, `front-desk@synthetic.odyssey.test`, `admin@synthetic.odyssey.test`, `lab@synthetic.odyssey.test`, and `patient@synthetic.odyssey.test`. They share the deliberately public local-only password `LocalOnly-2026!`; it is never valid outside a reset local database. Run `supabase/validation/phase2_auth_rls.sql` as a database administrator to verify RLS directly.

Staff access requires an active `practitioners` record and active `practitioner_roles` record at the organization. Registered patients use normal Supabase email/password or magic-link Auth. Front desk staff must call `create_walk_in_patient`; it returns a human-friendly ID and four-digit PIN once, storing only a bcrypt hash. The `get-walk-in-records` Edge Function verifies those credentials, returns only that patient's records through a server-side scoped query, and writes a walk-in access audit record. It does not create an Auth session or mint a JWT. A registered patient claims their existing history with `claim_walk_in_patient`, which attaches `auth.uid()` to the existing patient row instead of creating another record.

For the hosted Phase 2 test UI, create the synthetic Email/Password users in Dashboard > Authentication > Users, then run `supabase/validation/phase2_hosted_test_accounts.sql` in the SQL Editor. It safely links those Auth users to the synthetic organization roles and patient record; it does not contain or create passwords.

## Required cloud setup

Create three separate Supabase projects (`odyssey-healthcare-os-dev`, `-staging`, `-prod`) and three Vercel projects, one per app. Add the matching environment values in Vercel. Never use production credentials locally.

Enable GitHub branch protection on `main` with required pull requests and the `CI / quality` check. Store non-public keys in Doppler or 1Password, then sync them to GitHub/Vercel secrets; do not place service-role keys in any browser environment variable.

## Phase 5 observability and guardrails

Each Next.js app sends errors and low-volume traces to its own Sentry project.
Set `NEXT_PUBLIC_SENTRY_DSN` in the matching Vercel project; set `SENTRY_DSN`
for server-side reporting when it differs. To upload private source maps during
builds, add `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` as build
secrets only. The SDK deliberately removes request data, users, breadcrumbs,
extras, and exception messages before sending so patient data is not reported.
Set `SENTRY_DSN` and `SENTRY_ENVIRONMENT` as Supabase Edge Function secrets
before deploying `get-walk-in-records`.

Every pull request to `main` now runs the local Supabase-backed Playwright
vertical slice and `supabase/tests/rls_access.sql`. These checks are intentionally
based on the seeded synthetic users; a policy that exposes another organization
or role will abort the RLS job. Make the `quality`, `migrations`, `rls`, and
`vertical-slice` job checks required in branch protection (GitHub may display
them grouped under the `CI` workflow).

Production backup status and the pre-launch restore drill require Dashboard
access and cannot be verified from this repository. Follow
[`docs/operations/backup-restore-drill.md`](docs/operations/backup-restore-drill.md)
and retain the completed evidence in the launch record.
