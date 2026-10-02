# Multi-doctor pilot rollout

This is the pilot runbook for the committed Loops A–F changes. Apply migrations only to the local environment during validation, then use the hosted migration workflow after review; do not edit or replay an already-applied migration in place.

## Order and backup

1. Confirm the hosted migration list and schema diff against the release branch.
2. Take a database backup/snapshot and record its timestamp, project ref, and restore owner.
3. Apply migrations in timestamp order, including the legacy teleconsult search-path repair and the fee-permission default repair.
4. Run database tests and the focused client contract tests before enabling flags.

`20260927180000_billing_management_lifecycle.sql` is already present in the hosted migration history. Its later local correction is therefore not replayed by Supabase history; ship a new corrective migration for any hosted behavior that depends on those changes. Never edit that timestamp for rollout.

## Organization settings

For each pilot organization set:

- `fee_model`: `practitioner_declared` for private facilities; `fixed_rate` for government/fixed-rate facilities.
- `queue_mode`: `clinic_wide` for the legacy sequence, or `per_practitioner` with one-letter prefixes.
- Queue prefixes: assign/verify one active prefix per doctor when using per-practitioner mode.

Government organizations must remain `fixed_rate`. The provider Fees tab is available by default to doctors in practitioner-declared organizations and hidden/disabled in fixed-rate organizations.

## Permissions and seed/configuration

Assign the existing permission keys through Roles CMS: provider portal access, appointment/queue access as required, `can_manage_professional_fees` for practitioner-declared doctors, and administrator permissions for rooms, services, and queue management. Do not hard-code role names in rollout configuration.

Seed or configure, in this order:

1. active doctors and practitioner roles;
2. clinic services and service-practitioner assignments;
3. clinic rooms and date/shift room assignments;
4. declared fees for each bookable private service;
5. queue mode and prefixes.

## Smoke test

For each pilot organization:

1. Sign in as a doctor and confirm the Fees tab appears only for practitioner-declared mode.
2. Declare a fee, reload, and confirm the effective fee is shown; switch to fixed rate and confirm mutation is unavailable.
3. Book a doctor-specific in-person slot and verify the durable queue label.
4. Check in the appointment, start the encounter, and confirm the lobby shows only queue label, doctor display name, and room label.
5. Move the queue to in progress and confirm the lobby updates through Realtime; verify no patient name is displayed.
6. Repeat the read checks as a user from another organization and confirm no staff/calendar/teleconsult data is returned.
7. Exercise reassignment/coverage and confirm only the assigned doctor or active covering doctor can access the clinical path.

## Rollback and monitoring

Rollback is additive: turn off practitioner-declared fees and per-practitioner queues with organization settings, stop new room assignments, and keep existing rows for audit. Restore from the backup only for data corruption; do not delete migrations or run destructive commands against hosted.

Monitor migration errors, RPC authorization failures, queue-label uniqueness conflicts, Realtime channel status, lobby refresh latency, missing room labels, fee-declaration failures, audit-log writes, and cross-organization denied requests. Keep the pilot disabled if any patient identity appears in the lobby payload or if queue events stop updating.
