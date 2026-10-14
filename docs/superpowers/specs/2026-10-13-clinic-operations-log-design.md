# Clinic Operations Log & Administrative Movement Audit Design

## Intent & The Why

Clinic and hospital administrators require a single, authoritative, and real-time operational movement log to monitor clinic operations, track valuable transactions, investigate staff movements, and maintain regulatory compliance. While a platform-level audit log exists for platform superadmins and a patient-specific trail exists for individual charts, clinic administrators currently lack a clinic-wide operational audit viewer.

This feature introduces the **Operations Log** into the **Analytics & Governance** section of `@odyssey/admin-web`, strictly restricted to clinic administrators with the `can_view_audit_log` permission.

## Goals

1. **Comprehensive Event Coverage:** Capture movements across all clinic operational domains:
   - **Financial & POS:** Invoices, payments, voids, refunds, cashier collections, pharmacy POS transactions, and HMO claims.
   - **Queue & Appointments:** Booking creation, rescheduling, cancellations, and status transitions (*Checked-in*, *Called to Triage*, *In-Consultation*, *Fulfilled*, *No-show*).
   - **Pharmacy & Dispensing:** Prescriptions authored, pharmacy queue updates, dispensing completions, and FEFO stock deductions.
   - **Clinical Care (EHR):** Consultation start/finish, vital signs recorded, SOAP notes authored/edited, and PMR document releases.
   - **Diagnostics & Mini-LIS:** Lab orders requested, specimen collection events, and diagnostic results uploaded/verified.
   - **Inventory & Supplies:** Batch arrivals, manual counts, expiry write-offs, and department stock requisitions.
   - **Clinic Governance:** Staff invitations, role assignments, doctor room/schedule updates, and fee changes.
2. **Standard Filters for Administrators:**
   - **Date Range:** Presets (*Today*, *Last 7 Days*, *Last 30 Days*) and custom date bounds.
   - **Domain / Operational Module:** Filter by *All*, *Billing & Cashier*, *Queue & Appointments*, *Pharmacy & POS*, *Clinical Care*, *Diagnostics*, *Inventory*, *Staff & Governance*.
   - **Action Type:** Filter by *Created*, *Updated / Status Transition*, *Deleted / Cancelled*, *Dispensed / Paid*.
   - **Staff / Operator:** Dropdown to filter by specific staff user or system process.
   - **Quick Search:** Free-text filter matching patient names, transaction numbers, receipt IDs, or record IDs.
3. **Detail Inspection & Export:**
   - Expandable slide-over drawer to view payload diffs, previous vs new status, and audit metadata.
   - Filter-aware CSV export for official audit and compliance reporting.
4. **Tenant Isolation & Security:**
   - Strict organization scoping enforced via Postgres RLS and `SECURITY DEFINER` RPC checks requiring `can_view_audit_log` or `has_organization_role(organization_id, array['admin', 'owner'])`.
   - Never expose audit records across different clinic tenants.

## Non-Goals & Anti-Goals

- **Anti-Goal: Re-auditing Immutable Subledgers.** Tables that are already strictly append-only financial ledgers (e.g. `financial_ledger_entries`) must not be mutated or double-wrapped. Compensating debit/credit patterns remain strictly enforced.
- **Non-Goal: Modifying Existing Clinical Workflows.** The logging must be non-intrusive via database triggers and background logging; it must not alter clinical or checkout execution semantics.
- **Anti-Goal: Client-Side Table Scan.** The client must never pull an unbounded database log; filtering, sorting, and pagination are performed server-side via an indexed RPC.

## Confirmed Product Decisions

1. **Navigation & Section:**
   - Located under **ANALYTICS & GOVERNANCE** in `apps/admin-web/components/admin-shell.tsx`.
   - Labeled: **"Operations Log"** with icon `FileClock` or `ClipboardList`.
   - Route: `/analytics/operations-log` (or `/governance/operations-log`).
   - Access: Requires `anyOf: ["can_view_audit_log"]` or admin/owner role. Not visible to general staff or public.
2. **Auditing Completeness:**
   - Attach `write_audit_log()` triggers to newly added tables that lacked triggers (`pharmacy_prescription_orders`, `inventory_requisitions`, and related lifecycle records).
   - Ensure `public.audit_log` RLS policy explicitly permits users possessing `can_view_audit_log` permission for their organization.

## Server & Database Contract

### 1. Database Triggers Migration & Performance Index
- Add `create index if not exists audit_log_organization_occurred_idx on public.audit_log (organization_id, occurred_at desc);` for rapid sorted queries.
- Add `write_audit_log()` triggers for tables missing automated audit capture:
  - `pharmacy_prescription_orders`
  - `inventory_requisitions`
  - Ensure `public.audit_log` RLS policy explicitly permits users with `can_view_audit_log` permission for their organization.

### 2. High-Performance Query RPC: `list_clinic_operations_logs`
Create a `SECURITY DEFINER` function:
```sql
public.list_clinic_operations_logs(
  p_organization_id uuid,
  p_module text default null,          -- 'billing', 'appointments', 'pharmacy', 'clinical', 'diagnostics', 'inventory', 'governance'
  p_action text default null,          -- 'insert', 'update', 'delete', etc.
  p_actor_id uuid default null,
  p_start_time timestamptz default null,
  p_end_time timestamptz default null,
  p_search text default null,
  p_limit integer default 200,
  p_offset integer default 0
)
```
- Returns columns:
  - `id` (bigint)
  - `occurred_at` (timestamptz)
  - `actor_id` (uuid)
  - `actor_name` (text, resolved from `practitioners` or `auth.users`)
  - `actor_type` (text)
  - `module` (text, classified from `table_name`)
  - `action` (text)
  - `table_name` (text)
  - `record_id` (uuid)
  - `description` (text, human-readable summary derived from action & table)
  - `metadata` (jsonb)
- Security: Enforces `public.has_organization_permission(p_organization_id, 'can_view_audit_log') or public.has_organization_role(p_organization_id, array['admin', 'owner'])`.

## Client & Admin Web UX

1. **Route & Layout:**
   - Create route `/analytics/operations-log` in `apps/admin-web/app/analytics/operations-log/page.tsx`.
   - Register route rule in `apps/admin-web/lib/admin-access.ts` requiring `can_view_audit_log`.
   - Add nav item in `apps/admin-web/components/admin-shell.tsx` under `ANALYTICS & GOVERNANCE`.
2. **Standard Filter Toolbar Component:**
   - Quick date range buttons (*Today*, *7 Days*, *30 Days*) + custom date inputs.
   - Module filter dropdown (*All*, *Billing & POS*, *Appointments & Queue*, *Pharmacy*, *Clinical Care*, *Diagnostics*, *Inventory*, *Governance*).
   - Action filter dropdown (*All Actions*, *Created*, *Updated*, *Deleted / Cancelled*).
   - Staff member dropdown populated from clinic practitioners/staff.
   - Search input for real-time query.
3. **Summary Metric Strip:**
   - Total operations logged in selected window.
   - Financial/POS transactions count.
   - Clinical and appointment transitions count.
   - Active staff members operating during period.
4. **Log Data Table:**
   - Timestamp (formatted in PST, UTC+8).
   - Module badge with distinct aesthetic color tokens.
   - Action badge (*Created*, *Updated*, *Deleted*).
   - Movement summary / description.
   - Target record ID / reference.
   - Operator / staff member name.
5. **Detail Drawer:**
   - Clicking a row opens a slide-over panel displaying the full audit entry metadata, JSON diff / snapshot, actor UUID, and direct link to related module if applicable.

## Verification & Acceptance Criteria

1. **Security & Permissions:**
   - Non-admin staff without `can_view_audit_log` cannot see the sidebar link or access the route (redirected or forbidden).
   - Multi-tenant data segregation is strictly preserved: no cross-clinic audit rows are accessible.
2. **Logging Triggers:**
   - Creating/updating an appointment, prescription order, POS sale, invoice payment, or inventory requisition writes a row to `audit_log`.
3. **Filtering & Searching:**
   - Date range filters correctly constrain the returned logs.
   - Filtering by module (e.g., *Billing & Cashier*) restricts rows to financial tables.
   - Staff filter restricts rows to the selected actor.
   - Search query matches record descriptions or IDs.
4. **Export:**
   - Exporting CSV downloads only rows matching the active filters.
