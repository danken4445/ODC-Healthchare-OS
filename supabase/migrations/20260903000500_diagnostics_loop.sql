-- Loop 4: unified FHIR ServiceRequest workflow for laboratory orders and referrals.
-- DiagnosticReport + Observation result entry is atomic and notifies the requester.

create table public.clinical_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  recipient_user_id uuid not null references auth.users(id),
  service_request_id uuid not null references public.service_requests(id),
  diagnostic_report_id uuid references public.diagnostic_reports(id),
  kind text not null check (kind in ('diagnostic_result', 'referral_update')),
  title text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (length(btrim(title)) between 2 and 160),
  check (length(btrim(message)) between 2 and 500)
);

create index service_requests_worklist_idx
  on public.service_requests (organization_id, category, status, priority, created_at);
create index service_requests_performer_idx
  on public.service_requests (performer_practitioner_role_id, status, created_at);
create unique index diagnostic_reports_one_per_request_idx
  on public.diagnostic_reports (based_on_service_request_id)
  where based_on_service_request_id is not null;
create index diagnostic_reports_patient_idx
  on public.diagnostic_reports (organization_id, patient_id, issued_at desc);
create index clinical_notifications_recipient_idx
  on public.clinical_notifications (recipient_user_id, read_at, created_at desc);

create or replace function public.enforce_diagnostics_tenant_integrity()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_table_name = 'service_requests' then
    if not exists (select 1 from public.patients p where p.id=new.patient_id and p.organization_id=new.organization_id)
      or (new.encounter_id is not null and not exists (select 1 from public.encounters e where e.id=new.encounter_id and e.patient_id=new.patient_id and e.organization_id=new.organization_id))
      or (new.requester_practitioner_id is not null and not exists (select 1 from public.practitioners p where p.id=new.requester_practitioner_id and p.organization_id=new.organization_id))
      or (new.performer_organization_id is not null and new.performer_organization_id <> new.organization_id)
      or (new.performer_practitioner_role_id is not null and not exists (select 1 from public.practitioner_roles pr where pr.id=new.performer_practitioner_role_id and pr.organization_id=new.organization_id)) then
      raise exception 'ServiceRequest relationships must share one clinic and patient.' using errcode='23514';
    end if;
  elsif tg_table_name = 'diagnostic_reports' then
    if not exists (select 1 from public.patients p where p.id=new.patient_id and p.organization_id=new.organization_id)
      or (new.encounter_id is not null and not exists (select 1 from public.encounters e where e.id=new.encounter_id and e.patient_id=new.patient_id and e.organization_id=new.organization_id))
      or (new.based_on_service_request_id is not null and not exists (select 1 from public.service_requests sr where sr.id=new.based_on_service_request_id and sr.patient_id=new.patient_id and sr.organization_id=new.organization_id))
      or (new.performer_organization_id is not null and new.performer_organization_id <> new.organization_id) then
      raise exception 'DiagnosticReport relationships must share one clinic and patient.' using errcode='23514';
    end if;
  elsif tg_table_name = 'observations' and new.diagnostic_report_id is not null then
    if not exists (select 1 from public.diagnostic_reports dr where dr.id=new.diagnostic_report_id and dr.patient_id=new.patient_id and dr.organization_id=new.organization_id and dr.encounter_id is not distinct from new.encounter_id) then
      raise exception 'Diagnostic Observation must match its report clinic, patient, and encounter.' using errcode='23514';
    end if;
  elsif tg_table_name = 'clinical_notifications' then
    if not exists (select 1 from public.service_requests sr where sr.id=new.service_request_id and sr.organization_id=new.organization_id)
      or (new.diagnostic_report_id is not null and not exists (select 1 from public.diagnostic_reports dr where dr.id=new.diagnostic_report_id and dr.organization_id=new.organization_id and dr.based_on_service_request_id=new.service_request_id)) then
      raise exception 'Notification relationships must share one clinic and request.' using errcode='23514';
    end if;
  end if;
  return new;
end;
$$;

-- These two trigger names were created by the foundational access-control
-- migration. Replace them so diagnostics-specific relationship checks run.
drop trigger if exists service_requests_tenant_integrity on public.service_requests;
drop trigger if exists diagnostic_reports_tenant_integrity on public.diagnostic_reports;

create trigger service_requests_tenant_integrity before insert or update on public.service_requests
  for each row execute function public.enforce_diagnostics_tenant_integrity();
create trigger diagnostic_reports_tenant_integrity before insert or update on public.diagnostic_reports
  for each row execute function public.enforce_diagnostics_tenant_integrity();
create trigger diagnostic_observations_tenant_integrity before insert or update on public.observations
  for each row execute function public.enforce_diagnostics_tenant_integrity();
create trigger clinical_notifications_tenant_integrity before insert or update on public.clinical_notifications
  for each row execute function public.enforce_diagnostics_tenant_integrity();

insert into public.role_permissions (role_id, organization_id, permission)
select role.id, null, grant_row.permission
from public.roles role
join (values
  ('doctor', 'can_order_diagnostics'),
  ('doctor', 'can_view_diagnostics'),
  ('nurse', 'can_order_diagnostics'),
  ('front_desk', 'can_order_diagnostics'),
  ('lab_staff', 'can_access_provider_portal'),
  ('lab_staff', 'can_view_lab_worklist'),
  ('lab_staff', 'can_record_lab_results'),
  ('specialist', 'can_view_referrals'),
  ('specialist', 'can_update_referrals'),
  ('admin', 'can_view_diagnostics'),
  ('owner', 'can_view_diagnostics')
) as grant_row(role_name, permission) on grant_row.role_name = role.name
on conflict (role_id, organization_id, permission) do nothing;

alter table public.clinic_role_permission_overrides
  drop constraint if exists clinic_role_permission_overrides_permission_check;
alter table public.clinic_role_permission_overrides
  add constraint clinic_role_permission_overrides_permission_check check (permission in (
    'can_access_admin_portal', 'can_access_provider_portal', 'can_manage_appointments',
    'can_record_triage', 'can_start_consultation', 'can_manage_provider_schedule',
    'can_manage_staff_roles', 'can_view_inventory', 'can_manage_inventory',
    'can_tag_inventory_usage', 'can_order_diagnostics', 'can_view_diagnostics',
    'can_view_lab_worklist', 'can_record_lab_results', 'can_view_referrals',
    'can_update_referrals', 'role_permissions_configured'
  ));

insert into public.clinic_role_permission_overrides (organization_id, role_code, permission)
select organization.id, grant_row.role_code, grant_row.permission
from public.organizations organization
cross join (values
  ('doctor', 'can_order_diagnostics'), ('doctor', 'can_view_diagnostics'),
  ('nurse', 'can_order_diagnostics'), ('front_desk', 'can_order_diagnostics'),
  ('lab_staff', 'can_access_provider_portal'), ('lab_staff', 'can_view_lab_worklist'),
  ('lab_staff', 'can_record_lab_results'), ('specialist', 'can_view_referrals'),
  ('specialist', 'can_update_referrals'), ('admin', 'can_view_diagnostics'),
  ('owner', 'can_view_diagnostics')
) as grant_row(role_code, permission)
on conflict (organization_id, role_code, permission) do nothing;

create or replace function public.save_clinic_role_definition(
  p_organization_id uuid, p_code text, p_name text, p_permissions text[]
) returns void language plpgsql security definer set search_path = public, auth as $$
declare
  normalized_code text := lower(btrim(p_code)); normalized_name text := btrim(p_name);
  allowed_permissions text[] := array[
    'can_access_admin_portal', 'can_access_provider_portal', 'can_manage_appointments',
    'can_record_triage', 'can_start_consultation', 'can_manage_provider_schedule',
    'can_manage_staff_roles', 'can_view_inventory', 'can_manage_inventory',
    'can_tag_inventory_usage', 'can_order_diagnostics', 'can_view_diagnostics',
    'can_view_lab_worklist', 'can_record_lab_results', 'can_view_referrals',
    'can_update_referrals'
  ];
begin
  if not public.can_manage_organization_accounts(p_organization_id) then raise exception 'Role management permission is required.' using errcode='42501'; end if;
  if normalized_code !~ '^[a-z][a-z0-9_]{1,39}$' or length(normalized_name) not between 2 and 80
    or exists (select 1 from unnest(coalesce(p_permissions, '{}'::text[])) permission where permission <> all(allowed_permissions)) then
    raise exception 'Role details or permissions are invalid.' using errcode='22023';
  end if;
  if not exists (select 1 from public.roles role where role.name=normalized_code) then
    insert into public.clinic_role_definitions (organization_id, code, name) values (p_organization_id, normalized_code, normalized_name)
    on conflict (organization_id, code) do update set name=excluded.name, active=true;
  end if;
  delete from public.clinic_role_permission_overrides where organization_id=p_organization_id and role_code=normalized_code;
  insert into public.clinic_role_permission_overrides (organization_id, role_code, permission)
  select p_organization_id, normalized_code, permission
  from unnest(array_append(coalesce(p_permissions, '{}'::text[]), 'role_permissions_configured')) permission;
end;
$$;

-- Lab staff now use the provider shell, while admission remains database authoritative.
create or replace function public.get_portal_access(p_portal text)
returns table (is_allowed boolean, is_superadmin boolean, organization_ids uuid[], role_codes text[])
language plpgsql stable security definer set search_path = public, auth
as $$
declare v_organizations uuid[] := '{}'::uuid[]; v_roles text[] := '{}'::text[]; v_superadmin boolean := public.is_superadmin();
begin
  if p_portal not in ('patient', 'provider', 'admin') then raise exception 'Unsupported portal.' using errcode = '22023'; end if;
  if p_portal = 'patient' then return query select not v_superadmin and not public.is_active_staff(), false, v_organizations, v_roles; return; end if;
  if p_portal = 'provider' then
    select coalesce(array_agg(distinct pr.organization_id), '{}'::uuid[]), coalesce(array_agg(distinct pr.role_code), '{}'::text[])
    into v_organizations, v_roles
    from public.practitioner_roles pr join public.practitioners p on p.id = pr.practitioner_id
    where p.auth_user_id = auth.uid() and p.active and pr.active
      and public.has_organization_permission(pr.organization_id, 'can_access_provider_portal');
    return query select cardinality(v_organizations) > 0, false, v_organizations, v_roles; return;
  end if;
  if v_superadmin then return query select true, true, v_organizations, array['superadmin']::text[]; return; end if;
  select coalesce(array_agg(distinct a.organization_id), '{}'::uuid[]), coalesce(array_agg(distinct a.role_code), '{}'::text[])
  into v_organizations, v_roles from (
    select pr.organization_id, pr.role_code from public.practitioner_roles pr join public.practitioners p on p.id = pr.practitioner_id
      where p.auth_user_id = auth.uid() and p.active and pr.active and public.has_organization_permission(pr.organization_id, 'can_access_admin_portal')
    union select ur.organization_id, r.name from public.user_roles ur join public.roles r on r.id = ur.role_id
      where ur.user_id = auth.uid() and public.has_organization_permission(ur.organization_id, 'can_access_admin_portal')
  ) a;
  return query select cardinality(v_organizations) > 0, false, v_organizations, v_roles;
end;
$$;

create or replace function public.create_diagnostic_service_request(
  p_encounter_id uuid,
  p_category text,
  p_code text,
  p_code_display text,
  p_priority text default 'routine',
  p_note text default null,
  p_performer_practitioner_role_id uuid default null
)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare
  v_encounter public.encounters%rowtype;
  v_requester_id uuid;
  v_request_id uuid;
begin
  select * into v_encounter from public.encounters where id = p_encounter_id;
  if not found or v_encounter.status not in ('in_progress', 'finished') then
    raise exception 'An active or completed encounter is required.' using errcode = '22023';
  end if;
  if not public.has_organization_permission(v_encounter.organization_id, 'can_order_diagnostics') then
    raise exception 'Diagnostic ordering permission is required.' using errcode = '42501';
  end if;
  if p_category not in ('laboratory', 'referral') or p_priority not in ('routine', 'urgent', 'asap', 'stat')
    or length(coalesce(btrim(p_code), '')) < 1 or length(coalesce(btrim(p_code_display), '')) < 2 then
    raise exception 'A valid category, priority, code, and display are required.' using errcode = '22023';
  end if;
  if p_category = 'referral' and (p_performer_practitioner_role_id is null or not exists (
    select 1 from public.practitioner_roles pr where pr.id = p_performer_practitioner_role_id
      and pr.organization_id = v_encounter.organization_id and pr.role_code = 'specialist' and pr.active
  )) then raise exception 'Referrals require an active specialist in the same clinic.' using errcode = '22023'; end if;
  if p_category = 'laboratory' and p_performer_practitioner_role_id is not null then
    raise exception 'Laboratory orders route to the clinic lab worklist.' using errcode = '22023';
  end if;
  select p.id into v_requester_id from public.practitioners p
  join public.practitioner_roles pr on pr.practitioner_id = p.id
  where p.auth_user_id = auth.uid() and p.active and pr.active
    and pr.organization_id = v_encounter.organization_id limit 1;
  if v_requester_id is null then raise exception 'An active clinic practitioner is required.' using errcode = '42501'; end if;

  insert into public.service_requests (
    organization_id, patient_id, encounter_id, requester_practitioner_id,
    status, category, priority, code, code_display,
    performer_organization_id, performer_practitioner_role_id, note
  ) values (
    v_encounter.organization_id, v_encounter.patient_id, v_encounter.id, v_requester_id,
    'active', p_category, p_priority, btrim(p_code), btrim(p_code_display),
    case when p_category = 'laboratory' then v_encounter.organization_id else null end,
    p_performer_practitioner_role_id, nullif(btrim(p_note), '')
  ) returning id into v_request_id;
  return v_request_id;
end;
$$;

create or replace function public.list_diagnostic_encounters(p_organization_id uuid)
returns table (id uuid, patient_name text, service_type text, period_start timestamptz, status public.encounter_status)
language sql stable security definer set search_path = public, auth as $$
  select encounter.id, coalesce(patient.name->>'text', 'Patient'), encounter.service_type,
    encounter.period_start, encounter.status
  from public.encounters encounter join public.patients patient on patient.id=encounter.patient_id
  where encounter.organization_id=p_organization_id and encounter.status in ('in_progress', 'finished')
    and public.has_organization_permission(p_organization_id, 'can_order_diagnostics')
  order by encounter.period_start desc;
$$;

create or replace function public.record_diagnostic_report(
  p_service_request_id uuid,
  p_conclusion text,
  p_results jsonb
)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare
  v_request public.service_requests%rowtype;
  v_performer_id uuid;
  v_report_id uuid;
  v_result jsonb;
  v_requester_user_id uuid;
begin
  select * into v_request from public.service_requests where id = p_service_request_id for update;
  if not found or v_request.category <> 'laboratory' or v_request.status <> 'active' then
    raise exception 'An active laboratory request is required.' using errcode = '22023';
  end if;
  if not public.has_organization_permission(v_request.organization_id, 'can_record_lab_results') then
    raise exception 'Laboratory result permission is required.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_results) <> 'array' or jsonb_array_length(p_results) = 0 then
    raise exception 'At least one structured result is required.' using errcode = '22023';
  end if;
  select p.id into v_performer_id from public.practitioners p
  join public.practitioner_roles pr on pr.practitioner_id = p.id
  where p.auth_user_id = auth.uid() and p.active and pr.active
    and pr.organization_id = v_request.organization_id limit 1;

  insert into public.diagnostic_reports (
    organization_id, patient_id, encounter_id, based_on_service_request_id,
    status, category_codes, code, code_display, effective_at, issued_at,
    performer_organization_id, conclusion
  ) values (
    v_request.organization_id, v_request.patient_id, v_request.encounter_id, v_request.id,
    'final', '[{"code":"LAB"}]', v_request.code, v_request.code_display, now(), now(),
    v_request.organization_id, nullif(btrim(p_conclusion), '')
  ) returning id into v_report_id;

  for v_result in select value from jsonb_array_elements(p_results) loop
    if length(coalesce(btrim(v_result->>'code'), '')) < 1
      or length(coalesce(btrim(v_result->>'display'), '')) < 2
      or not (v_result ? 'value') then
      raise exception 'Every result requires code, display, and value.' using errcode = '22023';
    end if;
    insert into public.observations (
      organization_id, patient_id, encounter_id, diagnostic_report_id,
      performer_practitioner_id, status, category_codes, code, code_display,
      effective_at, issued_at, value, value_unit, reference_range, note
    ) values (
      v_request.organization_id, v_request.patient_id, v_request.encounter_id, v_report_id,
      v_performer_id, 'final', '[{"code":"laboratory"}]', btrim(v_result->>'code'),
      btrim(v_result->>'display'), now(), now(), v_result->'value',
      nullif(btrim(v_result->>'unit'), ''),
      case when v_result ? 'referenceRange' then jsonb_build_array(v_result->'referenceRange') else '[]'::jsonb end,
      nullif(btrim(v_result->>'note'), '')
    );
  end loop;

  update public.service_requests set status = 'completed', updated_at = now() where id = v_request.id;
  select auth_user_id into v_requester_user_id from public.practitioners where id = v_request.requester_practitioner_id;
  if v_requester_user_id is not null then
    insert into public.clinical_notifications (
      organization_id, recipient_user_id, service_request_id, diagnostic_report_id, kind, title, message
    ) values (
      v_request.organization_id, v_requester_user_id, v_request.id, v_report_id,
      'diagnostic_result', 'Laboratory result ready', coalesce(v_request.code_display, v_request.code) || ' has a final result.'
    );
  end if;
  return v_report_id;
end;
$$;

create or replace function public.update_referral_status(p_service_request_id uuid, p_status public.request_status)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_request public.service_requests%rowtype; v_requester_user_id uuid;
begin
  select * into v_request from public.service_requests where id = p_service_request_id for update;
  if not found or v_request.category <> 'referral' or p_status not in ('active', 'on_hold', 'completed', 'revoked') then
    raise exception 'A referral and supported status are required.' using errcode = '22023';
  end if;
  if not public.has_organization_permission(v_request.organization_id, 'can_update_referrals') or not exists (
    select 1 from public.practitioner_roles pr join public.practitioners p on p.id = pr.practitioner_id
    where pr.id = v_request.performer_practitioner_role_id and p.auth_user_id = auth.uid()
      and pr.active and p.active
  ) then raise exception 'Only the routed specialist may update this referral.' using errcode = '42501'; end if;
  update public.service_requests set status = p_status, updated_at = now() where id = v_request.id;
  select auth_user_id into v_requester_user_id from public.practitioners where id = v_request.requester_practitioner_id;
  if v_requester_user_id is not null then
    insert into public.clinical_notifications (organization_id, recipient_user_id, service_request_id, kind, title, message)
    values (v_request.organization_id, v_requester_user_id, v_request.id, 'referral_update',
      'Referral updated', coalesce(v_request.code_display, v_request.code) || ' is now ' || replace(p_status::text, '_', ' ') || '.');
  end if;
end;
$$;

create or replace function public.mark_clinical_notification_read(p_notification_id uuid)
returns void language sql security definer set search_path = public, auth as $$
  update public.clinical_notifications set read_at = coalesce(read_at, now())
  where id = p_notification_id and recipient_user_id = auth.uid();
$$;

-- Replace broad placeholder policies with workflow-specific access.
drop policy if exists service_requests_select on public.service_requests;
drop policy if exists service_requests_manage on public.service_requests;
create policy service_requests_select on public.service_requests for select to authenticated using (
  public.is_patient_self(patient_id, organization_id)
  or public.has_organization_permission(organization_id, 'can_view_diagnostics')
  or (category = 'laboratory' and public.has_organization_permission(organization_id, 'can_view_lab_worklist'))
  or (category = 'referral' and public.has_organization_permission(organization_id, 'can_view_referrals') and exists (
    select 1 from public.practitioner_roles pr join public.practitioners p on p.id = pr.practitioner_id
    where pr.id = service_requests.performer_practitioner_role_id and p.auth_user_id = auth.uid() and pr.active and p.active
  ))
);

drop policy if exists diagnostic_reports_select on public.diagnostic_reports;
drop policy if exists diagnostic_reports_manage on public.diagnostic_reports;
create policy diagnostic_reports_select on public.diagnostic_reports for select to authenticated using (
  public.is_patient_self(patient_id, organization_id)
  or public.has_organization_permission(organization_id, 'can_view_diagnostics')
  or public.has_organization_permission(organization_id, 'can_view_lab_worklist')
);

drop policy if exists observations_select on public.observations;
create policy observations_select on public.observations for select to authenticated using (
  public.is_patient_self(patient_id, organization_id)
  or public.has_organization_permission(organization_id, 'can_start_consultation')
  or public.has_organization_permission(organization_id, 'can_record_triage')
  or (diagnostic_report_id is not null and public.has_organization_permission(organization_id, 'can_view_lab_worklist'))
  or public.has_organization_permission(organization_id, 'can_view_diagnostics')
);

alter table public.clinical_notifications enable row level security;
create policy clinical_notifications_select on public.clinical_notifications for select to authenticated
  using (recipient_user_id = auth.uid());
revoke insert, update, delete on public.service_requests, public.diagnostic_reports from authenticated;
revoke insert, update, delete on public.clinical_notifications from authenticated;
grant select on public.service_requests, public.diagnostic_reports, public.clinical_notifications to authenticated;

create trigger clinical_notifications_audit after insert or update or delete on public.clinical_notifications
  for each row execute function public.write_audit_log();

revoke all on function public.create_diagnostic_service_request(uuid, text, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.record_diagnostic_report(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.list_diagnostic_encounters(uuid) from public, anon, authenticated;
revoke all on function public.update_referral_status(uuid, public.request_status) from public, anon, authenticated;
revoke all on function public.mark_clinical_notification_read(uuid) from public, anon, authenticated;
grant execute on function public.create_diagnostic_service_request(uuid, text, text, text, text, text, uuid) to authenticated;
grant execute on function public.record_diagnostic_report(uuid, text, jsonb) to authenticated;
grant execute on function public.list_diagnostic_encounters(uuid) to authenticated;
grant execute on function public.update_referral_status(uuid, public.request_status) to authenticated;
grant execute on function public.mark_clinical_notification_read(uuid) to authenticated;

alter table public.service_requests replica identity full;
alter table public.diagnostic_reports replica identity full;
alter table public.clinical_notifications replica identity full;
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='service_requests') then alter publication supabase_realtime add table public.service_requests; end if;
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='diagnostic_reports') then alter publication supabase_realtime add table public.diagnostic_reports; end if;
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='clinical_notifications') then alter publication supabase_realtime add table public.clinical_notifications; end if;
  end if;
end $$;

comment on table public.clinical_notifications is 'Clinic-scoped, recipient-only notification for diagnostic results and referral state changes.';
