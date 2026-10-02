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
