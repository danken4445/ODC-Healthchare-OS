# MASTER PROMPT (Codex Multi-Agent Edition): Multi-Doctor Readiness for Odyssey Healthcare OS

## 0. Kickoff (paste this into Codex to start)

```text
Read multi-doctor-master-prompt-codex.md in full. You are the ORCHESTRATOR.
Step 1: complete Section 7.2 (create the agent config files) and confirm the custom agents are available.
Step 2: execute Loop A using the pipeline in Section 7.4. You MUST spawn subagents as specified there; do not do the implementation work yourself.
For every subagent phase: spawn the listed agents, wait for all of them, then give me a consolidated summary (no raw logs).
Stop after Loop A's review gate passes and wait for my go-ahead before starting Loop B.
```

> Codex only spawns subagents when explicitly asked (or when `AGENTS.md` or a skill instructs it). The kickoff above and the `AGENTS.md` snippet in Section 7.8 exist for that reason. Run in an interactive session (not `codex exec`), because subagent approval requests cannot be answered in non-interactive runs and will fail.

---

## 1. Role

You are the **orchestrator**: a senior full-stack engineer and tech lead working in the `ODC-Healthchare-OS` monorepo (Next.js + Supabase, FHIR-aligned data model). You plan, delegate, integrate, and verify. You keep your own context clean by delegating exploration, implementation, testing, and review to subagents and consuming their **summaries**, not their raw output.

Apply production-grade practices: additive migrations, typed contracts, RLS-first security, tested concurrency, small reviewable changes.

## 2. Objective

Make the system fully multi-doctor capable across `apps/patient-web`, `apps/provider-web`, `apps/admin-web`, `packages/supabase-client`, and `supabase/migrations`. A clinic or hospital with many doctors must be able to schedule, book, queue, treat, bill, and pay them without collisions, information leaks, or blocked workflows.

## 3. Audit Findings (already established)

**Ready:** FHIR-aligned schema (`practitioners`, `practitioner_roles`, `appointments`, `encounters`, `appointment_slots` keyed by `practitioner_role_id`); doctor-scoped overlap checks in `save_provider_weekly_availability`; per-doctor WebRTC teleconsult rooms and specialist directory; per-doctor payout ledgers.

**Broken or missing:**

| # | Problem | Location |
|---|---|---|
| F1 | Services are owned 1:1 by a doctor (`clinic_services.owner_practitioner_role_id`); other doctors cannot set availability for a shared service, forcing duplicate services | `20260901001300_loop2_readiness_fixes.sql`, `20260926000400_fix_weekly_availability_today_slots.sql` |
| F2 | Patient booking has no doctor selection and slot cards show no doctor | `patient-web/app/components/AvailableSlotsCalendar.tsx`, `getAvailableAppointmentSlots` |
| F3 | Queue numbers are clinic-wide via `max()+1` in a trigger (likely race condition under concurrent inserts) | `assign_appointment_queue_number` in `20260905000500_remote_care_loop.sql` |
| F4 | `waiting_room_queue` has no doctor or room info | `20260901000500_core_visit_loop.sql` |
| F5 | `getProviderAppointmentSlots` is not scoped to the caller's `practitioner_role_id`, and RLS lets all staff read all free slots, so Doctor A sees Doctor B's slots and gets "Editable appointment slot not found" on blocking | `packages/supabase-client/src/index.ts`, `20260905000900_optimize_appointment_slots_select_policy.sql` |
| F6 | Queue table has no Assigned Doctor column or filter; doctor-admins can see all appointments and hit "Assigned appointment not found" when starting another doctor's patient | `provider-web/app/page.tsx`, `start_appointment_encounter` |
| F7 | Nurse queue does not show the assigned doctor | triage views |
| F8 | `add_soap_observation` / `finish_clinical_encounter` only check "active doctor in clinic": no assignment check, no attribution, no concurrent-edit protection | `20260901000900_clinical_documentation_loop.sql` |

## 4. Confirmed Product Decisions (do not re-litigate)

1. **Queue modes:** support both `clinic_wide` (default) and `per_practitioner` (per-doctor sequences with a short prefix, e.g. `A-001`), selected per organization.
2. **Patient chooses the doctor.** There is no "Any available" auto-assignment. Booking flow: Service → Doctor → Date → Time.
3. **Professional fees:**
   - **Government facilities:** fixed rate. The service price is the only price, and no doctor overrides are allowed. Standard prices are still tracked per line item for PhilHealth (No Balance Billing is unchanged).
   - **Private facilities:** each doctor declares their own professional fee per service through a new **Fees** CMS.

## 5. Open Decision (design for it, do not hard-code)

**Payout attribution when a covering doctor completes another doctor's encounter.** Working default: the **assigned doctor** keeps the professional fee. A covering doctor is paid only if an admin records an explicit coverage arrangement with a split. Store `performed_by_practitioner_role_id` and `assigned_practitioner_role_id` separately so either policy can be applied later. Do not implement payout-splitting logic until this is confirmed; leave a clearly marked TODO and surface it in your report.

## 6. Engineering Rules (non-negotiable, apply to every agent)

- **Expand → migrate → contract.** Never drop or rename in the same release. Deprecate columns with a comment; drop one release later.
- **Migration files:** `YYYYMMDDHHMMSS_<slice>_<change>.sql`, one concern per file, with a documented rollback note at the top.
- **Rules that must hold under concurrency live in Postgres RPCs**, not the client.
- **`SECURITY DEFINER` functions** must set `search_path = ''`, check `auth.uid()`, and scope every query by `organization_id`.
- **RLS on every new table**, org-scoped, least privilege.
- **Types:** regenerate Supabase types after each migration. Add Zod schemas for RPC inputs and outputs in `packages/supabase-client`. No hand-written row types, no `any`.
- **Permissions** are new keys in the existing Roles CMS, not hard-coded role checks.
- **Feature flags** live in `organization_settings`, so behavior is reversible per clinic.
- **Key every new table on `organization_id` + `practitioner_role_id`, never `practitioner_id` alone**, to stay valid for the Phase 2 federated network where a physician may serve several clinics.
- **Privacy:** patient-facing and public projections expose only the minimum fields (no license numbers or emails; no patient names on the lobby display).
- **UI:** follow the existing design system and the frontend-design guidelines; keep components small, typed, accessible, with loading, empty, and error states.
- **Every change ships with tests** (Section 10).
- **Never run destructive database commands against anything other than the local development database.**

---

## 7. Codex Multi-Agent Operating Model

### 7.1 Principles

1. **Parallelize reads, serialize writes.** Exploration, testing, and review run in parallel. Writing work is split by **exclusive file ownership** (Section 7.3) so agents never edit the same files. Anything with ordering dependencies (migrations, then client, then UI) runs as a pipeline, not in parallel.
2. **One writer for migrations.** Only `db_engineer` creates or edits files in `supabase/migrations`. You assign migration timestamps to prevent collisions and ordering mistakes.
3. **Contract first.** Before any writer starts, you produce a short **contract** for the loop: table and column names, RPC signatures with argument and return types, permission keys, and error codes. UI and client agents build against the contract, so they can run in parallel with the database work where the contract is stable.
4. **Subagents return summaries, not logs.** Every subagent reports in the format in Section 7.6. You never paste raw command output into the main thread.
5. **No nesting.** Subagents do not spawn subagents (keep depth at 1).
6. **You do not implement.** You may edit only the contract notes and glue that spans ownership boundaries. Delegate everything else.
7. **Commits are yours.** Subagents do not run `git commit`. After each phase you verify the diff and commit sequentially, so concurrent agents never fight over the git index.
8. **Reviewer gate.** No loop is finished until the `reviewer` agents report zero blocking findings.

### 7.2 One-time setup (Step 1 of the kickoff)

Create `.codex/config.toml` (merge if it exists):

```toml
[agents]
max_concurrent_threads_per_session = 6
# Optional cost/speed tuning, uncomment and set to models available on your account:
# default_subagent_model = "<fast model>"
# default_subagent_reasoning_effort = "medium"
```

Create these files under `.codex/agents/`. Each defines one custom agent. Model settings are intentionally omitted so agents inherit yours; add `model` and `model_reasoning_effort` per agent if you want cheaper exploration or deeper review.

`.codex/agents/code-mapper.toml`
```toml
name = "code_mapper"
description = "Read-only explorer that traces code paths, RLS policies, and RPCs and verifies audit assumptions before implementation."
sandbox_mode = "read-only"
developer_instructions = """
Stay in exploration mode. Read multi-doctor-master-prompt-codex.md Sections 3-6 first.
Trace the real execution path, cite files, line ranges, and symbols. Verify every item marked [verify] that the parent assigns you.
Do not propose or make code changes unless asked. Report contradictions with the audit findings explicitly.
Return the structured report from Section 7.6.
"""
```

`.codex/agents/db-engineer.toml`
```toml
name = "db_engineer"
description = "Owns supabase/migrations and SQL: schema, RLS, RPCs, triggers, seeds. The only agent allowed to write migrations."
sandbox_mode = "workspace-write"
developer_instructions = """
Read multi-doctor-master-prompt-codex.md Sections 4-6 first, then the contract the parent gives you.
You may edit ONLY: supabase/migrations/**, supabase/seed*, and supabase/config files the parent names. Use the migration timestamps the parent assigns.
Follow expand -> migrate -> contract. Every SECURITY DEFINER function sets search_path = '' and checks auth.uid() and organization scope.
Add RLS to every new table. Include a rollback note at the top of each migration.
Apply migrations only to the local development database and confirm they run cleanly from scratch.
Do not commit. Return the structured report from Section 7.6.
"""
```

`.codex/agents/client-engineer.toml`
```toml
name = "client_engineer"
description = "Owns packages/supabase-client: typed RPC wrappers, Zod schemas, generated types."
sandbox_mode = "workspace-write"
developer_instructions = """
Read multi-doctor-master-prompt-codex.md Sections 4-6 first, then the contract the parent gives you.
You may edit ONLY: packages/supabase-client/** and the location of generated Supabase types.
Regenerate types after the database migrations land. No hand-written row types, no any. Add Zod schemas for every RPC input and output.
Keep function signatures exactly as the contract states; if the contract is impossible, stop and report instead of improvising.
Do not commit. Return the structured report from Section 7.6.
"""
```

`.codex/agents/provider-ui.toml`
```toml
name = "provider_ui"
description = "Owns apps/provider-web: queue, availability studio, schedule builder, Fees tab, encounter UI."
sandbox_mode = "workspace-write"
developer_instructions = """
Read multi-doctor-master-prompt-codex.md Sections 4-6 first, then the contract the parent gives you.
You may edit ONLY: apps/provider-web/**. Consume data only through packages/supabase-client; never call Supabase tables directly from components.
Follow the existing design system. Every screen needs loading, empty, and error states, and must be accessible.
Do not commit. Return the structured report from Section 7.6.
"""
```

`.codex/agents/patient-ui.toml`
```toml
name = "patient_ui"
description = "Owns apps/patient-web: booking flow, doctor selection, appointment views."
sandbox_mode = "workspace-write"
developer_instructions = """
Read multi-doctor-master-prompt-codex.md Sections 4-6 first, then the contract the parent gives you.
You may edit ONLY: apps/patient-web/**. Consume data only through packages/supabase-client.
Expose only privacy-safe doctor fields. Handle 'slot taken' conflicts gracefully. Follow the existing design system.
Do not commit. Return the structured report from Section 7.6.
"""
```

`.codex/agents/admin-ui.toml`
```toml
name = "admin_ui"
description = "Owns apps/admin-web: service editor, doctor assignment, fee settings, rooms, staff management, admin calendar."
sandbox_mode = "workspace-write"
developer_instructions = """
Read multi-doctor-master-prompt-codex.md Sections 4-6 first, then the contract the parent gives you.
You may edit ONLY: apps/admin-web/**. Consume data only through packages/supabase-client.
Follow the existing design system and Roles CMS conventions for permission keys.
Do not commit. Return the structured report from Section 7.6.
"""
```

`.codex/agents/test-engineer.toml`
```toml
name = "test_engineer"
description = "Owns tests: pgTAP, concurrency tests, Playwright end-to-end flows, seed fixtures for tests."
sandbox_mode = "workspace-write"
developer_instructions = """
Read multi-doctor-master-prompt-codex.md Sections 4-6 and 10 first, then the contract and acceptance criteria the parent gives you.
You may edit ONLY: test directories (create supabase/tests for pgTAP and the e2e directory if they do not exist) and test fixtures.
Never modify application, migration, or client code to make a test pass; report the defect instead.
Run the tests you write and report exact pass/fail counts and failing test names. Concurrency tests must be deterministic (fixed counts, no sleeps as synchronization).
Do not commit. Return the structured report from Section 7.6.
"""
```

`.codex/agents/reviewer.toml`
```toml
name = "reviewer"
description = "Read-only reviewer for RLS/security, privacy, concurrency, correctness, and regression risk. Acts as the loop gate."
sandbox_mode = "read-only"
developer_instructions = """
Review like an owner. Read multi-doctor-master-prompt-codex.md Sections 3-6 and 10 first.
Prioritize: RLS gaps and cross-doctor or cross-organization data leaks, SECURITY DEFINER misuse, privacy exposure in patient-facing or public projections, race conditions, non-backward-compatible migrations, missing tests.
Classify each finding as BLOCKING or NON-BLOCKING with file, line, reproduction or reasoning, and a suggested fix. Avoid style-only comments unless they hide a real bug.
Do not edit files. Return the structured report from Section 7.6 with a final verdict: PASS or BLOCKED.
"""
```

**After creating the files:** ask Codex to list the available custom agents. If they are not recognized in the current session, restart the session in this repo. As a fallback, use the built-in agents (`explorer` for `code_mapper`/`reviewer`, `worker` for the writers) and paste the corresponding `developer_instructions` into each spawn brief.

### 7.3 File ownership matrix (exclusive write access)

| Agent | May write | Never writes |
|---|---|---|
| `db_engineer` | `supabase/migrations/**`, `supabase/seed*` | everything else |
| `client_engineer` | `packages/supabase-client/**`, generated types | migrations, apps |
| `provider_ui` | `apps/provider-web/**` | packages, other apps |
| `patient_ui` | `apps/patient-web/**` | packages, other apps |
| `admin_ui` | `apps/admin-web/**` | packages, other apps |
| `test_engineer` | test dirs and fixtures only | application code |
| `code_mapper`, `reviewer` | nothing (read-only) | everything |
| **Orchestrator** | contract notes; cross-boundary glue only | bulk implementation |

If an agent needs a change outside its ownership, it must **report the need** instead of making the edit. You then route it to the owner.

### 7.4 Per-loop pipeline

Each loop follows these phases. Within a phase, spawn the listed agents **in parallel**, wait for all of them, and consolidate before moving on.

| Phase | Agents (parallel within phase) | Output |
|---|---|---|
| **P1 Recon** | 1-3 × `code_mapper`, each with a distinct question and its [verify] items | Verified facts; deviations from the audit |
| **P2 Contract** | you (orchestrator) | Loop contract: schema, RPC signatures, permission keys, error codes, migration timestamps, acceptance criteria per agent |
| **P3 Database** | `db_engineer` (+ `test_engineer` writing pgTAP against the contract in parallel) | Migrations applied locally; pgTAP written |
| **P4 Client** | `client_engineer` (after P3 so types can be generated) | Typed wrappers, Zod schemas, regenerated types |
| **P5 UI** | `provider_ui`, `patient_ui`, `admin_ui` as needed, in parallel (disjoint directories) | Screens built on the client package |
| **P6 Verify** | `test_engineer` (Playwright, concurrency, regression) | Test results with exact counts |
| **P7 Review gate** | 2 × `reviewer` in parallel: (a) security/RLS/privacy, (b) concurrency/correctness/regression | PASS or BLOCKED with findings |
| **P8 Fix** | Route each BLOCKING finding to its owning agent; re-run P6 and P7 | Zero blocking findings |
| **P9 Report** | you | Loop report (Section 11) and sequential commits |

You may start P4 and P5 early against the contract only when the RPC signatures are final; otherwise wait for P3.

### 7.5 Spawn brief template

Every spawn instruction you write must contain:

```text
Agent: <name>          Loop/Tasks: <e.g. Loop B: B1-B4>
Goal: <one sentence>
Contract: <tables/columns, RPC signatures, permission keys, error codes relevant to this agent>
Files you may edit: <exact paths from the ownership matrix>
Files you must read first: <specific files>
Acceptance criteria: <testable list>
Constraints: <rules from Section 6 that apply; anything explicitly out of scope>
Return: the Section 7.6 report, maximum ~250 words plus the file list.
```

### 7.6 Subagent report format

```text
STATUS: DONE | BLOCKED | PARTIAL
SUMMARY: <what was done, 3-6 sentences>
FILES CHANGED: <path list>
TESTS RUN: <command -> pass/fail counts, failing test names>
DEVIATIONS: <anything that differs from the contract or audit findings>
NEEDS FROM OTHERS: <changes required outside your ownership>
RISKS / OPEN QUESTIONS: <bullets>
```
Reviewers add `VERDICT: PASS | BLOCKED` and a findings list tagged BLOCKING or NON-BLOCKING.

### 7.7 Failure handling

- **BLOCKED or contradictory reports:** stop the phase, resolve the contract, then re-spawn only the affected agent with a corrected brief.
- **Overlapping edits detected** (two agents changed one file): revert the later change, fix the ownership boundary, re-run that agent.
- **Test failures:** route to the owning code agent, never to `test_engineer` to "make it pass".
- **Cost control:** use `code_mapper` and `reviewer` sparingly with narrow questions; prefer 1-3 focused agents over a wide fan-out. Never exceed the configured concurrency cap.
- **Any ambiguity touching billing, inventory, or teleconsult behavior beyond the spec:** stop and ask the human.

### 7.8 Add to the repository `AGENTS.md`

```markdown
## Multi-doctor initiative
- Follow multi-doctor-master-prompt-codex.md for all work on this initiative.
- The main agent acts as orchestrator: delegate exploration to `code_mapper`, implementation to the owning writer agent (`db_engineer`, `client_engineer`, `provider_ui`, `patient_ui`, `admin_ui`), tests to `test_engineer`, and review to `reviewer`.
- Only `db_engineer` writes migrations. Subagents never commit. Subagents return structured summaries, not raw logs.
```

---

## 8. Work Plan (vertical-slice loops)

Complete one loop fully (DB → RPC → client → UI → tests → review gate) before starting the next, using the pipeline in Section 7.4. The **Agents** line under each loop maps tasks to owners. Items marked **[verify]** are assigned to `code_mapper` in P1.

### Loop A: Stabilize (no schema risk)
**Agents:** P1 `code_mapper` ×2 (slots RLS and dependents; provider/nurse queue UI) → P3 `db_engineer` (A2) ‖ `test_engineer` (pgTAP) → P4 `client_engineer` (A1) → P5 `provider_ui` (A3-A5 and helper) → P6/P7.

- A1. Scope `getProviderAppointmentSlots()` by the caller's `practitioner_role_id`; add explicit `scope: 'mine' | 'clinic'` (clinic scope requires `can_manage_appointments`).
- A2. Replace the staff `SELECT` policy on `appointment_slots`: own slots, or clinic-wide only with `can_manage_appointments`. Patients must keep reading free slots through the patient-safe RPC (Loop C); confirm nothing else depends on the broad policy **[verify]**.
- A3. Provider queue: add **Assigned Doctor** column, **My patients / All** toggle (default: mine), and a doctor filter.
- A4. Disable or hide "Mark in progress" unless the appointment is assigned to the caller or the caller has reassign permission; map the backend error to a readable message as a fallback.
- A5. Nurse queue shows the assigned doctor.
- Shared helper: `useCurrentPractitionerRole()` in provider-web.

### Loop B: Service catalog decoupling and Professional Fee CMS
**Agents:** P1 `code_mapper` ×2 (availability RPC and service ownership usages; billing and `doctor_payouts` derivation for B11) → P3 `db_engineer` (B1-B9, migrations strictly sequential) ‖ `test_engineer` → P4 `client_engineer` → P5 `provider_ui` (Fees tab, schedule dropdowns) ‖ `admin_ui` (service editor, fee overview) → P6/P7.

- B1. Create `service_practitioners` (`organization_id`, `clinic_service_id`, `practitioner_role_id`, `is_active`, `duration_minutes_override`, unique on service + role). RLS: staff read within the org; writes need `can_manage_services`.
- B2. Backfill from `clinic_services.owner_practitioner_role_id` with a pre-check that aborts on invalid or null owners. Make the owner column nullable and mark it deprecated.
- B3. Update `save_provider_weekly_availability` to authorize via active `service_practitioners` membership for the caller instead of owner match. Keep doctor-scoped overlap checks.
- B4. RPCs: `assign_service_practitioners`, `unassign_service_practitioners`, audited and permission-gated.
- B5. **Fee model:** `organization_settings.fee_model` in (`fixed_rate`, `practitioner_declared`).
- B6. **Versioned, insert-only** `practitioner_service_fees` (`service_practitioner_id`, `amount >= 0`, `effective_from`, `created_by`). Current fee = latest row with `effective_from <= now()`.
- B7. Optional admin bounds `min_professional_fee` / `max_professional_fee` per service, enforced inside the RPC.
- B8. RPCs: `set_my_professional_fee(service_id, amount)` (caller must be that practitioner, org must be `practitioner_declared`, bounds respected) and `get_professional_fee_at(service_practitioner_id, at)`. Admins with `can_manage_services` may view all history and set fees on a doctor's behalf (audited).
- B9. In `practitioner_declared` mode, a doctor with no declared fee for a service is **not bookable** for it (no accidental ₱0).
- B10. **UI:** provider-web **Fees** tab (my services, current fee, edit, history drawer) plus a **Fees** tab permission in the Roles CMS; admin-web service editor with "Doctors offering this service" multi-select, fee overview, fee-model toggle, and bounds; provider schedule/availability service dropdowns list only assigned services.
- B11. Invoice: professional fee and facility service price are **separate lines**; **snapshot** the fee amount onto the invoice line at bill generation so later fee changes never alter existing bills **[verify how bills and `doctor_payouts` currently derive amounts and adapt accordingly]**.

### Loop C: Doctor-first patient booking
**Agents:** P1 `code_mapper` (booking RPCs, slot-status transitions, bill generation hook) → P3 `db_engineer` (C1-C3, C5) ‖ `test_engineer` (20-parallel-booking test) → P4 `client_engineer` → P5 `patient_ui` (C4) → P6/P7.

- C1. Privacy-safe view or RPC `bookable_practitioners(service_id)`: `practitioner_role_id`, display name, specialty, title, photo only; active doctors assigned to the service and (in private mode) with a declared fee.
- C2. `get_available_slots(service_id, date_range, practitioner_role_id)` returning slots with doctor fields (`practitioner_role_id` required).
- C3. `book_appointment(slot_id)`: `select … for update` on the slot, verify still `free`, attach the appointment in one transaction; add a constraint guaranteeing one active appointment per slot.
- C4. patient-web `AvailableSlotsCalendar.tsx`: Service → Doctor cards → Date → Time; slot cards and confirmation show doctor name and specialty; doctor cards show total price (facility fee + professional fee, or the fixed rate).
- C5. Preserve the existing bill-then-confirm-after-payment lifecycle and the government free-service exception.

### Loop D: Day-of-visit (queue, rooms, waiting room)
**Agents:** P1 `code_mapper` ×2 (queue trigger and parallel-insert race reproduction; which app hosts the lobby display) → P3 `db_engineer` (D1-D4) ‖ `test_engineer` (50-parallel-insert test) → P4 `client_engineer` → P5 `provider_ui` (queue labels), `admin_ui` (rooms grid), and the app hosting the lobby display → P6/P7.

- D1. `queue_counters(organization_id, scope_key, queue_date, last_value)` with atomic allocation via `insert … on conflict do update … returning`. **[verify the current race with a parallel-insert test first.]**
- D2. `organization_settings.queue_mode` (`clinic_wide` | `per_practitioner`); `per_practitioner` uses `scope_key = practitioner_role_id` plus a per-doctor `queue_prefix`. Store `queue_label` on the appointment; the UI never reformats it.
- D3. `clinic_rooms` and `room_assignments` (practitioner, room, date, shift) with an exclusion constraint preventing overlapping double-booking of a room; admin daily assignment grid.
- D4. Extend `waiting_room_queue` with `queue_label`, `practitioner_display_name`, `room_label`. **No patient names.** Add a Realtime subscription; lobby display groups "Now serving" by doctor and room.
- D5. Default org settings (`clinic_wide`, no rooms) must behave exactly as today.

### Loop E: Reassignment, coverage, concurrency
**Agents:** P1 `code_mapper` (SOAP/finish RPCs, encounter write paths, teleconsult join checks) → P3 `db_engineer` (E1-E4) ‖ `test_engineer` (two-session conflict test) → P4 `client_engineer` → P5 `provider_ui` (reassign, absent-doctor flow, presence indicator, conflict dialog), `patient_ui` (reassignment notice if applicable) → P6/P7.

- E1. `reassign_appointment(appointment_id, new_practitioner_role_id, reason)` gated by `can_reassign_appointments`; updates the appointment and any open encounter, handles the slot, writes an audit row, and notifies the patient. UI: queue "Reassign" action and a "Mark doctor absent" bulk flow.
- E2. Tighten `add_soap_observation` / `finish_clinical_encounter`: require assigned doctor **or** active coverage grant **or** reassign permission. Record `authored_by_practitioner_role_id` on observations (Provenance-style attribution).
- E3. Optimistic concurrency: `version` on encounters and a `p_expected_version` parameter on write RPCs; conflicts return a typed error and the UI offers "reload latest". Add an advisory presence lock (`encounter_locks`, heartbeat, 60 s expiry) with an "X is editing this chart" indicator. The version check is the real safeguard.
- E4. Payout attribution per Section 5 (store both role ids; no splitting logic yet).

### Loop F: Admin oversight and hardening
**Agents:** P1 `code_mapper` (teleconsult permissions, audit coverage gaps) → P3 `db_engineer` (audit, permission keys) → P4 `client_engineer` → P5 `admin_ui` (calendar, doctor management, Roles CMS keys), `provider_ui` (as needed) → P6 full regression → P7 two `reviewer` agents over the **entire initiative**, not just this loop.

- F1. Admin clinic-wide calendar by doctor (read-only unless permitted).
- F2. Doctor management screen shows assigned services, rooms, queue prefix.
- F3. New permission keys in the Roles CMS: `can_manage_services`, `can_reassign_appointments`, `can_view_clinic_queue`, `can_manage_rooms`, and the **Fees** tab.
- F4. Audit log coverage for reassignment, service assignment, fee changes, and slot changes.
- F5. Verify teleconsult join permissions use assigned doctor or coverage grant **[verify `teleconsult_rooms`]**.

## 9. Rollout

Flag per organization, pilot in one clinic with two doctors, then enable broadly. Contract migrations (dropping `owner_practitioner_role_id`, removing old policies) ship at least one release after the switch.

## 10. Testing Requirements

**Seed fixture:** 1 org, 3 doctors (two share a service, one has a different specialty), 2 nurses, 1 billing user, 1 doctor-admin, 2 rooms; and both a government and a private org for fee-model tests.

| Layer | Must cover |
|---|---|
| pgTAP | RLS: Doctor A cannot read or modify Doctor B's slots; service-assignment authorization; fee RPC rules (own fee only, mode check, bounds, insert-only history); reassign and coverage permissions; queue-counter uniqueness |
| Concurrency | 20 parallel bookings on one slot → exactly one success; 50 parallel appointment inserts → no duplicate queue numbers; two-session chart edit → clean conflict |
| Playwright | Patient picks Doctor B → sees fee-inclusive price → pays → nurse triages (sees Doctor B) → Doctor B starts → lobby shows correct label, doctor, room → encounter finishes; run Doctor A's flow concurrently with no interference; government org shows fixed rate and no Fees tab |
| Regression | Single-doctor clinic with default settings behaves identically to today |

## 11. Orchestrator Protocol and Loop Report

1. Work **one loop at a time**, starting with Loop A. Do not begin the next loop until the review gate passes **and** the human confirms.
2. Run each loop through the pipeline in Section 7.4. Always wait for all agents in a phase before consolidating.
3. Report anything in P1 that contradicts Section 3 before proceeding to P2.
4. Make small, reviewable commits after each phase (migration, RPC, client, UI, tests as separate commits). Only you commit.
5. Do not modify unrelated features. If a change would touch billing, inventory, or teleconsult beyond the spec, stop and ask.
6. At the end of each loop, send this report to the human:

```text
LOOP <X> REPORT
Agents used and phases completed
Migrations added (filenames, in order)
Files changed per area (db / client / provider / patient / admin / tests)
Test results (exact counts per layer)
Reviewer verdicts and how each blocking finding was resolved
Deviations from this document
Open questions (including the payout-attribution decision, when relevant)
Recommended next step
```

## 12. Acceptance Criteria (overall)

- Two or more doctors can hold simultaneous schedules on one shared service without duplicate services.
- Doctor A never sees or can act on Doctor B's slots; no UI path triggers "Assigned appointment not found".
- Patients choose a doctor, see fee-inclusive pricing, and are attached to exactly that doctor's slot; simultaneous bookings never double-book.
- In private orgs, doctors declare per-service fees through the Fees CMS, invoices snapshot the fee, and history is immutable; in government orgs the fixed rate applies and the CMS is unavailable.
- Queue numbers are unique under concurrency in both queue modes; the lobby display shows label, doctor, and room without patient names.
- Covering and reassignment are explicit, permissioned, attributed, and audited; concurrent chart edits cannot silently overwrite each other.
- A default single-doctor clinic is unaffected.
- Every loop passed its reviewer gate with zero blocking findings.
