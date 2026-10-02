# MASTER PROMPT: PhilHealth-Ready Revenue Operations & HMO Claims Subsystem
**Monorepo Multi-Agent Implementation Engine for Odyssey Healthcare OS**

```text
========================================================================================
                                KICKOFF INSTRUCTION
             (Copy and paste this into Codex / Antigravity Orchestrator to start)
========================================================================================
Read revenue-operations-hmo-philhealth-master-prompt.md in full. You are the ORCHESTRATOR.
Step 1: Verify the custom agent definitions in Section 7 and confirm the execution pipeline.
Step 2: Execute Loop 1 (Core Self-Pay Checkout & Centavo Subledger) using the per-loop 
        pipeline in Section 7.4. Delegate implementation to the owning subagents; do not
        write bulk application code or migrations yourself.
Step 3: Enforce strict file ownership (db_engineer owns migrations, client_engineer owns 
        packages/supabase-client, cashier_ui / patient_ui / hmo_ui / provider_ui own their 
        respective apps).
For every phase: spawn the listed agents, collect their structured summaries, verify zero 
blocking reviewer findings, and commit sequentially.
Stop after Loop 1's review gate passes and await user confirmation before starting Loop 2.
========================================================================================
```

---

## 1. Role & System Context

You are the **Lead Healthcare Systems Architect and Financial Engineering Orchestrator** in the `ODC-Healthchare-OS` monorepo (Next.js 14 App Router, Supabase/Postgres, HL7 FHIR R4 data model, TailwindCSS).

You are upgrading the existing legacy billing prototype (`20260903000700_financial_loop.sql`, `20260927180000_billing_management_lifecycle.sql`, and `20261002111835_loop_e2_concurrency_presence_payout.sql`) into a **production-grade, PhilHealth eClaims-accredited, and BIR EOPT-compliant Revenue Operations and HMO Claims Subsystem**.

### Architecture Tenets
1. **Integer Centavos Rule:** Money is stored strictly as `bigint amount_in_centavos` (e.g., ₱1,500.50 = `150050`). No floats, no numeric rounding drift.
2. **Double-Entry Immutability:** Financial ledgers are append-only. No destructive `UPDATE` or `DELETE` on accounting entries; adjustments use compensating debit/credit reversals.
3. **Multi-Tenant Isolation:** Every table is keyed on `organization_id uuid not null references public.organizations(id)`. Direct cross-tenant data access is blocked by RLS.
4. **Postgres-First Financial State:** All money calculations, slot confirmation guards, and inventory decrements execute inside transactional PostgreSQL functions (`SECURITY DEFINER` with `search_path = ''`), never in browser client code.

---

## 2. Objective

Transform Odyssey's billing into a seamless, enterprise-grade revenue engine that:
1. **Enforces Upfront Booking Prepayment:** Guarantees appointment slots confirm only upon 100% full payment (or verified No Balance Billing / government waiver), eliminating ghost bookings.
2. **Captures Realtime Encounter Consumption:** Decrements physical stock immediately upon tagging in an encounter, while creating an immutable `inventory_usage_financial_ledger` entry.
3. **Automates Diagnostic Billing:** Seamlessly pulls doctor-ordered Laboratory tests into the patient's billing event without manual cashier re-entry.
4. **Supports QR Token Scanning:** Enables cashiers to scan a dynamic, per-encounter billing QR token (not the static patient ID) to instantly hydrate the POS terminal.
5. **Achieves PhilHealth eClaims & Konsulta Readiness:** Packages encounters into PhilHealth Claim Form 1 (CF1), Claim Form 2 (CF2), and Claim Form 4 (CF4) dossiers with ICD-10 and RVS 2001 coding, Case Rate splitting (Hospital Fee vs. Professional Fee), and No Balance Billing (NBB) ₱0 patient liability tracking.
6. **Manages Private HMO Pre-Authorizations (LOA):** Validates member eligibility, enforces LOA benefit caps, handles partial approvals, and cleanly resolves the Co-Pay Split vs. Pay-In-Full constraint.
7. **Calculates Doctor Professional Fees & Withholding:** Computes private practitioner fee schedules vs. government fixed rates, resolves covering-doctor attribution, withholds BIR Form 2307 taxes (10%/15%), and exports PESONet disbursement files.
8. **Automates Cashier Shift Reconciliation:** Enforces blind physical cash counts, captures cashier over/short variances, and locks shift drawers.

---

## 3. Forensic Audit: Legacy vs. PhilHealth-Ready Target

| # | Subsystem | Legacy State in Repository | PhilHealth-Ready Target Architecture |
|---|---|---|---|
| **A1** | **Monetary Precision** | Uses `numeric(14,2)` or `numeric(12,2)` across `billing_line_items`, `invoices`, and `payments`. Prone to floating-point rounding discrepancies during multi-line tax and discount splits. | Migrates all monetary columns to `bigint` storing integer centavos (`amount_in_centavos`). Zero rounding drift. |
| **A2** | **Ledger Architecture** | Ad-hoc status updates on `invoices` and `payments`. No balanced double-entry accounting; lacks formal Accounts Receivable subledger. | Introduces `public.financial_ledger_entries`: Append-only, double-entry subledger tracking Debits and Credits across Asset, Liability, Revenue, Contra, and Expense accounts. |
| **A3** | **Slot Confirmation & Prepayment** | Booking creates an appointment, but payment is loosely coupled; no database guard blocks unconfirmed slots from queue intake. | Database function `record_payment_and_confirm_slot()` enforces an atomic transaction: Slot confirms **if and only if** `patient_balance_due_centavos == 0`. |
| **A4** | **No Balance Billing (NBB)** | `billing_mode` enum ('standard', 'nbb') added in migration `20260927180000`, but lacks automated PhilHealth case rate calculation and CF4 clinical data mapping. | Standard chargemaster prices are tracked per line item; patient liability is set to ₱0; claims engine auto-generates PhilHealth NBB reimbursement claim. |
| **A5** | **Encounter Billing QR** | `invoice_qr_tokens` table exists, but cashier terminal lacks keyboard-first shortcuts and dynamic QRPh (GCash/Maya) integration. | Cashier terminal supports fast barcode/QR scanning (`F2`), dynamic QRPh string generation (BSP Circular 1055), and instant tender processing. |
| **A6** | **Covering Doctor PF Attribution** | Migration `20261002111835` sets `assigned_practitioner_role_id` and `performed_by_practitioner_role_id`, but explicitly states: *"coverage split logic remains TODO"*. | Implements configurable clinic attribution policy defaulting to **100% to Performing Doctor**, with BIR 2307 withholding (10%/15%) and payout batch locking. |
| **A7** | **HMO LOA & Co-Pay Conflict** | No mechanism to handle partial LOA approvals or co-pays while preserving the "No Partial Payment" rule. | Implements **Workflow 3.i**: Splits invoice into `hmo_liability` and `patient_liability`. The patient's co-pay must be paid 100% in full before the slot or encounter confirms. |
| **A8** | **PhilHealth eClaims (CF1/CF2/CF4)** | `claims` table has basic columns (`philhealth_claim_number`), but lacks clinical indicators (SOAP, vitest, ICD-10, RVS) required for eClaims submission. | Comprehensive `claims`, `claim_line_items`, and `claim_responses` schema conforming to PhilHealth Konsulta / Outpatient benefit package specifications. |

---

## 4. Confirmed Product Decisions (Fixed Constraints)

1. **Pay-In-Full Rule for Slot Confirmation:**
   An appointment booking bill must be paid 100% in full before the calendar slot confirms. No partial payments are permitted for slot confirmation.
   *Exception:* Government facilities / accredited NBB services where patient charge is ₱0 by statute.
2. **Standard Price Tracking under NBB:**
   In government facilities and for qualified NBB patients, patients are not billed (₱0 balance), but standard chargemaster catalog prices **must be recorded on every line item** to substantiate PhilHealth case rate claims.
3. **Immediate Inventory Realization & Financial Decoupling:**
   Consumables tagged during an encounter decrement physical stock immediately in `inventory_levels`, while simultaneously recording an entry in `inventory_usage_financial_ledger` (`tagged` state) and adding a `billing_line_item`.
4. **Automatic Laboratory Charge Injection:**
   Doctor-requested laboratory tests (`ServiceRequest`) are automatically added to the active `billing_event` as `source_type = 'laboratory_service'`.
5. **Encounter-Bound Billing QR Tokens:**
   Cashiers scan a dynamic, per-encounter billing QR token (never a static patient QR) to pull up the active invoice.
6. **Professional Fee Regimes:**
   * Government clinics: Fixed statutory rate; doctor overrides prohibited.
   * Private clinics: Doctors declare their own consultation tariffs via CMS.

---

## 5. Decision Resolution: Covering Doctor Payout Attribution

* **Decision Ratified:** **Configurable Organization Policy with Default to Performing Doctor (Option 3 / Default Option 1).**
* **Rule:**
  * For standard outpatient consultations, 100% of the doctor professional fee is attributed to the **performing doctor** (`performed_by_practitioner_role_id`) who completed and documented the encounter.
  * If the clinic has configured an administrative coverage split (e.g., 80% performing / 20% assigned), the batch payout engine divides the net fee accordingly.
  * Payout rows calculate BIR Form 2307 creditable withholding tax based on the receiving doctor's registered tax classification (10% for non-VAT ≤ ₱3M; 15% for VAT or > ₱3M).

---

## 6. Non-Negotiable Engineering Rules

1. **Database-Driven Concurrency & Locking:**
   * High-contention operations (slot confirmation, invoice checkout, cash drawer close) must acquire PostgreSQL advisory transaction locks:
     ```sql
     perform pg_advisory_xact_lock(hashtext('invoice_' || p_invoice_id::text));
     ```
2. **Strict Security Definer Hygiene:**
   * All financial database functions must declare `SECURITY DEFINER set search_path = ''`.
   * Must verify `auth.uid() is not null` and validate tenant permissions via `public.has_organization_permission()`.
3. **Additive-Only Migrations (Expand → Migrate → Contract):**
   * Never drop or rename columns in the same migration. Deprecate legacy columns with SQL comments; migrate data; drop legacy columns in a subsequent release.
4. **Typed Wrappers & Zod Schemas:**
   * Every database RPC must have an accompanying TypeScript wrapper and Zod schema in `packages/supabase-client`. No client-side `any`.
5. **Idempotent External Endpoints:**
   * Payment webhooks and claim submission endpoints must accept and enforce an `Idempotency-Key` to guarantee exactly-once processing.

---

## 7. Multi-Agent Operating Model

### 7.1 Principles
1. **Parallelize Reads, Serialize Writes:** Exploration, research, and test generation run in parallel. Implementation write access is partitioned by strict, exclusive file boundaries.
2. **One Migration Writer:** Only `db_engineer` writes or modifies files in `supabase/migrations`.
3. **Contract-First Development:** The Orchestrator produces the exact SQL table definitions, RPC signatures, and TypeScript interfaces before client or UI agents commence.
4. **Structured Summaries:** Agents report back in structured markdown summaries (maximum ~250 words) with file lists and test results. No raw command logs.

### 7.2 Custom Subagent Definitions

Create or verify these agent profiles under `.codex/agents/`:

1. `.codex/agents/code-mapper.toml` (Read-only forensic explorer)
2. `.codex/agents/db-engineer.toml` (Sole owner of `supabase/migrations/**` and SQL functions)
3. `.codex/agents/client-engineer.toml` (Owner of `packages/supabase-client/**` and generated types)
4. `.codex/agents/cashier-ui.toml` (Owner of `apps/admin-web/app/billing/**` and POS terminal)
5. `.codex/agents/hmo-ui.toml` (Owner of `apps/admin-web/app/hmo/**` and Claims Workbench)
6. `.codex/agents/provider-ui.toml` (Owner of `apps/provider-web/**` fee CMS & order sheets)
7. `.codex/agents/patient-ui.toml` (Owner of `apps/patient-web/**` booking payment flow)
8. `.codex/agents/test-engineer.toml` (Owner of `supabase/tests/**` pgTAP and `e2e/**` Playwright suites)
9. `.codex/agents/reviewer.toml` (Read-only security, RLS, financial integrity, and PhilHealth compliance gate)

### 7.3 File Ownership Matrix

| Agent | Exclusive Write Directory | Forbidden Directories |
|---|---|---|
| `db_engineer` | `supabase/migrations/**`, `supabase/seed*` | All app and package code |
| `client_engineer` | `packages/supabase-client/**`, generated types | `supabase/migrations/**`, `apps/**` |
| `cashier_ui` | `apps/admin-web/app/billing/**`, cashier components | `packages/**`, other apps |
| `hmo_ui` | `apps/admin-web/app/hmo/**`, claims components | `packages/**`, other apps |
| `provider_ui` | `apps/provider-web/**` | `packages/**`, other apps |
| `patient_ui` | `apps/patient-web/**` | `packages/**`, other apps |
| `test_engineer` | `supabase/tests/**`, `e2e/**`, test fixtures | Application production code |
| `reviewer`, `code_mapper` | Read-only (No write access) | All files |
| **Orchestrator** | Contract specifications and master coordination | Bulk application implementation |

### 7.4 Per-Loop Execution Pipeline

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              PER-LOOP EXECUTION PIPELINE                               │
│                                                                                        │
│  [P1: Recon]     ──> 1-2 × code_mapper (Audit existing code & verify assumptions)      │
│  [P2: Contract]  ──> Orchestrator (Publish SQL signatures, DDL, Zod schemas)           │
│  [P3: Database]  ──> db_engineer (Write migrations & RPCs) ‖ test_engineer (pgTAP)     │
│  [P4: Client]    ──> client_engineer (Regenerate types, write Zod wrappers)            │
│  [P5: UI Build]  ──> UI Agents in parallel (cashier_ui, hmo_ui, patient_ui)            │
│  [P6: Verify]    ──> test_engineer (Playwright E2E & unit test execution)              │
│  [P7: Review]    ──> reviewer ×2 (Security/RLS review & Financial integrity gate)       │
│  [P8: Fix]       ──> Route blocking findings to owning agent                           │
│  [P9: Commit]    ──> Orchestrator commits verified loop diff sequentially               │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Implementation Work Plan (6 Vertical-Slice Loops)

### Loop 1: Core Self-Pay Checkout, Integer Centavo Subledger & Slot Confirmation
* **Goal:** Enable upfront booking payment, dynamic QRPh / cash collection, instant slot confirmation, BIR e-Invoice generation, and double-entry subledger recording.
* **Database & Contracts (db_engineer):**
  * Migration `20261005000100_centavo_financial_subledger.sql`:
    * Create `financial_ledger_entries` (immutable double-entry ledger).
    * Upgrade `invoices` and `payments` to `bigint amount_in_centavos`.
    * Create RPC `record_payment_and_confirm_slot(p_invoice_id, p_amount_centavos, p_method, p_ref)`.
* **Client Layer (client_engineer):**
  * Regenerate Supabase types; implement `useRecordPayment()` and `useInvoiceDetails()` with Zod validation.
* **UI Slices (patient_ui & cashier_ui):**
  * `patient_ui`: Add payment step to booking calendar in `apps/patient-web`.
  * `cashier_ui`: Build keyboard-first cashier desk at `/billing/cashier` with barcode/QR scanning and dynamic QRPh modal.
* **Testing & Gate (test_engineer & reviewer):**
  * pgTAP: Test partial payment rejection, full payment slot confirmation, and ledger immutability trigger.
  * Playwright: Patient books → Cashier collects cash → Slot confirms → Realtime calendar updates.

### Loop 2: Encounter Realtime Tagging & Stock Financial Decoupling
* **Goal:** Realtime capture of tagged consumables, mini-LIS diagnostic orders, and doctor fees into the billing invoice with immediate inventory decrement.
* **Database & Contracts (db_engineer):**
  * Migration `20261005000200_encounter_charge_capture.sql`:
    * Upgrade `inventory_usage_financial_ledger` to integer centavos.
    * Create RPC `tag_encounter_consumable()`: Atomic inventory decrement + financial ledger entry.
    * Create trigger `auto_inject_lab_service_charge()` on `diagnostic_requests`.
* **Client Layer (client_engineer):**
  * Typed wrappers for consumable tagging, laboratory order billing, and invoice draft compilation.
* **UI Slices (provider_ui & cashier_ui):**
  * `provider_ui`: Add price preview tags to medication and laboratory search sheets in consultation chart.
  * `cashier_ui`: Scanning encounter QR token loads all tagged items instantly.
* **Testing & Gate:**
  * Verify physical inventory decrements immediately, cancelled item restore vs. wastage logic, and zero missed lab charges.

### Loop 3: HMO Eligibility, Pre-Authorization (LOA) & Co-Pay Split Engine
* **Goal:** Manage patient HMO policies, capture electronic LOAs, enforce authorized ceilings, and resolve the Co-Pay Split vs. Pay-In-Full rule.
* **Database & Contracts (db_engineer):**
  * Migration `20261005000300_hmo_authorizations_and_copay.sql`:
    * Create `hmo_providers`, `hmo_plans`, `patient_coverages`, and `authorizations`.
    * Create RPC `apply_loa_authorization_split()`: Segregates invoice lines into HMO liability and patient co-pay.
    * Constraint: If `patient_responsibility_centavos > 0`, patient must pay 100% of co-pay before slot/encounter confirmation.
* **Client Layer (client_engineer):**
  * Zod schemas for LOA pre-authorization and multi-payor split invoices.
* **UI Slices (hmo_ui & patient_ui):**
  * `hmo_ui`: Build `/hmo/eligibility` (card scanner + eligibility check) and `/hmo/loa-manager`.
  * `patient_ui`: Display HMO coverage and remaining co-pay on booking checkout.
* **Testing & Gate:**
  * Test partial LOA approval (consultation approved, ultrasound denied), expired LOA rejection, and co-pay satisfaction.

### Loop 4: Doctor Professional Fees, Covering Attribution & BIR 2307 Payouts
* **Goal:** Private doctor fee schedules, fixed government rates, covering doctor split execution, BIR Form 2307 tax withholding, and payout batches.
* **Database & Contracts (db_engineer):**
  * Migration `20261005000400_doctor_fee_payout_subledger.sql`:
    * Upgrade `doctor_payouts` and `practitioner_payout_settings` to centavos.
    * Implement configurable covering-doctor attribution (Option 3 / Default Option 1).
    * RPC `generate_payout_batch(p_start_date, p_end_date)` with BIR 2307 withholding (10%/15%).
* **Client Layer (client_engineer):**
  * Typed payout batch generators, BIR 2307 export helpers, and PESONet CSV formatters.
* **UI Slices (provider_ui & cashier_ui/admin):**
  * `provider_ui`: Doctor Fees CMS tab with fee history and monthly payout statement view.
  * `admin_ui`: Finance Payout Manager at `/finance/payouts` with batch approval and 2307 download.
* **Testing & Gate:**
  * Test covering doctor fee routing, tax withholding mathematical accuracy, and payout batch immutability.

### Loop 5: PhilHealth Outpatient Benefit Packaging (CF1/CF2/CF4), Claims & Appeals
* **Goal:** Assemble eClaims-ready dossiers, compute First/Second Case Rates, handle No Balance Billing (NBB), track batch submissions, and manage denial appeals.
* **Database & Contracts (db_engineer):**
  * Migration `20261005000500_philhealth_claims_and_adjudication.sql`:
    * Create `claims`, `claim_line_items`, `claim_responses`, and `claim_appeals`.
    * Create RPC `package_philhealth_cf4_dossier()`: Aggregates vital signs, SOAP observations, ICD-10/RVS codes, and hospital/PF case rate splits.
* **Client Layer (client_engineer):**
  * JSON/XML packaging engine matching PhilHealth eClaims / Konsulta schema specifications.
* **UI Slices (hmo_ui):**
  * Build Claims Workbench at `/hmo/claims` (Batch Builder, Clean Claim Linter) and Denial Workbench at `/hmo/appeals`.
* **Testing & Gate:**
  * Verify clean-claim pre-submission validator blocks claims with missing CF4 clinical data; verify remittance reconciliation and denial workflows.

### Loop 6: Shift Reconciliation, Cash Drawer Blind Balancing & Month-End Close
* **Goal:** Cashier shift management with blind cash counts, variance logs, A/R aging reports, and immutable month-end subledger close.
* **Database & Contracts (db_engineer):**
  * Migration `20261005000600_cashier_shifts_and_ar_aging.sql`:
    * Create `cashier_shifts` and `cashier_variances`.
    * Create RPC `close_cashier_shift()`: Blind cash count reconciliation ($\Delta = \text{Actual} - \text{Expected}$).
    * Create materialized view `mv_revops_monthly_executive_summary` and month-end freeze RPC.
* **Client Layer (client_engineer):**
  * Typed shift open/close hooks, variance alerts, and A/R aging trial balance queries.
* **UI Slices (cashier_ui & admin_ui):**
  * `cashier_ui`: Shift drawer open/close modal with denomination counter.
  * `admin_ui`: Finance A/R Aging Explorer at `/finance/aging` with 30/60/90/120+ day buckets.
* **Testing & Gate:**
  * End-to-end cashier shift balancing, overage/shortage audit logging, and month-end ledger freeze verification.

---

## 9. Database Schema & RPC Contract Specifications

### 9.1 Core Table Blueprint (`20261005000100_centavo_financial_subledger.sql`)

```sql
-- Double-entry financial subledger table
create table public.financial_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  transaction_group_id uuid not null,
  entry_timestamp timestamptz not null default clock_timestamp(),
  account_type text not null check (account_type in (
    'asset_cash', 'asset_bank_undeposited', 'asset_ar_patient', 'asset_ar_hmo', 'asset_ar_philhealth',
    'liability_doctor_payout', 'liability_withholding_tax', 'liability_patient_deposit',
    'revenue_clinical_service', 'revenue_pharmacy_retail', 'revenue_laboratory', 'revenue_facility_fee',
    'contra_statutory_discount', 'contra_contractual_allow', 'expense_bad_debt_writeoff'
  )),
  direction text not null check (direction in ('debit', 'credit')),
  amount_centavos bigint not null check (amount_centavos > 0),
  currency char(3) not null default 'PHP' check (currency = 'PHP'),
  reference_entity_type text not null,
  reference_entity_id uuid not null,
  actor_user_id uuid references auth.users(id),
  description text not null,
  is_reversal boolean not null default false,
  reversal_of_entry_id uuid references public.financial_ledger_entries(id),
  created_at timestamptz not null default now()
);

-- Immutability enforcement trigger
create or replace function public.trg_enforce_ledger_immutability()
returns trigger language plpgsql as $$
begin
  raise exception 'Financial ledger entries are strictly immutable. Post compensating reversals for corrections.'
    using errcode = '28000';
end;
$$;

create trigger trg_financial_ledger_no_mod
  before update or delete on public.financial_ledger_entries
  for each row execute function public.trg_enforce_ledger_immutability();
```

### 9.2 Critical RPC Signature: Payment & Slot Confirmation

```sql
create or replace function public.record_payment_and_confirm_slot(
  p_invoice_id uuid,
  p_amount_centavos bigint,
  p_method text,
  p_reference_number text default null,
  p_cashier_shift_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.invoices%rowtype;
  v_appointment public.appointments%rowtype;
  v_payment_id uuid;
  v_group_id uuid := gen_random_uuid();
begin
  -- 1. Lock invoice row to prevent race conditions
  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found.' using errcode = 'P0002'; end if;
  
  -- 2. Verify payment amount
  if p_amount_centavos <= 0 then raise exception 'Payment amount must be greater than zero.' using errcode = '22023'; end if;
  if p_amount_centavos > v_invoice.patient_balance_due_centavos then
    raise exception 'Payment exceeds remaining balance due.' using errcode = '22023';
  end if;

  -- 3. Insert payment record
  insert into public.payments (
    organization_id, invoice_id, amount_centavos, currency, method, status, reference_number, confirmed_at, recorded_by
  ) values (
    v_invoice.organization_id, v_invoice.id, p_amount_centavos, 'PHP', p_method::public.payment_method, 'confirmed', p_reference_number, now(), auth.uid()
  ) returning id into v_payment_id;

  -- 4. Post double-entry ledger entries
  -- Debit: Cash/Bank Asset
  insert into public.financial_ledger_entries (
    organization_id, transaction_group_id, account_type, direction, amount_centavos, reference_entity_type, reference_entity_id, actor_user_id, description
  ) values (
    v_invoice.organization_id, v_group_id, case when p_method = 'cash' then 'asset_cash' else 'asset_bank_undeposited' end, 'debit', p_amount_centavos, 'payment', v_payment_id, auth.uid(), 'Payment collection against ' || v_invoice.invoice_number
  );
  -- Credit: Patient Accounts Receivable
  insert into public.financial_ledger_entries (
    organization_id, transaction_group_id, account_type, direction, amount_centavos, reference_entity_type, reference_entity_id, actor_user_id, description
  ) values (
    v_invoice.organization_id, v_group_id, 'asset_ar_patient', 'credit', p_amount_centavos, 'payment', v_payment_id, auth.uid(), 'Settlement of patient liability for ' || v_invoice.invoice_number
  );

  -- 5. Update invoice balances
  update public.invoices set
    patient_paid_centavos = patient_paid_centavos + p_amount_centavos,
    patient_balance_due_centavos = patient_balance_due_centavos - p_amount_centavos,
    state = case when (patient_balance_due_centavos - p_amount_centavos) = 0 then 'paid'::public.invoice_lifecycle_state else state end,
    settled_at = case when (patient_balance_due_centavos - p_amount_centavos) = 0 then now() else null end,
    updated_at = now()
  where id = v_invoice.id;

  -- 6. Pay-in-full slot confirmation guard
  if (v_invoice.patient_balance_due_centavos - p_amount_centavos) = 0 then
    select a.* into v_appointment from public.appointments a
    join public.billing_events be on be.appointment_id = a.id
    where be.id = v_invoice.billing_event_id;

    if v_appointment.id is not null and v_appointment.status = 'pending_payment' then
      update public.appointments set
        status = 'confirmed',
        slot_confirmed_at = now(),
        updated_at = now()
      where id = v_appointment.id;
    end if;
  end if;

  return jsonb_build_object(
    'payment_id', v_payment_id,
    'invoice_state', case when (v_invoice.patient_balance_due_centavos - p_amount_centavos) = 0 then 'paid' else 'issued' end,
    'slot_confirmed', (v_invoice.patient_balance_due_centavos - p_amount_centavos) = 0
  );
end;
$$;
```

---

## 10. Quality Assurance & Review Gates

### 10.1 Test Coverage Requirements
* **Unit Tests (Vitest):**
  * Integer centavo arithmetic algorithms.
  * Senior Citizen (RA 9994) / PWD (RA 10754) VAT-exemption ($/ 1.12$) and 20% discount formulas.
  * BIR Form 2307 withholding tax schedules (10% vs. 15%).
* **Database Tests (pgTAP):**
  * RLS verification: Ensure Clinic A staff cannot access Clinic B's invoices, ledger entries, or HMO claims.
  * Test immutability triggers: Verify direct updates to `financial_ledger_entries` abort with error `28000`.
  * Atomic slot confirmation: Verify partial payments leave the slot in `pending_payment` while full payments transition status to `confirmed`.
* **Playwright E2E Tests:**
  * Cashier flow: Scan encounter QR → Select Cash tender → Enter exact amount → Confirm → Print e-OR receipt.
  * HMO LOA flow: Patient presents HMO card → Desk records LOA → Invoice splits liability → Patient pays co-pay → Appointment confirmed.

### 10.2 Reviewer Gate Checklist (Must achieve PASS before loop sign-off)
1. **Financial Integrity:** Does every credit have an offsetting debit in `financial_ledger_entries`?
2. **Precision:** Are all monetary values stored as `bigint` centavos without float usage?
3. **Multi-Tenancy:** Is `organization_id` present on every new table with strict RLS enforcement?
4. **Segregation of Duties:** Are cashier payment voids and bad-debt write-offs guarded by dual-custody supervisory approval?
5. **PhilHealth Compliance:** Does the claims packaging engine validate mandatory CF4 clinical indicators before marking claims `clean_validated`?

---

## 11. Kickoff Instruction for Codex Multi-Agent Orchestrator

To start execution of this initiative, copy and execute this instruction:

```text
Read revenue-operations-hmo-philhealth-master-prompt.md. You are the ORCHESTRATOR.
Begin Loop 1: Core Self-Pay Checkout, Integer Centavo Subledger & Slot Confirmation.
Phase 1: Spawn code_mapper to audit existing payments and invoices code in supabase/migrations/20260903000700_financial_loop.sql and 20260927180000_billing_management_lifecycle.sql.
Phase 2: Publish Loop 1 contract.
Phase 3: Direct db_engineer to apply migration 20261005000100_centavo_financial_subledger.sql while test_engineer writes pgTAP tests.
Do not commit directly; return structured summaries and await user confirmation after Loop 1 review gate passes.
```
