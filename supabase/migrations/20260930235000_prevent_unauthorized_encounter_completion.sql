-- Rollback: restore public.finish_clinical_encounter(uuid) from
-- 20260927180000_billing_management_lifecycle.sql, then reapply its execute
-- grants.
--
-- Encounter completion uses the existing consultation permission and requires
-- an active practitioner role in the encounter organization.

create or replace function public.finish_clinical_encounter(
  p_encounter_id uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_encounter public.encounters%rowtype;
  v_practitioner_id uuid;
  v_event_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select encounter.*
  into v_encounter
  from public.encounters encounter
  where encounter.id = p_encounter_id
  for update;

  if not found or v_encounter.status <> 'in_progress' then
    raise exception 'An in-progress encounter is required.' using errcode = '22023';
  end if;

  if not public.has_organization_permission(
    v_encounter.organization_id,
    'can_start_consultation'
  ) then
    raise exception 'Consultation permission is required to complete an encounter.'
      using errcode = '42501';
  end if;

  select practitioner.id
  into v_practitioner_id
  from public.practitioners practitioner
  join public.practitioner_roles practitioner_role
    on practitioner_role.practitioner_id = practitioner.id
  where practitioner.auth_user_id = auth.uid()
    and practitioner.active
    and practitioner_role.active
    and practitioner_role.organization_id = v_encounter.organization_id
  order by practitioner_role.created_at, practitioner_role.id
  limit 1;

  if v_practitioner_id is null then
    raise exception 'An active practitioner role in this organization is required.'
      using errcode = '42501';
  end if;

  update public.encounters
  set status = 'finished', period_end = now()
  where id = v_encounter.id;

  update public.appointments
  set status = 'fulfilled'
  where id = v_encounter.appointment_id;

  select billing_event.id
  into v_event_id
  from public.billing_events billing_event
  where billing_event.encounter_id = v_encounter.id
    and billing_event.status = 'draft'
  order by billing_event.created_at desc
  limit 1;

  if v_event_id is not null then
    perform public.issue_billing_invoice(v_event_id);
  end if;
end;
$$;

revoke all on function public.finish_clinical_encounter(uuid)
from public, anon, authenticated;

grant execute on function public.finish_clinical_encounter(uuid)
to authenticated;

comment on function public.finish_clinical_encounter(uuid) is
  'Completes an organization-scoped encounter for an authenticated practitioner with consultation permission.';
