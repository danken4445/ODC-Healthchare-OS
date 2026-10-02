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
# Loop E-2

- TODO: define and implement explicit coverage payout splits/admin payout arrangements. E-2 records original assigned and performed practitioner roles while retaining assigned-doctor fee ownership; no split logic is intentionally implemented.
