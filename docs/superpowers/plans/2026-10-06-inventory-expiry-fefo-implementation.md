# Inventory Expiry and FEFO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add perishable-item expiry tracking and server-enforced FEFO allocation while retaining aggregate inventory rows and making Pharmacy POS decrement its designated Pharmacy stock.

**Architecture:** Keep the existing item master and one `department_stock` aggregate per item/location. Add batch records beneath only perishable stock, then have each server-side mutation allocate batches transactionally and preserve aggregate/batch parity. The admin UI surfaces expiry state and batch receipt entry; POS keeps its current cart contract and derives its source from an organization-level Pharmacy setting.

**Tech Stack:** Next.js 15/React 19, TypeScript, Supabase Postgres/RLS/RPCs, pnpm/Turbo, SQL validation fixtures, PowerShell concurrency harness.

**Spec:** `docs/superpowers/specs/2026-10-05-inventory-expiry-fefo-design.md`

## Global Constraints

- Keep one catalogue `inventory_items` row and one aggregate `department_stock` row per item and department; expiry batches are a drill-down ledger only.
- Expiry applies only when `inventory_items.is_perishable` is true; every new perishable receipt requires expiry and may have an optional lot number.
- Use dated, unexpired batches in FEFO order; expired batches cannot be tagged, transferred, or sold. Legacy unknown-expiry batches remain usable only after dated valid stock.
- Enforce FEFO inside PostgreSQL transactions for all reductions, transfers, expired disposal, encounter tagging, and Pharmacy POS; never rely on client batch selection.
- Preserve append-only inventory histories, authorization, organization isolation, and the canonical `tag_inventory_usage(uuid, uuid, numeric, uuid)` RPC signature.
- Add no prescription/NBB/HMO-claims dependency and do not change money, payment, invoice, or financial-ledger schema.
- Use `SECURITY DEFINER` only with empty `search_path`, fully qualified references, explicit authorization, and revoked default execution where required.
- Preserve unrelated dirty work. Reconcile the untracked expiry drafts only after reading them; do not discard or overwrite them wholesale.

## Review Focus

- Concurrent allocations of the same last valid batch: exactly one succeeds and neither leaves aggregate/batch parity broken. Covered in Task 3 concurrency fixture.
- A perishable receipt with mixed dates but no lot numbers: one aggregate item stays visible while batch quantities and usable total are correct. Covered in Task 2 SQL validation.
- Expired stock combined with legacy unknown-expiry stock: patient/POS actions skip expired stock and use legacy only after dated valid stock. Covered in Tasks 3 and 4 SQL validation.
- A missing, inactive, or cross-tenant Pharmacy department: POS fails before any sale, invoice, payment, movement, or batch allocation persists. Covered in Task 4 SQL validation.
- An ordinary non-perishable item: legacy receipt, adjustment, transfer, tagging, and POS behavior still works without an expiry batch. Covered in Tasks 3 and 7 regression verification.

---

## File structure

- `supabase/migrations/<generated>_inventory_expiry_fefo.sql`: authoritative expiry schema, settings, RLS, grants, internal allocation helper, and replaced inventory/POS RPCs. Owned by `db_engineer`.
- `supabase/validation/expiry_tracking.sql`: deterministic database behavior and authorization validation.
- `supabase/validation/expiry_tracking_concurrency_setup.sql`: isolated local fixture for simultaneous allocation.
- `supabase/validation/expiry_tracking_concurrency.ps1`: concurrency assertion harness.
- `packages/types/src/database.ts` and `packages/types/src/index.ts`: refreshed database contract and inventory/POS domain types. Owned by `client_engineer`.
- `packages/supabase-client/src/index.ts`: typed settings, batch receipt, expiry workspace, and existing POS wrappers. Owned by `client_engineer`.
- `packages/supabase-client/tests/*.test.ts`: wrapper and contract tests where the package uses them. Owned by `client_engineer`.
- `apps/admin-web/app/inventory/page.tsx`: item flag, expiry settings, status summary, and multi-batch receipt UI. Owned by `admin_ui`.
- `apps/admin-web/components/record-management.tsx` and the active POS surface it renders: Pharmacy POS usable-stock feedback without a department selector. Owned by `cashier_ui` or the designated admin UI owner.

### Task 1: Freeze the expiry-work baseline and create schema-contract tests

**Owner:** `db_engineer`

**Files:**
- Read: `supabase/migrations/20261004181144_expiry_schema.sql`
- Read: `supabase/migrations/20261004181145_expiry_parity.sql`
- Modify: `supabase/validation/expiry_tracking.sql`
- Create: one migration generated with `pnpm exec supabase migration new inventory_expiry_fefo`

**Interfaces:**
- Consumes: existing `inventory_items`, `department_stock`, `inventory_stock_movements`, `inventory_usages`, and `tag_inventory_usage(uuid, uuid, numeric, uuid)`.
- Produces: `inventory_batches`, `inventory_usage_batch_consumptions`, `inventory_expiry_settings`, `inventory_pos_settings`, `inventory_batch_statuses`, and an `inventory_manila_today()` date helper.

- [ ] **Step 1: Extend `supabase/validation/expiry_tracking.sql` with failing schema assertions**

Assert the perishable flag, settings/config tables, batch/consumption tables, `batch_id` movement reference, RLS, explicit browser-role grants, and the unique aggregate stock invariant.

- [ ] **Step 2: Run the schema validation against a reset local database**

Run: `pnpm exec supabase db reset --local`, then pipe `supabase/validation/expiry_tracking.sql` to the local Postgres container.

Expected: FAIL because the current draft has no Pharmacy POS setting and does not yet meet the complete contract.

- [ ] **Step 3: Implement the migration schema contract**

Create/reconcile the generated migration so `inventory_items` gains `is_perishable` and optional 1--3650 day override; new organization-scoped settings/configuration and batch tables have composite tenant FKs, checks, indexes, audit timestamps, RLS, policy/grant boundaries, and immutable consumption history. Create `inventory_batch_statuses` as a security-invoker read projection returning `expiry_status` and `usable_quantity` using Manila's date.

`inventory_pos_settings` must hold a single active Pharmacy department per organization and its saving routine must require inventory-management permission and validate same-tenant active department ownership.

- [ ] **Step 4: Add aggregate/batch parity constraints and legacy migration behavior**

For perishable stock, defer parity validation until transaction commit. When an existing item is marked perishable, create one labelled `legacy_unassigned_expiry` batch for any on-hand balance; never infer a date. The item-flag routine must be tenant-authorized and safe on repeated calls.

- [ ] **Step 5: Re-run the schema validation**

Run: the Task 1 reset and SQL validation command.

Expected: PASS for schema, RLS visibility, unknown-expiry shape, and aggregate/batch parity setup.

- [ ] **Step 6: Commit the schema-contract deliverable**

Stage only the generated migration and `supabase/validation/expiry_tracking.sql`; run `git diff --cached --check`; commit with `feat(inventory): add expiry batch schema`.

### Task 2: Implement atomic perishable receiving and expiry administration

**Owner:** `db_engineer`

**Files:**
- Modify: migration created in Task 1
- Modify: `supabase/validation/expiry_tracking.sql`

**Interfaces:**
- Consumes: Task 1 tables/settings and existing aggregate stock model.
- Produces: `receive_inventory_stock(p_item_id uuid, p_department_id uuid, p_batches jsonb, p_reason text, p_movement_type text)` and `save_inventory_expiry_settings(p_organization_id uuid, p_near_expiry_days integer, p_pharmacy_department_id uuid)`.

- [ ] **Step 1: Add failing receipt tests**

Test a perishable item receipt containing two dated batch lines, verify one aggregate row and two batch rows, verify aggregate equals batch sum, and reject a missing/expired receipt date, wrong-tenant department, zero quantity, and direct table write. Test that a non-perishable receipt accepts the existing aggregate-only flow.

- [ ] **Step 2: Run the receipt assertions**

Run: local reset plus `supabase/validation/expiry_tracking.sql`.

Expected: FAIL until the receipt RPC is installed.

- [ ] **Step 3: Implement `receive_inventory_stock` and setting save RPC**

Require `can_manage_inventory`; validate an active same-tenant item/department and an allowed `opening` or `receipt` movement. For a perishable item, require a non-empty JSON batch array whose positive quantities sum exactly to the receipt total; upsert/lock aggregate stock and matching batch rows in one transaction and record batch-linked receipt movements. For non-perishable items, preserve aggregate-only receipt semantics.

Use `save_inventory_expiry_settings` to set the organization warning window and designated active Pharmacy department under the same authorization boundary.

- [ ] **Step 4: Re-run receipt and settings assertions**

Run: local reset plus the validation file.

Expected: PASS; invalid input rolls back both aggregate and batch data.

- [ ] **Step 5: Commit the receiving deliverable**

Stage only the migration and expiry validation changes; run `git diff --cached --check`; commit with `feat(inventory): receive perishable stock by batch`.

### Task 3: Apply FEFO to aggregate inventory mutations and encounter tagging

**Owner:** `db_engineer`

**Files:**
- Modify: migration created in Task 1
- Modify: `supabase/validation/expiry_tracking.sql`
- Modify: `supabase/validation/expiry_tracking_concurrency_setup.sql`
- Modify: `supabase/validation/expiry_tracking_concurrency.ps1`

**Interfaces:**
- Consumes: Task 1 parity contract and Task 2 batches.
- Produces: an inaccessible internal allocator returning `(batch_id uuid, quantity numeric)`; upgraded `adjust_department_stock`, `transfer_department_stock`, and canonical `tag_inventory_usage(uuid, uuid, numeric, uuid)`.

- [ ] **Step 1: Write failing FEFO mutation tests**

Test dated batches ordered by expiry/receipt/id, skip expired batches, defer legacy unknown-expiry batches until all dated valid stock, reject insufficient usable quantity, retain immutable usage-to-batch consumption records, and retain aggregate parity after negative adjustment, transfer, and encounter tagging. Include an expired-disposal case that reduces only expired batches under an explicit disposal movement/reason.

- [ ] **Step 2: Run the FEFO validation and concurrency harnesses**

Run: `pnpm exec supabase db reset --local`; execute `supabase/validation/expiry_tracking.sql`; then run `supabase/validation/expiry_tracking_concurrency.ps1`.

Expected: FAIL because the current mutation RPCs do not allocate batches.

- [ ] **Step 3: Implement the internal allocation helper**

Create a non-public, transaction-local helper used only by authorized mutation functions. Lock the aggregate row and batch rows in stable FEFO order; select only unexpired dated rows first and legacy rows last; verify total usable quantity before any decrement; return each allocation. A separate expired-disposal path may lock only expired batches and must not be callable as patient/POS dispensing.

- [ ] **Step 4: Replace mutation RPC implementations without changing their public callers**

Keep `adjust_department_stock` for aggregate-only non-perishable changes; route perishable negative changes through the allocator and require the receipt RPC for perishable positive intake. Update transfer to move allocation metadata to destination batches and write paired per-batch movements. Update only the canonical four-argument `tag_inventory_usage` so it creates the existing aggregate usage/billing link and immutable per-batch consumption/movement records in one transaction.

- [ ] **Step 5: Re-run FEFO, authorization, and concurrency tests**

Run: the commands from Step 2.

Expected: PASS; concurrent three-unit tags against three valid units yield exactly one success, the loser reports insufficient usable stock, and final aggregate/batch counts are zero.

- [ ] **Step 6: Commit the FEFO mutation deliverable**

Stage only migration and expiry-validation files; run `git diff --cached --check`; commit with `feat(inventory): enforce FEFO stock allocation`.

### Task 4: Make Pharmacy POS allocate FEFO stock atomically

**Owner:** `db_engineer`

**Files:**
- Modify: migration created in Task 1
- Modify: `supabase/validation/expiry_tracking.sql`

**Interfaces:**
- Consumes: `inventory_pos_settings`, Task 3 allocator, and existing `create_pos_sale(uuid, jsonb, text, payment_method)` public signature.
- Produces: a POS transaction that writes existing billing records plus immutable Pharmacy stock/batch movements, with no client source-department parameter.

- [ ] **Step 1: Add failing POS allocation tests**

Test that POS uses the configured Pharmacy department, allocates the earliest valid perishable batch, skips expired stock, leaves no partial sale/payment/invoice when source is absent/inactive or usable stock is insufficient, and preserves current non-perishable sale behavior. Include cross-tenant configuration and direct helper-call denial tests.

- [ ] **Step 2: Run the POS assertions locally**

Run: local reset plus `supabase/validation/expiry_tracking.sql`.

Expected: FAIL because `create_pos_sale` currently does not deduct stock or require a Pharmacy source.

- [ ] **Step 3: Replace the body of `create_pos_sale` while preserving its signature and financial fields**

Retain its current POS permission, catalogue validation, line-item, invoice, payment, and return JSON behavior. Before finalizing its billing records, load and lock the configured active same-tenant Pharmacy department, invoke the internal allocator for each cart item, update aggregate and batch quantities, and write immutable `pos_sale`/sale-reference movements linked to every allocation. Any allocation failure must abort the entire transaction.

- [ ] **Step 4: Re-run POS tests and check accounting contract non-regression**

Run: local reset plus `supabase/validation/expiry_tracking.sql`, then the focused existing billing lifecycle SQL test.

Expected: PASS; no monetary type or ledger schema changes are introduced.

- [ ] **Step 5: Commit the Pharmacy POS deliverable**

Stage only migration and test files; run `git diff --cached --check`; commit with `feat(pos): allocate pharmacy stock by FEFO`.

### Task 5: Refresh types and add typed expiry/POS client APIs

**Owner:** `client_engineer`

**Files:**
- Modify: `packages/types/src/database.ts`
- Modify: `packages/types/src/index.ts`
- Modify: `packages/supabase-client/src/index.ts`
- Test: `packages/supabase-client/tests/inventory-expiry.test.ts`

**Interfaces:**
- Consumes: Task 1--4 relations/views/RPCs and unchanged POS public checkout signature.
- Produces: `InventoryBatchSummary`, `InventoryExpirySettings`, `InventoryExpiryStatus`, `ReceiveInventoryStockInput`, `saveInventoryExpirySettings`, `receiveInventoryStock`, and workspace data carrying aggregate expiry summaries.

- [ ] **Step 1: Write failing client-wrapper tests**

Mock `.rpc()` and `.from().select().eq()` calls to assert correct RPC names/argument shape, propagated errors, typed batch payload serialization, and that `createPosSale` keeps its existing item-only cart contract.

- [ ] **Step 2: Run the focused client test**

Run: `pnpm --filter @odyssey/supabase-client test -- inventory-expiry.test.ts`.

Expected: FAIL because expiry APIs and types do not exist.

- [ ] **Step 3: Regenerate types and implement wrappers**

After the local migration is applied, run `pnpm db:types`; export only the summary/input types consumed by UI. Add typed wrappers for receipt batches and organization settings; update `getInventoryWorkspace` to read the status projection/summaries without separate item rows. Do not add client-side FEFO selection or a POS department parameter.

- [ ] **Step 4: Re-run focused tests and package typechecks**

Run: `pnpm --filter @odyssey/supabase-client test -- inventory-expiry.test.ts`; `pnpm --filter @odyssey/types typecheck`; `pnpm --filter @odyssey/supabase-client typecheck`.

Expected: PASS.

- [ ] **Step 5: Commit the client contract deliverable**

Stage only types/client/test files; run `git diff --cached --check`; commit with `feat(inventory): expose expiry stock contracts`.

### Task 6: Build aggregate expiry controls in the Inventory workspace

**Owner:** `admin_ui`

**Files:**
- Modify: `apps/admin-web/app/inventory/page.tsx`
- Modify: `apps/admin-web/app/globals.css` only if existing inventory styles cannot express the new status treatment
- Test: focused component/page test if existing framework supports it; otherwise typecheck plus manual local interaction checklist recorded in PR notes

**Interfaces:**
- Consumes: Task 5 workspace summaries, receipt wrapper, item perishable setting, and organization expiry/Pharmacy setting API.
- Produces: item-level perishable administration, 90-day default/configuration UI, Pharmacy department configuration UI, multi-batch perishable receipt submission, and aggregate expiry display.

- [ ] **Step 1: Define failing UI acceptance checks**

Cover one aggregate row for an item with several batch dates; visible usable/near-expiry/expired/unknown state; required expiry per batch when perishable; optional lot; ability to add/remove receipt lines; and no batch picker in adjustments, transfers, or patient tagging.

- [ ] **Step 2: Implement item and settings controls**

Add a perishable toggle to the existing item management flow, an organization expiry warning window defaulting to 90 days, and a designated active Pharmacy department selector. Respect existing inventory permission handling and show server-side validation errors verbatim enough for correction.

- [ ] **Step 3: Replace perishable receipt quantity entry with batch lines**

Keep non-perishable receiving unchanged. For a perishable receipt, render repeatable quantity/expiry/optional-lot fields, prevent obviously invalid client submissions, and submit one `receiveInventoryStock` action. Do not create duplicate list rows for batches.

- [ ] **Step 4: Render aggregate expiry state and usable availability**

Add compact accessible status chips/counts to existing inventory aggregates and a drill-down batch detail. Clearly identify expired as unavailable and legacy stock as expiry unknown; do not expose direct batch mutation controls.

- [ ] **Step 5: Verify UI compilation and targeted interaction behavior**

Run: `pnpm --filter @odyssey/admin-web typecheck` and the relevant inventory test/manual checklist against local Supabase.

Expected: PASS; aggregate list remains one row per item/location and the receipt workflow follows server validation.

- [ ] **Step 6: Commit the Inventory UI deliverable**

Stage only owned Inventory UI/style/test files; run `git diff --cached --check`; commit with `feat(admin): manage inventory expiry batches`.

### Task 7: Present Pharmacy POS availability without creating a second source model

**Owner:** `cashier_ui` (or `admin_ui` if that is the active POS owner)

**Files:**
- Modify: `apps/admin-web/components/record-management.tsx`
- Modify: the active Billing/POS component if inspection shows it owns the checkout form instead
- Test: existing relevant admin component test or manual checklist

**Interfaces:**
- Consumes: unchanged `createPosSale` client signature and Task 5 Pharmacy aggregate/usable status data.
- Produces: Pharmacy-only checkout feedback with no department selector and meaningful unavailable/insufficient stock errors.

- [ ] **Step 1: Define failing POS UI acceptance checks**

Confirm POS identifies its configured Pharmacy source, shows usable availability/expiry warning, never asks a cashier to select a department or batch, and keeps the cart item-only payload.

- [ ] **Step 2: Implement Pharmacy POS state and error presentation**

Load the configured Pharmacy stock summary through the typed client layer, display compact availability/near-expiry information, disable clearly impossible quantities, and show RPC failures without pretending a transaction completed. Do not add prescription, NBB, claims, or financial changes.

- [ ] **Step 3: Verify admin compilation and checkout regression**

Run: `pnpm --filter @odyssey/admin-web typecheck`; execute the focused local POS SQL fixture from Task 4 and complete the UI checklist.

Expected: PASS; successful POS sale reduces Pharmacy aggregate/batches by FEFO and any failed sale leaves the cart action visibly unsuccessful.

- [ ] **Step 4: Commit the POS UI deliverable**

Stage only owned POS UI/test files; run `git diff --cached --check`; commit with `feat(pos): show pharmacy stock availability`.

### Task 8: Integration verification and independent review

**Owner:** `test_engineer`, then `reviewer`

**Files:**
- Modify only as needed: focused SQL validation fixtures and client/UI tests owned by their layers
- Read: all staged expiry-related migration, type, client, Inventory UI, and POS UI changes

**Interfaces:**
- Consumes: Tasks 1--7 complete implementation.
- Produces: evidence-backed validation summary and security/concurrency review findings.

- [ ] **Step 1: Establish the scoped diff and local database baseline**

Inspect `git status --short`, list only expiry/POS scoped paths, reset the local database, and verify the generated migration order. Do not stage or modify unrelated dirty paths.

- [ ] **Step 2: Run focused database, concurrency, and package gates**

Run: `pnpm exec supabase db reset --local`; expiry validation SQL; `supabase/validation/expiry_tracking_concurrency.ps1`; `pnpm --filter @odyssey/types typecheck`; `pnpm --filter @odyssey/supabase-client typecheck`; `pnpm --filter @odyssey/admin-web typecheck`.

Expected: every focused gate passes, or any unavailable/local-environment failure is reported as unverified rather than passing.

- [ ] **Step 3: Perform independent security and regression review**

Review tenant authorization, RLS/grants, `SECURITY DEFINER` search paths, direct DML denial, immutable history, stable locking, transaction rollback on POS failure, and preservation of the canonical tag RPC. Re-run the cross-tenant and direct-call tests from Tasks 1--4.

- [ ] **Step 4: Resolve only validated scoped defects and repeat affected gates**

Route SQL changes to `db_engineer`, client contracts to `client_engineer`, Inventory UI to `admin_ui`, and POS UI to its owner. Do not broaden into prescription, NBB, claims, or financial-ledger work.

- [ ] **Step 5: Produce final scoped verification report**

Record exact passing commands, committed hashes, skipped/unavailable checks, and any known non-goals. Confirm `git diff --cached --check` before any requested final commit/push.

## Plan self-review

- **Spec coverage:** Tasks 1--4 implement the schema, legacy backfill, expiry status, server-authorized FEFO, perishable receipt, transfer, adjustment, tagging, expired disposal, and POS allocation. Tasks 5--7 implement the typed client and aggregate-first Inventory/POS presentation. Task 8 proves concurrency, RLS, rollback, and regression behavior.
- **Step scan:** Each task has a failing check, bounded implementation point, passing verification, and a scoped commit boundary. Exact public signatures are preserved or named where new.
- **Type consistency:** `receiveInventoryStock` wraps `receive_inventory_stock`; `saveInventoryExpirySettings` wraps `save_inventory_expiry_settings`; POS remains `createPosSale` / `create_pos_sale` with no department argument; only the canonical four-argument tag RPC is retained.
- **Review focus:** Each of the five listed risky inputs is mapped to a named test task above.
- **Proportion:** This plan specifies interfaces, ownership, and testable outcomes without prescribing implementation bodies beyond the locking algorithm and immutable transaction boundaries that the specification requires.
