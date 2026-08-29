-- FHIR-aligned foundational clinical schema. This migration intentionally stores
-- resource fields relationally; it does not require complete FHIR JSON documents.

create extension if not exists pgcrypto;

create type public.appointment_status as enum ('proposed', 'pending', 'booked', 'arrived', 'fulfilled', 'cancelled', 'noshow');
create type public.encounter_status as enum ('planned', 'arrived', 'in_progress', 'onleave', 'finished', 'cancelled', 'entered_in_error', 'unknown');
create type public.observation_status as enum ('registered', 'preliminary', 'final', 'amended', 'corrected', 'cancelled', 'entered_in_error', 'unknown');
create type public.request_status as enum ('draft', 'active', 'on_hold', 'revoked', 'completed', 'entered_in_error', 'unknown');
create type public.diagnostic_report_status as enum ('registered', 'partial', 'preliminary', 'final', 'amended', 'corrected', 'appended', 'cancelled', 'entered_in_error', 'unknown');
create type public.document_reference_status as enum ('current', 'superseded', 'entered_in_error');
create type public.claim_status as enum ('active', 'cancelled', 'draft', 'entered_in_error');

-- FHIR Organization
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  identifier jsonb not null default '[]'::jsonb,
  type_codes jsonb not null default '[]'::jsonb,
  telecom jsonb not null default '[]'::jsonb,
  address jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- FHIR Practitioner
create table public.practitioners (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  auth_user_id uuid unique references auth.users(id),
  active boolean not null default true,
  identifier jsonb not null default '[]'::jsonb,
  name jsonb not null,
  telecom jsonb not null default '[]'::jsonb,
  address jsonb not null default '[]'::jsonb,
  qualification jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- FHIR PractitionerRole: a practitioner's capabilities at one clinic.
create table public.practitioner_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  practitioner_id uuid not null references public.practitioners(id),
  active boolean not null default true,
  role_code text not null,
  specialty_codes jsonb not null default '[]'::jsonb,
  telecom jsonb not null default '[]'::jsonb,
  available_time jsonb not null default '[]'::jsonb,
  not_available jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, practitioner_id, role_code)
);

-- FHIR Patient. auth_user_id and walk_in_id support an anonymous walk-in later
-- being linked to a registered auth identity.
create table public.patients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  auth_user_id uuid references auth.users(id),
  walk_in_id text,
  active boolean not null default true,
  identifier jsonb not null default '[]'::jsonb,
  name jsonb not null,
  telecom jsonb not null default '[]'::jsonb,
  gender text check (gender in ('male', 'female', 'other', 'unknown')),
  birth_date date,
  address jsonb not null default '[]'::jsonb,
  contact jsonb not null default '[]'::jsonb,
  communication jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (auth_user_id is not null or walk_in_id is not null)
);
create unique index patients_organization_auth_user_key on public.patients (organization_id, auth_user_id) where auth_user_id is not null;
create unique index patients_organization_walk_in_key on public.patients (organization_id, walk_in_id) where walk_in_id is not null;

-- FHIR Appointment
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  patient_id uuid not null references public.patients(id),
  practitioner_role_id uuid references public.practitioner_roles(id),
  status public.appointment_status not null default 'proposed',
  service_category text,
  service_type text,
  specialty text,
  appointment_type text,
  start_at timestamptz,
  end_at timestamptz,
  minutes_duration integer check (minutes_duration is null or minutes_duration > 0),
  reason_codes jsonb not null default '[]'::jsonb,
  description text,
  patient_instruction text,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((start_at is null and end_at is null) or (start_at is not null and end_at is not null and end_at > start_at))
);

-- FHIR Encounter; SOAP content remains structured for later clinical UI work.
create table public.encounters (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  patient_id uuid not null references public.patients(id),
  appointment_id uuid unique references public.appointments(id),
  practitioner_role_id uuid references public.practitioner_roles(id),
  status public.encounter_status not null default 'planned',
  class_code text not null default 'AMB',
  type_codes jsonb not null default '[]'::jsonb,
  service_type text,
  period_start timestamptz,
  period_end timestamptz,
  reason_codes jsonb not null default '[]'::jsonb,
  diagnosis jsonb not null default '[]'::jsonb,
  subject_note text,
  objective_note text,
  assessment_note text,
  plan_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((period_start is null and period_end is null) or (period_end is null or period_end >= period_start))
);

-- FHIR Observation. Corrections are new records linked through supersedes_id;
-- a trigger below prohibits updates.
create table public.observations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  patient_id uuid not null references public.patients(id),
  encounter_id uuid references public.encounters(id),
  performer_practitioner_id uuid references public.practitioners(id),
  status public.observation_status not null default 'registered',
  category_codes jsonb not null default '[]'::jsonb,
  code_system text,
  code text not null,
  code_display text,
  effective_at timestamptz,
  issued_at timestamptz,
  value jsonb,
  value_unit text,
  interpretation_codes jsonb not null default '[]'::jsonb,
  reference_range jsonb not null default '[]'::jsonb,
  note text,
  supersedes_id uuid references public.observations(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (supersedes_id is null or supersedes_id <> id)
);

-- FHIR MedicationRequest
create table public.medication_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  patient_id uuid not null references public.patients(id),
  encounter_id uuid references public.encounters(id),
  requester_practitioner_id uuid references public.practitioners(id),
  status public.request_status not null default 'draft',
  intent text not null default 'order' check (intent in ('proposal', 'plan', 'order', 'original-order', 'reflex-order', 'filler-order', 'instance-order', 'option')),
  category_codes jsonb not null default '[]'::jsonb,
  medication_code text not null,
  medication_display text,
  authored_on timestamptz not null default now(),
  dosage_instruction jsonb not null default '[]'::jsonb,
  dispense_request jsonb,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- FHIR ServiceRequest. category distinguishes laboratory orders and referrals.
create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  patient_id uuid not null references public.patients(id),
  encounter_id uuid references public.encounters(id),
  requester_practitioner_id uuid references public.practitioners(id),
  status public.request_status not null default 'draft',
  intent text not null default 'order' check (intent in ('proposal', 'plan', 'order', 'original-order', 'reflex-order', 'filler-order', 'instance-order', 'option')),
  category text not null check (category in ('laboratory', 'referral')),
  priority text check (priority in ('routine', 'urgent', 'asap', 'stat')),
  code text not null,
  code_display text,
  occurrence_start timestamptz,
  occurrence_end timestamptz,
  reason_codes jsonb not null default '[]'::jsonb,
  supporting_info jsonb not null default '[]'::jsonb,
  performer_organization_id uuid references public.organizations(id),
  performer_practitioner_role_id uuid references public.practitioner_roles(id),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (occurrence_end is null or occurrence_start is null or occurrence_end >= occurrence_start)
);

-- FHIR DiagnosticReport. Its result Observations are linked after this table exists.
create table public.diagnostic_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  patient_id uuid not null references public.patients(id),
  encounter_id uuid references public.encounters(id),
  based_on_service_request_id uuid references public.service_requests(id),
  status public.diagnostic_report_status not null default 'registered',
  category_codes jsonb not null default '[]'::jsonb,
  code text not null,
  code_display text,
  effective_at timestamptz,
  issued_at timestamptz,
  performer_organization_id uuid references public.organizations(id),
  conclusion text,
  conclusion_codes jsonb not null default '[]'::jsonb,
  presented_form jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.observations add column diagnostic_report_id uuid references public.diagnostic_reports(id);

-- FHIR DocumentReference, including generated medical certificates and uploads.
create table public.document_references (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  patient_id uuid references public.patients(id),
  encounter_id uuid references public.encounters(id),
  author_practitioner_id uuid references public.practitioners(id),
  status public.document_reference_status not null default 'current',
  doc_status text,
  type_code text not null,
  type_display text,
  category_codes jsonb not null default '[]'::jsonb,
  date_at timestamptz not null default now(),
  description text,
  content_url text not null,
  content_type text not null,
  content_title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- FHIR Coverage and Claim are schema-only in Phase 1; HMO workflows come later.
create table public.coverages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  patient_id uuid not null references public.patients(id),
  status text not null check (status in ('active', 'cancelled', 'draft', 'entered_in_error')),
  coverage_type text not null,
  subscriber_id text,
  beneficiary_relationship text,
  payor jsonb not null,
  period_start date,
  period_end date,
  class_values jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end is null or period_start is null or period_end >= period_start)
);

create table public.claims (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  patient_id uuid not null references public.patients(id),
  encounter_id uuid references public.encounters(id),
  coverage_id uuid references public.coverages(id),
  status public.claim_status not null default 'draft',
  use text not null default 'claim' check (use in ('claim', 'preauthorization', 'predetermination')),
  claim_type text not null,
  billable_period_start date,
  billable_period_end date,
  provider_organization_id uuid references public.organizations(id),
  priority_code text,
  items jsonb not null default '[]'::jsonb,
  total numeric(12,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (billable_period_end is null or billable_period_start is null or billable_period_end >= billable_period_start)
);

-- Roles are global definitions; memberships are tenant-scoped FHIR-adjacent access data.
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  name text unique not null check (name in ('patient', 'doctor', 'nurse', 'lab_staff', 'specialist', 'front_desk', 'admin', 'owner')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.roles(id) on delete cascade,
  organization_id uuid references public.organizations(id),
  permission text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (role_id, organization_id, permission)
);
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references public.roles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, role_id, organization_id)
);

-- Upgrade the append-only audit table introduced by the smoke-test migration.
-- Converting legacy integer keys to UUIDs preserves existing records while bringing
-- this table in line with the foundational identifier convention.
alter table public.audit_log
  alter column id drop identity if exists;
alter table public.audit_log
  alter column id drop default,
  alter column id type uuid using gen_random_uuid(),
  alter column id set default gen_random_uuid(),
  add column if not exists organization_id uuid references public.organizations(id),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();
alter table public.audit_log drop constraint if exists audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check check (action in ('insert', 'update', 'delete'));
alter table public.audit_log alter column record_id set not null;

create index appointments_organization_start_idx on public.appointments (organization_id, start_at);
create index encounters_organization_patient_idx on public.encounters (organization_id, patient_id);
create index observations_organization_patient_idx on public.observations (organization_id, patient_id, effective_at desc);
create index medication_requests_organization_patient_idx on public.medication_requests (organization_id, patient_id);
create index service_requests_organization_category_status_idx on public.service_requests (organization_id, category, status);
create index diagnostic_reports_organization_patient_idx on public.diagnostic_reports (organization_id, patient_id);
create index document_references_organization_patient_idx on public.document_references (organization_id, patient_id);
create index audit_log_organization_record_idx on public.audit_log (organization_id, table_name, record_id, occurred_at desc);

create function public.set_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

create function public.reject_observation_update() returns trigger language plpgsql set search_path = public as $$
begin raise exception 'Observations are immutable; insert a new row with supersedes_id to correct one.' using errcode = '55000'; end;
$$;

create function public.write_audit_log() returns trigger language plpgsql security definer set search_path = public, auth as $$
declare resource jsonb; resource_id uuid; resource_org_id uuid;
begin
  resource := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  resource_id := (resource ->> 'id')::uuid;
  resource_org_id := nullif(resource ->> 'organization_id', '')::uuid;
  insert into public.audit_log (organization_id, actor_id, action, table_name, record_id)
  values (resource_org_id, auth.uid(), lower(tg_op), tg_table_name, resource_id);
  return coalesce(new, old);
end;
$$;

create function public.has_organization_role(target_organization_id uuid, allowed_roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid() and ur.organization_id = target_organization_id and r.name = any(allowed_roles)
  );
$$;

create function public.can_access_organization(target_organization_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_organization_role(target_organization_id, array['doctor', 'nurse', 'lab_staff', 'specialist', 'front_desk', 'admin', 'owner']);
$$;

-- Apply timestamp triggers everywhere mutable. Observations deliberately omit it.
create trigger organizations_set_updated_at before update on public.organizations for each row execute function public.set_updated_at();
create trigger practitioners_set_updated_at before update on public.practitioners for each row execute function public.set_updated_at();
create trigger practitioner_roles_set_updated_at before update on public.practitioner_roles for each row execute function public.set_updated_at();
create trigger patients_set_updated_at before update on public.patients for each row execute function public.set_updated_at();
create trigger appointments_set_updated_at before update on public.appointments for each row execute function public.set_updated_at();
create trigger encounters_set_updated_at before update on public.encounters for each row execute function public.set_updated_at();
create trigger medication_requests_set_updated_at before update on public.medication_requests for each row execute function public.set_updated_at();
create trigger service_requests_set_updated_at before update on public.service_requests for each row execute function public.set_updated_at();
create trigger diagnostic_reports_set_updated_at before update on public.diagnostic_reports for each row execute function public.set_updated_at();
create trigger document_references_set_updated_at before update on public.document_references for each row execute function public.set_updated_at();
create trigger coverages_set_updated_at before update on public.coverages for each row execute function public.set_updated_at();
create trigger claims_set_updated_at before update on public.claims for each row execute function public.set_updated_at();
create trigger roles_set_updated_at before update on public.roles for each row execute function public.set_updated_at();
create trigger role_permissions_set_updated_at before update on public.role_permissions for each row execute function public.set_updated_at();
create trigger user_roles_set_updated_at before update on public.user_roles for each row execute function public.set_updated_at();
create trigger audit_log_set_updated_at before update on public.audit_log for each row execute function public.set_updated_at();
create trigger observations_are_immutable before update on public.observations for each row execute function public.reject_observation_update();

-- Audit all requested resources. Audit writes bypass the audit table's client RLS policy.
create trigger organizations_audit after insert or update or delete on public.organizations for each row execute function public.write_audit_log();
create trigger practitioners_audit after insert or update or delete on public.practitioners for each row execute function public.write_audit_log();
create trigger practitioner_roles_audit after insert or update or delete on public.practitioner_roles for each row execute function public.write_audit_log();
create trigger patients_audit after insert or update or delete on public.patients for each row execute function public.write_audit_log();
create trigger appointments_audit after insert or update or delete on public.appointments for each row execute function public.write_audit_log();
create trigger encounters_audit after insert or update or delete on public.encounters for each row execute function public.write_audit_log();
create trigger observations_audit after insert or delete on public.observations for each row execute function public.write_audit_log();
create trigger medication_requests_audit after insert or update or delete on public.medication_requests for each row execute function public.write_audit_log();
create trigger service_requests_audit after insert or update or delete on public.service_requests for each row execute function public.write_audit_log();
create trigger diagnostic_reports_audit after insert or update or delete on public.diagnostic_reports for each row execute function public.write_audit_log();
create trigger document_references_audit after insert or update or delete on public.document_references for each row execute function public.write_audit_log();
create trigger coverages_audit after insert or update or delete on public.coverages for each row execute function public.write_audit_log();
create trigger claims_audit after insert or update or delete on public.claims for each row execute function public.write_audit_log();

-- RLS: organization staff are scoped through user_roles; patients can only see their own rows.
alter table public.organizations enable row level security;
alter table public.practitioners enable row level security;
alter table public.practitioner_roles enable row level security;
alter table public.patients enable row level security;
alter table public.appointments enable row level security;
alter table public.encounters enable row level security;
alter table public.observations enable row level security;
alter table public.medication_requests enable row level security;
alter table public.service_requests enable row level security;
alter table public.diagnostic_reports enable row level security;
alter table public.document_references enable row level security;
alter table public.coverages enable row level security;
alter table public.claims enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.audit_log enable row level security;

create policy organizations_select on public.organizations for select to authenticated using (public.can_access_organization(id));
create policy organizations_manage on public.organizations for all to authenticated using (public.has_organization_role(id, array['owner', 'admin'])) with check (public.has_organization_role(id, array['owner', 'admin']));
create policy practitioners_select on public.practitioners for select to authenticated using (auth_user_id = auth.uid() or public.can_access_organization(organization_id));
create policy practitioners_manage on public.practitioners for all to authenticated using (public.has_organization_role(organization_id, array['owner', 'admin'])) with check (public.has_organization_role(organization_id, array['owner', 'admin']));
create policy practitioner_roles_select on public.practitioner_roles for select to authenticated using (public.can_access_organization(organization_id));
create policy practitioner_roles_manage on public.practitioner_roles for all to authenticated using (public.has_organization_role(organization_id, array['owner', 'admin'])) with check (public.has_organization_role(organization_id, array['owner', 'admin']));
create policy patients_select on public.patients for select to authenticated using (auth_user_id = auth.uid() or public.can_access_organization(organization_id));
create policy patients_insert on public.patients for insert to authenticated with check (auth_user_id = auth.uid() or public.has_organization_role(organization_id, array['front_desk', 'admin', 'owner']));
create policy patients_update on public.patients for update to authenticated using (auth_user_id = auth.uid() or public.has_organization_role(organization_id, array['front_desk', 'admin', 'owner'])) with check (auth_user_id = auth.uid() or public.has_organization_role(organization_id, array['front_desk', 'admin', 'owner']));
create policy appointments_select on public.appointments for select to authenticated using (exists (select 1 from public.patients p where p.id = patient_id and p.auth_user_id = auth.uid()) or public.can_access_organization(organization_id));
create policy appointments_insert on public.appointments for insert to authenticated with check (public.has_organization_role(organization_id, array['front_desk', 'admin', 'owner']) or exists (select 1 from public.patients p where p.id = patient_id and p.auth_user_id = auth.uid()));
create policy appointments_update on public.appointments for update to authenticated using (public.has_organization_role(organization_id, array['front_desk', 'admin', 'owner'])) with check (public.has_organization_role(organization_id, array['front_desk', 'admin', 'owner']));
create policy clinical_staff_select on public.encounters for select to authenticated using (public.can_access_organization(organization_id));
create policy clinical_staff_manage on public.encounters for all to authenticated using (public.has_organization_role(organization_id, array['doctor', 'nurse', 'specialist', 'admin', 'owner'])) with check (public.has_organization_role(organization_id, array['doctor', 'nurse', 'specialist', 'admin', 'owner']));
create policy observations_select on public.observations for select to authenticated using (public.can_access_organization(organization_id));
create policy observations_insert on public.observations for insert to authenticated with check (public.has_organization_role(organization_id, array['doctor', 'nurse', 'lab_staff', 'specialist', 'admin', 'owner']));
create policy medication_requests_select on public.medication_requests for select to authenticated using (public.can_access_organization(organization_id));
create policy medication_requests_manage on public.medication_requests for all to authenticated using (public.has_organization_role(organization_id, array['doctor', 'specialist', 'admin', 'owner'])) with check (public.has_organization_role(organization_id, array['doctor', 'specialist', 'admin', 'owner']));
create policy service_requests_select on public.service_requests for select to authenticated using (public.can_access_organization(organization_id));
create policy service_requests_manage on public.service_requests for all to authenticated using (public.has_organization_role(organization_id, array['doctor', 'nurse', 'specialist', 'admin', 'owner'])) with check (public.has_organization_role(organization_id, array['doctor', 'nurse', 'specialist', 'admin', 'owner']));
create policy diagnostic_reports_select on public.diagnostic_reports for select to authenticated using (public.can_access_organization(organization_id));
create policy diagnostic_reports_manage on public.diagnostic_reports for all to authenticated using (public.has_organization_role(organization_id, array['lab_staff', 'doctor', 'specialist', 'admin', 'owner'])) with check (public.has_organization_role(organization_id, array['lab_staff', 'doctor', 'specialist', 'admin', 'owner']));
create policy document_references_select on public.document_references for select to authenticated using (public.can_access_organization(organization_id));
create policy document_references_manage on public.document_references for all to authenticated using (public.has_organization_role(organization_id, array['doctor', 'nurse', 'specialist', 'admin', 'owner'])) with check (public.has_organization_role(organization_id, array['doctor', 'nurse', 'specialist', 'admin', 'owner']));
create policy coverages_patient_or_staff_select on public.coverages for select to authenticated using (public.can_access_organization(organization_id) or exists (select 1 from public.patients p where p.id = patient_id and p.auth_user_id = auth.uid()));
create policy coverages_manage on public.coverages for all to authenticated using (public.has_organization_role(organization_id, array['front_desk', 'admin', 'owner'])) with check (public.has_organization_role(organization_id, array['front_desk', 'admin', 'owner']));
create policy claims_patient_or_staff_select on public.claims for select to authenticated using (public.can_access_organization(organization_id) or exists (select 1 from public.patients p where p.id = patient_id and p.auth_user_id = auth.uid()));
create policy claims_manage on public.claims for all to authenticated using (public.has_organization_role(organization_id, array['admin', 'owner'])) with check (public.has_organization_role(organization_id, array['admin', 'owner']));
create policy roles_select on public.roles for select to authenticated using (true);
-- Role definitions are managed through server-side administration only. There is
-- intentionally no client mutation policy because this global catalog is security-sensitive.
create policy role_permissions_select on public.role_permissions for select to authenticated using (organization_id is null or public.can_access_organization(organization_id));
create policy role_permissions_manage on public.role_permissions for all to authenticated using (organization_id is null or public.has_organization_role(organization_id, array['owner'])) with check (organization_id is null or public.has_organization_role(organization_id, array['owner']));
create policy user_roles_select on public.user_roles for select to authenticated using (user_id = auth.uid() or public.has_organization_role(organization_id, array['admin', 'owner']));
create policy user_roles_manage on public.user_roles for all to authenticated using (public.has_organization_role(organization_id, array['owner'])) with check (public.has_organization_role(organization_id, array['owner']));
create policy audit_log_select on public.audit_log for select to authenticated using (public.has_organization_role(organization_id, array['admin', 'owner']));

comment on table public.organizations is 'FHIR Organization mapping; a clinic/facility tenant.';
comment on table public.practitioners is 'FHIR Practitioner mapping; staff identity independent of clinic role.';
comment on table public.practitioner_roles is 'FHIR PractitionerRole mapping; practitioner to organization capability.';
comment on table public.patients is 'FHIR Patient mapping; supports registered and walk-in identities.';
comment on table public.appointments is 'FHIR Appointment mapping.';
comment on table public.encounters is 'FHIR Encounter mapping; consultation and SOAP notes.';
comment on table public.observations is 'FHIR Observation mapping; immutable and versioned via supersedes_id.';
comment on table public.medication_requests is 'FHIR MedicationRequest mapping.';
comment on table public.service_requests is 'FHIR ServiceRequest mapping for laboratory orders and referrals.';
comment on table public.diagnostic_reports is 'FHIR DiagnosticReport mapping; results link through observations.diagnostic_report_id.';
comment on table public.document_references is 'FHIR DocumentReference mapping for medical certificates and files.';
comment on table public.coverages is 'FHIR Coverage mapping; schema-only in Phase 1.';
comment on table public.claims is 'FHIR Claim mapping; schema-only in Phase 1.';

insert into public.roles (name) values
  ('patient'), ('doctor'), ('nurse'), ('lab_staff'), ('specialist'), ('front_desk'), ('admin'), ('owner')
on conflict (name) do nothing;
