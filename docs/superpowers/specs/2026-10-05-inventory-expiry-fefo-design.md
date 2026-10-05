# Inventory expiry and FEFO design

**Status:** proposed for review
**Date:** 2026-10-05
**Scope:** Inventory and pharmacy POS only

## 1. Outcome and boundaries

Odyssey will track expiry at the batch level while continuing to show a single
catalogue item and a single aggregate on-hand row per department. A perishable
item may therefore have several expiry batches without being split into
separate inventory items or stock-list rows.

FEFO (first-expiry, first-out) is a server-side rule for all stock-reducing
paths in this scope: encounter tagging, negative adjustments, inter-department
transfers, expired-stock disposal, and pharmacy POS checkout. Expired stock is
never dispensed or transferred. Legacy stock without a recorded expiry remains
usable, visibly labelled `expiry unknown`, and is consumed only after dated,
unexpired batches.

This slice is intentionally standalone. It neither requires nor validates a
doctor prescription, changes NBB eligibility, nor alters HMO/PhilHealth
claims, invoices, payments, prices, or financial-ledger schema.

## 2. Current-state audit

The authoritative current total is `department_stock`: one row per
organization, item, and department. `inventory_items` is the item master;
`inventory_stock_movements` and `inventory_usages` are immutable history.
Receiving, stock corrections, transfers, and encounter tagging currently
change that aggregate through server-side RPCs. POS creates a paid retail sale
from an item and quantity but currently has neither a source department nor an
inventory deduction.

The uncommitted expiry draft adds `inventory_batches`, a batch-consumption
table, status view, and aggregate/batch parity triggers. Its data model is
compatible with this design, but it cannot be deployed as-is: current mutation
RPCs do not create or consume batch allocations, so its parity trigger would
reject perishable receipt, adjustment, transfer, and tagging operations. It
also does not integrate POS, item/receipt UI, client contracts, or every
required authorization boundary.

## 3. Data model

### 3.1 Item and settings

`inventory_items.is_perishable boolean not null default false` determines
whether batches and expiry are required. New receipts for a perishable item
must supply an expiry date; a lot number is optional. Non-perishable items do
not create expiry batches.

`inventory_expiry_settings` stores one organization-scoped
`near_expiry_days`, defaulting to 90 days. `inventory_items` may carry an
optional 1--3650 day override. The effective alert threshold is the item
override, then the organization setting, then 90 days.

### 3.2 Batch ledger

`inventory_batches` belongs to one aggregate `department_stock` row and
records `lot_number`, `expiry_date`, `quantity`, `received_at`, and a
`legacy_unassigned_expiry` flag. The only valid legacy form has a null expiry;
all normal batches have a non-null expiry. A batch may be merged only when the
same stock row, lot, and expiry identify the same lot allocation.

`inventory_usage_batch_consumptions` permanently links an encounter usage to
each allocated batch and quantity. `inventory_stock_movements.batch_id` links
logistics history to the corresponding batch allocation. A multi-batch action
creates one aggregate usage where appropriate and one immutable movement or
consumption record per allocated batch.

For every perishable aggregate row, `department_stock.quantity` must equal the
sum of all its batch quantities at transaction commit. Deferred constraint
triggers enforce that invariant; all mutation routines update both sides in the
same transaction.

### 3.3 Pharmacy POS source

`inventory_pos_settings` stores exactly one active `pharmacy_department_id`
per organization. It is explicitly configured by inventory administration;
the system never assumes a department named "Pharmacy". Pharmacy POS uses this
configured department automatically and presents no per-sale location picker.

## 4. Transactional FEFO rules

All stock mutation remains in PostgreSQL functions. Client-side code submits
intent only; it neither chooses a batch nor calculates usable quantity.

1. The function validates caller permission, organization ownership, active
   item/department status, positive quantity, and its path-specific rule.
2. It locks the aggregate stock row and eligible batch rows in a stable FEFO
   order. Dated unexpired batches sort by `expiry_date`, `received_at`, and
   batch ID. Legacy unknown-expiry batches sort after every dated unexpired
   batch. Expired batches are excluded from dispensing and transfer.
3. It verifies the requested quantity against the sum of eligible batch
   quantities, then decrements batches in order. A concurrent operation either
   sees the committed remainder or fails without partial allocation.
4. It updates the aggregate once, writes immutable movement/allocation rows,
   and commits only when the parity check passes.

The following operations use that allocator:

| Operation | FEFO result |
| --- | --- |
| Receive / opening stock | Perishable receipt accepts one or more batch lines and raises aggregate and matching batch totals atomically. |
| Negative correction / breakage | Reduces dated unexpired batches first, then legacy unknown batches. |
| Expired-stock disposal | Uses a dedicated write-off path that can reduce only expired batches, in earliest-expiry order; it is never a patient/POS dispense. |
| Department transfer | Moves earliest valid batches to the destination, preserving lot, expiry, and received-at provenance while writing paired immutable movement rows. |
| Encounter tagging | Creates the existing aggregate usage and bill linkage, plus batch-consumption and batch-specific movement rows. Expired units cannot be tagged. |
| Pharmacy POS | Allocates the configured Pharmacy department's earliest valid batches inside the same checkout transaction as its existing sale, invoice, and payment records. |

If a perishable item has no eligible stock, the operation fails with an
inventory-specific error; it never falls back to expired inventory. For
non-perishable items, the existing aggregate-only behavior remains intact.

## 5. Authorization, integrity, and audit

New batch/settings tables are organization-scoped, use RLS, and expose only
authorized read projections. Direct insert, update, and delete privileges are
revoked from browser roles. Management writes occur only through narrowly
authorized RPCs; the POS checkout function may allocate Pharmacy stock only
after its existing POS permission check.

Every new or replaced `SECURITY DEFINER` function will use an empty
`search_path` and fully qualified relations/functions. It will validate tenant
ownership and permission before locking or mutating rows. Existing immutable
usage and movement records remain immutable; corrections create compensating
stock movements rather than editing history. The feature introduces no money
columns or financial-ledger mutations, avoiding any change to the current POS
financial contract.

## 6. User experience and client contracts

The Inventory page retains one item row per department. It adds usable quantity
and compact expiry status indicators: expired, near expiry, and expiry unknown.
The item editor adds a perishable toggle and optional item-specific warning
window. Inventory settings configure the organization warning window and
designated Pharmacy department.

For perishable receipts, the Receive Stock form changes from one quantity to a
repeatable list of batch lines (quantity, required expiry, optional lot). The
form submits a single atomic receipt. Non-perishable receiving retains the
current simple quantity input. The batch detail view is drill-down information,
not an additional catalogue item or aggregate stock row.

Adjust, transfer, patient-tagging, and POS screens show usable availability and
the auto-selected FEFO consequence but do not offer batch selection. Expired
stock is visibly unavailable. The Pharmacy POS surface continues to sell the
same catalogue but only against its configured Pharmacy department.

The Supabase client gets typed wrappers for receipt batches, expiry settings,
Pharmacy POS configuration, and expiry summary reads. Generated database types
and workspace summary fields are refreshed together so no client needs unsafe
casts for the new schema.

## 7. Migration and compatibility

The implementation will reconcile the existing untracked expiry migration
drafts rather than overwrite unrelated work. It will preserve the established
item and aggregate-stock IDs, introduce legacy unknown-expiry batches only for
already-on-hand perishable stock, and leave non-perishable stock untouched.

The current public `tag_inventory_usage(uuid, uuid, numeric, uuid)` signature
remains canonical to avoid the known PostgREST overloaded-RPC failure. Its
behavior is upgraded internally to allocate batches. Existing callers keep the
same request shape.

No automatic migration may invent an expiry date. An existing perishable stock
balance becomes a labelled legacy batch until staff reconcile it through normal
inventory operations.

## 8. Verification

Database tests must prove:

- one aggregate item/department row supports several expiry batches;
- a perishable receipt requires expiry, while a non-perishable receipt does
  not;
- dated FEFO allocation skips expired stock and uses legacy unknown stock only
  after dated valid stock;
- each allocation preserves aggregate/batch parity and immutable audit rows;
- negative adjustments, transfers, patient tagging, expired disposal, and POS
  all apply the designated allocation rule;
- POS rejects a missing/inactive Pharmacy source or insufficient usable stock
  without creating partial financial or inventory records;
- cross-tenant and unauthorized attempts fail, and direct batch mutation is
  denied;
- concurrent dispensations cannot over-allocate the same batch.

Client verification covers typechecks, the inventory receipt/item/settings
forms, the aggregate inventory display, and Pharmacy POS behavior. Existing
inventory and POS workflows will be regression-tested; no claim or
prescription flow is in scope.

## 9. Files and ownership for the implementation plan

- `supabase/migrations/**`: schema, RLS, RPCs, triggers, and POS integration.
- `packages/types/**` and `packages/supabase-client/**`: generated schema types
  and typed inventory/POS APIs.
- `apps/admin-web/app/inventory/**`: item, receipt, expiry-status, and settings
  user interface.
- `apps/admin-web` POS ownership path: Pharmacy source presentation and usable
  inventory feedback without a department selector.
- `supabase/validation/**` and relevant test suites: SQL, concurrency, and
  workflow regression coverage.

## 10. Explicit non-goals

- Prescription validation, NBB dispensing policy, HMO/PhilHealth claims, and
  patient eligibility rules.
- Financial price, payment, invoice, or ledger redesign.
- Supplier, purchase-order, barcode, recall, cold-chain, or email/SMS alert
  workflows.
