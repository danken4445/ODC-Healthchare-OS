# Supply Room Root Warehouse and Pharmacy Inventory Workflow Design

**Status:** Proposed for review  
**Date:** 2026-10-06  
**Scope:** Root Supply Department, Departmental Isolation (Pharmacy), Mon–Wed Requisitions, GSO CSV Intake, and Pharmacy POS  

---

## 1. Executive Summary & Operational Workflow

Odyssey Healthcare OS serves multi-department clinical and hospital operations. The inventory system establishes the **Supply Department (Supply Room / General Services Office - GSO)** as the authoritative **Root Warehouse** of the facility, and departments (e.g., **Pharmacy**, Laboratory, Emergency Room) as isolated satellite stockrooms.

### Workflow Lifecycle

```
[ External Suppliers / GSO Procurement Deliveries ]
                      │
                      ▼
┌────────────────────────────────────────────────────────┐
│             SUPPLY DEPARTMENT (ROOT ROOM)              │
│  • Central Receiving Hub (Manual & GSO CSV Import)     │
│  • Optional Expiry Tracking on GSO Intake              │
│  • Hospital-wide Oversight (Breakdown across all depts)│
└───────────────────────────┬────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              │ Requisition Cutoff Window │
              │ Monday – Wednesday Only   │
              │ Guaranteed Delivery Next Wk│
              └─────────────┬─────────────┘
                            │
       ┌────────────────────┴────────────────────┐
       ▼                                         ▼
[ Item In-Stock at Supply Room ]    [ Item Out-of-Stock at Supply Room ]
       │                                         │
       ▼                                         ▼
 Immediate Dispersal                      Backordered Requisition
(FEFO transfer to Dept)             (Queued; Dispersed upon GSO receipt)
       │                                         │
       └────────────────────┬────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                  PHARMACY DEPARTMENT                   │
│  • Isolated Department Stock (Zero cross-dept leakage) │
│  • Mon–Wed Supply Requisitions Submission & Tracking   │
│  • FEFO Batch Expiry Monitoring                        │
│  • Integrated Pharmacy POS (Real-time stock deduction) │
└────────────────────────────────────────────────────────┘
```

---

## 2. Core Principles & Boundaries

1. **Supply Department as the Root Hub:**
   * All external shipments, donor donations, and LGU/GSO delivery receipts must be received into the **Root Supply Room**.
   * End-user departments never receive external stock directly from outside suppliers; they receive stock strictly via internal **dispersal/transfer** from the Supply Room.
   * Central Supply staff and Clinic Administrators have visibility over root stock balances *plus* a live breakdown of balances in all satellite departments.

2. **Strict Departmental Isolation:**
   * Staff assigned to a specific department (e.g., Pharmacy) can only view, monitor, and dispense items from their own department's stockroom (`department_id`).
   * No department can view or modify inventory belonging to other departments or Central Supply without explicit cross-department administrative privileges.

3. **Requisition Cutoff Window (Monday–Wednesday):**
   * Routine department requisitions may only be created and submitted between **Monday 00:00:00 and Wednesday 23:59:59 (Asia/Manila time)**.
   * Requisitions submitted within this window are scheduled and guaranteed for fulfillment/dispersal during the following week.
   * Routine requisitions attempted between Thursday and Sunday are blocked at the database and UI levels with a scheduling notification banner.
   * An optional administrative emergency bypass (`is_emergency = true` with reason) is permitted only for users with elevated emergency logistics permissions.

4. **Two-Path Dispersal Mechanism:**
   * **Path A (In-Stock):** If the Supply Room has sufficient on-hand stock, the Supply Officer approves and executes immediate dispersal, triggering an atomic FEFO transfer to the requesting department.
   * **Path B (Out-of-Stock / Backorder):** If the requested quantity exceeds Supply Room on-hand stock, the request line is marked as `backordered_awaiting_delivery`. When Central Supply subsequently receives a matching shipment (via GSO intake), the system flags pending backorders for immediate priority dispersal.

5. **GSO CSV Intake with Optional Expiry:**
   * Central Supply officers can bulk-receive inventory using standard General Services Office (GSO) CSV files.
   * Expiry date is **strictly optional** (permissible as blank or null) to accommodate non-perishables, general supplies, office items, or supplies without manufacturer expiration stamps.
   * All financial costs are stored strictly in `bigint` centavos (`unit_cost_in_centavos`) without floating-point arithmetic.

6. **Pharmacy POS Live Decrement:**
   * Pharmacy staff process transactions through the Pharmacy POS terminal.
   * POS sales decrement stock directly from the designated Pharmacy department using FEFO allocation rules.

---

## 3. Data Model & Schema Contracts

### 3.1 Department Root Identification
Add `is_root_supply` flag to `public.departments`:
```sql
alter table public.departments
  add column if not exists is_root_supply boolean not null default false;

-- Exactly one department per organization can be designated as root supply
create unique index if not exists uq_org_root_supply_dept
  on public.departments (organization_id)
  where (is_root_supply is true and active is true);
```

### 3.2 Inventory Requisitions Ledger
Track stock requisition orders across departments:

```sql
create table if not exists public.inventory_requisitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  requisition_number text not null,
  requesting_department_id uuid not null,
  supply_department_id uuid not null,
  status text not null default 'submitted' check (
    status in ('submitted', 'approved', 'partially_dispersed', 'fulfilled', 'cancelled')
  ),
  is_emergency boolean not null default false,
  emergency_justification text,
  target_delivery_week date not null, -- Monday of the guaranteed fulfillment week
  notes text,
  submitted_by uuid not null references auth.users(id),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (requesting_department_id, organization_id)
    references public.departments(id, organization_id),
  foreign key (supply_department_id, organization_id)
    references public.departments(id, organization_id),
  unique (organization_id, requisition_number)
);

create table if not exists public.inventory_requisition_items (
  id uuid primary key default gen_random_uuid(),
  requisition_id uuid not null references public.inventory_requisitions(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  item_id uuid not null references public.inventory_items(id),
  requested_quantity numeric(12, 3) not null check (requested_quantity > 0),
  dispersed_quantity numeric(12, 3) not null default 0 check (dispersed_quantity >= 0),
  status text not null default 'pending' check (
    status in ('pending', 'awaiting_supply_intake', 'ready_for_dispersal', 'dispersed', 'cancelled')
  ),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (dispersed_quantity <= requested_quantity)
);
```

### 3.3 Requisition Cutoff Window Rule (Mon–Wed)
Enforced in database function `public.validate_requisition_submission_window(p_organization_id uuid, p_is_emergency boolean)`:
* Timezone: `Asia/Manila` (PHT, UTC+8).
* Allowed ISO Day of Week: `1` (Monday), `2` (Tuesday), `3` (Wednesday).
* Calculation of `target_delivery_week`: The Monday of the upcoming week (`date_trunc('week', now() at time zone 'Asia/Manila') + interval '7 days'`).
* If submitted on Thursday (4), Friday (5), Saturday (6), or Sunday (7), raise error `REQUISITION_WINDOW_CLOSED` unless `p_is_emergency` is true with explicit authorization.

---

## 4. GSO CSV Import Specification

General Services Office (GSO) deliveries arrive in structured spreadsheets from municipal/provincial LGU logistics. The intake pipeline supports importing this exact GSO CSV format into the **Root Supply Room**.

### 4.1 Real-World GSO CSV Structure

The uploaded GSO file reflects a multi-section spreadsheet layout:

1. **Category Banners & Sections:**
   The file is segmented into distinct operational categories indicated by header rows:
   * `OFFICE SUPPLIES`
   * `GSO MEDICAL SUPPLIES`
   * `LAUNDRY & JANITORIAL SUPPLIES`
   * `MEDICAL EQUIPMENTS`
   * `ICT, OFFICE SUPPLIES`
   * Special Programs / Funding Sources: `PCSO`, `DOH`, `DOH MEDICAL SUPPLIES/EQUIPMENT`

2. **Column Layout:**
   * **Leading Column (Column 0):** Often empty due to spreadsheet margin formatting.
   * **Column 1 (`DESCRIPTION`):** Item name, drug name, or supply description (e.g., `ACTIVATED CHARCOAL`, `AMBU BAG ADULT`, `BOND PAPER A4`, `IV CANNULA G16`).
   * **Column 2 (`EXPIRY` / `EXPIRY DATE`):** **Strictly Optional**. Either empty or populated in various formats.
   * **Column 3 (`UNIT`):** Unit of measure (e.g., `PCS`, `ROLLS`, `REAMS`, `BOXES`, `PACKS`, `GAL`, `BOTS`, `SACHET`, `TUBE`, `UNITS`).
   * **Column 4 (`QTY`):** Quantity received. (If blank in the master file, defaults to editable input in the intake wizard preview).

3. **Artifact Cleaning:**
   * Blank rows (`,,,,,,,,,,,,,,`) and page markers (`,,,Page 3,,,,3,,,,,,,`) are automatically detected and stripped during parsing.
   * Trailing annotations (e.g., `to be checked`, `OR`) are filtered or preserved as item intake notes.

### 4.2 Expiry Date Formats & Normalization (Optional Expiry)

In accordance with GSO documentation, `expiry_date` is **optional**. When present, the parser normalizes the following formats to standard ISO `YYYY-MM-DD`:

| GSO CSV Raw Value | Detected Format | Normalized DB Value (`date`) | Batch Strategy |
|---|---|---|---|
| *(empty / blank)* | None | `NULL` | Non-perishable / Standard consumable aggregate stock |
| `7/2027` | Month / Year | `2027-07-31` (end of month) | Dated batch tracked in FEFO |
| `11/19/26` | MM/DD/YY | `2026-11-19` | Dated batch tracked in FEFO |
| `9/14/2029` | MM/DD/YYYY | `2029-09-14` | Dated batch tracked in FEFO |
| `SEPT. 2027` / `MARCH 2027` | Month name + Year | `2027-09-30` / `2027-03-31` | Dated batch tracked in FEFO |
| `AUG. 5, 2027` | Month Day, Year | `2027-08-05` | Dated batch tracked in FEFO |
| `2028` | Year only | `2028-12-31` (end of year) | Dated batch tracked in FEFO |

### 4.3 Handling Optional Expiry in the Database

* **When Expiry is Present:** An `inventory_batches` record is created under the Central Supply stock row with the normalized `expiry_date`.
* **When Expiry is Omitted (Blank):**
  * If the catalog item is non-perishable (e.g., Bond paper, scissors, wheelchair), stock is incremented directly on `department_stock` without mandatory batch creation.
  * If the catalog item is classified as perishable/clinical (e.g., antiseptics, tubes) but delivered without a printed expiry stamp, an `inventory_batches` record is generated with `legacy_unassigned_expiry = true` (`expiry unknown`), allowing intake to proceed smoothly while ensuring dated stock is prioritized ahead of it during FEFO allocation.

---

## 5. Security & Isolation Matrix

| Role / Assigned Dept | View Root Supply? | View Own Dept? | View Other Depts? | Submit Requisition? | Receive Inbound GSO? | Disperse Stock? | Use Pharmacy POS? |
|---|---|---|---|---|---|---|---|
| **Root Supply Staff** | Yes | Yes (Supply) | Yes (Full breakdown) | No | Yes (Root only) | Yes | No |
| **Pharmacy Staff** | No (Except catalog items) | Yes (Pharmacy only) | No | Yes (Mon–Wed) | No | No | Yes |
| **Ward / ER Staff** | No (Except catalog items) | Yes (Ward only) | No | Yes (Mon–Wed) | No | No | No |
| **Clinic Superadmin** | Yes | Yes | Yes | Yes (Bypass) | Yes | Yes | Yes |

---

## 6. Verification and Acceptance Criteria

1. **Requisition Window Constraint:**
   * Requisition created on Tuesday succeeds with `target_delivery_week` set to next Monday.
   * Requisition created on Thursday fails with `REQUISITION_WINDOW_CLOSED` unless emergency flag is set.
2. **Department Isolation:**
   * Authenticated Pharmacy user querying inventory only receives records matching their assigned department ID.
   * Authenticated Central Supply user sees root warehouse + aggregated breakdown across departments.
3. **Two-Path Dispersal:**
   * When Supply has stock $\ge$ requested quantity: Dispersal executes immediately via FEFO and decrements Supply stock, incrementing Pharmacy stock.
   * When Supply has 0 stock: Requisition item transitions to `awaiting_supply_intake`. Inbound receipt of that item triggers notification/ready state for dispersal.
4. **GSO CSV Intake:**
   * Uploading a CSV with mixed rows (some with expiry date, some with empty expiry) processes successfully without error.
   * Quantities increment Root Supply Room only.
5. **Pharmacy POS:**
   * Sale in Pharmacy POS reduces Pharmacy department stock in real time without touching Supply Room stock.
