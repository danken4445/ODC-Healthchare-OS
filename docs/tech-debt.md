# Technical debt

## Loop A provider E2E teardown on Windows

`e2e/run-loop-a-playwright.mjs` has a bounded Playwright timeout, force-kills its
owned dev-server tree, and verifies the temporary listener closes. The current
run passed its two assertions and completed teardown, but Windows process-tree
cleanup remains operationally fragile. Revisit this if CI or local runs begin
to exceed the bounded teardown window.

## Loop B-2 professional-fee payout allocation

Professional fees are snapshotted as their own immutable billing line and feed
the existing doctor-payout calculation. Coverage-specific allocation and
multi-practitioner payout splitting are intentionally not implemented in this
loop; they remain a follow-up when coverage adjudication and encounter
attribution are introduced.

## Loop D queue allocator finding F3

The reported `max()+1` queue race was disproved by the deterministic 50-way
baseline: the existing organization/date advisory lock produced 50 unique
numbers with zero duplicates. Loop D retains that lock and scopes it, along
with the max query, by organization, queue date, and queue mode scope.

The admin waiting-room/lobby route and legacy teleconsult summary still format
`queue_number` directly; they have no React-key collision because keys remain
appointment IDs. Updating those displays to group by doctor and room belongs
to Loop D-2 and is intentionally not redesigned here.

## D-UI public lobby grouping

The Loop D-2 database projection and Realtime subscription now carry the
assigned practitioner display name and room label. The public lobby display
still needs a dedicated UI pass to group “Now serving” by doctor and room;
that work is intentionally deferred and remains outside this loop.

## Loop E patient reassignment notifications

The current notification system is limited to diagnostic and referral
notifications; there is no patient appointment-notification mechanism to reuse.
Reassignment is therefore audited but does not send a patient notification.
Add a patient-safe appointment notification path before enabling reassignment
broadly.

## Loop F release notes and deferred contracts

### Security

- The legacy `public.sync_virtual_appointment_room()` and
  `public.close_teleconsult_room(uuid)` SECURITY DEFINER functions still carry
  the older `search_path = public, pg_catalog` / `search_path = public, auth`
  settings. Their current authorization predicates and tenant joins remain in
  force; normalize their search paths in the next teleconsult maintenance
  release without changing the room contract.

### Correctness

- `can_manage_professional_fees` remains a global doctor permission for
  backwards-compatible fee RPC behavior. The fee RPC rejects government and
  fixed-rate declarations, and the Fees screen suppresses fee mutations in
  those modes. Make the permission assignment itself organization/fee-model
  dynamic in a future RBAC release after updating the existing fee pgTAP
  fixtures.
- Coverage payout splitting remains TODO: assigned and performed practitioner
  roles are retained, but no split policy is applied until the product decision
  in Section 5 is confirmed.

### UX

- The Loop F doctor-management links reuse the existing service, room, and fee
  editors; inline editing and a dedicated private-mode Fees-tab visibility
  state remain future polish.
- The public lobby display remains intentionally deferred; this session did
  not build or alter it.

### Tooling

- The root typecheck still has the pre-existing TSConfig `allowImportingTsExtensions`
  mismatch when run without the repository flag. With the required flag, the
  Supabase client typecheck passes; admin typecheck still reports the
  pre-existing `apps/admin-web/hooks/use-vesper-dashboard-data.ts:710`
  `"active"` versus `"PENDING" | "SUCCESS" | "ERROR"` mismatch.
- Two historical client TSX-loader test failures remain pre-existing; the
  repository's TSX-loader command cannot run because the `tsx` executable is
  not installed. Node 24's native TypeScript test loader was used instead; all
  9 client test files passed (34 tests).

## Deferred contract migrations

These compatibility contracts stay in place for at least one release after
the multi-doctor rollout is enabled:

- `public.clinic_services.owner_practitioner_role_id`: deprecated single-owner
  service column retained for legacy provider/catalog callers. Remove only
  after all service CRUD, availability, booking, generated-slot, and hosted
  data backfills use `service_practitioners` exclusively and the single-doctor
  regression suite passes in one release.
- Legacy `appointment_slots_select` policy revisions from the pre-doctor-first
  direct free-slot read path: retain the final patient-booked/assigned/admin
  policy chain until all supported clients use the narrow availability RPC and
  hosted privacy checks confirm no direct public slot consumer remains. Remove
  only in the release after that verification.
- Legacy `appointment_slots_public_select` policy contract: the final policy
  is intentionally anon-only for the narrow free-slot projection; remove the
  old policy history only when the public projection and its Realtime refresh
  have shipped and the anonymous cross-organization isolation test remains
  green.
# Loop E-2

- TODO: define and implement explicit coverage payout splits/admin payout arrangements. E-2 records original assigned and performed practitioner roles while retaining assigned-doctor fee ownership; no split logic is intentionally implemented.
