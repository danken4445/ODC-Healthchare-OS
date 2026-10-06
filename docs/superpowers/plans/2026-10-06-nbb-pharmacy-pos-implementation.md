# NBB Pharmacy POS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver an NBB-only pharmacy POS that requires a patient name, sells only currently available Pharmacy Department stock, records standard charges in centavos, and creates no payment.

**Architecture:** Preserve the legacy self-pay `create_pos_sale` contract. Add an NBB-specific read catalog and checkout RPC that derives the active cashier's Pharmacy Department from `staff_department_assignments`, locks stock transactionally, and records zero patient liability. Expose those RPCs through typed client wrappers and render a dedicated `/pos` terminal only for NBB/government-no-billing organizations.

**Tech Stack:** Next.js 15/React 19, TypeScript, Supabase/Postgres/RLS/RPCs, pgTAP, Node test runner, pnpm/Turbo.

**Spec:** `docs/superpowers/specs/2026-10-06-nbb-pharmacy-pos-design.md`

## Global Constraints

- Existing standard POS retains its `create_pos_sale(uuid, jsonb, text, payment_method)` signature, payment behavior, and UI.
- NBB eligibility, Pharmacy assignment, stock availability, tenant scope, and stock mutation are server-side only.
- The new NBB checkout creates no `payments` row and returns `patient_balance_due_in_centavos = 0`.
- Newly introduced monetary fields and RPC outputs are `bigint` integer centavos; no new float or numeric money field is introduced.
- NBB patient names are required free text, authorized-staff-only, and never placed in routes, public projections, or browser logs.
- Use `SECURITY DEFINER` only with `search_path = ''`, explicit `auth.uid()`/organization checks, revoked default execute, and explicit authenticated grants.
- Preserve unrelated dirty files, especially the incomplete expiry migration split. Do not reset the local database until the preflight task confirms the migration chain is runnable.

## Review Focus

- A self-pay organization invokes the NBB RPC directly: reject before any stock or billing write. Covered in Task 2.
- Two NBB checkouts consume the final unit concurrently: exactly one succeeds, with no partial sale, payment, or negative stock. Covered in Task 2.
- A cashier with `can_manage_pos` but a non-Pharmacy/no department assignment: reject without using another department's stock. Covered in Task 2.
- A cart repeats an item ID or requests a non-positive/fractional quantity: aggregate/reject before stock changes. Covered in Task 2 and Task 3.
- An NBB checkout is displayed in the terminal: payment controls never render, but standard centavo totals and zero patient balance remain explicit to authorized staff. Covered in Task 4.

---

## File structure

- `supabase/migrations/<generated>_nbb_pharmacy_pos.sql`: NBB standard-charge centavo fields, catalog/checkout RPCs, grants, and RLS-safe billing/inventory writes. Owned by `db_engineer`.
- `supabase/tests/nbb_pharmacy_pos_test.sql`: pgTAP authorization, accounting, stock, and concurrency-safe transaction assertions. Owned by `test_engineer`.
- `packages/types/src/database.ts` and `packages/types/src/index.ts`: generated database definitions and NBB POS DTOs. Owned by `client_engineer`.
- `packages/supabase-client/src/index.ts` and `packages/supabase-client/tests/nbb-pharmacy-pos-contract.test.ts`: validated RPC wrappers and contract tests. Owned by `client_engineer`.
- `apps/admin-web/app/pos/page.tsx` and `apps/admin-web/components/nbb-pharmacy-pos-terminal.tsx`: facility-aware POS entry point and NBB terminal. Owned by the designated `cashier_ui` fallback (`admin_ui` in this session).
- `e2e/billing-ui.spec.ts`: NBB terminal smoke coverage, if the existing local browser harness is available. Owned by `test_engineer`.

### Task 1: Reconcile the inventory-migration precondition and publish the contract

**Owner:** `code_mapper`, then orchestrator

**Files:**
- Read: `supabase/migrations/20260903000700_financial_loop.sql`
- Read: `supabase/migrations/20260927180000_billing_management_lifecycle.sql`
- Read: `supabase/migrations/20260927173000_inventory_hierarchy_and_immediate_usage.sql`
- Read: untracked `supabase/migrations/20261004181144_expiry_schema.sql` and `20261004181145_expiry_parity.sql`

**Interfaces:**
- Produces the exact Department assignment query, current NBB fields, stock/movement constraints, and whether the local migration chain can be reset safely.

- [x] **Step 1: Read-only migration-chain preflight**

Run: `pnpm exec supabase migration list --local` and inspect the named migration files without applying or resetting the database.

Expected: an explicit PASS/blocked result for adding a migration after the incomplete expiry drafts; no migration file is changed.

- [x] **Step 2: Publish the final contract before writers start**

Set these exact signatures unless preflight identifies an existing conflict:

```text
list_nbb_pharmacy_pos_catalog(p_organization_id uuid)
  -> table(stock_id uuid, item_id uuid, sku text, name text,
           unit_of_measure text, available_quantity numeric,
           standard_unit_price_in_centavos bigint, currency text)

create_nbb_pharmacy_pos_sale(
  p_organization_id uuid,
  p_items jsonb,
  p_patient_name text
) -> jsonb
```

The result contains `billing_event_id`, `pos_sale_id`, `invoice_id`,
`receipt_number`, `standard_total_in_centavos`, and
`patient_balance_due_in_centavos` (always `0`). Error codes are
`NBB_FACILITY_REQUIRED`, `PHARMACY_ASSIGNMENT_REQUIRED`,
`PATIENT_NAME_REQUIRED`, `INVALID_CART_ITEM`, and `INSUFFICIENT_PHARMACY_STOCK`.

### Task 2: Add the NBB stock-and-zero-liability database boundary

**Owner:** `db_engineer` and `test_engineer` in parallel

**Files:**
- Create: `supabase/migrations/<generated>_nbb_pharmacy_pos.sql` via `pnpm exec supabase migration new nbb_pharmacy_pos`
- Create: `supabase/tests/nbb_pharmacy_pos_test.sql`

**Interfaces:**
- Consumes Task 1 contract, `department_stock`, `staff_department_assignments`, `inventory_stock_movements`, `billing_events`, `billing_line_items`, `invoices`, `pos_sales`, and organization facility context.
- Produces the two Task 1 RPCs and cents-only NBB standard-charge snapshots for each NBB line/sale.

- [x] **Step 1: Write failing pgTAP tests**

Add fixtures for one NBB organization, one self-pay organization, a Pharmacy-assigned cashier, a non-Pharmacy cashier, Pharmacy and non-Pharmacy stock for the same item, and a second organization. Assert the five Review Focus cases plus: required trimmed patient name, no payment row, zero patient invoice balance, standard charge cents, same-organization catalog-only rows, and a stock movement only from the Pharmacy row.

- [x] **Step 2: Run the focused test to verify it fails for the missing contract**

Run: `pnpm exec supabase test db supabase/tests/nbb_pharmacy_pos_test.sql --local`.

Expected: FAIL because the RPCs and centavo snapshots do not exist.

- [x] **Step 3: Implement the migration contract**

Add only additive centavo snapshot fields needed for NBB standard charge/audit; do not reinterpret legacy numeric columns. Define both RPCs as `SECURITY DEFINER SET search_path = ''`; revoke `PUBLIC` execution; grant only `authenticated`. The checkout validates the actor's same-organization Pharmacy assignment, normalizes duplicate cart IDs, locks Pharmacy `department_stock` rows in stable item order, writes NBB billing records with zero patient liability and written-off line settlement, writes immutable negative stock movements, and never inserts `payments`.

- [x] **Step 4: Re-run focused pgTAP and local migration verification**

Run: `pnpm exec supabase migration list --local`; then `pnpm exec supabase test db supabase/tests/nbb_pharmacy_pos_test.sql --local`.

Expected: PASS. If Task 1 reports the local chain is unsafe, report verification as blocked rather than resetting or bypassing it.

### Task 3: Expose the typed NBB POS client contract

**Owner:** `client_engineer`

**Files:**
- Modify: `packages/types/src/database.ts`
- Modify: `packages/types/src/index.ts`
- Modify: `packages/supabase-client/src/index.ts`
- Create: `packages/supabase-client/tests/nbb-pharmacy-pos-contract.test.ts`

**Interfaces:**
- Consumes Task 2 RPCs.
- Produces `NbbPharmacyPosCatalogItem`, `NbbPosCartItem`, `NbbPosCheckoutResult`, `getNbbPharmacyPosCatalog(client, organizationId)`, and `createNbbPharmacyPosSale(client, input)`.

- [x] **Step 1: Write failing wrapper tests**

Test Zod validation rejects blank patient names, zero/fractional quantities, malformed IDs, and empty carts; test valid inputs map exactly to the two RPC argument names; test the checkout result accepts bigint/serialized-centavo values and preserves zero patient balance.

- [x] **Step 2: Run the focused test to verify it fails**

Run: `pnpm --filter @odyssey/supabase-client test -- nbb-pharmacy-pos-contract.test.ts`.

Expected: FAIL because the schemas and wrapper functions do not exist.

- [x] **Step 3: Regenerate types and implement the typed wrappers**

After Task 2 is locally applied, run `pnpm db:types`. Parse inputs/outputs with exported Zod schemas and call only the Task 2 RPCs. Do not add a department argument or a browser-side stock mutation.

- [x] **Step 4: Re-run focused tests and typechecks**

Run: `pnpm --filter @odyssey/supabase-client test -- nbb-pharmacy-pos-contract.test.ts`; `pnpm --filter @odyssey/types typecheck`; `pnpm --filter @odyssey/supabase-client typecheck`.

Expected: PASS.

### Task 4: Build the NBB pharmacy terminal and preserve standard POS

**Owner:** `cashier_ui` fallback (`admin_ui` in this session)

**Files:**
- Modify: `apps/admin-web/app/pos/page.tsx`
- Create: `apps/admin-web/components/nbb-pharmacy-pos-terminal.tsx`
- Modify: `apps/admin-web/app/globals.css` only for styles not expressible with existing shared classes
- Test: `e2e/billing-ui.spec.ts`

**Interfaces:**
- Consumes `getOrganizationFacilityContext`, `getNbbPharmacyPosCatalog`, and `createNbbPharmacyPosSale`.
- Produces the NBB terminal only when `isGovernmentNoBilling` is true; standard organizations continue rendering `RecordsScreen` with `posConfig`.

- [ ] **Step 1: Add a failing NBB POS UI smoke test**

Extend the billing Playwright fixture to assert a NBB organization sees required `Patient name`, a Pharmacy-stock inventory item and cart, but no payment-method control; checkout is disabled until a patient name and item exist.

- [ ] **Step 2: Run the targeted smoke test to verify it fails**

Run: `pnpm exec playwright test e2e/billing-ui.spec.ts --grep "NBB pharmacy POS"`.

Expected: FAIL because `/pos` is the generic record screen.

- [ ] **Step 3: Implement the terminal**

Load the organization context and NBB pharmacy catalog with explicit loading/error/empty/permission states. Make the patient-name input required, support search plus whole-number cart quantities constrained by returned stock, disable checkout while invalid/submitting, and show a successful receipt with zero patient balance. Render no payment control and surface typed RPC errors without leaking SQL details.

- [ ] **Step 4: Re-run the UI smoke test and app typecheck**

Run: `pnpm exec playwright test e2e/billing-ui.spec.ts --grep "NBB pharmacy POS"`; `pnpm --filter @odyssey/admin-web typecheck`.

Expected: PASS. If the local browser/server harness is unavailable, typecheck must pass and the Playwright result is reported as unavailable, not passed.

### Task 5: End-to-end verification and independent review

**Owner:** `test_engineer`, then two `reviewer` agents

**Files:**
- Review: all Task 2--4 files only

**Interfaces:**
- Consumes the completed NBB terminal and RPCs.
- Produces one verification summary and two independent PASS/BLOCKED review reports.

- [ ] **Step 1: Run regression verification**

Run: focused Task 2 pgTAP, focused Task 3 Node test, package/app typechecks, and the targeted Task 4 Playwright test. Run `git diff --check` for scoped files.

Expected: all available checks pass; unavailable Docker/browser dependencies are called out.

- [ ] **Step 2: Security/financial review**

Verify direct RPC denial for standard facilities, non-Pharmacy cashiers, and cross-tenant stock; no payment insert; zero balance; centavo-only new money; `search_path`, grants, and RLS are safe.

- [ ] **Step 3: Correctness/concurrency review**

Verify cart normalization, row-lock ordering, rollback on insufficient stock, Pharmacy-only movement, standard POS compatibility, and UI state/error behavior.

- [ ] **Step 4: Route every blocking finding to its file owner and re-run the affected verification/review**

Expected: zero blocking findings before reporting completion.

## Plan self-review

- Spec coverage: Tasks 2--4 cover the mandatory patient name, NBB eligibility, Pharmacy-only live-stock sale, no-payment rule, centavo snapshots, and dedicated terminal. Task 5 covers the financial/security gate.
- Type consistency: all consumers use the Task 1 RPC names and the Task 3 wrappers; UI never receives a department ID.
- Scope: claim submission, patient matching, broad centavo migration, and the unrelated expiry draft recovery remain excluded.
- Dirty-tree safety: new paths are additive; only scoped files may be staged after every reviewer gate.
