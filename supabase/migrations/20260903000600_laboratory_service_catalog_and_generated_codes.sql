-- Laboratory service catalog and system-owned operational codes.

create table public.laboratory_services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  lab_cost numeric(12,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code),
  check (length(btrim(code)) between 1 and 80),
  check (length(btrim(name)) between 2 and 160),
  check (lab_cost >= 0)
);

create index laboratory_services_org_active_name_idx
  on public.laboratory_services (organization_id, active, name);

create trigger laboratory_services_set_updated_at before update on public.laboratory_services
  for each row execute function public.set_updated_at();
create trigger laboratory_services_audit after insert or update or delete on public.laboratory_services
  for each row execute function public.write_audit_log();

alter table public.laboratory_services enable row level security;

create or replace function public.system_generated_code(p_prefix text)
returns text language sql volatile set search_path = public as $$
  select upper(p_prefix) || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
$$;

create or replace function public.assign_system_codes()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if tg_table_name in ('laboratory_services', 'departments', 'clinic_services') then new.code := old.code;
    elsif tg_table_name = 'inventory_items' then new.sku := old.sku;
    end if;
    return new;
  end if;
  if tg_table_name = 'laboratory_services' then
    new.code := public.system_generated_code('LAB');
  elsif tg_table_name = 'departments' then
    new.code := public.system_generated_code('DEPT');
  elsif tg_table_name = 'inventory_items' then
    new.sku := public.system_generated_code('SKU');
  elsif tg_table_name = 'clinic_services' then
    new.code := public.system_generated_code('SERVICE');
  end if;
  return new;
end;
$$;

create trigger laboratory_services_assign_system_code before insert on public.laboratory_services
  for each row execute function public.assign_system_codes();
create trigger departments_assign_system_code before insert on public.departments
  for each row execute function public.assign_system_codes();
create trigger inventory_items_assign_system_sku before insert on public.inventory_items
  for each row execute function public.assign_system_codes();
create trigger clinic_services_assign_system_code before insert on public.clinic_services
  for each row execute function public.assign_system_codes();
create trigger clinic_services_preserve_system_code before update on public.clinic_services
  for each row execute function public.assign_system_codes();

create policy laboratory_services_select on public.laboratory_services for select to authenticated
  using (public.can_access_organization(organization_id));

create or replace function public.can_manage_laboratory_services(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select public.has_organization_permission(p_organization_id, 'can_manage_laboratory_services');
$$;

create policy laboratory_services_manage on public.laboratory_services for all to authenticated
  using (public.can_manage_laboratory_services(organization_id))
  with check (public.can_manage_laboratory_services(organization_id));

insert into public.role_permissions (role_id, organization_id, permission)
select role.id, null, 'can_manage_laboratory_services'
from public.roles role where role.name in ('admin', 'owner')
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
    'can_update_referrals', 'can_manage_laboratory_services', 'role_permissions_configured'
  ));

insert into public.clinic_role_permission_overrides (organization_id, role_code, permission)
select organization.id, role_code, 'can_manage_laboratory_services'
from public.organizations organization cross join (values ('admin'), ('owner')) as roles(role_code)
on conflict (organization_id, role_code, permission) do nothing;

create or replace function public.list_laboratory_services(p_organization_id uuid)
returns table (id uuid, code text, name text, lab_cost numeric, active boolean)
language sql stable security definer set search_path = public, auth as $$
  select service.id, service.code, service.name, service.lab_cost, service.active
  from public.laboratory_services service
  where service.organization_id = p_organization_id
    and public.can_access_organization(p_organization_id)
  order by service.active desc, service.name;
$$;

create or replace function public.save_laboratory_service(
  p_service_id uuid, p_organization_id uuid, p_name text, p_lab_cost numeric, p_active boolean default true
) returns uuid language plpgsql security definer set search_path = public, auth as $$
declare v_id uuid;
begin
  if not public.can_manage_laboratory_services(p_organization_id) then
    raise exception 'Laboratory service management permission is required.' using errcode = '42501';
  end if;
  if length(coalesce(btrim(p_name), '')) not between 2 and 160 or coalesce(p_lab_cost, -1) < 0 then
    raise exception 'Laboratory service name and cost are invalid.' using errcode = '22023';
  end if;
  if p_service_id is null then
    insert into public.laboratory_services (organization_id, code, name, lab_cost, active)
    values (p_organization_id, '', btrim(p_name), p_lab_cost, coalesce(p_active, true)) returning id into v_id;
  else
    update public.laboratory_services set name=btrim(p_name), lab_cost=p_lab_cost, active=coalesce(p_active, true)
    where id=p_service_id and organization_id=p_organization_id returning id into v_id;
    if v_id is null then raise exception 'Laboratory service not found.' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.create_diagnostic_service_request(
  p_encounter_id uuid, p_category text, p_code text, p_code_display text,
  p_priority text default 'routine', p_note text default null,
  p_performer_practitioner_role_id uuid default null, p_laboratory_service_id uuid default null
) returns uuid language plpgsql security definer set search_path = public, auth as $$
declare v_encounter public.encounters%rowtype; v_requester_id uuid; v_request_id uuid;
declare v_code text; v_display text;
begin
  select * into v_encounter from public.encounters where id=p_encounter_id;
  if not found or v_encounter.status not in ('in_progress', 'finished') then raise exception 'An active or completed encounter is required.' using errcode='22023'; end if;
  if not public.has_organization_permission(v_encounter.organization_id, 'can_order_diagnostics') then raise exception 'Diagnostic ordering permission is required.' using errcode='42501'; end if;
  if p_category not in ('laboratory', 'referral') or p_priority not in ('routine', 'urgent', 'asap', 'stat') then raise exception 'A valid category and priority are required.' using errcode='22023'; end if;
  if p_category='laboratory' then
    select code, name into v_code, v_display from public.laboratory_services
    where id=p_laboratory_service_id and organization_id=v_encounter.organization_id and active;
    if v_code is null then raise exception 'Select an active laboratory service.' using errcode='22023'; end if;
    if p_performer_practitioner_role_id is not null then raise exception 'Laboratory orders route to the clinic lab worklist.' using errcode='22023'; end if;
  else
    if p_performer_practitioner_role_id is null or not exists (select 1 from public.practitioner_roles pr where pr.id=p_performer_practitioner_role_id and pr.organization_id=v_encounter.organization_id and pr.role_code='specialist' and pr.active) then raise exception 'Referrals require an active specialist in the same clinic.' using errcode='22023'; end if;
    v_code := public.system_generated_code('REF');
    v_display := 'Specialist referral';
  end if;
  select p.id into v_requester_id from public.practitioners p join public.practitioner_roles pr on pr.practitioner_id=p.id where p.auth_user_id=auth.uid() and p.active and pr.active and pr.organization_id=v_encounter.organization_id limit 1;
  if v_requester_id is null then raise exception 'An active clinic practitioner is required.' using errcode='42501'; end if;
  insert into public.service_requests (organization_id, patient_id, encounter_id, requester_practitioner_id, status, category, priority, code, code_display, performer_organization_id, performer_practitioner_role_id, note)
  values (v_encounter.organization_id, v_encounter.patient_id, v_encounter.id, v_requester_id, 'active', p_category, p_priority, v_code, v_display, case when p_category='laboratory' then v_encounter.organization_id else null end, p_performer_practitioner_role_id, nullif(btrim(p_note), '')) returning id into v_request_id;
  return v_request_id;
end;
$$;

create or replace function public.record_diagnostic_report(
  p_service_request_id uuid, p_conclusion text, p_results jsonb
) returns uuid language plpgsql security definer set search_path = public, auth as $$
declare v_request public.service_requests%rowtype; v_performer_id uuid; v_report_id uuid; v_result jsonb; v_requester_user_id uuid;
begin
  select * into v_request from public.service_requests where id=p_service_request_id for update;
  if not found or v_request.category<>'laboratory' or v_request.status<>'active' then raise exception 'An active laboratory request is required.' using errcode='22023'; end if;
  if not public.has_organization_permission(v_request.organization_id, 'can_record_lab_results') then raise exception 'Laboratory result permission is required.' using errcode='42501'; end if;
  if jsonb_typeof(p_results)<>'array' or jsonb_array_length(p_results)=0 then raise exception 'At least one structured result is required.' using errcode='22023'; end if;
  select p.id into v_performer_id from public.practitioners p join public.practitioner_roles pr on pr.practitioner_id=p.id where p.auth_user_id=auth.uid() and p.active and pr.active and pr.organization_id=v_request.organization_id limit 1;
  insert into public.diagnostic_reports (organization_id, patient_id, encounter_id, based_on_service_request_id, status, category_codes, code, code_display, effective_at, issued_at, performer_organization_id, conclusion)
  values (v_request.organization_id, v_request.patient_id, v_request.encounter_id, v_request.id, 'final', '[{"code":"LAB"}]', v_request.code, v_request.code_display, now(), now(), v_request.organization_id, nullif(btrim(p_conclusion), '')) returning id into v_report_id;
  for v_result in select value from jsonb_array_elements(p_results) loop
    if length(coalesce(btrim(v_result->>'display'), ''))<2 or not (v_result ? 'value') then raise exception 'Every result requires a name and value.' using errcode='22023'; end if;
    insert into public.observations (organization_id, patient_id, encounter_id, diagnostic_report_id, performer_practitioner_id, status, category_codes, code, code_display, effective_at, issued_at, value, value_unit, reference_range, note)
    values (v_request.organization_id, v_request.patient_id, v_request.encounter_id, v_report_id, v_performer_id, 'final', '[{"code":"laboratory"}]', public.system_generated_code('RESULT'), btrim(v_result->>'display'), now(), now(), v_result->'value', nullif(btrim(v_result->>'unit'), ''), case when v_result ? 'referenceRange' then jsonb_build_array(v_result->'referenceRange') else '[]'::jsonb end, nullif(btrim(v_result->>'note'), ''));
  end loop;
  update public.service_requests set status='completed', updated_at=now() where id=v_request.id;
  select auth_user_id into v_requester_user_id from public.practitioners where id=v_request.requester_practitioner_id;
  if v_requester_user_id is not null then insert into public.clinical_notifications (organization_id, recipient_user_id, service_request_id, diagnostic_report_id, kind, title, message) values (v_request.organization_id, v_requester_user_id, v_request.id, v_report_id, 'diagnostic_result', 'Laboratory result ready', coalesce(v_request.code_display, v_request.code) || ' has a final result.'); end if;
  return v_report_id;
end;
$$;

create or replace function public.get_specialist_options(p_organization_id uuid)
returns table (practitioner_role_id uuid, display_name text, specialty jsonb, organization_name text)
language sql stable security definer set search_path = public, auth as $$
  select pr.id, coalesce(p.name->>'text', 'Specialist'), pr.specialty_codes, organization.name
  from public.practitioner_roles pr join public.practitioners p on p.id=pr.practitioner_id
  join public.organizations organization on organization.id=pr.organization_id
  where pr.organization_id=p_organization_id and pr.role_code='specialist' and pr.active
    and public.can_access_organization(p_organization_id);
$$;

grant select, insert, update, delete on public.laboratory_services to authenticated;
grant execute on function public.list_laboratory_services(uuid), public.save_laboratory_service(uuid, uuid, text, numeric, boolean), public.get_specialist_options(uuid) to authenticated;

-- New custom roles receive a stable internal code; operators only provide the display name.
create or replace function public.save_clinic_role_definition(
  p_organization_id uuid, p_code text, p_name text, p_permissions text[]
) returns void language plpgsql security definer set search_path = public, auth as $$
declare
  normalized_code text := coalesce(nullif(lower(btrim(p_code)), ''), lower(replace(public.system_generated_code('role'), '-', '_')));
  normalized_name text := btrim(p_name);
  allowed_permissions text[] := array[
    'can_access_admin_portal', 'can_access_provider_portal', 'can_manage_appointments',
    'can_record_triage', 'can_start_consultation', 'can_manage_provider_schedule',
    'can_manage_staff_roles', 'can_view_inventory', 'can_manage_inventory',
    'can_tag_inventory_usage', 'can_order_diagnostics', 'can_view_diagnostics',
    'can_view_lab_worklist', 'can_record_lab_results', 'can_view_referrals',
    'can_update_referrals', 'can_manage_laboratory_services'
  ];
begin
  if not public.can_manage_organization_accounts(p_organization_id) then raise exception 'Role management permission is required.' using errcode='42501'; end if;
  if normalized_code !~ '^[a-z][a-z0-9_]{1,39}$' or length(normalized_name) not between 2 and 80
    or exists (select 1 from unnest(coalesce(p_permissions, '{}'::text[])) permission where permission <> all(allowed_permissions)) then raise exception 'Role details or permissions are invalid.' using errcode='22023'; end if;
  if not exists (select 1 from public.roles role where role.name=normalized_code) then
    insert into public.clinic_role_definitions (organization_id, code, name) values (p_organization_id, normalized_code, normalized_name)
    on conflict (organization_id, code) do update set name=excluded.name, active=true;
  end if;
  delete from public.clinic_role_permission_overrides where organization_id=p_organization_id and role_code=normalized_code;
  insert into public.clinic_role_permission_overrides (organization_id, role_code, permission)
  select p_organization_id, normalized_code, permission from unnest(array_append(coalesce(p_permissions, '{}'::text[]), 'role_permissions_configured')) permission;
end;
$$;

-- Provider services retain the same RPC contract while the database owns the code.
create or replace function public.save_provider_clinic_service(
  p_service_id uuid, p_organization_id uuid, p_code text, p_name text,
  p_description text, p_duration_minutes integer, p_base_price numeric, p_booking_enabled boolean
) returns uuid language plpgsql security definer set search_path = public, auth as $$
declare caller_role public.practitioner_roles%rowtype; existing_service public.clinic_services%rowtype; saved_id uuid;
begin
  select pr.* into caller_role from public.practitioner_roles pr join public.practitioners p on p.id=pr.practitioner_id
  where p.auth_user_id=auth.uid() and p.active and pr.active and pr.organization_id=p_organization_id and pr.role_code in ('doctor', 'specialist') order by pr.created_at limit 1;
  if caller_role.id is null then raise exception 'An active doctor role at this clinic is required.' using errcode='42501'; end if;
  if nullif(btrim(p_name), '') is null or length(btrim(p_name))>160 or length(coalesce(p_description, ''))>500 or p_duration_minutes not between 5 and 480 or p_base_price<0 then raise exception 'Service values are invalid.' using errcode='22023'; end if;
  if p_service_id is null then
    insert into public.clinic_services (organization_id, owner_practitioner_role_id, code, name, description, duration_minutes, base_price, currency, booking_enabled)
    values (p_organization_id, caller_role.id, '', btrim(p_name), nullif(btrim(p_description), ''), p_duration_minutes, p_base_price, 'PHP', coalesce(p_booking_enabled, false)) returning id into saved_id;
  else
    select * into existing_service from public.clinic_services where id=p_service_id and organization_id=p_organization_id and owner_practitioner_role_id=caller_role.id and active for update;
    if existing_service.id is null then raise exception 'Editable provider service not found.' using errcode='P0002'; end if;
    update public.clinic_services set name=btrim(p_name), description=nullif(btrim(p_description), ''), duration_minutes=p_duration_minutes, base_price=p_base_price, booking_enabled=coalesce(p_booking_enabled, false) where id=p_service_id returning id into saved_id;
    if existing_service.duration_minutes is distinct from p_duration_minutes or existing_service.name is distinct from btrim(p_name) or existing_service.booking_enabled is distinct from coalesce(p_booking_enabled, false) then
      delete from public.provider_weekly_availability where clinic_service_id=saved_id and practitioner_role_id=caller_role.id;
      delete from public.appointment_slots where clinic_service_id=saved_id and practitioner_role_id=caller_role.id and appointment_id is null and status='free' and start_at>now();
    end if;
  end if;
  return saved_id;
end;
$$;
