-- Loop C review fixes. Rollback: restore the retired anon policy only with a
-- minimal organization-scoped public projection; never expose slots directly.
drop policy if exists appointment_slots_public_select on public.appointment_slots;
