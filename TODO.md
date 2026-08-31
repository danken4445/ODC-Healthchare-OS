# Tomorrow's checklist

## Phase 2 verification

- [ ] In the hosted Supabase Dashboard, create confirmed synthetic Auth users and run `supabase/validation/phase2_hosted_test_accounts.sql`.
- [ ] Deploy `get-walk-in-records`, verify it returns only the PIN-authenticated walk-in patient's records, then delete the obsolete `issue-walk-in-token` function.
- [ ] Start the three apps (`patient-web` on 3000, `provider-web` on 3001, `admin-web` on 3002) and run the login/RLS smoke tests.
- [ ] Use the admin screen to create a walk-in; use its one-time ID/PIN in the patient screen and verify the scoped records.
- [ ] Run `supabase/validation/phase2_auth_rls.sql` in the hosted SQL Editor and confirm every result is `true`.
- [ ] Add `http://localhost:3000` to Supabase Auth redirect URLs and test the patient magic-link flow.

## Before Phase 3/4

- [ ] Commit or separately review the current foundation changes before merging.
- [ ] Regenerate `packages/types/src/database.ts` from the linked schema when the Supabase CLI/database connection is available.
- [ ] Add the Playwright end-to-end test for registration/walk-in → booking → provider queue.
