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

## Loop 1 staging verification

- [ ] Apply `20260901000500_core_visit_loop.sql` and regenerate shared database types from staging.
- [ ] Run `supabase/validation/loop1_core_visit.sql` and confirm every result is `true`.
- [ ] Verify the public waiting-room route receives Realtime changes without exposing patient identity fields.

## Multi-clinic verification

- [ ] Apply `20260901000600_multi_clinic_tenancy.sql` and regenerate shared database types.
- [ ] Run `supabase/validation/multi_clinic_tenancy.sql` against a two-clinic environment.
- [ ] Verify a patient can explicitly join a second clinic while clinic A and B records remain isolated after each clinic selection.

## Before merge

- [ ] Commit or separately review the current foundation changes before merging.
- [ ] Regenerate `packages/types/src/database.ts` from the linked schema when the Supabase CLI/database connection is available.
- [x] Add the Playwright end-to-end test for registration/walk-in to booking to provider queue.

## Loop 2 staging verification

- [ ] Apply `20260901000900_clinical_documentation_loop.sql` and regenerate database types from the linked project.
- [ ] Run `supabase/validation/loop2_clinical_documentation.sql` and the two-clinic RLS suite.
- [ ] Run the Playwright clinical flow and confirm SOAP notes, prescriptions, certificates, encounter completion, and profile changes arrive in the patient portal without refresh.
