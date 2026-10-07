# Pharmacy Prescription Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an authorized nurse transcribe a patient’s physical prescription into a live Pharmacy queue, show availability before a ward journey, and let only authorized Pharmacy staff verify and complete a traceable dispense transaction.

**Architecture:** Add a patient-linked prescription-transcription order and line ledger separate from the clinician-authored `medication_requests` record. The Provider portal creates a transcription and receives availability projections; the Pharmacy POS reads the same queue and invokes one transactionally safe server-side completion RPC. It atomically verifies authority, rechecks Pharmacy stock and FEFO batches, writes immutable inventory/billing facts, and advances the order and line status history.

**Tech Stack:** Next.js/React, TypeScript, Supabase Postgres/RLS/RPCs/Realtime, existing `@odyssey/supabase-client`, `@odyssey/types`, and pgTAP-style SQL tests.

**Spec:** User-requested workflow design, 2026-10-07. The assumptions and decisions below are the proposed specification and require approval before implementation.

## Global Constraints

- This is an electronic transcription of a physical prescription, **not** a nurse-issued clinician prescription; preserve source/prescriber/reference and nurse attribution.
- Nurse encoders may create, edit before submission, view their own orders, and view availability; they may not dispense, change a pharmacist-verified order, adjust stock, or charge a patient.
- Pharmacy staff receive distinct dispense authority; all stock deduction and final status changes occur through one server RPC, never client writes.
- Use Pharmacy Department stock only; recheck availability with row locks at completion and allocate perishable stock FEFO, excluding expired stock.
- Support standard and NBB facility modes through one order lifecycle. New money values are `bigint amount_in_centavos`; immutable financial and inventory facts are corrected only by compensating records.
- Keep the existing generic private POS and NBB walk-in POS contracts intact. This plan adds a prescription queue; it does not convert every POS sale into a prescription.
- No external Affiliated Pharmacy reservation/integration is in this slice. An unavailable line is recorded with an explicit reason and may be referred externally without pretending stock is reserved.
- Preserve the unrelated dirty change at `apps/admin-web/app/support/page.tsx`; do not reset, broadly stage, or commit unrelated work.

## Scope Decisions

- Add permissions `can_encode_pharmacy_prescriptions` and `can_dispense_pharmacy_prescriptions`. Seed neither onto all nurses nor all POS staff; clinic administrators assign them explicitly, normally through roles such as `nurse_prescription_encoder` and `pharmacy_dispensing_staff`.
- A transcription requires an organization-scoped patient and an active encounter because the existing immutable inventory/billing usage contract requires an in-progress encounter. `medication_request_id` remains optional so a physical prescription can be tracked even when it did not originate in Odyssey; a physical-prescription reference is required.
- Header status: `draft`, `submitted`, `under_pharmacist_review`, `ready_to_dispense`, `partially_dispensed`, `completed`, `cancelled`, `rejected`.
- Line status: `entered`, `available`, `unavailable`, `pharmacist_verified`, `partially_dispensed`, `dispensed`, `cancelled`, `external_referral`.
- Status changes are append-only events with actor, timestamp, optional reason, and an immutable payload snapshot. `completed` is only possible once every line is terminal (`dispensed`, `cancelled`, or `external_referral`).
- A pharmacist may correct transcription/mapping details during verification, but the original nurse-entered text must remain visible in the event history. A material correction requires a reason.

## Review Focus

- A nurse must never be able to submit an order for a patient outside their organization or finalize/dispense it by calling an RPC directly.
- A stale availability preview must not allow overselling; concurrent completions for the final unit must yield exactly one success.
- A physical prescription transcription must not be presented as a doctor-issued electronic prescription, and the original prescriber/reference must remain auditable.
- A partially supplied prescription must keep the undispensed line visible and must not create a full patient charge or mark the order completed.
- A failed/voided dispense must use an authorized compensating reversal and leave original usage, movement, charge, and event history intact.

---

### Task 1: Confirm contracts and write the feature migration test first

**Files:**
- Create: `supabase/tests/pharmacy_prescription_queue_test.sql`
- Create: `supabase/migrations/<generated>_pharmacy_prescription_queue.sql`
- Modify: `packages/types/src/index.ts`

**Interfaces:**
- Consumes: current Pharmacy Department assignment, `department_stock`, FEFO batch allocator, `inventory_usages`, billing mode, role permission helpers.
- Produces: the canonical order/status vocabulary and SQL acceptance tests consumed by later tasks.

- [ ] **Step 1: Establish the deployment and schema baseline**

Run `pnpm exec supabase migration list --local` and inspect the active definitions of `tag_inventory_usage`, NBB POS checkout, batch allocation, role-permission allow-list, and financial reversal RPCs. Record any migration-history drift before creating this migration.

- [ ] **Step 2: Write failing database tests**

Cover nurse encoder creation, tenant isolation, read-only post-submission behavior, pharmacist-only review/dispense, Pharmacy-only stock source, full/partial/unavailable outcomes, immutable event history, NBB zero balance, standard billing handoff, and a two-session final-unit race.

- [ ] **Step 3: Create the migration through the CLI**

Run `pnpm exec supabase migration new pharmacy_prescription_queue`; use the generated filename in the test harness. Do not invent a timestamped migration filename.

- [ ] **Step 4: Run the new test and capture the expected red result**

Run: `pnpm exec supabase test db supabase/tests/pharmacy_prescription_queue_test.sql`

Expected: failing because the queue schema/RPCs do not yet exist.

### Task 2: Add permissions, order ledger, RLS, and append-only status events

**Files:**
- Modify: generated `supabase/migrations/<generated>_pharmacy_prescription_queue.sql`
- Modify: `packages/types/src/index.ts`

**Interfaces:**
- Produces: `PharmacyPrescriptionOrder`, `PharmacyPrescriptionOrderLine`, and `PharmacyPrescriptionOrderEvent` database/type contracts.
- Consumes: `has_organization_permission`, `patients`, `encounters`, `medication_requests`, `inventory_items`, and organization-scoped staff assignments.

- [ ] **Step 1: Add the two permission names everywhere the role CMS validates and displays them**

Extend the TypeScript union, role dialog allow-list, role-override check constraint, default permission catalog, and admin permission labels. Keep clinic assignment explicit rather than changing existing nurse/POS defaults.

- [ ] **Step 2: Add order, line, and immutable event tables**

Use organization-scoped foreign keys, constrained statuses, a nonblank physical-prescription source reference or linked request, and indexes for Pharmacy queue filtering (`organization_id`, `status`, `submitted_at`) and patient history. Store prices/totals only as `bigint` centavos when introduced.

- [ ] **Step 3: Enable RLS and restrict direct mutations**

Grant direct reads only where required; deny browser inserts/updates/deletes for finalized data. Add policies so encoders can see their own draft/submitted orders, pharmacists can see same-organization queue items, and no role can edit event rows.

- [ ] **Step 4: Add immutable/audit triggers and Realtime publication**

Forbid update/delete of events and terminal lines except through an authorized compensating workflow. Publish header/line changes for scoped live queue refreshes.

- [ ] **Step 5: Run focused SQL tests**

Run: `pnpm exec supabase test db supabase/tests/pharmacy_prescription_queue_test.sql`

Expected: schema/RLS/status tests pass; completion tests still fail until Task 3.

### Task 3: Implement the server-side transcription, availability, review, and completion RPCs

**Files:**
- Modify: generated `supabase/migrations/<generated>_pharmacy_prescription_queue.sql`
- Modify: `supabase/tests/pharmacy_prescription_queue_test.sql`

**Interfaces:**
- Produces:
  - `create_pharmacy_prescription_transcription(...) -> uuid`
  - `get_pharmacy_prescription_availability(uuid, jsonb) -> jsonb`
  - `list_pharmacy_prescription_queue(uuid, text) -> jsonb`
  - `review_pharmacy_prescription_order(uuid, jsonb, text) -> void`
  - `complete_pharmacy_prescription_order(uuid, jsonb) -> jsonb`
- Consumes: Task 2 tables/permissions and the repository’s canonical FEFO and billing paths.

- [ ] **Step 1: Implement nurse transcription and live availability**

Authorize only `can_encode_pharmacy_prescriptions`; validate tenant/patient/context, keep original transcribed medicine text, and return projected Pharmacy availability by exact mapped item. A preview does not reserve stock or create a charge.

- [ ] **Step 2: Implement pharmacist review**

Authorize only `can_dispense_pharmacy_prescriptions` plus same-organization Pharmacy Department assignment. Permit mapping/transcription correction with a mandatory reason, append the event, and transition only valid lines/orders to review/ready states.

- [ ] **Step 3: Implement one atomic completion RPC**

Lock the order, lines, department stock, and selected FEFO batches; re-authorize; reject stale/non-ready lines; write per-line usage/movement/batch-consumption and status event records; invoke the established billing mode path; then derive terminal header status. Return only receipt/order identifiers, final line outcomes, and zero/nonzero patient balance in centavos.

- [ ] **Step 4: Implement explicit unavailable, partial, and external-referral outcomes**

Require a reason for each non-dispensed terminal line. Do not decrement stock or create a patient charge for those lines. Do not allow an already completed line to be silently edited.

- [ ] **Step 5: Prove the concurrency and financial invariants**

Run the focused test with two authenticated sessions and assert one final-unit completion, one typed insufficient-stock result, no duplicate usage/movement/charge, and no `payments` row in NBB mode.

### Task 4: Expose typed client contracts and focused subscriptions

**Files:**
- Modify: `packages/types/src/index.ts`
- Modify: `packages/types/src/database.ts` (generated after local schema verification)
- Modify: `packages/supabase-client/src/index.ts`
- Create: `packages/supabase-client/tests/pharmacy-prescription-queue-contract.test.ts`

**Interfaces:**
- Produces: typed order/line/event summaries, request input schemas, the five RPC wrappers, and `subscribeToPharmacyPrescriptionQueue`.
- Consumes: Task 3 return shapes; no UI is allowed to construct privileged SQL or inventory writes.

- [ ] **Step 1: Add failing contract tests**

Test empty prescription reference, malformed item IDs/quantities, bad statuses, zero/negative quantities, and correct RPC argument names/return parsing.

- [ ] **Step 2: Add Zod schemas, type exports, and wrappers**

Make amount fields `bigint`/centavos at the boundary; preserve existing POS client contracts. Use `.from().select().eq()` in direct reads and scoped Realtime filters.

- [ ] **Step 3: Regenerate database types and pass focused client tests**

Run: `pnpm db:types` then `pnpm dlx tsx --test packages/supabase-client/tests/pharmacy-prescription-queue-contract.test.ts`

Expected: all contract tests pass.

### Task 5: Add the nurse prescription-encoder workspace in the Provider portal

**Files:**
- Create: `apps/provider-web/app/pharmacy-orders/page.tsx`
- Create: `apps/provider-web/app/components/PharmacyPrescriptionEncoder.tsx`
- Modify: `apps/provider-web/app/components/provider-shell.tsx`
- Modify: `apps/provider-web/app/globals.css`
- Create: `apps/provider-web/app/components/pharmacy-prescription-encoder.test.ts`

**Interfaces:**
- Consumes: Task 4 typed transcription/availability APIs and patient/encounter search patterns.
- Produces: nurse-created `submitted` orders only; it never calls completion or stock-adjustment APIs.

- [ ] **Step 1: Write component tests**

Assert that the route is unavailable without encoder permission; a valid patient/reference/line can submit; availability is displayed as Available/Limited/Unavailable rather than an authoritative reservation; and submitted data becomes read-only with a queue reference.

- [ ] **Step 2: Build the encoder UI**

Use the Provider shell. Include patient/context selection, physical prescription reference, prescriber/free-text source details, transcribed medicine text, mapped inventory item, requested quantity/unit, live availability, priority, and a final nurse attestation that the entry matches the physical prescription.

- [ ] **Step 3: Guard the route in the UI and server contracts**

Show the navigation item only for `can_encode_pharmacy_prescriptions`; preserve server-side denial as the authority. Avoid placing prescription data in URLs or client logs.

- [ ] **Step 4: Run focused UI verification**

Run: `pnpm dlx tsx --test apps/provider-web/app/components/pharmacy-prescription-encoder.test.ts` and `pnpm --filter @odyssey/provider-web typecheck`.

### Task 6: Turn Pharmacy POS into a prescription queue and dispense workbench

**Files:**
- Create: `apps/admin-web/components/pharmacy-prescription-queue.tsx`
- Modify: `apps/admin-web/app/pos/page.tsx`
- Modify: `apps/admin-web/components/admin-shell.tsx`
- Modify: `apps/admin-web/lib/admin-access.ts`
- Modify: `apps/admin-web/app/globals.css`
- Create: `apps/admin-web/components/pharmacy-prescription-queue.test.ts`

**Interfaces:**
- Consumes: Task 4 queue/review/completion APIs.
- Produces: pharmacist review, dispense, receipt/reprint, status filtering, and no nurse-only action path.

- [ ] **Step 1: Write failing queue behavior tests**

Assert filtering by status/priority, review-before-dispense enforcement, unavailable/partial reason capture, disabled completion without dispense permission, and successful terminal status rendering.

- [ ] **Step 2: Add queue-first POS UI**

Show submitted/review/ready work with patient, ward/context, prescription reference, age of request, line availability, and status timeline. Keep existing NBB walk-in functionality as a separate tab/entry point and do not merge unrelated generic POS semantics.

- [ ] **Step 3: Add pharmacist review and completion panels**

Require a verified mapped item/quantity for each line, show selected FEFO lot/expiry only to Pharmacy staff, require a reason for partial/unavailable outcomes, and show receipt/order IDs after success. Refresh via the scoped Realtime subscription.

- [ ] **Step 4: Run focused UI verification**

Run: `pnpm dlx tsx --test apps/admin-web/components/pharmacy-prescription-queue.test.ts` and `pnpm --filter @odyssey/admin-web typecheck`.

### Task 7: Add audit/reporting views and end-to-end acceptance coverage

**Files:**
- Modify: `apps/admin-web/app/pos/page.tsx` or create a narrowly permissioned queue-history tab
- Create: `e2e/pharmacy-prescription-queue.spec.ts`
- Modify: `supabase/tests/pharmacy_prescription_queue_test.sql`
- Modify: relevant receipt/document builder only if the existing receipt cannot identify prescription order and final line status

**Interfaces:**
- Consumes: Tasks 1–6.
- Produces: traceable operational history without exporting clinical data unnecessarily.

- [ ] **Step 1: Add queryable history and operational filters**

Support date, status, nurse encoder, pharmacist, patient, department/ward, and unresolved-line filtering. Make the default pharmacy view operational; restrict broader history to authorized staff.

- [ ] **Step 2: Cover the full acceptance path**

Automate: nurse transcribes physical prescription, sees unavailable stock before submitting, pharmacist reviews/makes a documented correction, completes partial dispense, system writes one stock/billing result per dispensed line, and the status timeline remains visible after reload.

- [ ] **Step 3: Run final verification**

Run focused SQL/client/UI/E2E tests, `pnpm --filter @odyssey/provider-web typecheck`, `pnpm --filter @odyssey/admin-web typecheck`, and `git diff --check -- <scoped paths>`. Report any unavailable local Supabase/browser prerequisites as unverified rather than passed.

### Task 8: Security review, rollout gate, and scoped delivery

**Files:**
- Modify: `docs/tech-debt.md` only if a deliberate, approved deferral is discovered
- Test: all Task 1–7 paths

**Interfaces:**
- Consumes: complete feature diff.
- Produces: deployable, audited feature with explicit rollout conditions.

- [ ] **Step 1: Review authorization and privacy boundaries**

Prove direct RPC denial for a nurse attempting review/complete, a non-Pharmacy POS user attempting completion, and a cross-organization caller reading/creating orders. Confirm no raw prescription data appears in URLs, Realtime payloads outside authorized organization scope, or logs.

- [ ] **Step 2: Review billing/inventory reversals**

Prove completion is idempotent, partial lines do not overcharge, NBB has zero patient balance/no payment, and correction/void uses an append-only compensating workflow.

- [ ] **Step 3: Validate rollout readiness**

Confirm Pharmacy Department assignments, permitted pharmacist roles, catalog mapping readiness, batch/FEFO behavior, and training material for nurses/pharmacists. Pilot with one ward before enabling the role organization-wide.

- [ ] **Step 4: Deliver with scoped staging**

Stage only the feature files, generated migration, and tests. Run `git diff --cached --check`; do not use `git add -A` or include the pre-existing support-page edit.

## Self-Review

- **Coverage:** The plan covers role separation, transcription, live availability, POS queue, status lifecycle, standard/NBB outcomes, FEFO, billing/inventory atomicity, audit, Realtime, and tests.
- **Known decision before implementation:** Confirm whether the first production release supports both standard and NBB modes as planned, or restricts pilot use to a single facility classification.
- **Implementation ruling:** The existing `tag_inventory_usage` RPC requires `can_tag_inventory_usage`; Pharmacy staff therefore receive both the new dispense permission and that existing permission so FEFO and billing remain on the canonical server-side path.
- **Scope control:** External AP inventory/reservation, OCR of paper prescriptions, barcode scanning, and patient notifications are intentionally deferred.
