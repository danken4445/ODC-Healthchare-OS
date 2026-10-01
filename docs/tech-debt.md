# Technical debt

## Loop A provider E2E teardown on Windows

`e2e/run-loop-a-playwright.mjs` has a bounded Playwright timeout, force-kills its
owned dev-server tree, and verifies the temporary listener closes. The current
run passed its two assertions and completed teardown, but Windows process-tree
cleanup remains operationally fragile. Revisit this if CI or local runs begin
to exceed the bounded teardown window.
