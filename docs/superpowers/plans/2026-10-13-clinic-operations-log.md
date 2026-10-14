# Clinic Operations Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a clinic-wide Operations Log with standard filters in `@odyssey/admin-web` under Analytics & Governance for clinic administrators to monitor all user movements, clinical actions, and financial transactions.

**Architecture:** Database triggers capture all clinic movements into `public.audit_log` indexed by `(organization_id, occurred_at desc)`. A secure `SECURITY DEFINER` RPC `list_clinic_operations_logs` filters and categorizes audit entries server-side. `@odyssey/supabase-client` provides typed access. `@odyssey/admin-web` renders an administrative log interface with date, module, action, and staff filters, a summary strip, and an inspection drawer.

**Tech Stack:** PostgreSQL (Supabase), TypeScript, Next.js 15 (App Router), TanStack Table / Custom DataTable, Tailwind CSS / Vanilla CSS design tokens.

**Spec:** [docs/superpowers/specs/2026-10-13-clinic-operations-log-design.md](file:///g:/Projects/ODC-Healthchare-OS/docs/superpowers/specs/2026-10-13-clinic-operations-log-design.md)

## Global Constraints

- All monetary amounts stored as `bigint` integer centavos (`amount_in_centavos`).
- Financial subledgers (`financial_ledger_entries`) are strictly immutable and append-only.
- Timestamps displayed to users must use Philippine Standard Time (PST, UTC+8).
- Multi-tenant boundary must be strictly enforced via `organization_id` checking.
- Route and RPC access restricted to administrators with `can_view_audit_log` or `admin`/`owner` role.

## Review Focus

1. Cross-tenant leakage: Querying logs for Organization A must never return Organization B's records, even if actor belongs to both.
2. Unhandled table names: Unexpected or future tables added to `audit_log` must gracefully fall back to an "Other / Operations" module rather than erroring or disappearing.
3. Missing actor profiles: Deleted users or system actions must display "System" or "Unknown Operator" without crashing `actor_name` resolution.
4. Large payload performance: Entries with large JSON payloads in `metadata` must not degrade list view rendering; raw JSON is only rendered in the detail drawer.
5. Filter boundary edge cases: Custom date range filter must include the entire selected end date (up to 23:59:59.999).

---

### Task 1: Database Migration for Triggers, Performance Index & RLS

**Files:**
- Create: `supabase/migrations/20261013221500_clinic_operations_log_triggers_and_index.sql`
- Test: `packages/supabase-client/__tests__/operations-log-triggers.test.ts` (or migration verification)

**Interfaces:**
- Produces: `audit_log_organization_occurred_idx`, `pharmacy_prescription_orders_audit` trigger, `inventory_requisitions_audit` trigger, updated `audit_log_select` RLS policy.

- [ ] **Step 1: Write migration SQL with triggers and performance index**
Add index `audit_log_organization_occurred_idx` on `public.audit_log (organization_id, occurred_at desc)`.
Add triggers on `pharmacy_prescription_orders` and `inventory_requisitions` for `after insert or update or delete` executing `public.write_audit_log()`.
Update `audit_log_select` policy so users with `can_view_audit_log` permission can select.

- [ ] **Step 2: Verify migration syntax and idempotency**
Check that `if not exists` and `drop trigger if exists` guards prevent conflicts.

- [ ] **Step 3: Commit migration**
```bash
git add supabase/migrations/20261013221500_clinic_operations_log_triggers_and_index.sql
git commit -m "feat(db): add operations log performance index and missing triggers"
```

---

### Task 2: Database Migration for `list_clinic_operations_logs` RPC

**Files:**
- Create: `supabase/migrations/20261013222500_list_clinic_operations_logs_rpc.sql`
- Test: `packages/supabase-client/__tests__/operations-log-rpc.test.ts`

**Interfaces:**
- Consumes: `public.audit_log`, `public.practitioners`, `auth.users`, `public.has_organization_permission`
- Produces: `public.list_clinic_operations_logs(p_organization_id uuid, p_module text, p_action text, p_actor_id uuid, p_start_time timestamptz, p_end_time timestamptz, p_search text, p_limit integer, p_offset integer)`

- [ ] **Step 1: Write the RPC function SQL**
Define `public.list_clinic_operations_logs` returning a table of:
`(id bigint, occurred_at timestamptz, actor_id uuid, actor_name text, actor_type text, module text, action text, table_name text, record_id uuid, description text, metadata jsonb)`.
Classify module:
- `invoices`, `payments`, `payment_allocations`, `billing_events`, `billing_line_items`, `pos_sales`, `claims` -> `'billing'`
- `appointments`, `encounters`, `room_assignments` -> `'appointments'`
- `pharmacy_prescription_orders`, `medication_requests`, `inventory_pos_settings` -> `'pharmacy'`
- `observations`, `pmr_document_snapshots`, `pmr_share_links`, `conditions`, `procedures` -> `'clinical'`
- `diagnostic_reports`, `service_requests`, `laboratory_services` -> `'diagnostics'`
- `inventory_items`, `inventory_batches`, `inventory_movements`, `inventory_adjustments`, `inventory_requisitions`, `inventory_usage_batch_consumptions` -> `'inventory'`
- others -> `'governance'`

- [ ] **Step 2: Add grant and security execution permissions**
`revoke all on function public.list_clinic_operations_logs from public;`
`grant execute on function public.list_clinic_operations_logs to authenticated;`

- [ ] **Step 3: Commit migration**
```bash
git add supabase/migrations/20261013222500_list_clinic_operations_logs_rpc.sql
git commit -m "feat(db): add list_clinic_operations_logs RPC"
```

---

### Task 3: Client SDK Data Access in `@odyssey/supabase-client`

**Files:**
- Modify: `packages/supabase-client/src/index.ts`
- Test: `packages/supabase-client/src/__tests__/operations-log.test.ts`

**Interfaces:**
- Consumes: RPC `list_clinic_operations_logs`
- Produces:
  ```typescript
  export interface ClinicOperationsLogEntry {
    id: number;
    occurredAt: string;
    actorId: string | null;
    actorName: string;
    actorType: string;
    module: string;
    action: string;
    tableName: string;
    recordId: string | null;
    description: string;
    metadata: Record<string, unknown>;
  }
  export interface ClinicOperationsLogFilters {
    module?: string;
    action?: string;
    actorId?: string;
    startTime?: string;
    endTime?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }
  export function listClinicOperationsLogs(
    client: SupabaseClient<Database>,
    organizationId: string,
    filters?: ClinicOperationsLogFilters
  ): Promise<SupabaseResult<ClinicOperationsLogEntry[]>>;
  ```

- [ ] **Step 1: Write the failing unit test for `listClinicOperationsLogs`**
- [ ] **Step 2: Implement `listClinicOperationsLogs` and types in `packages/supabase-client/src/index.ts`**
- [ ] **Step 3: Run client test suite and verify it passes**
- [ ] **Step 4: Commit**
```bash
git add packages/supabase-client/src/index.ts packages/supabase-client/src/__tests__/operations-log.test.ts
git commit -m "feat(sdk): add listClinicOperationsLogs client helper"
```

---

### Task 4: Admin Web Navigation & Access Control Configuration

**Files:**
- Modify: `apps/admin-web/lib/admin-access.ts`
- Modify: `apps/admin-web/components/admin-shell.tsx`

**Interfaces:**
- Consumes: `can_view_audit_log` permission
- Produces: Route `/analytics/operations-log` protected by `can_view_audit_log`, sidebar nav item under `ANALYTICS & GOVERNANCE`.

- [ ] **Step 1: Add `/analytics/operations-log` route rule to `admin-access.ts`**
`{ href: "/analytics/operations-log", anyOf: ["can_view_audit_log"] }`

- [ ] **Step 2: Add `Operations Log` NavItem to `admin-shell.tsx`**
In `navSections` under `ANALYTICS & GOVERNANCE`:
`{ href: "/analytics/operations-log", label: "Operations Log", icon: ClipboardList, anyOf: ["can_view_audit_log"] }`

- [ ] **Step 3: Commit navigation changes**
```bash
git add apps/admin-web/lib/admin-access.ts apps/admin-web/components/admin-shell.tsx
git commit -m "feat(admin): add Operations Log navigation and route protection"
```

---

### Task 5: Operations Log UI, Filter Toolbar, Detail Drawer & CSV Export

**Files:**
- Create: `apps/admin-web/hooks/use-operations-logs.ts`
- Create: `apps/admin-web/app/analytics/operations-log/page.tsx`
- Create: `apps/admin-web/app/analytics/operations-log/components/log-filter-toolbar.tsx`
- Create: `apps/admin-web/app/analytics/operations-log/components/log-detail-drawer.tsx`
- Test: `apps/admin-web/__tests__/operations-log.test.tsx` (or build check)

**Interfaces:**
- Consumes: `useAdminData`, `listClinicOperationsLogs` from `@odyssey/supabase-client`
- Produces: Interactive Operations Log dashboard with filtering, summary strip, table view, detail drawer, and CSV export.

- [ ] **Step 1: Implement `use-operations-logs.ts` hook**
Handles:
- Active filters state (`dateRangePreset`, `startDate`, `endDate`, `module`, `action`, `actorId`, `search`)
- Fetching operations logs with debounced search
- Calculating summary metrics (total count, financial count, clinical count, active actors count)
- Loading and error states

- [ ] **Step 2: Implement Filter Toolbar (`log-filter-toolbar.tsx`)**
- Date presets: "Today", "Last 7 Days", "Last 30 Days", "Custom"
- Module select: All Modules, Billing & POS, Appointments & Queue, Pharmacy & Dispensing, Clinical Care, Diagnostics, Inventory, Governance
- Action select: All Actions, Created, Updated, Deleted / Voided
- Operator / Staff select: dynamically populated with known actors
- Search input with clear button

- [ ] **Step 3: Implement Detail Drawer (`log-detail-drawer.tsx`)**
Slide-over modal showing:
- Formatted timestamp (PST UTC+8)
- Actor ID & display name
- Target record ID and table name
- Action & Module
- Formatted JSON metadata / changes payload

- [ ] **Step 4: Implement main page (`apps/admin-web/app/analytics/operations-log/page.tsx`)**
Integrates Header, Summary Strip, Filter Toolbar, Log Table, Pagination, Detail Drawer, and CSV Export.

- [ ] **Step 5: Test UI rendering and build**
Run: `pnpm --filter @odyssey/admin-web build` or test suite to ensure clean compilation.

- [ ] **Step 6: Commit**
```bash
git add apps/admin-web/app/analytics/operations-log/ apps/admin-web/hooks/use-operations-logs.ts
git commit -m "feat(admin): implement Operations Log page with standard filters and drawer"
```

---

### Task 6: Final Verification & Integration Gate

- [ ] **Step 1: Run type checking across workspaces**
`pnpm turbo run check-types` or `pnpm --filter @odyssey/admin-web check-types`
- [ ] **Step 2: Run unit and integration tests**
`pnpm test`
- [ ] **Step 3: Verify dev server on `http://localhost:3000/analytics/operations-log`**
- [ ] **Step 4: Final review and documentation**
