# Tomorrow's checklist

## Phase 2 verification

- [ ] In the hosted Supabase Dashboard, create confirmed synthetic Auth users and run `supabase/validation/phase2_hosted_test_accounts.sql`.
- [ ] Deploy `get-walk-in-records` and verify it returns only the PIN-authenticated walk-in patient's records.
- [ ] Run `supabase/validation/phase2_auth_rls.sql` in the hosted SQL Editor and confirm every result is `true`.
- [ ] Add `http://localhost:3000` to Supabase Auth redirect URLs.

## Phase 4 staging verification

- [ ] Apply `20260901000400_phase4_vertical_slice.sql` to staging and deploy the updated `get-walk-in-records` Edge Function.
- [ ] Run `phase2_hosted_test_accounts.sql` to link synthetic actors and create temporary staging slots.
- [ ] Run `pnpm test:e2e` against staging and retain the passing CI run as the Phase 4 exit evidence.

## Before merge

- [ ] Commit or separately review the current foundation changes before merging.
- [ ] Regenerate `packages/types/src/database.ts` from the linked schema when the Supabase CLI/database connection is available.
- [x] Add the Playwright end-to-end test for registration/walk-in to booking to provider queue.
