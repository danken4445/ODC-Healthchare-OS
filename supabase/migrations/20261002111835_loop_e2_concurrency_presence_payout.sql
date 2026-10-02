-- Loop E-2: encounter optimistic concurrency, advisory presence, and payout
-- attribution. Rollback: restore the prior E-1 RPC signatures, revoke the lock
-- RPC grants, then remove only the additive columns/table after callers stop
-- using them. Historical payout rows retain their assigned-role value.

alter table public.encounters
  add column if not exists version integer not null default 1;

alter table public.appointments
  add column if not exists original_assigned_practitioner_role_id uuid
    references public.practitioner_roles(id);

update public.appointments
set original_assigned_practitioner_role_id = practitioner_role_id
where original_assigned_practitioner_role_id is null;

-- Walk-in and draft appointments may legitimately have no assignee yet; booked
-- appointments receive the original role through the trigger below.

create or replace function public.set_original_appointment_assignee()
returns trigger language plpgsql set search_path = public as $$
begin
  new.original_assigned_practitioner_role_id := coalesce(
    new.original_assigned_practitioner_role_id,
    new.practitioner_role_id
  );
  return new;
end;
$$;

drop trigger if exists appointments_set_original_assignee on public.appointments;
create trigger appointments_set_original_assignee
  before insert on public.appointments
  for each row execute function public.set_original_appointment_assignee();

alter table public.doctor_payouts
  add column if not exists assigned_practitioner_role_id uuid
    references public.practitioner_roles(id),
  add column if not exists performed_by_practitioner_role_id uuid
    references public.practitioner_roles(id);

update public.doctor_payouts payout
set assigned_practitioner_role_id = coalesce(
  payout.assigned_practitioner_role_id,
  appointment.original_assigned_practitioner_role_id,
  payout.practitioner_role_id
)
from public.encounters encounter
left join public.appointments appointment on appointment.id = encounter.appointment_id
where payout.encounter_id = encounter.id;

alter table public.doctor_payouts
  alter column assigned_practitioner_role_id set not null;

create index if not exists doctor_payouts_assigned_role_status_idx
  on public.doctor_payouts (assigned_practitioner_role_id, status, created_at desc);

create or replace function public.enforce_remote_care_tenant_integrity()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_table_name = 'teleconsult_rooms' and not exists (
    select 1 from public.appointments appointment
    where appointment.id = new.appointment_id
      and appointment.organization_id = new.organization_id
      and appointment.delivery_mode = 'virtual'
  ) then
    raise exception 'Teleconsult room appointment must be virtual and belong to the same organization.' using errcode = '23514';
  elsif tg_table_name = 'practitioner_payout_settings' and not exists (
    select 1 from public.practitioner_roles practitioner_role
    where practitioner_role.id = new.practitioner_role_id
      and practitioner_role.organization_id = new.organization_id
  ) then
    raise exception 'Payout setting practitioner must belong to the same organization.' using errcode = '23514';
  elsif tg_table_name = 'doctor_payouts' and not exists (
    select 1
    from public.encounters encounter
    join public.billing_events billing_event on billing_event.id = new.billing_event_id and billing_event.encounter_id = encounter.id
    join public.appointments appointment on appointment.id = encounter.appointment_id and appointment.organization_id = encounter.organization_id
    join public.practitioner_roles practitioner_role on practitioner_role.id = new.assigned_practitioner_role_id
    where encounter.id = new.encounter_id
      and appointment.original_assigned_practitioner_role_id = new.assigned_practitioner_role_id
      and encounter.organization_id = new.organization_id
      and billing_event.organization_id = new.organization_id
      and practitioner_role.organization_id = new.organization_id
  ) then
    raise exception 'Payout links must all belong to the same organization and original assignment.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create table if not exists public.encounter_locks (
  encounter_id uuid primary key references public.encounters(id) on delete cascade,
  practitioner_role_id uuid not null references public.practitioner_roles(id),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  acquired_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (expires_at > acquired_at)
);

create index if not exists encounter_locks_org_expiry_idx
  on public.encounter_locks (organization_id, expires_at);

alter table public.encounter_locks enable row level security;
drop policy if exists encounter_locks_staff_select on public.encounter_locks;
create policy encounter_locks_staff_select on public.encounter_locks
  for select to authenticated
  using (public.can_access_organization(organization_id) and expires_at > now());
revoke insert, update, delete on public.encounter_locks from authenticated;
grant select on public.encounter_locks to authenticated;

create or replace function public.assert_encounter_writer(
  p_encounter public.encounters,
  p_role_id uuid
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_assigned_role_id uuid;
begin
  select appointment.practitioner_role_id into v_assigned_role_id
  from public.appointments appointment
  where appointment.id = p_encounter.appointment_id
    and appointment.organization_id = p_encounter.organization_id;
  if p_encounter.practitioner_role_id is null
    or p_encounter.practitioner_role_id <> v_assigned_role_id then
    raise exception 'The encounter and appointment must have the same assigned practitioner role.' using errcode = '22023';
  end if;
  if p_role_id = v_assigned_role_id
    or public.has_organization_permission(p_encounter.organization_id, 'can_reassign_appointments')
    or exists (
      select 1 from public.practitioner_coverage_grants grant_row
      where grant_row.organization_id = p_encounter.organization_id
        and grant_row.covered_practitioner_role_id = v_assigned_role_id
        and grant_row.covering_practitioner_role_id = p_role_id
        and grant_row.valid_from <= (coalesce(p_encounter.period_start, now()) at time zone 'Asia/Manila')::date
        and grant_row.valid_to > (coalesce(p_encounter.period_start, now()) at time zone 'Asia/Manila')::date
    ) then
    return;
  end if;
  raise exception 'Only the assigned doctor or an active covering doctor may document this encounter.' using errcode = '42501';
end;
$$;

create or replace function public.raise_encounter_version_conflict(
  p_actual_version integer
)
returns void language plpgsql set search_path = '' as $$
begin
  raise exception 'ENCOUNTER_VERSION_CONFLICT'
    using errcode = 'P0001', detail = 'ENCOUNTER_VERSION_CONFLICT', hint = p_actual_version::text;
end;
$$;

drop function if exists public.add_soap_note(uuid, text, uuid);
create function public.add_soap_note(
  p_encounter_id uuid,
  p_text text,
  p_supersedes_id uuid,
  p_expected_version integer
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_encounter public.encounters%rowtype;
  v_assigned_role_id uuid;
  v_practitioner_id uuid;
  v_caller_role_id uuid;
  v_caller_role_code text;
  v_latest_id uuid;
  v_observation_id uuid;
  v_new_version integer;
  v_text text := btrim(p_text);
begin
  if auth.uid() is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  select encounter.* into v_encounter from public.encounters encounter
  where encounter.id = p_encounter_id for update;
  if not found or v_encounter.status <> 'in_progress' then
    raise exception 'An in-progress encounter is required.' using errcode = '22023';
  end if;
  if p_expected_version is not null and p_expected_version <> v_encounter.version then
    perform public.raise_encounter_version_conflict(v_encounter.version);
  end if;
  select practitioner.id, role.id, role.role_code
  into v_practitioner_id, v_caller_role_id, v_caller_role_code
  from public.practitioners practitioner
  join public.practitioner_roles role on role.practitioner_id = practitioner.id
  where practitioner.auth_user_id = auth.uid() and practitioner.active and role.active
    and role.organization_id = v_encounter.organization_id
    and role.role_code in ('doctor', 'nurse', 'specialist');
  if v_practitioner_id is null then raise exception 'Clinical documentation access is required.' using errcode = '42501'; end if;
  if v_caller_role_code <> 'nurse' then
    perform public.assert_encounter_writer(v_encounter, v_caller_role_id);
  end if;
  if v_caller_role_code <> 'nurse' and v_caller_role_id is null then
    raise exception 'A practitioner role is required.' using errcode = '42501';
  end if;
  if v_text is null or length(v_text) < 1 or length(v_text) > 20000 then
    raise exception 'SOAP note text is required and must be 20,000 characters or fewer.' using errcode = '22023';
  end if;
  select observation.id into v_latest_id from public.observations observation
  where observation.encounter_id = v_encounter.id and observation.code = 'SOAP-NOTE'
  order by observation.created_at desc limit 1;
  if v_latest_id is distinct from p_supersedes_id then
    raise exception 'A SOAP revision must supersede the latest note version.' using errcode = '40001';
  end if;
  insert into public.observations (
    organization_id, patient_id, encounter_id, performer_practitioner_id,
    authored_by_practitioner_role_id, status, category_codes, code_system, code,
    code_display, effective_at, issued_at, value, supersedes_id
  ) values (
    v_encounter.organization_id, v_encounter.patient_id, v_encounter.id,
    v_practitioner_id, v_caller_role_id, 'final',
    '[{"coding":[{"code":"clinical-note","display":"Clinical note"}]}]'::jsonb,
    'urn:odyssey:soap', 'SOAP-NOTE', 'SOAP note', now(), now(),
    jsonb_build_object('text', v_text), p_supersedes_id
  ) returning id into v_observation_id;
  update public.encounters set version = version + 1 where id = v_encounter.id returning version into v_new_version;
  return jsonb_build_object('observation_id', v_observation_id, 'version', v_new_version);
end;
$$;

create function public.add_soap_note(
  p_encounter_id uuid,
  p_text text,
  p_supersedes_id uuid default null
)
returns uuid language sql security definer set search_path = '' as $$
  select (public.add_soap_note(p_encounter_id, p_text, p_supersedes_id, null) ->> 'observation_id')::uuid;
$$;

drop function if exists public.add_soap_observation(uuid, text, text, uuid);
create function public.add_soap_observation(
  p_encounter_id uuid,
  p_section text,
  p_text text,
  p_supersedes_id uuid,
  p_expected_version integer
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_encounter public.encounters%rowtype;
  v_assigned_role_id uuid;
  v_practitioner_id uuid;
  v_caller_role_id uuid;
  v_observation_id uuid;
  v_latest_id uuid;
  v_new_version integer;
  v_section text := upper(btrim(p_section));
  v_text text := btrim(p_text);
begin
  if auth.uid() is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  select encounter.* into v_encounter from public.encounters encounter where encounter.id = p_encounter_id for update;
  if not found or v_encounter.status <> 'in_progress' then raise exception 'An in-progress encounter is required.' using errcode = '22023'; end if;
  if p_expected_version is not null and p_expected_version <> v_encounter.version then perform public.raise_encounter_version_conflict(v_encounter.version); end if;
  select practitioner.id, role.id into v_practitioner_id, v_caller_role_id
  from public.practitioners practitioner join public.practitioner_roles role on role.practitioner_id = practitioner.id
  where practitioner.auth_user_id = auth.uid() and practitioner.active and role.active
    and role.organization_id = v_encounter.organization_id and role.role_code in ('doctor', 'specialist');
  if v_practitioner_id is null then raise exception 'Clinical documentation access is required.' using errcode = '42501'; end if;
  perform public.assert_encounter_writer(v_encounter, v_caller_role_id);
  if v_section is null or v_text is null or v_section not in ('S', 'O', 'A', 'P') or length(v_text) < 1 or length(v_text) > 10000 then raise exception 'SOAP section and text are invalid.' using errcode = '22023'; end if;
  select observation.id into v_latest_id from public.observations observation where observation.encounter_id = v_encounter.id and observation.code = 'SOAP-' || v_section order by observation.created_at desc limit 1;
  if v_latest_id is distinct from p_supersedes_id then raise exception 'A SOAP revision must supersede the latest section version.' using errcode = '40001'; end if;
  insert into public.observations (organization_id, patient_id, encounter_id, performer_practitioner_id, authored_by_practitioner_role_id, status, category_codes, code_system, code, code_display, effective_at, issued_at, value, supersedes_id)
  values (v_encounter.organization_id, v_encounter.patient_id, v_encounter.id, v_practitioner_id, v_caller_role_id, 'final', '[{"coding":[{"code":"clinical-note","display":"Clinical note"}]}]'::jsonb, 'urn:odyssey:soap', 'SOAP-' || v_section, case v_section when 'S' then 'Subjective' when 'O' then 'Objective' when 'A' then 'Assessment' else 'Plan' end, now(), now(), jsonb_build_object('text', v_text), p_supersedes_id)
  returning id into v_observation_id;
  update public.encounters set version = version + 1 where id = v_encounter.id returning version into v_new_version;
  return jsonb_build_object('observation_id', v_observation_id, 'version', v_new_version);
end;
$$;

create function public.add_soap_observation(
  p_encounter_id uuid,
  p_section text,
  p_text text,
  p_supersedes_id uuid default null
)
returns uuid language sql security definer set search_path = '' as $$
  select (public.add_soap_observation(p_encounter_id, p_section, p_text, p_supersedes_id, null) ->> 'observation_id')::uuid;
$$;

drop function if exists public.finish_clinical_encounter(uuid);
create function public.finish_clinical_encounter(
  p_encounter_id uuid,
  p_expected_version integer
)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_encounter public.encounters%rowtype;
  v_assigned_role_id uuid;
  v_caller_role_id uuid;
  v_event_id uuid;
  v_new_version integer;
begin
  if auth.uid() is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  select encounter.* into v_encounter from public.encounters encounter where encounter.id = p_encounter_id for update;
  if not found or v_encounter.status <> 'in_progress' then raise exception 'An in-progress encounter is required.' using errcode = '22023'; end if;
  if p_expected_version is not null and p_expected_version <> v_encounter.version then perform public.raise_encounter_version_conflict(v_encounter.version); end if;
  select role.id into v_caller_role_id from public.practitioner_roles role join public.practitioners practitioner on practitioner.id = role.practitioner_id
  where practitioner.auth_user_id = auth.uid() and practitioner.active and role.active and role.organization_id = v_encounter.organization_id and role.role_code in ('doctor', 'specialist');
  if v_caller_role_id is null then raise exception 'Only a doctor may complete an encounter.' using errcode = '42501'; end if;
  perform public.assert_encounter_writer(v_encounter, v_caller_role_id);
  update public.encounters set status = 'finished', period_end = now(), version = version + 1 where id = v_encounter.id returning version into v_new_version;
  update public.appointments set status = 'fulfilled' where id = v_encounter.appointment_id and organization_id = v_encounter.organization_id;
  select billing_event.id into v_event_id from public.billing_events billing_event where billing_event.encounter_id = v_encounter.id and billing_event.organization_id = v_encounter.organization_id and billing_event.status = 'draft' order by billing_event.created_at desc limit 1;
  if v_event_id is not null then perform public.issue_billing_invoice(v_event_id); end if;
  return v_new_version;
end;
$$;

create function public.finish_clinical_encounter(p_encounter_id uuid)
returns void language sql security definer set search_path = '' as $$
  select public.finish_clinical_encounter(p_encounter_id, null);
$$;

create or replace function public.acquire_encounter_lock(p_encounter_id uuid)
returns table (encounter_id uuid, practitioner_role_id uuid, organization_id uuid, acquired_at timestamptz, heartbeat_at timestamptz, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_encounter public.encounters%rowtype; v_role_id uuid; v_org_id uuid; v_existing public.encounter_locks%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  select encounter.* into v_encounter from public.encounters encounter where encounter.id = p_encounter_id for update;
  if not found then raise exception 'Encounter not found.' using errcode = 'P0002'; end if;
  select role.id, role.organization_id into v_role_id, v_org_id
  from public.practitioner_roles role join public.practitioners practitioner on practitioner.id = role.practitioner_id
  where practitioner.auth_user_id = auth.uid() and practitioner.active and role.active and role.organization_id = v_encounter.organization_id and role.role_code in ('doctor', 'specialist');
  if v_role_id is null then raise exception 'A doctor role is required.' using errcode = '42501'; end if;
  perform public.assert_encounter_writer(v_encounter, v_role_id);
  select lock_row.* into v_existing from public.encounter_locks lock_row where lock_row.encounter_id = p_encounter_id for update;
  if v_existing.encounter_id is not null and v_existing.expires_at > now() and v_existing.practitioner_role_id <> v_role_id then
    raise exception 'The encounter is currently held by another practitioner.' using errcode = '55P03';
  end if;
  insert into public.encounter_locks (encounter_id, practitioner_role_id, organization_id, acquired_at, heartbeat_at, expires_at)
  values (p_encounter_id, v_role_id, v_encounter.organization_id, coalesce(v_existing.acquired_at, now()), now(), now() + interval '60 seconds')
  on conflict on constraint encounter_locks_pkey do update set practitioner_role_id = excluded.practitioner_role_id, organization_id = excluded.organization_id, acquired_at = excluded.acquired_at, heartbeat_at = excluded.heartbeat_at, expires_at = excluded.expires_at;
  select lock_row.* into v_existing
  from public.encounter_locks lock_row
  where lock_row.encounter_id = p_encounter_id;
  return query select v_existing.encounter_id, v_existing.practitioner_role_id, v_existing.organization_id, v_existing.acquired_at, v_existing.heartbeat_at, v_existing.expires_at;
end;
$$;

create or replace function public.heartbeat_encounter_lock(p_encounter_id uuid)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare v_role_id uuid; v_expires_at timestamptz;
begin
  select role.id into v_role_id from public.practitioner_roles role join public.practitioners practitioner on practitioner.id = role.practitioner_id where practitioner.auth_user_id = auth.uid() and practitioner.active and role.active and role.organization_id = (select organization_id from public.encounters where id = p_encounter_id) and role.role_code in ('doctor', 'specialist');
  update public.encounter_locks lock_row set heartbeat_at = now(), expires_at = now() + interval '60 seconds' where lock_row.encounter_id = p_encounter_id and lock_row.practitioner_role_id = v_role_id and lock_row.expires_at > now() returning lock_row.expires_at into v_expires_at;
  if v_expires_at is null then raise exception 'The encounter lock is no longer held.' using errcode = '42501'; end if;
  return v_expires_at;
end;
$$;

create or replace function public.release_encounter_lock(p_encounter_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_role_id uuid;
begin
  select role.id into v_role_id from public.practitioner_roles role join public.practitioners practitioner on practitioner.id = role.practitioner_id where practitioner.auth_user_id = auth.uid() and practitioner.active and role.active and role.organization_id = (select organization_id from public.encounters where id = p_encounter_id) and role.role_code in ('doctor', 'specialist');
  delete from public.encounter_locks lock_row where lock_row.encounter_id = p_encounter_id and lock_row.practitioner_role_id = v_role_id;
end;
$$;

create or replace function public.get_encounter_lock(p_encounter_id uuid)
returns table (encounter_id uuid, practitioner_role_id uuid, practitioner_name text, heartbeat_at timestamptz, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select lock_row.encounter_id, lock_row.practitioner_role_id, coalesce(practitioner.name ->> 'text', 'Another practitioner'), lock_row.heartbeat_at, lock_row.expires_at
  from public.encounter_locks lock_row
  join public.practitioner_roles role on role.id = lock_row.practitioner_role_id and role.organization_id = lock_row.organization_id
  join public.practitioners practitioner on practitioner.id = role.practitioner_id
  where lock_row.encounter_id = p_encounter_id and lock_row.expires_at > now() and public.can_access_organization(lock_row.organization_id);
$$;

create or replace function public.refresh_doctor_payout(p_encounter_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare selected_encounter public.encounters%rowtype; selected_event public.billing_events%rowtype; payout_total numeric(14,2); payout_currency text; share_bps integer; has_professional_fee boolean; v_assigned_role_id uuid; v_performed_role_id uuid;
begin
  select * into selected_encounter from public.encounters where id = p_encounter_id;
  if selected_encounter.id is null then return; end if;
  select appointment.original_assigned_practitioner_role_id into v_assigned_role_id from public.appointments appointment where appointment.id = selected_encounter.appointment_id and appointment.organization_id = selected_encounter.organization_id;
  v_assigned_role_id := coalesce(v_assigned_role_id, selected_encounter.practitioner_role_id);
  if v_assigned_role_id is null then return; end if;
  select practitioner_role.id into v_performed_role_id from public.practitioner_roles practitioner_role join public.practitioners practitioner on practitioner.id = practitioner_role.practitioner_id where practitioner.auth_user_id = auth.uid() and practitioner_role.organization_id = selected_encounter.organization_id and practitioner_role.active and practitioner.active limit 1;
  select * into selected_event from public.billing_events where encounter_id = p_encounter_id and status <> 'cancelled' order by finalized_at desc nulls last, created_at desc limit 1;
  if selected_encounter.status <> 'finished' or selected_event.id is null or selected_event.status <> 'finalized' then return; end if;
  select exists (select 1 from public.billing_line_items where billing_event_id = selected_event.id and source_type = 'professional_fee'), coalesce(sum(line_total), 0), coalesce(min(currency), 'PHP') into has_professional_fee, payout_total, payout_currency from public.billing_line_items where billing_event_id = selected_event.id and source_type = 'professional_fee';
  if not has_professional_fee then select coalesce(sum(line_total), 0), coalesce(min(currency), 'PHP') into payout_total, payout_currency from public.billing_line_items where billing_event_id = selected_event.id and source_type = 'clinic_service'; end if;
  if payout_total < 0 or (not has_professional_fee and payout_total <= 0) then return; end if;
  select coalesce((select setting.share_basis_points from public.practitioner_payout_settings setting where setting.organization_id = selected_encounter.organization_id and setting.practitioner_role_id = v_assigned_role_id and setting.active), 10000) into share_bps;
  insert into public.doctor_payouts (organization_id, practitioner_role_id, assigned_practitioner_role_id, performed_by_practitioner_role_id, encounter_id, billing_event_id, gross_service_amount, share_basis_points, payout_amount, currency)
  values (selected_encounter.organization_id, v_assigned_role_id, v_assigned_role_id, coalesce(v_performed_role_id, v_assigned_role_id), selected_encounter.id, selected_event.id, payout_total, share_bps, round(payout_total * share_bps / 10000.0, 2), payout_currency)
  on conflict (encounter_id) do update set billing_event_id = excluded.billing_event_id, practitioner_role_id = excluded.practitioner_role_id, assigned_practitioner_role_id = excluded.assigned_practitioner_role_id, performed_by_practitioner_role_id = excluded.performed_by_practitioner_role_id, gross_service_amount = excluded.gross_service_amount, share_basis_points = excluded.share_basis_points, payout_amount = excluded.payout_amount, currency = excluded.currency, status = 'pending', paid_at = null, paid_by = null, payment_reference = null where public.doctor_payouts.status in ('pending', 'void');
end;
$$;

revoke all on function public.assert_encounter_writer(public.encounters, uuid) from public, anon, authenticated;
revoke all on function public.raise_encounter_version_conflict(integer) from public, anon, authenticated;
revoke all on function public.add_soap_note(uuid, text, uuid, integer) from public, anon, authenticated;
revoke all on function public.add_soap_note(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.add_soap_observation(uuid, text, text, uuid, integer) from public, anon, authenticated;
revoke all on function public.add_soap_observation(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.finish_clinical_encounter(uuid, integer) from public, anon, authenticated;
revoke all on function public.finish_clinical_encounter(uuid) from public, anon, authenticated;
revoke all on function public.acquire_encounter_lock(uuid) from public, anon, authenticated;
revoke all on function public.heartbeat_encounter_lock(uuid) from public, anon, authenticated;
revoke all on function public.release_encounter_lock(uuid) from public, anon, authenticated;
revoke all on function public.get_encounter_lock(uuid) from public, anon, authenticated;
grant execute on function public.add_soap_note(uuid, text, uuid, integer) to authenticated;
grant execute on function public.add_soap_note(uuid, text, uuid) to authenticated;
grant execute on function public.add_soap_observation(uuid, text, text, uuid, integer) to authenticated;
grant execute on function public.add_soap_observation(uuid, text, text, uuid) to authenticated;
grant execute on function public.finish_clinical_encounter(uuid, integer) to authenticated;
grant execute on function public.finish_clinical_encounter(uuid) to authenticated;
grant execute on function public.acquire_encounter_lock(uuid) to authenticated;
grant execute on function public.heartbeat_encounter_lock(uuid) to authenticated;
grant execute on function public.release_encounter_lock(uuid) to authenticated;
grant execute on function public.get_encounter_lock(uuid) to authenticated;

comment on column public.encounters.version is 'Optimistic concurrency version; incremented by encounter write RPCs.';
comment on table public.encounter_locks is 'Advisory 60-second encounter presence; never blocks clinical writes.';
comment on column public.doctor_payouts.assigned_practitioner_role_id is 'Original appointment assignee; payout owner by default.';
comment on column public.doctor_payouts.performed_by_practitioner_role_id is 'Practitioner who completed the encounter; coverage split logic remains TODO.';
