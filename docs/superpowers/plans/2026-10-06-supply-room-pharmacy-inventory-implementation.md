# Supply Room Root Warehouse and Pharmacy Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the Supply Department as the authoritative root warehouse for external intakes (with GSO CSV import supporting optional expiry), enforce departmental stock isolation so Pharmacy only accesses Pharmacy stock, enforce a Monday–Wednesday requisition window for scheduled next-week delivery, support two-path dispersal (immediate FEFO dispersal vs. backorder awaiting supply receipt), and integrate real-time Pharmacy POS transactions.

**Architecture:** 
1. Database: Add `is_root_supply` to `departments`, introduce `inventory_requisitions` and `inventory_requisition_items` ledgers, add Manila timezone-aware validation for the Monday–Wednesday submission window, implement `submit_inventory_requisition` and `disperse_inventory_requisition_item` RPCs.
2. Security & RLS: Department staff (e.g. Pharmacy) only query stock, batches, and movements for their assigned department; Central Supply and Superadmins query both root stock and cross-departmental stock breakdowns.
3. Inbound Intake: GSO CSV intake parser supporting optional expiry dates; all inbound receipts route strictly to the designated Root Supply Room.
4. UI: Requisition ordering tab with Mon–Wed countdown badge, Supply fulfillment dashboard with immediate dispersal and backorder triage, and Pharmacy POS integration.

**Tech Stack:** Next.js 15, TypeScript, Supabase PostgreSQL / RLS / RPCs, pnpm, Playwright / SQL validation.

**Spec:** `docs/superpowers/specs/2026-10-06-supply-room-pharmacy-inventory-design.md`

---

## Global Constraints

- **Centavo Integer Rule:** All monetary amounts (`unit_cost`, `unit_price`) must be stored in `bigint` integer centavos (`unit_cost_in_centavos`). No floating-point or raw numeric drift.
- **Root Supply Invariant:** External vendor/GSO intake (`receive_inventory_stock`) must enter via the designated Root Supply Department (`is_root_supply = true`). Satellite departments (Pharmacy, Wards) only receive stock via internal dispersal.
- **Optional Expiry on GSO Intake:** Non-perishable items or supplies without manufacturer expiration stamps must not fail intake when `expiry_date` is omitted or empty.
- **Strict Mon–Wed Window:** Requisitions submitted between Monday 00:00:00 and Wednesday 23:59:59 (PHT) are accepted and scheduled for the following week; routine submissions outside this window are rejected.
- **FEFO Transfer Enforcement:** Dispersal from Central Supply to Pharmacy must allocate batches via First-Expiry, First-Out (`transfer_department_stock`).
- **Pharmacy Isolation:** Non-supply users can only read and mutate stock records for their assigned `department_id`.
- **Subagent Roles:** Only `db_engineer` writes migrations. Subagents return structured summaries.

---

## Task Breakdown

### Task 1: Root Department & Requisition Ledger Migration

**Owner:** `db_engineer`

**Files:**
- Create: `supabase/migrations/<timestamp>_root_supply_and_requisitions.sql`
- Create: `supabase/validation/root_supply_requisition_validation.sql`

**Interfaces:**
- Consumes: `public.departments`, `public.inventory_items`, `public.department_stock`, `public.inventory_batches`.
- Produces: 
  - `departments.is_root_supply` column and unique constraint.
  - `inventory_requisitions` and `inventory_requisition_items` tables.
  - RPC: `public.get_root_supply_department(p_organization_id uuid)`.
  - RPC: `public.submit_inventory_requisition(p_organization_id uuid, p_items jsonb, p_notes text, p_is_emergency boolean, p_emergency_reason text)`.
  - RPC: `public.disperse_inventory_requisition_item(p_requisition_item_id uuid, p_quantity numeric)`.

- [x] **Step 1: Write failing validation script `supabase/validation/root_supply_requisition_validation.sql`**
  - Verify that attempting to submit a requisition on a simulated Thursday fails with `REQUISITION_WINDOW_CLOSED`.
  - Verify that a requisition submitted on Tuesday calculates `target_delivery_week` as the coming Monday.
  - Verify that non-supply users cannot set their intake destination to other departments.

- [x] **Step 2: Generate and apply migration for Root Supply & Requisitions**
  - Add `is_root_supply boolean not null default false` to `departments`.
  - Create unique index ensuring only one active root supply department per organization.
  - Create `inventory_requisitions` and `inventory_requisition_items` with appropriate RLS policies.
  - Create Manila time helper `public.inventory_manila_dow()` and validation function.

- [x] **Step 3: Implement RPC `submit_inventory_requisition`**
  - Validate caller assignment to the requesting department.
  - Validate day of week (Monday–Wednesday) unless `p_is_emergency = true` with permission.
  - Insert requisition header and lines; check item availability in Root Supply.
  - If Root Supply stock $> 0$, mark item status as `ready_for_dispersal`; if 0, mark as `awaiting_supply_intake` (backorder).

- [x] **Step 4: Implement RPC `disperse_inventory_requisition_item`**
  - Validate caller has `can_manage_inventory` and belongs to Root Supply or Admin.
  - Check Root Supply stock for the item.
  - Execute `transfer_department_stock` from Root Supply to requesting department using FEFO.
  - Update `dispersed_quantity` and requisition status (`partially_dispersed` or `fulfilled`).

- [x] **Step 5: Run SQL validation suite**
  - Ensure all assertions pass against local PostgreSQL.

---

### Task 2: GSO CSV Intake Engine with Optional Expiry

**Owner:** `client_engineer` & `db_engineer`

**Files:**
- Modify: `packages/supabase-client/src/index.ts`
- Create: `packages/supabase-client/src/gso-csv-parser.ts`
- Create: `packages/supabase-client/tests/gso-csv-parser.test.ts`
- Modify: `packages/types/src/index.ts`

**Interfaces:**
- Input: CSV string or buffer matching GSO procurement format.
- Output: Parsed, validated payload array for bulk receiving into Root Supply.

- [x] **Step 1: Define GSO CSV format contract and parser**
  - Implement `packages/supabase-client/src/gso-csv-parser.ts` to parse the multi-section GSO spreadsheet format (as captured in [docs/gso-inventory-sample.csv](file:///d:/ODC%20Projects/ODC-Healthchare-OS/docs/gso-inventory-sample.csv)).
  - Parse section headers (`OFFICE SUPPLIES`, `GSO MEDICAL SUPPLIES`, `LAUNDRY & JANITORIAL SUPPLIES`, `MEDICAL EQUIPMENTS`, `ICT, OFFICE SUPPLIES`, `PCSO`, `DOH`) as item categories / fund tags.
  - Extract `DESCRIPTION`, `EXPIRY` / `EXPIRY DATE` (**Optional**), `UNIT`, and `QTY`.
  - Implement date normalizer supporting `MM/YYYY`, `MM/DD/YY`, `MM/DD/YYYY`, `Named Month YYYY` (e.g. `SEPT. 2027`), `Year only` (e.g. `2028`), and empty string -> `null`.
  - Discard blank lines and page markers (`Page 3`, `Page 4`, etc.).

- [x] **Step 2: Unit test GSO CSV parser against actual fixture**
  - Write tests in `packages/supabase-client/tests/gso-csv-parser.test.ts` utilizing `docs/gso-inventory-sample.csv`.
  - Assert that all 200+ line items parse with correct category assignments and normalized unit of measures.
  - Assert that items with blank expiry dates produce `expiry_date: null` without errors.
  - Assert that items like `AMBU BAG ADULT` (`7/2027`) produce `2027-07-31` and `CORD CLAMP` (`11/19/26`) produce `2026-11-19`.

- [x] **Step 3: Implement `importGsoInventoryCsv` in `@odyssey/supabase-client`**
  - Resolve Root Supply department ID automatically.
  - Upsert items into item catalog if new, then invoke `receive_inventory_stock` into Root Supply.
  - For items without quantities in the template, provide a preview modal interface allowing the Supply Officer to input or confirm quantities prior to database insertion.
  - Flag any pending backorders matching the received items as ready for dispersal.

---

### Task 3: Department Isolation & Requisition Client Wrappers

**Owner:** `client_engineer`

**Files:**
- Modify: `packages/types/src/index.ts`
- Modify: `packages/supabase-client/src/index.ts`

**Interfaces:**
- `getInventoryWorkspace(client, orgId, includeMovements?, departmentId?)`: Accepts optional `departmentId` filter. Scopes stock, batches, usages, and movements to enforce departmental isolation.
- `submitInventoryRequisition(client, input)`
- `listInventoryRequisitions(client, orgId, departmentId?)`
- `disperseInventoryRequisitionItem(client, input)`
- `importGsoInventoryRows(client, orgId, rows, defaultQty?)`

- [x] **Step 1: Update TypeScript types**
  - Add `InventoryRequisition`, `InventoryRequisitionItem`, `RequisitionStatus`, `GsoCsvRow`.
- [x] **Step 2: Add client functions with error handling**
  - Handle `REQUISITION_WINDOW_CLOSED` with localized friendly message indicating the next available submission window.
  - Handle `INSUFFICIENT_SUPPLY_STOCK` during dispersal.

---

### Task 4: Pharmacy Department UI (Isolated Stock, Mon–Wed Requisitions)

**Owner:** `admin_ui`

**Files:**
- Modify: `apps/admin-web/app/inventory/page.tsx`
- Create: `apps/admin-web/components/inventory-requisition-modal.tsx`
- Create: `apps/admin-web/components/inventory-requisition-tracker.tsx`

**Interfaces:**
- Renders:
  - Department Scoped Stock View: When logged in as Pharmacy staff, the department selector is locked to "Pharmacy", displaying only Pharmacy stock, batches, and movements.
  - Requisition Action Bar: Displays "Submit Supply Request" button with live status badge ("Open: Mon–Wed Requisition Window" or "Closed: Opens Monday").
  - Requisition Modal: Multi-item selector, requested quantities, target delivery week preview.
  - Requisition Tracker Tab: Lists department requests with status badges (`Pending Supply Dispersal`, `Awaiting Supply Delivery (Backorder)`, `Fulfilled`).

- [x] **Step 1: Enforce department locking in `InventoryPage`**
  - If current user is assigned to Pharmacy (or other non-supply department) and lacks global inventory management permission, lock active department filter.
- [x] **Step 2: Build Requisition Modal & Submission Handler**
  - Include Mon–Wed validation feedback and next-week delivery date computation.
  - Add optional emergency checkbox with mandatory justification field.
- [x] **Step 3: Build Requisition History and Backorder Tracking Tab**
  - Show status of pending supplies.

---

### Task 5: Root Supply Room Dashboard & Dispersal Hub

**Owner:** `admin_ui`

**Files:**
- Modify: `apps/admin-web/app/inventory/page.tsx`
- Create: `apps/admin-web/components/supply-fulfillment-hub.tsx`
- Create: `apps/admin-web/components/gso-csv-import-modal.tsx`

**Interfaces:**
- Renders:
  - Hospital Breakdown Matrix: View Root Supply balance side-by-side with Pharmacy, ER, and Lab balances.
  - Inbound GSO CSV Import Tool: File dropzone, column mapping preview, optional expiry handling, and commit button.
  - Dispersal Queue: Incoming department requests grouped by:
    - **Ready for Immediate Dispersal:** Items in stock in Supply Room; single-click "Disperse" action.
    - **Awaiting Supply Delivery (Backorder):** Items out of stock; automatic indicator when matching GSO shipment is received.

- [x] **Step 1: Implement GSO CSV upload modal**
  - Preview parsed items with badges for dated vs. non-dated items.
  - Submit batch intake to Root Supply Room.
- [x] **Step 2: Implement Supply Dispersal Queue**
  - Action button invokes `disperse_inventory_requisition_item`.
  - Shows FEFO batch preview that will be transferred to requesting department.

---

### Task 6: Pharmacy POS Live Stock Integration & E2E Verification

**Owner:** `cashier_ui` & `test_engineer`

**Files:**
- Verify: `apps/admin-web/components/nbb-pharmacy-pos-terminal.tsx`
- Create: `e2e/inventory-supply-pharmacy-workflow.spec.ts`

- [x] **Step 1: Verify Pharmacy POS live stock deduction**
  - Confirm `list_nbb_pharmacy_pos_catalog` displays isolated Pharmacy stock.
  - Confirm `create_nbb_pharmacy_pos_sale` deducts exclusively from Pharmacy stock via FEFO, without touching Central Supply stock.
- [x] **Step 2: Create end-to-end Playwright workflow test**
  - Step A: Central Supply receives GSO shipment (some items with expiry, some without).
  - Step B: Pharmacy submits requisition within Monday–Wednesday window.
  - Step C: Central Supply disperses item to Pharmacy.
  - Step D: Pharmacy verifies stock received in their isolated ledger.
  - Step E: Pharmacy POS dispenses item to patient and confirms local stock decrement.

---

## Deliverables & Review Checklist

- [x] Schema migration for `is_root_supply` and requisitions applied.
- [x] Mon–Wed submission constraint validated with simulated date tests.
- [x] GSO CSV parser tested with and without `expiry_date`.
- [x] Department isolation verified: Pharmacy staff cannot access Supply or Lab stock.
- [x] Two-path dispersal verified: In-stock immediate transfer vs. out-of-stock backorder.
- [x] Pharmacy POS tested against live isolated stock.
