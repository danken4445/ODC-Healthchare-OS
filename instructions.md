# Odyssey Healthcare OS — Agent Instructions

This document is the execution contract for agents working in this repository. Read it before changing code. The user request, applicable security requirements, and these instructions take precedence over convenience or an agent's assumptions.

## 1. Project scope

Odyssey Healthcare OS is a multi-application healthcare platform built on Next.js/React, Supabase (Postgres, Auth, Storage, Realtime, Edge Functions), and a FHIR-aligned data model.

The repository is a pnpm/Turborepo monorepo:

```text
apps/patient-web    Patient-facing portal
apps/provider-web   Doctor, nurse, and laboratory workspace
apps/admin-web      Owner, front-desk, and administration workspace
packages/types      Generated and hand-written shared TypeScript types
packages/supabase-client  Shared Supabase client/helpers
packages/ui         Shared UI components
packages/config     Shared TypeScript/tooling configuration
supabase/migrations  Database source of truth
supabase/seed.sql   Synthetic development data only
```

The foundation supports all later features (booking, SOAP notes, lab orders, billing, teleconsultation). Do not prematurely implement those features when a task is limited to foundation work.

## 2. Non-negotiable principles

1. **Database security is authoritative.** RLS policies, database constraints, and database functions—not frontend conditionals—decide what a user may read or write.
2. **FHIR-shaped clinical data.** Each clinical table must map to a FHIR resource (for example `Patient`, `Encounter`, `Observation`, or `Appointment`), retain stable identifiers, and document its mapping.
3. **One type system.** Shared contracts belong in `packages/types` or generated Supabase types. Do not duplicate clinical interfaces inside an app.
4. **Audit from day one.** Reads and writes involving patient-linked records require an auditable path. New patient-linked tables must include the audit design in the same migration.
5. **Vertical slice before breadth.** Prioritize the end-to-end foundation flow: patient registers → books an appointment → provider sees it in a queue.
6. **Synthetic data only.** Never put real or plausible identifiable patient data in source, fixtures, logs, screenshots, tests, or `supabase/seed.sql`.
7. **Least privilege and environment separation.** Development, staging, and production are separate Supabase projects. Never use production credentials locally or expose a service-role key to a browser.

## 3. Database and migration rules

- Every schema change is a new timestamped SQL file in `supabase/migrations/`; do not edit an already-applied migration.
- Enable RLS on every application table. Include explicit policies for each operation and role; absence of a policy should be intentional and documented.
- Use `uuid` identifiers, UTC `timestamptz`, database defaults, foreign keys, check constraints, and indexes appropriate to access patterns.
- Keep auth identity in `auth.users`; application profile/role data belongs in an explicitly related public table.
- Patient-linked tables must record tenant/clinic scope where applicable and must be covered by audit logging.
- Use `SECURITY DEFINER` functions only when necessary, with a fixed `search_path` and narrowly scoped grants.
- Update `supabase/seed.sql` only with deterministic synthetic development data. Never seed secrets or PHI.
- Regenerate shared database types after schema changes (`pnpm db:types`) and fix all resulting TypeScript errors.

## 4. Application and package rules

- Keep patient, provider, and admin concerns in their respective apps; put genuinely reusable behavior in packages.
- Browser code may use only `NEXT_PUBLIC_*` values. Server-only secrets must never cross a client boundary.
- Use the shared Supabase client package; do not create ad hoc clients with copied configuration in an app.
- Prefer accessible semantic HTML and shared UI primitives. Preserve keyboard navigation, focus visibility, readable contrast, and responsive layouts.
- Keep route handlers/server actions small, validate inputs at the boundary, and return safe error messages without leaking clinical or infrastructure details.
- Do not add a dependency when the existing stack or a small local utility is sufficient. If a dependency is necessary, update the workspace manifest and lockfile together.
- Follow the repository's TypeScript strictness and ESLint/Prettier configuration. Avoid `any`; use an explicit type or `unknown` with validation.

## 5. Agent workflow

Before editing:

1. Inspect the relevant files and current worktree; preserve unrelated user changes.
2. Identify whether the task changes UI, shared types, database schema, security, or deployment configuration.
3. State assumptions in the implementation notes when requirements are ambiguous.

While editing:

1. Make the smallest coherent change that satisfies the request.
2. Use `apply_patch` for source edits.
3. Add or update tests/fixtures for changed behavior, using synthetic data.
4. For schema work, include RLS, audit coverage, and migration safety in the same change.

Before finishing:

1. Run `pnpm typecheck` and `pnpm lint`.
2. Run `pnpm build` for app or shared-runtime changes.
3. For migration work, run the migration against a clean local/throwaway Postgres database where available, then verify policies and seed behavior.
4. Inspect the final diff and confirm no `.env`, credentials, tokens, PHI, generated build output, or unrelated edits are included.
5. Report exactly what changed, what was verified, and any blocked account/infrastructure action.

## 6. Definition of done

A change is complete only when:

- Its code and data model are consistent with the architecture above.
- Security is enforced in the database for any protected data.
- Shared types and generated artifacts are updated where needed.
- Relevant automated checks pass, or the failure is explicitly reported with its cause.
- The change is deployable through the existing CI/Vercel/Supabase workflow.
- Documentation is updated when setup, migrations, environment variables, or operator behavior changes.

## 7. Foundation acceptance criteria

Foundation work is considered ready when an empty app deploys, connects to the development Supabase project, and a synthetic `hello_world` record round-trips successfully through the CI/local infrastructure. The next milestone is the complete registration → appointment booking → provider queue vertical slice on real development infrastructure.

Agents may prepare configuration, migrations, CI, and code for cloud setup, but must not claim that Supabase projects, Vercel projects, secrets managers, GitHub branch protection, or remote deployments are configured unless they have direct evidence from the relevant service.

## 8. Preferred handoff format

End implementation responses with:

- **Changed:** concise file-level summary.
- **Verified:** commands/checks and results.
- **Follow-up:** explicit remaining work, blockers, or required human account actions.
