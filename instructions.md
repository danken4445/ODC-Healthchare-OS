# Odyssey Healthcare OS — Agent Instructions

This document is the execution contract for agents working in this repository during the **Building Phase**. Read it before changing code. The user request, applicable security requirements, and these instructions take precedence over convenience or an agent's assumptions.

---

## 1. Project Scope & Architecture

Odyssey Healthcare OS is a multi-application healthcare platform built on Next.js/React, Supabase (Postgres, Auth, Storage, Realtime, Edge Functions), and a FHIR-aligned data model.

The repository is a pnpm/Turborepo monorepo:

```text
apps/patient-web          Patient-facing portal & booking
apps/provider-web         Doctor, nurse, and laboratory workspace
apps/admin-web            Owner, front-desk, inventory, and administration workspace
packages/types            Generated and hand-written shared TypeScript types
packages/supabase-client  Shared Supabase client/helpers
packages/ui               Shared UI components
packages/config           Shared TypeScript/tooling configuration
supabase/migrations       Database source of truth (migrations)
supabase/seed.sql         Synthetic development data only
```

---

## 2. Feature-Driven Build Philosophy

Build **by feature, not by role or app**. A feature isn't done when one role's screen looks finished — it's done when every role that touches it can actually use it, against real data, end to end.

Features are grouped into **loops**: clusters that share the same underlying data relationship (usually chained FHIR resources — `Appointment → Encounter → Observation/MedicationRequest → DiagnosticReport`, etc.). Complete one loop fully across every role it touches before starting the next. Don't let loops overlap — that's the same "everything half-built" problem, just reorganized.

### Definition of Done (Applies to every feature, every loop)

A feature is not done until **all** of these are true:

1. **Real Data**: Every role involved is using real Supabase data — nothing mocked or hardcoded.
2. **RLS & Security**: RLS policies exist and are tested for any new/changed table. Database security is authoritative.
3. **Audit Logging**: Audit logging is wired for any table touching patient data.
4. **End-to-End Testing**: A Playwright test covers the full cross-role flow, not just one role's screen.
5. **Schema Stability**: The next loop's features don't require touching this loop's schema again.

> If a feature fails #5 repeatedly, it's a sign the foundation schema needs a fix — go back, don't build around it.

---

## 3. Build Order & Feature Loops

```
Loop 1: Core Visit          → Appointment lifecycle across Patient/Front Desk/Doctor
Loop 2: Clinical Docs       → Encounter, SOAP notes, prescriptions, certs
Loop 3: Inventory           → Item master, per-department stock ledger, usage tagging
Loop 4: Diagnostics         → Lab orders, results, referrals, specialist portal
Loop 5: Financial           → Billing, payments, POS, HMO claims (incl. consumable charges)
Loop 6: Remote Care         → Teleconsult, payouts
Loop 7: Platform/Governance → Analytics, RBAC UI, white-labeling, admin tooling
```

---

### Loop 1 — Core Visit Loop

_Extends the foundation vertical slice. Everything else in the system hangs off this._

| Feature                                 | Primary Role(s)               |
| --------------------------------------- | ----------------------------- |
| Public clinic portal / service browsing | Patient                       |
| Patient self-registration               | Patient                       |
| Walk-in "Unique ID" login               | Patient, Front Desk           |
| Online appointment booking              | Patient                       |
| My Bookings tracker                     | Patient                       |
| Administrative appointment scheduling   | Front Desk / Admin            |
| Doctor availability management          | Doctor                        |
| Doctor daily workflow / queue           | Doctor                        |
| Public waiting-room queue display       | Front Desk, Patient (passive) |

**Cross-role relationship:** Patient (or front desk on their behalf) creates an `Appointment` → front desk sees it on the day's schedule → doctor sees it on their queue, filtered by their own availability → patient sees live status on "My Bookings" and the waiting-room display via Supabase Realtime.

**Why first:** Every other loop references an `Appointment` or the `Encounter` it produces. Nothing downstream works without this.

---

### Loop 2 — Clinical Documentation Loop

| Feature                                            | Primary Role(s) |
| -------------------------------------------------- | --------------- |
| Consultation entry (SOAP notes, versioned history) | Doctor / Nurse  |
| Prescriptions                                      | Doctor          |
| Medical certificates                               | Doctor          |
| Personal medical history view                      | Patient         |
| Patient profile self-service                       | Patient         |

**Cross-role relationship:** Doctor opens the `Appointment` from Loop 1's queue → creates an `Encounter` → writes SOAP notes (`Observation`s) → issues a `MedicationRequest` and/or `DocumentReference` (cert) off that same `Encounter` → patient sees all of it appear under their medical history in near-real-time.

**Why second:** Requires a real `Encounter` to attach to, which only exists once Loop 1 works. This is also the highest-value loop for a pilot demo — it's the actual clinical visit.

---

### Loop 3 — Inventory & Consumables Loop

_Elevated priority — built right after the clinical documentation loop that produces the data it depends on._

| Feature                                                               | Primary Role(s)         |
| --------------------------------------------------------------------- | ----------------------- |
| Stock and inventory control                                           | Inventory Staff / Admin |
| Service catalog and inventory master management (item-master portion) | Admin                   |

**How the mechanic actually works, translated into data:**

- **Item master:** One row per distinct item (e.g. "Syringe 5ml"), independent of quantity or location.
- **Per-location stock ledger:** A separate row per `(item, department)` pair holding a quantity. Hospital total syringe count split across OPD, IPD, ER, etc. is this table; overall stock is a derived sum across department rows for that item, never a separately-stored number.
- **Subtraction via tagging:** When an authorized user (doctor or staff) uses an item during a patient's `Encounter` (Loop 2), they tag it to that encounter. This decrements quantity on that specific department's ledger row and writes a usage record linking `item → quantity → encounter → patient`. Loop 5 (Financial) reads that exact usage record to generate billing line items.
- **Realtime:** Department views subscribe to the ledger via Supabase Realtime so inventory counts update instantly across departments.
- **FHIR alignment:** Splits `InventoryItem` (definition/logistics) from dispense/usage events to a patient (`MedicationDispense` / supply delivery).
- **Permission for tagging:** Both doctors and authorized staff can tag items to encounters. Enforce via `role_permissions` (e.g., `can_tag_inventory_usage`) and database RLS.

**Cross-role relationship:** Inventory staff/admin receives stock and allocates across departments → doctor/staff tags item during `Encounter` → department ledger decrements in real time → usage record surfaces in Loop 5 billing.

**Why third:** Tagging consumables requires a real `Encounter` (Loop 2) to tag against. Loop 5 billing will rely directly on these usage records.

---

### Loop 4 — Diagnostics Loop (mini-LIS)

| Feature                | Primary Role(s)    |
| ---------------------- | ------------------ |
| Lab ordering & results | Doctor, Lab Staff  |
| Referral management    | Doctor, Specialist |
| Specialist portal      | Specialist         |

**Cross-role relationship:** Doctor creates a `ServiceRequest` (lab order or referral) off the `Encounter` → lab staff sees it queued in worklist → lab staff enters results as a `DiagnosticReport` + `Observation`s → ordering doctor notified → patient sees results on history. Referrals follow the identical `ServiceRequest` shape routed to specialist portals.

**Why fourth:** Reuses the unified `ServiceRequest` pattern across lab orders and referrals before expanding into billing.

---

### Loop 5 — Financial Loop

| Feature                                   | Primary Role(s)     |
| ----------------------------------------- | ------------------- |
| QR-based receipt/payment                  | Patient             |
| Billing, invoicing, and payments          | Front Desk / Admin  |
| B2B company account oversight             | Admin               |
| Point-of-Sale (POS) retail operations     | Front Desk          |
| HMO management: claims and authorizations | Admin, HMO reviewer |

**Cross-role relationship:** A completed `Encounter`, a Loop 3 consumable-usage record, or a POS sale generates a billable line item → invoice generated → patient pays via QR (webhook updates Realtime) or routes to `Claim` for HMO authorization.

**Why fifth:** Billing requires real billable events from Loops 1–4 to bill against.

---

### Loop 6 — Remote Care Loop

| Feature                                | Primary Role(s) |
| -------------------------------------- | --------------- |
| Teleconsultation (video/virtual visit) | Patient, Doctor |
| Teleconsult meeting rooms              | Doctor          |
| Doctor payouts                         | Doctor, Admin   |

**Cross-role relationship:** A Loop 1 `Appointment` flagged as "virtual" spins up a Daily.co/Twilio room → doctor and patient join → generates Loop 2 `Encounter` normally → payouts aggregate completed encounters against Loop 5 financial records.

**Why sixth:** Delivery-mode variant of Loops 1 & 2.

---

### Loop 7 — Platform & Governance Loop

| Feature                                               | Primary Role(s) |
| ----------------------------------------------------- | --------------- |
| Analytics and dashboard overview                      | Admin/Owner     |
| Comprehensive patient records and mass ingestion      | Admin           |
| Patient activity audit trails (UI)                    | Admin           |
| Patient identification via QR code                    | Front Desk      |
| Role-based access and permission settings (UI)        | Owner/Admin     |
| Staff and user account administration                 | Owner/Admin     |
| Clinic white-labeling and brand configuration         | Owner/Admin     |
| Service catalog management (services/pricing portion) | Admin           |
| System-wide document template management              | Admin           |
| Feature flag and module toggling                      | Owner/Admin     |

**Cross-role relationship:** Admin/Owner configuration and oversight sitting on top of data produced across Loops 1–6.

---

## 4. Non-Negotiable Core Engineering Principles

### Multi-clinic tenancy

Odyssey is a multi-clinic platform. `organizations` is the hard security boundary, not a UI filter.

- Every operational resource, configuration record, audit event, Realtime channel, storage object, and query must carry and enforce one `organization_id`. RLS and database functions must verify that all related records belong to that same clinic.
- Clinical and front-desk identities are clinic-bound. A practitioner, doctor, nurse, laboratory staff member, specialist, or front-desk user must have exactly one clinic through an active `PractitionerRole`; never grant those identities cross-clinic clinical visibility. An `admin` or `owner` may hold separate, explicit `user_roles` assignments at more than one clinic (for example, a regional manager). Any administrative clinic switcher must show only those explicit assignments and must never infer access from a URL or browser-stored ID.
- The patient Auth identity is the sole universal user identity. A patient may explicitly enroll at multiple clinics, but each enrollment creates a distinct clinic-scoped `patients` record and an isolated appointment, encounter, clinical-history, billing, and audit trail. Never merge or query those clinic records as one cross-clinic chart.
- Public clinic discovery may expose only intentional directory data. Public queue projections must contain no patient identity data. A public or authenticated client must never select another clinic merely by changing an ID in the browser.
- New features must include a two-clinic RLS and Realtime isolation test. Test both directions: an actor from clinic A cannot read, write, subscribe to, or infer clinic B data; a universal patient can only access the clinic record they explicitly selected.

### Role-based access control and portal admission

- Authentication proves who the actor is; it never, by itself, admits them to a portal or grants record access. Each portal must call the database-authoritative `get_portal_access` decision after session restoration and after password sign-in, and must sign out a rejected session.
- `PractitionerRole` is the source of truth for clinical and front-desk capabilities. `user_roles` is for organization-scoped `admin`/`owner` assignments. A bare `user_roles` clinical role must never authorize clinical data or a provider portal session.
- The Patient portal is for non-staff Auth identities. A newly authenticated non-staff account may self-register/enroll; staff and platform accounts cannot enroll as, or read as, patients. Walk-in access remains a narrowly scoped, clinic-bound credential flow.
- The Provider workspace requires an active doctor or specialist `PractitionerRole`. The administrative workspace requires front-desk, admin, or owner access for at least one explicitly assigned clinic.
- Clinic account administration is stricter than schedule administration: only `admin` or `owner` may create Auth accounts or assign staff roles, and the server-side authorization check must bind every creation to one of the caller's explicit clinic assignments. Front desk may use scheduling workflows only; it must not see or invoke account-management, role-management, or other administrative configuration features.
- Superadmin is an Odyssey platform role kept only in `platform_admins`, never in an organization-scoped role with a nullable clinic. It can administer organizations, staff-role configuration, service configuration, and global audit data, but has no ambient RLS bypass for patients, appointments, encounters, observations, or any other clinical tables. Any future clinical support access must be explicit, time-boxed, reasoned, and separately audited as break-glass access.

1. **Database security is authoritative.** RLS policies, database constraints, and database functions—not frontend conditionals—decide what a user may read or write.
2. **FHIR-shaped clinical data.** Each clinical table must map to a FHIR resource (`Patient`, `Encounter`, `Observation`, `Appointment`, `ServiceRequest`, etc.), retain stable identifiers, and document its mapping.
3. **One type system.** Shared contracts belong in `packages/types` or generated Supabase types (`pnpm db:types`). Do not duplicate clinical interfaces inside an app.
4. **Audit from day one.** Reads and writes involving patient-linked records require an auditable path. New patient-linked tables must include audit coverage in the same migration.
5. **Synthetic data only.** Never put real or plausible identifiable patient data in source, fixtures, logs, screenshots, tests, or `supabase/seed.sql`.
6. **Least privilege and environment separation.** Development, staging, and production are separate Supabase projects. Never use production credentials locally or expose a service-role key to a browser.

---

## 5. Database and Migration Rules

- Every schema change is a new timestamped SQL file in `supabase/migrations/`; do not edit an already-applied migration.
- Enable RLS on every application table. Include explicit policies for each operation and role.
- Use `uuid` identifiers, UTC `timestamptz`, database defaults, foreign keys, check constraints, and indexes appropriate to access patterns.
- Keep auth identity in `auth.users`; application profile/role data belongs in an explicitly related public table.
- Patient-linked tables must record tenant/clinic scope where applicable and must be covered by audit logging.
- Use `SECURITY DEFINER` functions only when necessary, with a fixed `search_path` and narrowly scoped grants.
- Update `supabase/seed.sql` only with deterministic synthetic development data.
- Regenerate shared database types after schema changes (`pnpm db:types`) and fix all resulting TypeScript errors.

---

## 6. Application and Package Rules

- Keep patient, provider, and admin concerns in their respective apps (`patient-web`, `provider-web`, `admin-web`); put reusable behavior in packages (`@odyssey/ui`, `@odyssey/supabase-client`, `@odyssey/types`).
- Browser code may use only `NEXT_PUBLIC_*` values. Server-only secrets must never cross a client boundary.
- Use the shared Supabase client package; do not create ad hoc clients with copied configuration in an app.
- Prefer accessible semantic HTML and shared UI primitives. Preserve keyboard navigation, focus visibility, readable contrast, and responsive layouts.
- Keep route handlers/server actions small, validate inputs at the boundary, and return safe error messages without leaking clinical or infrastructure details.
- Follow the repository's TypeScript strictness and ESLint/Prettier configuration. Avoid `any`; use explicit types or `unknown` with validation.

---

## 7. Agent Execution Workflow

Before editing:

1. Inspect the relevant files and current worktree; confirm which Loop the task belongs to.
2. Verify all prerequisites for that Loop are met.
3. Identify whether the task changes UI, shared types, database schema, security, or tests.

While editing:

1. Build cross-role end-to-end (e.g. Patient booking → Provider queue).
2. For schema work, include RLS, audit coverage, and migration safety in the same change.
3. Add or update Playwright tests and fixtures using synthetic data.

Before finishing:

1. Run `pnpm typecheck` and `pnpm lint`.
2. Run `pnpm test` / Playwright tests where applicable.
3. Run `pnpm build` for affected apps and packages.
4. Verify no `.env`, credentials, tokens, or PHI are included in diffs.

---

## 8. Preferred Handoff Format

End implementation responses with:

- **Changed:** Concise file-level summary.
- **Verified:** Commands, checks, and test results.
- **Loop Status & Next Step:** Current feature loop status and recommended next cross-role step.
