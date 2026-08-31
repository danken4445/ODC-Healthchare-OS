# Production backup verification and restore drill

This runbook uses only a production backup created by Supabase and restores it
into a separate scratch project. Never restore a production backup over any
shared development, staging, or production project.

## Before go-live

1. In the Supabase Dashboard for `odyssey-healthcare-os-prod`, open **Database
   > Backups** and confirm automated Postgres backups are enabled, the retention
   > period meets the organization's policy, and a recent successful backup is
   > listed. Record the project reference, plan, retention period, backup time,
   > and the operator in the launch record.
2. Create an empty, access-restricted scratch project in the same Supabase
   organization and region. Name it with the date, for example
   `odyssey-healthcare-os-restore-drill-YYYY-MM-DD`; do not connect an app,
   email provider, or production integration to it.
3. From the production project's **Backups** page, select a recent automated
   backup and use **Restore to a new project** (or the Dashboard's current
   equivalent) to target the scratch project. This action requires an
   organization owner or an operator with the required billing permissions.
4. Wait for the restore to complete, then compare the migration history and
   perform read-only checks in the scratch project: table count, a sample
   organization, a sample appointment, and RLS enabled on every clinical table.
   Do not copy patient data out of the scratch project or attach it to local
   tools.
5. Record the start/end time, selected backup timestamp, restore result, and
   any remediation in the launch record. Delete the scratch project once the
   evidence is retained according to policy.

## Recurrence and failure handling

Repeat this drill before the first production-data launch and at least every
quarter thereafter. If automated backups are unavailable, stale, or the restore
cannot be validated, stop the production-data launch, open an incident with
Supabase support, and do not mark this gate complete.
