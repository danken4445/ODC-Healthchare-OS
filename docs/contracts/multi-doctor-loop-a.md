# Multi-doctor Loop A contract

Status: frozen for Loop A implementation

## Scope and compatibility

- Loop A changes slot-read authorization, the typed slot loader, and provider/nurse queue presentation only.
- Existing appointment, encounter, billing, inventory, and teleconsult contracts remain unchanged.
- Existing uncommitted work in shared files must be preserved.
- No new permission key is introduced in this loop. `can_manage_appointments` authorizes clinic-wide slot and queue views. Encounter start remains restricted to the assigned practitioner and `can_start_consultation`; the future `can_reassign_appointments` key stays in Loop F.

## Database

Migration: `20260930160000_loop_a_scope_appointment_slot_reads.sql`

No tables or RPC signatures change. Replace the overlapping `appointment_slots` SELECT policies with these explicit branches:

1. `anon` may read unbooked free slots under the existing public-discovery semantics.
2. An authenticated patient may read future free slots only when `public.is_patient_self(auth.uid(), <slot organization>)` succeeds, and may read their own booked slots under the existing ownership predicate.
3. An authenticated practitioner may read slots whose `practitioner_role_id` belongs to their active role in the same organization.
4. An authenticated staff member may read clinic-wide slots only when `public.has_organization_permission(auth.uid(), organization_id, 'can_manage_appointments')` succeeds.

Operational dual-role identities must not gain the patient-wide branch. Remove hard-coded role-name authorization. Keep policies organization-scoped and use `TO anon` / `TO authenticated` explicitly. The migration starts with a rollback note and does not drop or rename schema objects.

## Client and shared types

Add:

```ts
type ProviderAppointmentSlotScope = "mine" | "clinic";

getProviderAppointmentSlots(
  client,
  organizationId: string,
  options: { scope: ProviderAppointmentSlotScope; from?: Date },
): Promise<SupabaseResult<AppointmentSlotSummary[]>>;
```

- `mine`: resolve the current active practitioner role and add an equality filter on `practitioner_role_id`.
- `clinic`: require effective `can_manage_appointments` before issuing the clinic-wide query. RLS remains the enforcement boundary.
- Preserve the current nine-field slot return shape and sort order.
- Client validation errors: `PROVIDER_ROLE_REQUIRED` and `APPOINTMENT_SCOPE_FORBIDDEN`, each with a human-readable message.

Extend `AppointmentQueueItem` with `assignedDoctorName: string`. `getDailyAppointmentQueue` resolves only distinct assigned role IDs to `practitioner_roles(id, practitioner_id)` and `practitioners(id, name)`, formats the existing FHIR HumanName safely, and exposes no email or license fields. Unknown/deactivated references render as `Assigned doctor unavailable` rather than dropping the queue row.

## Provider UI

- Add a reusable `useCurrentPractitionerRole()` hook backed by the client helper.
- Provider availability calls `getProviderAppointmentSlots` with `scope: "mine"`.
- Doctor queue defaults to `My patients`. Users with `can_manage_appointments` may switch to `All` and filter by doctor; filter choices derive from queue rows and therefore include only doctors present in the loaded result.
- Show `Assigned Doctor` in the main queue, overview/nurse table, and reusable queue cards.
- Show/enable `Mark in progress` only when the user has `can_start_consultation` and the row is assigned to the current practitioner role. Do not infer reassign authority from `can_manage_appointments`.
- Map backend `P0002` / `Assigned appointment not found` to: `This appointment is assigned to another doctor. Ask an authorized coordinator to reassign it.`
- Controls must be keyboard accessible, use visible labels, expose selected state, avoid color-only meaning, and remain usable without horizontal page overflow at 375 px.

## Tests and acceptance

- pgTAP covers: anon free-slot read only; authenticated patient free and own-booked access; Doctor A can read A but not B; Doctor B reciprocal isolation; appointment manager clinic scope; ordinary staff denial; operational dual-role denial of the patient-wide branch.
- Client tests or type-level checks cover both explicit scopes, missing provider role, forbidden clinic scope, and assigned-doctor fallback.
- Provider UI checks cover default mine state, authorized All/filter behavior, assigned-doctor rendering in doctor and nurse views, disabled/hidden cross-doctor start, readable fallback error, keyboard labels, and 375 px overflow.
- Regression: current patient availability discovery remains functional; single-doctor provider behavior is unchanged.

## Known deferred work

- Loop C replaced direct appointment-slot discovery with the patient-safe `bookable_practitioners`, `get_available_slots`, and `book_appointment` RPC path. The patient booking UI is signed-in and clinic-context scoped, so direct anonymous SELECT on `appointment_slots` is intentionally denied.
- Doctors with zero matching queue rows do not appear in the derived filter list.
