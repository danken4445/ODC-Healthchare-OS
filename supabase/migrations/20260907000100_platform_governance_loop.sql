-- Loop 7: Platform and Governance.
-- Administrative reporting and configuration are tenant scoped. Patient chart
-- reads use narrow RPCs which emit explicit read-audit events; configuration
-- writes are permission checked inside SECURITY DEFINER functions.

create table public.organization_branding (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  display_name text not null,
  tagline text,
  logo_url text,
  primary_color text not null default '#155EEF',
  accent_color text not null default '#12B76A',
  support_email text,
  support_phone text,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(btrim(display_name)) between 2 and 120),
  check (tagline is null or length(tagline) <= 240),
  check (logo_url is null or (length(logo_url) <= 1000 and logo_url ~ '^https://')),
  check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  check (support_email is null or length(support_email) <= 254),
  check (support_phone is null or length(support_phone) <= 40)
);

create table public.document_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  category text not null check (category in ('medical_certificate', 'prescription', 'referral', 'laboratory', 'invoice', 'general')),
  description text,
  body text not null,
  version integer not null default 1 check (version > 0),
  active boolean not null default true,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code),
  check (code ~ '^[A-Z][A-Z0-9_-]{1,49}$'),
  check (length(btrim(name)) between 2 and 120),
  check (length(body) between 1 and 20000)
);

create table public.organization_modules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  module_key text not null check (module_key in (
    'core_visit', 'clinical_documentation', 'inventory', 'diagnostics',
    'financial', 'remote_care', 'governance'
  )),
  enabled boolean not null default true,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, module_key)
);

create table public.patient_import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  file_name text not null,
  row_count integer not null check (row_count between 1 and 500),
  imported_count integer not null default 0 check (imported_count >= 0),
  error_count integer not null default 0 check (error_count >= 0),
  errors jsonb not null default '[]'::jsonb,
  imported_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (length(file_name) between 1 and 255),
  check (imported_count + error_count <= row_count)
);

create table public.clinic_user_access_status (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  active boolean not null default true,
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index document_templates_org_category_idx on public.document_templates (organization_id, category, active, name);
create index patient_import_batches_org_created_idx on public.patient_import_batches (organization_id, created_at desc);
create index clinic_user_access_status_org_active_idx on public.clinic_user_access_status (organization_id, active);

insert into public.organization_branding (organization_id, display_name)
select id, name from public.organizations on conflict (organization_id) do nothing;

insert into public.organization_modules (organization_id, module_key)
select organization.id, module.module_key
from public.organizations organization
cross join unnest(array[
  'core_visit', 'clinical_documentation', 'inventory', 'diagnostics',
  'financial', 'remote_care', 'governance'
]) module(module_key)
on conflict (organization_id, module_key) do nothing;

-- Extend the clinic role CMS with explicit governance capabilities.
alter table public.clinic_role_permission_overrides
  drop constraint if exists clinic_role_permission_overrides_permission_check;
alter table public.clinic_role_permission_overrides
  add constraint clinic_role_permission_overrides_permission_check check (permission in (
    'can_access_admin_portal', 'can_access_provider_portal', 'can_manage_appointments',
    'can_record_triage', 'can_start_consultation', 'can_manage_provider_schedule',
    'can_manage_staff_roles', 'can_view_inventory', 'can_manage_inventory',
    'can_tag_inventory_usage', 'can_order_diagnostics', 'can_view_diagnostics',
    'can_view_lab_worklist', 'can_record_lab_results', 'can_view_referrals',
    'can_update_referrals', 'can_manage_laboratory_services', 'role_permissions_configured',
    'can_manage_billing', 'can_view_billing', 'can_manage_pos',
    'can_manage_claims', 'can_view_claims', 'can_view_payouts', 'can_manage_payouts',
    'can_view_analytics', 'can_manage_patients', 'can_view_audit_log',
    'can_identify_patients', 'can_manage_clinic_branding', 'can_manage_service_catalog',
    'can_manage_document_templates', 'can_manage_feature_modules'
  ));

insert into public.clinic_role_permission_overrides (organization_id, role_code, permission)
select organization.id, grant_row.role_code, grant_row.permission
from public.organizations organization
cross join (values
  ('front_desk', 'can_identify_patients'),
  ('admin', 'can_view_analytics'), ('admin', 'can_manage_patients'),
  ('admin', 'can_view_audit_log'), ('admin', 'can_identify_patients'),
  ('admin', 'can_manage_clinic_branding'), ('admin', 'can_manage_service_catalog'),
  ('admin', 'can_manage_document_templates'), ('admin', 'can_manage_feature_modules'),
  ('owner', 'can_view_analytics'), ('owner', 'can_manage_patients'),
  ('owner', 'can_view_audit_log'), ('owner', 'can_identify_patients'),
  ('owner', 'can_manage_clinic_branding'), ('owner', 'can_manage_service_catalog'),
  ('owner', 'can_manage_document_templates'), ('owner', 'can_manage_feature_modules')
) as grant_row(role_code, permission)
on conflict (organization_id, role_code, permission) do nothing;

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
    'can_update_referrals', 'can_manage_laboratory_services',
    'can_manage_billing', 'can_view_billing', 'can_manage_pos',
    'can_manage_claims', 'can_view_claims', 'can_view_payouts', 'can_manage_payouts',
    'can_view_analytics', 'can_manage_patients', 'can_view_audit_log',
    'can_identify_patients', 'can_manage_clinic_branding', 'can_manage_service_catalog',
    'can_manage_document_templates', 'can_manage_feature_modules'
  ];
begin
  if not public.can_manage_organization_accounts(p_organization_id) then
    raise exception 'Role management permission is required.' using errcode = '42501';
  end if;
  if normalized_code !~ '^[a-z][a-z0-9_]{1,39}$'
    or length(normalized_name) not between 2 and 80
    or exists (
      select 1 from unnest(coalesce(p_permissions, '{}'::text[])) permission
      where permission <> all(allowed_permissions)
    ) then
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

-- A disabled clinic account cannot regain access through a second membership
-- table. This function remains the single permission decision used by portals.
create or replace function public.has_organization_permission(
  target_organization_id uuid,
  target_permission text
) returns boolean language sql stable security definer set search_path = public, auth as $$
  with enabled_caller as (
    select not exists (
      select 1 from public.clinic_user_access_status status
      where status.organization_id = target_organization_id
        and status.user_id = auth.uid() and not status.active
    ) as active
  ), caller_roles as (
    select practitioner_role.role_code
    from public.practitioner_roles practitioner_role
    join public.practitioners practitioner on practitioner.id = practitioner_role.practitioner_id
    cross join enabled_caller
    where enabled_caller.active and practitioner.auth_user_id = auth.uid()
      and practitioner.active and practitioner_role.active
      and practitioner_role.organization_id = target_organization_id
    union
    select role.name
    from public.user_roles membership
    join public.roles role on role.id = membership.role_id
    cross join enabled_caller
    where enabled_caller.active and membership.user_id = auth.uid()
      and membership.organization_id = target_organization_id
  )
  select exists (
    select 1 from caller_roles caller_role
    where exists (
      select 1 from public.clinic_role_permission_overrides role_override
      where role_override.organization_id = target_organization_id
        and role_override.role_code = caller_role.role_code
        and role_override.permission = target_permission
    ) or (
      not exists (
        select 1 from public.clinic_role_permission_overrides role_override
        where role_override.organization_id = target_organization_id
          and role_override.role_code = caller_role.role_code
      ) and exists (
        select 1 from public.role_permissions permission
        join public.roles role on role.id = permission.role_id
        where role.name = caller_role.role_code
          and permission.organization_id is null
          and permission.permission = target_permission
      )
    )
  );
$$;

create or replace function public.has_organization_role(target_organization_id uuid, allowed_roles text[])
returns boolean language sql stable security definer set search_path = public, auth as $$
  select not exists (
    select 1 from public.clinic_user_access_status status
    where status.organization_id = target_organization_id
      and status.user_id = auth.uid() and not status.active
  ) and (
    exists (
      select 1 from public.practitioner_roles practitioner_role
      join public.practitioners practitioner on practitioner.id = practitioner_role.practitioner_id
      where practitioner_role.organization_id = target_organization_id
        and practitioner_role.active and practitioner.active
        and practitioner.auth_user_id = auth.uid()
        and practitioner_role.role_code = any(allowed_roles)
    ) or exists (
      select 1 from public.user_roles membership
      join public.roles role on role.id = membership.role_id
      where membership.organization_id = target_organization_id
        and membership.user_id = auth.uid()
        and role.name in ('admin', 'owner') and role.name = any(allowed_roles)
    )
  );
$$;

create or replace function public.get_governance_dashboard(p_organization_id uuid)
returns table (
  active_patients bigint, appointments_today bigint, waiting_now bigint,
  completed_encounters_30d bigint, outstanding_invoices bigint,
  outstanding_balance numeric, confirmed_revenue_30d numeric,
  active_staff bigint, audit_events_24h bigint
) language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.has_organization_permission(p_organization_id, 'can_view_analytics') then
    raise exception 'Analytics permission is required.' using errcode = '42501';
  end if;
  return query select
    (select count(*) from public.patients p where p.organization_id = p_organization_id and p.active),
    (select count(*) from public.appointments a where a.organization_id = p_organization_id and a.start_at >= current_date and a.start_at < current_date + interval '1 day'),
    (select count(*) from public.appointments a where a.organization_id = p_organization_id and a.status = 'arrived'),
    (select count(*) from public.encounters e where e.organization_id = p_organization_id and e.status = 'finished' and e.period_end >= now() - interval '30 days'),
    (select count(*) from public.invoices i where i.organization_id = p_organization_id and i.status in ('issued', 'partially_paid') and i.balance_due > 0),
    coalesce((select sum(i.balance_due) from public.invoices i where i.organization_id = p_organization_id and i.status in ('issued', 'partially_paid')), 0),
    coalesce((select sum(p.amount) from public.payments p where p.organization_id = p_organization_id and p.status = 'confirmed' and p.confirmed_at >= now() - interval '30 days'), 0),
    (select count(distinct staff.user_id) from (
      select practitioner.auth_user_id user_id from public.practitioners practitioner
      join public.practitioner_roles role on role.practitioner_id = practitioner.id
      where role.organization_id = p_organization_id and practitioner.active and role.active and practitioner.auth_user_id is not null
      union select membership.user_id from public.user_roles membership where membership.organization_id = p_organization_id
    ) staff where not exists (
      select 1 from public.clinic_user_access_status status where status.organization_id = p_organization_id and status.user_id = staff.user_id and not status.active
    )),
    (select count(*) from public.audit_log log where log.organization_id = p_organization_id and log.occurred_at >= now() - interval '24 hours');
end;
$$;

create or replace function public.list_governance_patients(p_organization_id uuid, p_search text default '')
returns table (
  patient_id uuid, display_name text, walk_in_id text, birth_date date, gender text,
  telecom jsonb, active boolean, encounter_count bigint, appointment_count bigint,
  last_activity_at timestamptz
) language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.has_organization_permission(p_organization_id, 'can_manage_patients') then
    raise exception 'Patient administration permission is required.' using errcode = '42501';
  end if;
  return query select patient.id, coalesce(nullif(patient.name ->> 'text', ''), 'Unnamed patient'),
    patient.walk_in_id, patient.birth_date, patient.gender, patient.telecom, patient.active,
    (select count(*) from public.encounters encounter where encounter.patient_id = patient.id and encounter.organization_id = p_organization_id),
    (select count(*) from public.appointments appointment where appointment.patient_id = patient.id and appointment.organization_id = p_organization_id),
    greatest(patient.updated_at,
      coalesce((select max(encounter.updated_at) from public.encounters encounter where encounter.patient_id = patient.id and encounter.organization_id = p_organization_id), patient.updated_at),
      coalesce((select max(appointment.updated_at) from public.appointments appointment where appointment.patient_id = patient.id and appointment.organization_id = p_organization_id), patient.updated_at))
  from public.patients patient
  where patient.organization_id = p_organization_id
    and (coalesce(btrim(p_search), '') = '' or patient.name ->> 'text' ilike '%' || btrim(p_search) || '%'
      or patient.walk_in_id ilike '%' || btrim(p_search) || '%')
  order by patient.updated_at desc limit 250;
end;
$$;

create or replace function public.get_governance_patient_record(p_organization_id uuid, p_patient_id uuid)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare result jsonb;
begin
  if not public.has_organization_permission(p_organization_id, 'can_manage_patients') then
    raise exception 'Patient administration permission is required.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.patients where id = p_patient_id and organization_id = p_organization_id) then
    raise exception 'Patient record not found.' using errcode = 'P0002';
  end if;
  select jsonb_build_object(
    'patient', (select to_jsonb(p) - 'auth_user_id' - 'walk_in_pin_hash' - 'walk_in_failed_attempts' - 'walk_in_locked_until' from public.patients p where p.id = p_patient_id),
    'appointments', coalesce((select jsonb_agg(to_jsonb(a) order by a.start_at desc) from public.appointments a where a.organization_id = p_organization_id and a.patient_id = p_patient_id), '[]'::jsonb),
    'encounters', coalesce((select jsonb_agg(to_jsonb(e) order by e.period_start desc) from public.encounters e where e.organization_id = p_organization_id and e.patient_id = p_patient_id), '[]'::jsonb),
    'observations', coalesce((select jsonb_agg(to_jsonb(o) order by o.effective_at desc) from public.observations o where o.organization_id = p_organization_id and o.patient_id = p_patient_id), '[]'::jsonb),
    'medications', coalesce((select jsonb_agg(to_jsonb(m) order by m.authored_on desc) from public.medication_requests m where m.organization_id = p_organization_id and m.patient_id = p_patient_id), '[]'::jsonb),
    'documents', coalesce((select jsonb_agg(to_jsonb(d) order by d.date_at desc) from public.document_references d where d.organization_id = p_organization_id and d.patient_id = p_patient_id), '[]'::jsonb),
    'service_requests', coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at desc) from public.service_requests s where s.organization_id = p_organization_id and s.patient_id = p_patient_id), '[]'::jsonb),
    'diagnostic_reports', coalesce((select jsonb_agg(to_jsonb(d) order by d.issued_at desc) from public.diagnostic_reports d where d.organization_id = p_organization_id and d.patient_id = p_patient_id), '[]'::jsonb),
    'invoices', coalesce((select jsonb_agg(to_jsonb(i) - 'qr_payment_token' order by i.created_at desc) from public.invoices i where i.organization_id = p_organization_id and i.patient_id = p_patient_id), '[]'::jsonb)
  ) into result;
  insert into public.audit_log (organization_id, actor_id, actor_type, action, table_name, record_id, metadata)
  values (p_organization_id, auth.uid(), 'registered_user', 'read', 'patient_governance_record', p_patient_id, jsonb_build_object('surface', 'governance'));
  return result;
end;
$$;

create or replace function public.identify_patient_by_qr(p_organization_id uuid, p_payload text)
returns table (patient_id uuid, display_name text, walk_in_id text, birth_date date, gender text)
language plpgsql security definer set search_path = public, auth as $$
declare parts text[]; selected_id uuid;
begin
  if not public.has_organization_permission(p_organization_id, 'can_identify_patients') then
    raise exception 'Patient identification permission is required.' using errcode = '42501';
  end if;
  parts := string_to_array(btrim(p_payload), '|');
  if cardinality(parts) <> 3 or parts[1] <> 'ODYSSEY' or parts[2] <> p_organization_id::text then
    raise exception 'This QR code is not valid for the selected clinic.' using errcode = '22023';
  end if;
  begin selected_id := parts[3]::uuid; exception when invalid_text_representation then
    raise exception 'The patient QR code is invalid.' using errcode = '22023';
  end;
  if not exists (select 1 from public.patients p where p.id = selected_id and p.organization_id = p_organization_id and p.active) then
    raise exception 'No active patient matches this QR code.' using errcode = 'P0002';
  end if;
  insert into public.audit_log (organization_id, actor_id, actor_type, action, table_name, record_id, metadata)
  values (p_organization_id, auth.uid(), 'registered_user', 'read', 'patient_qr_identification', selected_id, jsonb_build_object('surface', 'front_desk'));
  return query select p.id, coalesce(nullif(p.name ->> 'text', ''), 'Unnamed patient'), p.walk_in_id, p.birth_date, p.gender
    from public.patients p where p.id = selected_id and p.organization_id = p_organization_id;
end;
$$;

create or replace function public.import_governance_patients(p_organization_id uuid, p_file_name text, p_rows jsonb)
returns table (patient_id uuid, row_number integer, display_name text, walk_in_id text, pin text, error text)
language plpgsql security definer set search_path = public, auth, extensions as $$
declare batch_id uuid; item jsonb; ordinal bigint; imported integer := 0; failed integer := 0;
  selected_name text; selected_birth date; selected_gender text; selected_walk_in text; selected_pin text; selected_id uuid; error_rows jsonb := '[]'::jsonb;
begin
  if not public.has_organization_permission(p_organization_id, 'can_manage_patients') then
    raise exception 'Patient administration permission is required.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) not between 1 and 500
    or length(coalesce(btrim(p_file_name), '')) not between 1 and 255 then
    raise exception 'Provide a CSV batch containing between 1 and 500 rows.' using errcode = '22023';
  end if;
  insert into public.patient_import_batches (organization_id, file_name, row_count, imported_by)
  values (p_organization_id, btrim(p_file_name), jsonb_array_length(p_rows), auth.uid()) returning id into batch_id;
  for item, ordinal in select value, ordinality from jsonb_array_elements(p_rows) with ordinality loop
    begin
      selected_name := btrim(item ->> 'name');
      selected_birth := nullif(btrim(item ->> 'birth_date'), '')::date;
      selected_gender := nullif(lower(btrim(item ->> 'gender')), '');
      if length(selected_name) not between 2 and 120 or (selected_gender is not null and selected_gender not in ('male', 'female', 'other', 'unknown')) then
        raise exception 'Name or gender is invalid.' using errcode = '22023';
      end if;
      selected_walk_in := format('WK-%s-%s', to_char(now() at time zone 'UTC', 'YYYY'), lpad(nextval('public.walk_in_reference_seq')::text, 6, '0'));
      selected_pin := lpad(((get_byte(gen_random_bytes(2), 0) * 256 + get_byte(gen_random_bytes(2), 1)) % 10000)::text, 4, '0');
      insert into public.patients (organization_id, walk_in_id, walk_in_pin_hash, name, telecom, birth_date, gender)
      values (p_organization_id, selected_walk_in, crypt(selected_pin, gen_salt('bf')), jsonb_build_object('text', selected_name),
        case when nullif(btrim(item ->> 'phone'), '') is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('system', 'phone', 'value', btrim(item ->> 'phone'))) end,
        selected_birth, selected_gender) returning id into selected_id;
      imported := imported + 1;
      patient_id := selected_id; row_number := ordinal::integer; display_name := selected_name; walk_in_id := selected_walk_in; pin := selected_pin; error := null; return next;
    exception when others then
      failed := failed + 1;
      error_rows := error_rows || jsonb_build_array(jsonb_build_object('row', ordinal, 'message', sqlerrm));
      patient_id := null; row_number := ordinal::integer; display_name := coalesce(selected_name, ''); walk_in_id := null; pin := null; error := sqlerrm; return next;
    end;
  end loop;
  update public.patient_import_batches set imported_count = imported, error_count = failed, errors = error_rows where id = batch_id;
end;
$$;

create or replace function public.list_patient_audit_trail(p_organization_id uuid, p_patient_id uuid default null, p_limit integer default 100)
returns table (id uuid, occurred_at timestamptz, actor_name text, actor_type text, action text, resource_type text, record_id uuid, metadata jsonb)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.has_organization_permission(p_organization_id, 'can_view_audit_log') then
    raise exception 'Audit log permission is required.' using errcode = '42501';
  end if;
  return query
  with patient_resources as (
    select p_patient_id resource_id where p_patient_id is not null
    union select a.id from public.appointments a where a.organization_id = p_organization_id and a.patient_id = p_patient_id
    union select e.id from public.encounters e where e.organization_id = p_organization_id and e.patient_id = p_patient_id
    union select o.id from public.observations o where o.organization_id = p_organization_id and o.patient_id = p_patient_id
    union select m.id from public.medication_requests m where m.organization_id = p_organization_id and m.patient_id = p_patient_id
    union select d.id from public.document_references d where d.organization_id = p_organization_id and d.patient_id = p_patient_id
    union select s.id from public.service_requests s where s.organization_id = p_organization_id and s.patient_id = p_patient_id
    union select d.id from public.diagnostic_reports d where d.organization_id = p_organization_id and d.patient_id = p_patient_id
    union select i.id from public.invoices i where i.organization_id = p_organization_id and i.patient_id = p_patient_id
  )
  select log.id, log.occurred_at,
    coalesce(nullif(practitioner.name ->> 'text', ''), nullif(user_account.raw_user_meta_data ->> 'display_name', ''), user_account.email,
      case when log.actor_type = 'system' then 'System' else 'Unknown actor' end),
    log.actor_type, log.action, log.table_name, log.record_id, log.metadata
  from public.audit_log log
  left join auth.users user_account on user_account.id = log.actor_id and log.actor_type = 'registered_user'
  left join public.practitioners practitioner on practitioner.auth_user_id = log.actor_id and practitioner.organization_id = p_organization_id
  where log.organization_id = p_organization_id
    and (p_patient_id is null or log.record_id in (select resource_id from patient_resources))
  order by log.occurred_at desc limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

create or replace function public.save_organization_branding(
  p_organization_id uuid, p_display_name text, p_tagline text, p_logo_url text,
  p_primary_color text, p_accent_color text, p_support_email text, p_support_phone text
) returns uuid language plpgsql security definer set search_path = public, auth as $$
declare saved_id uuid;
begin
  if not public.has_organization_permission(p_organization_id, 'can_manage_clinic_branding') then raise exception 'Brand management permission is required.' using errcode = '42501'; end if;
  insert into public.organization_branding (organization_id, display_name, tagline, logo_url, primary_color, accent_color, support_email, support_phone, updated_by)
  values (p_organization_id, btrim(p_display_name), nullif(btrim(p_tagline), ''), nullif(btrim(p_logo_url), ''), upper(p_primary_color), upper(p_accent_color), nullif(btrim(p_support_email), ''), nullif(btrim(p_support_phone), ''), auth.uid())
  on conflict (organization_id) do update set display_name = excluded.display_name, tagline = excluded.tagline, logo_url = excluded.logo_url,
    primary_color = excluded.primary_color, accent_color = excluded.accent_color, support_email = excluded.support_email,
    support_phone = excluded.support_phone, updated_by = auth.uid()
  returning id into saved_id;
  update public.organizations set name = btrim(p_display_name) where id = p_organization_id;
  return saved_id;
end;
$$;

create or replace function public.save_document_template(
  p_organization_id uuid, p_template_id uuid, p_name text, p_category text,
  p_description text, p_body text, p_active boolean
) returns uuid language plpgsql security definer set search_path = public, auth as $$
declare saved_id uuid;
begin
  if not public.has_organization_permission(p_organization_id, 'can_manage_document_templates') then raise exception 'Template management permission is required.' using errcode = '42501'; end if;
  if p_template_id is null then
    insert into public.document_templates (organization_id, code, name, category, description, body, active, created_by, updated_by)
    values (p_organization_id, public.system_generated_code('TPL'), btrim(p_name), p_category, nullif(btrim(p_description), ''), p_body, coalesce(p_active, true), auth.uid(), auth.uid()) returning id into saved_id;
  else
    update public.document_templates set name = btrim(p_name), category = p_category, description = nullif(btrim(p_description), ''),
      body = p_body, active = coalesce(p_active, true), version = version + 1, updated_by = auth.uid()
    where id = p_template_id and organization_id = p_organization_id returning id into saved_id;
    if saved_id is null then raise exception 'Document template not found.' using errcode = 'P0002'; end if;
  end if;
  return saved_id;
end;
$$;

create or replace function public.save_admin_clinic_service(
  p_organization_id uuid, p_service_id uuid, p_name text, p_description text,
  p_duration_minutes integer, p_base_price numeric, p_currency text,
  p_booking_enabled boolean, p_active boolean, p_delivery_modes public.appointment_delivery_mode[]
) returns uuid language plpgsql security definer set search_path = public, auth as $$
declare saved_id uuid;
begin
  if not public.has_organization_permission(p_organization_id, 'can_manage_service_catalog') then raise exception 'Service catalog permission is required.' using errcode = '42501'; end if;
  if p_service_id is null then
    insert into public.clinic_services (organization_id, code, name, description, duration_minutes, base_price, currency, booking_enabled, active, delivery_modes)
    values (p_organization_id, public.system_generated_code('SVC'), btrim(p_name), nullif(btrim(p_description), ''), p_duration_minutes, p_base_price, upper(p_currency), coalesce(p_booking_enabled, false), coalesce(p_active, true), p_delivery_modes)
    returning id into saved_id;
  else
    update public.clinic_services set name = btrim(p_name), description = nullif(btrim(p_description), ''), duration_minutes = p_duration_minutes,
      base_price = p_base_price, currency = upper(p_currency), booking_enabled = coalesce(p_booking_enabled, false), active = coalesce(p_active, true), delivery_modes = p_delivery_modes
    where id = p_service_id and organization_id = p_organization_id returning id into saved_id;
    if saved_id is null then raise exception 'Clinic service not found.' using errcode = 'P0002'; end if;
  end if;
  return saved_id;
end;
$$;

create or replace function public.set_organization_module(p_organization_id uuid, p_module_key text, p_enabled boolean)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.has_organization_permission(p_organization_id, 'can_manage_feature_modules') then raise exception 'Module management permission is required.' using errcode = '42501'; end if;
  if p_module_key = 'governance' and not p_enabled then raise exception 'The governance module cannot disable itself.' using errcode = '22023'; end if;
  insert into public.organization_modules (organization_id, module_key, enabled, updated_by)
  values (p_organization_id, p_module_key, p_enabled, auth.uid())
  on conflict (organization_id, module_key) do update set enabled = excluded.enabled, updated_by = auth.uid();
end;
$$;

create or replace function public.is_organization_module_enabled(p_organization_id uuid, p_module_key text)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select coalesce((select module.enabled from public.organization_modules module where module.organization_id = p_organization_id and module.module_key = p_module_key), true)
    and (public.can_access_organization(p_organization_id) or exists (select 1 from public.organizations o where o.id = p_organization_id and o.active));
$$;

create or replace function public.set_clinic_user_active(p_organization_id uuid, p_user_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.has_organization_permission(p_organization_id, 'can_manage_staff_roles') then raise exception 'Staff management permission is required.' using errcode = '42501'; end if;
  if p_user_id = auth.uid() and not p_active then raise exception 'You cannot deactivate your own clinic access.' using errcode = '22023'; end if;
  if exists (select 1 from public.user_roles membership join public.roles role on role.id = membership.role_id where membership.organization_id = p_organization_id and membership.user_id = p_user_id and role.name = 'owner')
    and not public.has_organization_role(p_organization_id, array['owner']) then raise exception 'Only an owner may change owner access.' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.user_roles where organization_id = p_organization_id and user_id = p_user_id
    union select 1 from public.practitioners where organization_id = p_organization_id and auth_user_id = p_user_id
  ) then raise exception 'Clinic staff account not found.' using errcode = 'P0002'; end if;
  insert into public.clinic_user_access_status (organization_id, user_id, active, updated_by)
  values (p_organization_id, p_user_id, p_active, auth.uid())
  on conflict (organization_id, user_id) do update set active = excluded.active, updated_by = auth.uid();
end;
$$;

-- Include the explicit access status in the existing account list.
create or replace function public.list_clinic_staff(p_organization_id uuid)
returns table (user_id uuid, display_name text, email text, role_code text, department_id uuid, active boolean)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.can_manage_organization_accounts(p_organization_id) then raise exception 'Staff management permission is required.' using errcode = '42501'; end if;
  return query with staff_members as (
    select practitioner.auth_user_id staff_user_id,
      coalesce(nullif(practitioner.name ->> 'text', ''), nullif(user_account.raw_user_meta_data ->> 'display_name', ''), user_account.email, 'Unnamed staff') staff_display_name,
      user_account.email staff_email, practitioner_role.role_code staff_role_code,
      practitioner.active and practitioner_role.active staff_active
    from public.practitioner_roles practitioner_role
    join public.practitioners practitioner on practitioner.id = practitioner_role.practitioner_id
    left join auth.users user_account on user_account.id = practitioner.auth_user_id
    where practitioner_role.organization_id = p_organization_id and practitioner.auth_user_id is not null
    union
    select membership.user_id, coalesce(nullif(user_account.raw_user_meta_data ->> 'display_name', ''), user_account.email, 'Unnamed staff'),
      user_account.email, role.name, true
    from public.user_roles membership join public.roles role on role.id = membership.role_id
    left join auth.users user_account on user_account.id = membership.user_id
    where membership.organization_id = p_organization_id and role.name <> 'patient'
  ) select staff.staff_user_id, staff.staff_display_name, staff.staff_email, staff.staff_role_code,
    assignment.department_id, staff.staff_active and coalesce(status.active, true)
  from staff_members staff
  left join public.staff_department_assignments assignment on assignment.organization_id = p_organization_id and assignment.user_id = staff.staff_user_id
  left join public.clinic_user_access_status status on status.organization_id = p_organization_id and status.user_id = staff.staff_user_id
  order by (staff.staff_active and coalesce(status.active, true)) desc, staff.staff_display_name, staff.staff_role_code;
end;
$$;

alter table public.organization_branding enable row level security;
alter table public.document_templates enable row level security;
alter table public.organization_modules enable row level security;
alter table public.patient_import_batches enable row level security;
alter table public.clinic_user_access_status enable row level security;

create policy organization_branding_public_select on public.organization_branding for select to anon, authenticated using (
  exists (select 1 from public.organizations organization where organization.id = organization_id and organization.active)
);
create policy document_templates_select on public.document_templates for select to authenticated using (public.has_organization_permission(organization_id, 'can_manage_document_templates'));
create policy organization_modules_select on public.organization_modules for select to authenticated using (public.can_access_organization(organization_id));
create policy patient_import_batches_select on public.patient_import_batches for select to authenticated using (public.has_organization_permission(organization_id, 'can_manage_patients'));
create policy clinic_user_access_status_select on public.clinic_user_access_status for select to authenticated using (public.has_organization_permission(organization_id, 'can_manage_staff_roles') or user_id = auth.uid());

create trigger organization_branding_set_updated_at before update on public.organization_branding for each row execute function public.set_updated_at();
create trigger document_templates_set_updated_at before update on public.document_templates for each row execute function public.set_updated_at();
create trigger organization_modules_set_updated_at before update on public.organization_modules for each row execute function public.set_updated_at();
create trigger clinic_user_access_status_set_updated_at before update on public.clinic_user_access_status for each row execute function public.set_updated_at();
create trigger organization_branding_audit after insert or update or delete on public.organization_branding for each row execute function public.write_audit_log();
create trigger document_templates_audit after insert or update or delete on public.document_templates for each row execute function public.write_audit_log();
create trigger organization_modules_audit after insert or update or delete on public.organization_modules for each row execute function public.write_audit_log();
create trigger patient_import_batches_audit after insert or update or delete on public.patient_import_batches for each row execute function public.write_audit_log();
create trigger clinic_user_access_status_audit after insert or update or delete on public.clinic_user_access_status for each row execute function public.write_audit_log();

revoke insert, update, delete on public.organization_branding, public.document_templates, public.organization_modules, public.patient_import_batches, public.clinic_user_access_status from authenticated, anon;
revoke all on function public.get_governance_dashboard(uuid) from public;
revoke all on function public.list_governance_patients(uuid, text) from public;
revoke all on function public.get_governance_patient_record(uuid, uuid) from public;
revoke all on function public.identify_patient_by_qr(uuid, text) from public;
revoke all on function public.import_governance_patients(uuid, text, jsonb) from public;
revoke all on function public.list_patient_audit_trail(uuid, uuid, integer) from public;
revoke all on function public.save_organization_branding(uuid, text, text, text, text, text, text, text) from public;
revoke all on function public.save_document_template(uuid, uuid, text, text, text, text, boolean) from public;
revoke all on function public.save_admin_clinic_service(uuid, uuid, text, text, integer, numeric, text, boolean, boolean, public.appointment_delivery_mode[]) from public;
revoke all on function public.set_organization_module(uuid, text, boolean) from public;
revoke all on function public.set_clinic_user_active(uuid, uuid, boolean) from public;

grant execute on function public.get_governance_dashboard(uuid) to authenticated;
grant execute on function public.list_governance_patients(uuid, text) to authenticated;
grant execute on function public.get_governance_patient_record(uuid, uuid) to authenticated;
grant execute on function public.identify_patient_by_qr(uuid, text) to authenticated;
grant execute on function public.import_governance_patients(uuid, text, jsonb) to authenticated;
grant execute on function public.list_patient_audit_trail(uuid, uuid, integer) to authenticated;
grant execute on function public.save_organization_branding(uuid, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.save_document_template(uuid, uuid, text, text, text, text, boolean) to authenticated;
grant execute on function public.save_admin_clinic_service(uuid, uuid, text, text, integer, numeric, text, boolean, boolean, public.appointment_delivery_mode[]) to authenticated;
grant execute on function public.set_organization_module(uuid, text, boolean) to authenticated;
grant execute on function public.is_organization_module_enabled(uuid, text) to anon, authenticated;
grant execute on function public.set_clinic_user_active(uuid, uuid, boolean) to authenticated;

comment on function public.get_governance_patient_record(uuid, uuid) is 'Tenant-scoped comprehensive administrative Patient record read. Every successful call appends a read audit event.';
comment on function public.identify_patient_by_qr(uuid, text) is 'Front-desk-safe patient identification. The QR is an identifier, never an authentication credential.';
comment on table public.document_templates is 'Clinic-wide reusable document definitions. Generated patient documents remain immutable DocumentReference resources.';
comment on table public.organization_modules is 'Clinic module availability. Feature flags do not replace RLS or permission checks.';
