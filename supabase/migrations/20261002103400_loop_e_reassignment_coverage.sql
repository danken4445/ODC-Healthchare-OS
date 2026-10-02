-- Loop E-1/E-2: practitioner coverage, permissioned reassignment, and
-- assigned-doctor clinical authorship. Rollback: revoke the new RPC grants,
-- restore the prior clinical RPC definitions, then drop the coverage table and
-- attribution column after callers have been removed.

alter table public.clinic_role_permission_overrides
  drop constraint if exists clinic_role_permission_overrides_permission_check;

alter table public.clinic_role_permission_overrides
  add constraint clinic_role_permission_overrides_permission_check check (permission in (
    'can_access_admin_portal', 'can_access_provider_portal',
    'can_manage_appointments', 'can_record_triage',
    'can_start_consultation', 'can_manage_provider_schedule',
    'can_manage_staff_roles', 'can_view_inventory',
    'can_manage_inventory', 'can_tag_inventory_usage',
    'can_reassign_appointments', 'role_permissions_configured'
  ));

insert into public.role_permissions (role_id, organization_id, permission)
select role.id, null, defaults.permission
from public.roles role
cross join (values ('can_reassign_appointments')) as defaults(permission)
where role.name in ('admin', 'owner')
  and not exists (
    select 1 from public.role_permissions existing
    where existing.role_id = role.id
      and existing.organization_id is null
      and existing.permission = defaults.permission
  );

create or replace function public.save_clinic_role_definition(
  p_organization_id uuid, p_code text, p_name text, p_permissions text[]
)
returns void
language plpgsql security definer set search_path = public, auth
as $$
declare
  normalized_code text := lower(btrim(p_code));
  normalized_name text := btrim(p_name);
  allowed_permissions text[] := array[
    'can_access_admin_portal', 'can_access_provider_portal',
    'can_manage_appointments', 'can_record_triage', 'can_start_consultation',
    'can_manage_provider_schedule', 'can_manage_staff_roles',
    'can_view_inventory', 'can_manage_inventory', 'can_tag_inventory_usage',
    'can_reassign_appointments'
  ];
begin
  if not public.can_manage_organization_accounts(p_organization_id) then
    raise exception 'Role management permission is required.' using errcode = '42501';
  end if;
  if normalized_code !~ '^[a-z][a-z0-9_]{1,39}$'
    or length(normalized_name) not between 2 and 80
    or exists (select 1 from unnest(coalesce(p_permissions, '{}'::text[])) permission where permission <> all(allowed_permissions)) then
    raise exception 'Role details or permissions are invalid.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.roles role where role.name = normalized_code) then
    insert into public.clinic_role_definitions (organization_id, code, name)
    values (p_organization_id, normalized_code, normalized_name)
    on conflict (organization_id, code) do update set name = excluded.name, active = true;
  end if;
  delete from public.clinic_role_permission_overrides
  where organization_id = p_organization_id and role_code = normalized_code;
  insert into public.clinic_role_permission_overrides (organization_id, role_code, permission)
  select p_organization_id, normalized_code, permission
  from unnest(array_append(coalesce(p_permissions, '{}'::text[]), 'role_permissions_configured')) permission;
end;
$$;

insert into public.clinic_role_permission_overrides (organization_id, role_code, permission)
select organization.id, defaults.role_code, 'can_reassign_appointments'
from public.organizations organization
cross join (values ('admin'), ('owner')) as defaults(role_code)
on conflict (organization_id, role_code, permission) do nothing;

create table public.practitioner_coverage_grants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  covered_practitioner_role_id uuid not null references public.practitioner_roles(id),
  covering_practitioner_role_id uuid not null references public.practitioner_roles(id),
  valid_from date not null,
  valid_to date not null,
  reason text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (covered_practitioner_role_id <> covering_practitioner_role_id),
  check (valid_to > valid_from),
  check (length(btrim(reason)) between 2 and 1000)
);

create index practitioner_coverage_grants_lookup_idx
  on public.practitioner_coverage_grants
  (organization_id, covered_practitioner_role_id, valid_from, valid_to);

alter table public.practitioner_coverage_grants enable row level security;
create policy practitioner_coverage_grants_select
  on public.practitioner_coverage_grants for select to authenticated
  using (public.can_access_organization(organization_id));

revoke insert, update, delete on public.practitioner_coverage_grants from authenticated;
grant select on public.practitioner_coverage_grants to authenticated;
create trigger practitioner_coverage_grants_audit
  after insert or update or delete on public.practitioner_coverage_grants
  for each row execute function public.write_audit_log();

alter table public.observations
  add column authored_by_practitioner_role_id uuid references public.practitioner_roles(id);

create or replace function public.reassign_appointment(
  p_appointment_id uuid,
  p_new_practitioner_role_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appointment public.appointments%rowtype;
  v_old_role_id uuid;
  v_old_slot public.appointment_slots%rowtype;
  v_new_slot public.appointment_slots%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) not between 2 and 1000 then
    raise exception 'A reassignment reason is required.' using errcode = '22023';
  end if;

  select appointment.* into v_appointment
  from public.appointments appointment
  where appointment.id = p_appointment_id
  for update;
  if not found then
    raise exception 'Appointment not found.' using errcode = 'P0002';
  end if;
  if not public.has_organization_permission(v_appointment.organization_id, 'can_reassign_appointments') then
    raise exception 'Appointment reassignment permission is required.' using errcode = '42501';
  end if;
  if v_appointment.status in ('fulfilled', 'cancelled') then
    raise exception 'Finished or cancelled appointments cannot be reassigned.' using errcode = '22023';
  end if;
  if p_new_practitioner_role_id is null or p_new_practitioner_role_id = v_appointment.practitioner_role_id then
    raise exception 'A different practitioner is required.' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.practitioner_roles role
    join public.practitioners practitioner on practitioner.id = role.practitioner_id
    where role.id = p_new_practitioner_role_id
      and role.organization_id = v_appointment.organization_id
      and role.role_code = 'doctor'
      and role.active and practitioner.active
  ) then
    raise exception 'The target must be an active doctor in the appointment organization.' using errcode = '23503';
  end if;
  if v_appointment.clinic_service_id is null
    or not exists (
      select 1 from public.service_practitioners membership
      where membership.organization_id = v_appointment.organization_id
        and membership.clinic_service_id = v_appointment.clinic_service_id
        and membership.practitioner_role_id = p_new_practitioner_role_id
        and membership.is_active
    ) then
    raise exception 'The target doctor is not assigned to this service.' using errcode = '23503';
  end if;

  v_old_role_id := v_appointment.practitioner_role_id;
  select slot.* into v_old_slot
  from public.appointment_slots slot
  where slot.appointment_id = v_appointment.id
  for update;

  if v_appointment.start_at is not null then
    select slot.* into v_new_slot
    from public.appointment_slots slot
    where slot.organization_id = v_appointment.organization_id
      and slot.practitioner_role_id = p_new_practitioner_role_id
      and slot.clinic_service_id = v_appointment.clinic_service_id
      and slot.start_at = v_appointment.start_at
      and slot.end_at = v_appointment.end_at
      and slot.status = 'free'
      and slot.appointment_id is null
    for update;
  end if;

  update public.appointments
  set practitioner_role_id = p_new_practitioner_role_id
  where id = v_appointment.id
    and organization_id = v_appointment.organization_id;

  if v_old_slot.id is not null then
    update public.appointment_slots
    set status = 'free', appointment_id = null
    where id = v_old_slot.id;
  end if;
  if v_new_slot.id is not null then
    update public.appointment_slots
    set status = 'busy', appointment_id = v_appointment.id
    where id = v_new_slot.id and status = 'free' and appointment_id is null;
    if not found then
      raise exception 'The replacement slot was taken during reassignment.' using errcode = '40001';
    end if;
  end if;

  update public.encounters
  set practitioner_role_id = p_new_practitioner_role_id
  where appointment_id = v_appointment.id
    and organization_id = v_appointment.organization_id
    and status = 'in_progress';

  insert into public.audit_log (organization_id, actor_id, actor_type, action, table_name, record_id, metadata)
  values (
    v_appointment.organization_id, auth.uid(), 'registered_user', 'insert', 'appointments', v_appointment.id,
    jsonb_build_object(
      'event_type', 'appointment_reassigned',
      'assigned_practitioner_role_id', v_old_role_id,
      'new_practitioner_role_id', p_new_practitioner_role_id,
      'reason', btrim(p_reason),
      'replacement_slot_id', v_new_slot.id,
      'payout_attribution_todo', 'E-2: preserve assigned and performed attribution before payout splitting.'
    )
  );
  -- TODO(E-2): billing/payout attribution remains unchanged until the explicit
  -- coverage split policy is confirmed; store performed role separately first.
  return v_appointment.id;
end;
$$;

create or replace function public.mark_practitioner_absent(
  p_practitioner_role_id uuid,
  p_date date,
  p_covering_practitioner_role_id uuid,
  p_reason text
)
returns table (moved_count integer, not_movable_count integer, results jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
  v_appointment record;
  v_moved integer := 0;
  v_not_movable integer := 0;
  v_results jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_date is null or p_reason is null or length(btrim(p_reason)) not between 2 and 1000 then
    raise exception 'Date and absence reason are required.' using errcode = '22023';
  end if;
  select role.organization_id into v_org_id
  from public.practitioner_roles role
  where role.id = p_practitioner_role_id and role.active and role.role_code = 'doctor';
  if v_org_id is null then
    raise exception 'The absent practitioner must be an active doctor.' using errcode = '23503';
  end if;
  if not public.has_organization_permission(v_org_id, 'can_reassign_appointments') then
    raise exception 'Appointment reassignment permission is required.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.practitioner_roles role
    join public.practitioners practitioner on practitioner.id = role.practitioner_id
    where role.id = p_covering_practitioner_role_id and role.organization_id = v_org_id
      and role.role_code = 'doctor' and role.active and practitioner.active
  ) or p_covering_practitioner_role_id = p_practitioner_role_id then
    raise exception 'The covering practitioner must be a different active doctor in the same organization.' using errcode = '23503';
  end if;

  insert into public.practitioner_coverage_grants (
    organization_id, covered_practitioner_role_id, covering_practitioner_role_id,
    valid_from, valid_to, reason, created_by
  ) values (v_org_id, p_practitioner_role_id, p_covering_practitioner_role_id,
    p_date, p_date + 1, btrim(p_reason), auth.uid());

  for v_appointment in
    select appointment.id
    from public.appointments appointment
    where appointment.organization_id = v_org_id
      and appointment.practitioner_role_id = p_practitioner_role_id
      and appointment.start_at is not null
      and (appointment.start_at at time zone 'Asia/Manila')::date = p_date
      and appointment.status not in ('fulfilled', 'cancelled')
    order by appointment.start_at, appointment.id
  loop
    begin
      perform public.reassign_appointment(v_appointment.id, p_covering_practitioner_role_id, p_reason);
      v_moved := v_moved + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object('appointment_id', v_appointment.id, 'moved', true));
    exception when others then
      v_not_movable := v_not_movable + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'appointment_id', v_appointment.id, 'moved', false, 'reason', sqlerrm, 'sqlstate', sqlstate
      ));
    end;
  end loop;
  return query select v_moved, v_not_movable, v_results;
end;
$$;

create or replace function public.add_soap_observation(
  p_encounter_id uuid,
  p_section text,
  p_text text,
  p_supersedes_id uuid default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_encounter public.encounters%rowtype;
  v_assigned_role_id uuid;
  v_practitioner_id uuid;
  v_caller_role_id uuid;
  v_observation_id uuid;
  v_latest_id uuid;
  v_section text := upper(btrim(p_section));
  v_text text := btrim(p_text);
begin
  if auth.uid() is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  select encounter.* into v_encounter from public.encounters encounter where encounter.id = p_encounter_id for update;
  if not found or v_encounter.status <> 'in_progress' then raise exception 'An in-progress encounter is required.' using errcode = '22023'; end if;
  select practitioner.id, role.id into v_practitioner_id, v_caller_role_id
  from public.practitioners practitioner join public.practitioner_roles role on role.practitioner_id = practitioner.id
  where practitioner.auth_user_id = auth.uid() and practitioner.active and role.active
    and role.organization_id = v_encounter.organization_id and role.role_code in ('doctor', 'specialist');
  if v_practitioner_id is null then raise exception 'Clinical documentation access is required.' using errcode = '42501'; end if;
  select appointment.practitioner_role_id into v_assigned_role_id from public.appointments appointment
  where appointment.id = v_encounter.appointment_id and appointment.organization_id = v_encounter.organization_id;
  if v_encounter.practitioner_role_id is null or v_encounter.practitioner_role_id <> v_assigned_role_id then
    raise exception 'The encounter and appointment must have the same assigned practitioner role.' using errcode = '22023';
  end if;
  if not (
    v_caller_role_id = v_assigned_role_id
    or public.has_organization_permission(v_encounter.organization_id, 'can_reassign_appointments')
    or exists (select 1 from public.practitioner_coverage_grants grant_row where grant_row.organization_id = v_encounter.organization_id
      and grant_row.covered_practitioner_role_id = v_assigned_role_id and grant_row.covering_practitioner_role_id = v_caller_role_id
      and grant_row.valid_from <= (coalesce(v_encounter.period_start, now()) at time zone 'Asia/Manila')::date
      and grant_row.valid_to > (coalesce(v_encounter.period_start, now()) at time zone 'Asia/Manila')::date)
  ) then raise exception 'Only the assigned doctor or an active covering doctor may document this encounter.' using errcode = '42501'; end if;
  if v_section is null or v_text is null or v_section not in ('S', 'O', 'A', 'P') or length(v_text) < 1 or length(v_text) > 10000 then raise exception 'SOAP section and text are invalid.' using errcode = '22023'; end if;
  select observation.id into v_latest_id from public.observations observation where observation.encounter_id = v_encounter.id and observation.code = 'SOAP-' || v_section order by observation.created_at desc limit 1;
  if v_latest_id is distinct from p_supersedes_id then raise exception 'A SOAP revision must supersede the latest section version.' using errcode = '40001'; end if;
  insert into public.observations (organization_id, patient_id, encounter_id, performer_practitioner_id, authored_by_practitioner_role_id, status, category_codes, code_system, code, code_display, effective_at, issued_at, value, supersedes_id)
  values (v_encounter.organization_id, v_encounter.patient_id, v_encounter.id, v_practitioner_id, v_caller_role_id, 'final', '[{"coding":[{"code":"clinical-note","display":"Clinical note"}]}]'::jsonb, 'urn:odyssey:soap', 'SOAP-' || v_section, case v_section when 'S' then 'Subjective' when 'O' then 'Objective' when 'A' then 'Assessment' else 'Plan' end, now(), now(), jsonb_build_object('text', v_text), p_supersedes_id)
  returning id into v_observation_id;
  return v_observation_id;
end;
$$;

create or replace function public.add_soap_note(p_encounter_id uuid, p_text text, p_supersedes_id uuid default null)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_encounter public.encounters%rowtype;
  v_assigned_role_id uuid;
  v_practitioner_id uuid;
  v_caller_role_id uuid;
  v_caller_role_code text;
  v_latest_id uuid;
  v_observation_id uuid;
  v_text text := btrim(p_text);
begin
  select encounter.* into v_encounter from public.encounters encounter where encounter.id = p_encounter_id for update;
  if not found or v_encounter.status <> 'in_progress' then raise exception 'An in-progress encounter is required.' using errcode = '22023'; end if;
  select practitioner.id, role.id, role.role_code into v_practitioner_id, v_caller_role_id, v_caller_role_code
  from public.practitioners practitioner join public.practitioner_roles role on role.practitioner_id = practitioner.id
  where practitioner.auth_user_id = auth.uid() and practitioner.active and role.active and role.organization_id = v_encounter.organization_id and role.role_code in ('doctor', 'nurse', 'specialist');
  if v_practitioner_id is null then raise exception 'Clinical documentation access is required.' using errcode = '42501'; end if;
  select appointment.practitioner_role_id into v_assigned_role_id from public.appointments appointment where appointment.id = v_encounter.appointment_id and appointment.organization_id = v_encounter.organization_id;
  if v_encounter.practitioner_role_id is null or v_encounter.practitioner_role_id <> v_assigned_role_id then
    raise exception 'The encounter and appointment must have the same assigned practitioner role.' using errcode = '22023';
  end if;
  if v_caller_role_code <> 'nurse' and not (v_caller_role_id = v_assigned_role_id or public.has_organization_permission(v_encounter.organization_id, 'can_reassign_appointments') or exists (select 1 from public.practitioner_coverage_grants grant_row where grant_row.organization_id = v_encounter.organization_id and grant_row.covered_practitioner_role_id = v_assigned_role_id and grant_row.covering_practitioner_role_id = v_caller_role_id and grant_row.valid_from <= (coalesce(v_encounter.period_start, now()) at time zone 'Asia/Manila')::date and grant_row.valid_to > (coalesce(v_encounter.period_start, now()) at time zone 'Asia/Manila')::date)) then raise exception 'Only the assigned doctor or an active covering doctor may document this encounter.' using errcode = '42501'; end if;
  if v_text is null or length(v_text) < 1 or length(v_text) > 20000 then raise exception 'SOAP note text is required and must be 20,000 characters or fewer.' using errcode = '22023'; end if;
  select observation.id into v_latest_id from public.observations observation where observation.encounter_id = v_encounter.id and observation.code = 'SOAP-NOTE' order by observation.created_at desc limit 1;
  if v_latest_id is distinct from p_supersedes_id then raise exception 'A SOAP revision must supersede the latest note version.' using errcode = '40001'; end if;
  insert into public.observations (organization_id, patient_id, encounter_id, performer_practitioner_id, authored_by_practitioner_role_id, status, category_codes, code_system, code, code_display, effective_at, issued_at, value, supersedes_id)
  values (v_encounter.organization_id, v_encounter.patient_id, v_encounter.id, v_practitioner_id, v_caller_role_id, 'final', '[{"coding":[{"code":"clinical-note","display":"Clinical note"}]}]'::jsonb, 'urn:odyssey:soap', 'SOAP-NOTE', 'SOAP note', now(), now(), jsonb_build_object('text', v_text), p_supersedes_id) returning id into v_observation_id;
  return v_observation_id;
end;
$$;

create or replace function public.finish_clinical_encounter(p_encounter_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_encounter public.encounters%rowtype; v_assigned_role_id uuid; v_caller_role_id uuid; v_event_id uuid;
begin
  select encounter.* into v_encounter from public.encounters encounter where encounter.id = p_encounter_id for update;
  if not found or v_encounter.status <> 'in_progress' then raise exception 'An in-progress encounter is required.' using errcode = '22023'; end if;
  select role.id into v_caller_role_id from public.practitioner_roles role join public.practitioners practitioner on practitioner.id = role.practitioner_id where practitioner.auth_user_id = auth.uid() and practitioner.active and role.active and role.organization_id = v_encounter.organization_id and role.role_code in ('doctor', 'specialist');
  select appointment.practitioner_role_id into v_assigned_role_id from public.appointments appointment where appointment.id = v_encounter.appointment_id and appointment.organization_id = v_encounter.organization_id;
  if v_encounter.practitioner_role_id is null or v_encounter.practitioner_role_id <> v_assigned_role_id then
    raise exception 'The encounter and appointment must have the same assigned practitioner role.' using errcode = '22023';
  end if;
  if v_caller_role_id is null or not (v_caller_role_id = v_assigned_role_id or public.has_organization_permission(v_encounter.organization_id, 'can_reassign_appointments') or exists (select 1 from public.practitioner_coverage_grants grant_row where grant_row.organization_id = v_encounter.organization_id and grant_row.covered_practitioner_role_id = v_assigned_role_id and grant_row.covering_practitioner_role_id = v_caller_role_id and grant_row.valid_from <= (coalesce(v_encounter.period_start, now()) at time zone 'Asia/Manila')::date and grant_row.valid_to > (coalesce(v_encounter.period_start, now()) at time zone 'Asia/Manila')::date)) then raise exception 'Only the assigned doctor or an active covering doctor may complete this encounter.' using errcode = '42501'; end if;
  update public.encounters set status = 'finished', period_end = now() where id = v_encounter.id and organization_id = v_encounter.organization_id;
  update public.appointments set status = 'fulfilled' where id = v_encounter.appointment_id and organization_id = v_encounter.organization_id;
  select billing_event.id into v_event_id
  from public.billing_events billing_event
  where billing_event.encounter_id = v_encounter.id
    and billing_event.organization_id = v_encounter.organization_id
    and billing_event.status = 'draft'
  order by billing_event.created_at desc limit 1;
  if v_event_id is not null then perform public.issue_billing_invoice(v_event_id); end if;
end;
$$;

revoke all on function public.reassign_appointment(uuid, uuid, text) from public, anon;
revoke all on function public.mark_practitioner_absent(uuid, date, uuid, text) from public, anon;
grant execute on function public.reassign_appointment(uuid, uuid, text) to authenticated;
grant execute on function public.mark_practitioner_absent(uuid, date, uuid, text) to authenticated;
revoke all on function public.add_soap_observation(uuid, text, text, uuid) from public, anon;
revoke all on function public.add_soap_note(uuid, text, uuid) from public, anon;
revoke all on function public.finish_clinical_encounter(uuid) from public, anon;
grant execute on function public.add_soap_observation(uuid, text, text, uuid) to authenticated;
grant execute on function public.add_soap_note(uuid, text, uuid) to authenticated;
grant execute on function public.finish_clinical_encounter(uuid) to authenticated;

comment on table public.practitioner_coverage_grants is 'Organization-scoped doctor coverage windows used for reassignment and clinical authorization.';
comment on column public.observations.authored_by_practitioner_role_id is 'PractitionerRole that authored the observation; nullable for historical rows.';
