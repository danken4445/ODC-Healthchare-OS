# Standalone Pharmacy Inventory Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove clinical-account linkage from new prescription encodings while retaining live inventory stock and the Pharmacy queue lifecycle.

**Architecture:** Add standalone free-text context to pharmacy orders and a dedicated non-billable inventory usage path. Keep legacy linked orders compatible, then update both encoders to use inventory-backed medicine selection and the new submit RPC.

**Tech Stack:** Supabase Postgres/RPC/RLS, TypeScript, Next.js, React.

**Spec:** `docs/superpowers/specs/2026-10-08-standalone-pharmacy-inventory-orders-design.md`

## Global Constraints

- Preserve existing patient-linked orders and their billing behavior.
- Do not create a patient, encounter, billing event, or invoice for standalone orders.
- Keep a single RPC signature per public function name.
- Inventory deductions must keep FEFO batch allocation and immutable audit/movement records.

## Review Focus

- Legacy patient-linked order completion continues to use the clinical billing path.
- Standalone dispense cannot deduct stock twice under retries or stale queue actions.
- A selected item from another organization is rejected server-side.
- A non-Pharmacy staff member cannot review or dispense standalone orders.
- No patient or encounter lookup remains in either encoder form.

### Task 1: Expand the standalone database contract

**Files:**
- Create: `supabase/migrations/<generated>_standalone_pharmacy_inventory_orders.sql`
- Modify: `packages/types/src/index.ts`
- Modify: `packages/supabase-client/src/index.ts`

**Interfaces:**
- Produces: `createStandalonePharmacyInventoryOrder` client wrapper and queue rows with `patient_reference`/`ward_reference`.

- [ ] Add nullable legacy clinical links and standalone reference fields.
- [ ] Add a server-authorized standalone submit RPC and a non-billable FEFO inventory usage path.
- [ ] Update queue JSON, types, and client wrappers.
- [ ] Verify with migration checks and focused contract tests.

### Task 2: Update encoder and queue interfaces

**Files:**
- Modify: `apps/admin-web/components/pharmacy-prescription-encoder.tsx`
- Modify: `apps/provider-web/app/components/PharmacyPrescriptionQueue.tsx`
- Modify: `apps/admin-web/components/pharmacy-prescription-queue.tsx`

**Interfaces:**
- Consumes: standalone submit wrapper and inventory workspace/live availability.

- [ ] Replace patient/encounter selection with free-text references.
- [ ] Add inventory-backed medicine search and live pharmacy availability.
- [ ] Render reference text in the encoder history and pharmacist queue.
- [ ] Verify both portal typechecks and focused tests.
