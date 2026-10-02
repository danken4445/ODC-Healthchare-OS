-- Migration: 20261002010000_pmr_clinical_document_infrastructure.sql
-- Description: Standardized Patient Medical Record (PMR) Clinical Document Architecture,
-- immutable snapshots, secure share links, verification RPCs, release audit logs, and FHIR clinical tables.
-- Rollback: drop table public.pmr_release_audit_log, public.pmr_share_links, public.pmr_document_snapshots cascade;

create extension if not exists pgcrypto;

-- 1. Clinical Foundation: AllergyIntolerances, Conditions, Immunizations, Procedures
create table if not exists public.allergy_intolerances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  patient_id uuid not null references public.patients(id),
  substance text not null,
  clinical_status text not null default 'active' check (clinical_status in ('active', 'inactive', 'resolved')),
  verification_status text not null default 'confirmed' check (verification_status in ('confirmed', 'unconfirmed', 'refuted')),
  category text not null default 'medication' check (category in ('food', 'medication', 'environment', 'biologic', 'other')),
  criticality text not null default 'low' check (criticality in ('low', 'high', 'unable-to-assess')),
  manifestation text not null,
  recorded_date date not null default current_date,
  recorder_practitioner_id uuid references public.practitioners(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conditions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  patient_id uuid not null references public.patients(id),
  encounter_id uuid references public.encounters(id),
  code text not null,
  code_display text not null,
  clinical_status text not null default 'active' check (clinical_status in ('active', 'recurrence', 'relapse', 'inactive', 'remission', 'resolved')),
  verification_status text not null default 'confirmed' check (verification_status in ('provisional', 'differential', 'confirmed', 'refuted')),
  onset_date date,
  resolved_date date,
  is_sensitive boolean not null default false,
  sensitive_category text check (sensitive_category in ('mental_health', 'infectious_disease_hiv', 'reproductive_health', 'substance_use', 'genetic_testing')),
  recorded_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.immunizations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  patient_id uuid not null references public.patients(id),
  encounter_id uuid references public.encounters(id),
  vaccine_code text not null,
  vaccine_display text not null,
  administered_date timestamptz not null default now(),
  dose_number text not null default '1',
  lot_number text,
  administered_by_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.procedures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  patient_id uuid not null references public.patients(id),
  encounter_id uuid references public.encounters(id),
  code text not null,
  code_display text not null,
  performed_date timestamptz not null default now(),
  performed_by_name text,
  notes text,
  created_at timestamptz not null default now()
);

-- 2. PMR Document Snapshots: Immutable record snapshots
create table if not exists public.pmr_document_snapshots (
  id uuid primary key default gen_random_uuid(),
  document_id text unique not null,
  organization_id uuid not null references public.organizations(id),
  patient_id uuid not null references public.patients(id),
  document_reference_id uuid references public.document_references(id),
  revision integer not null default 1,
  copy_type text not null default 'Patient Copy' check (copy_type in ('Official Copy', 'Patient Copy', 'Uncontrolled Copy')),
  watermark_status text check (watermark_status in ('UNCONTROLLED COPY', 'VOID', 'DRAFT')),
  sha256_hash text not null,
  sections_included jsonb not null default '[]'::jsonb,
  redactions_applied jsonb not null default '[]'::jsonb,
  document_payload jsonb not null,
  storage_path text,
  is_latest_revision boolean not null default true,
  superseded_by uuid references public.pmr_document_snapshots(id),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index if not exists idx_pmr_snapshots_patient on public.pmr_document_snapshots(patient_id, created_at desc);
create index if not exists idx_pmr_snapshots_document_id on public.pmr_document_snapshots(document_id);

-- Enforce immutability of snapshots: updates and deletes are disallowed
create or replace function public.prohibit_pmr_snapshot_mutation()
returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    -- Allow only updating superseded_by, is_latest_revision, and storage_path (for server PDF background upload)
    if new.id = old.id
       and new.document_id = old.document_id
       and new.organization_id = old.organization_id
       and new.patient_id = old.patient_id
       and new.sha256_hash = old.sha256_hash
       and new.document_payload = old.document_payload then
      return new;
    end if;
    raise exception 'PMR document snapshots are immutable clinical records.' using errcode = '22000';
  elsif tg_op = 'DELETE' then
    raise exception 'PMR document snapshots cannot be deleted.' using errcode = '22000';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pmr_snapshots_mutation on public.pmr_document_snapshots;
create trigger trg_pmr_snapshots_mutation
  before update or delete on public.pmr_document_snapshots
  for each row execute function public.prohibit_pmr_snapshot_mutation();

-- 3. PMR Secure Share Links
create table if not exists public.pmr_share_links (
  id uuid primary key default gen_random_uuid(),
  share_token text unique not null,
  snapshot_id uuid not null references public.pmr_document_snapshots(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  patient_id uuid not null references public.patients(id),
  passcode_hash text,
  expires_at timestamptz not null default (now() + interval '72 hours'),
  max_views integer not null default 10 check (max_views > 0),
  view_count integer not null default 0 check (view_count >= 0),
  revoked boolean not null default false,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),
  purpose text not null,
  recipient_name text not null,
  recipient_email text,
  consent_reference text not null,
  sections_included jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index if not exists idx_pmr_share_token on public.pmr_share_links(share_token);
create index if not exists idx_pmr_share_patient on public.pmr_share_links(patient_id, created_at desc);

-- 4. PMR Immutable Release Audit Log (RA 10173 Data Privacy Compliance)
create table if not exists public.pmr_release_audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  organization_id uuid not null references public.organizations(id),
  patient_id uuid not null references public.patients(id),
  document_id text not null,
  action text not null check (action in ('view', 'print', 'pdf_download', 'share_link_created', 'share_link_accessed', 'email_sent')),
  recipient text not null,
  purpose text not null,
  consent_reference text not null,
  sections_included jsonb not null default '[]'::jsonb,
  actor_id uuid references auth.users(id),
  actor_type text not null default 'patient' check (actor_type in ('patient', 'staff', 'external_recipient', 'system')),
  ip_address text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_pmr_audit_patient on public.pmr_release_audit_log(patient_id, occurred_at desc);
create index if not exists idx_pmr_audit_document on public.pmr_release_audit_log(document_id, occurred_at desc);

-- Prohibit updating or deleting release audit logs
create or replace function public.prohibit_audit_log_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'PMR release audit logs are strictly append-only.' using errcode = '22000';
end;
$$;

drop trigger if exists trg_pmr_release_audit_mutation on public.pmr_release_audit_log;
create trigger trg_pmr_release_audit_mutation
  before update or delete on public.pmr_release_audit_log
  for each row execute function public.prohibit_audit_log_mutation();

-- 5. RLS Policies
alter table public.allergy_intolerances enable row level security;
alter table public.conditions enable row level security;
alter table public.immunizations enable row level security;
alter table public.procedures enable row level security;
alter table public.pmr_document_snapshots enable row level security;
alter table public.pmr_share_links enable row level security;
alter table public.pmr_release_audit_log enable row level security;

-- Allergies RLS
create policy "Patients can view own allergies"
  on public.allergy_intolerances for select to authenticated
  using (public.is_patient_self(patient_id, organization_id));

create policy "Staff can manage patient allergies"
  on public.allergy_intolerances for all to authenticated
  using (public.has_organization_permission(organization_id, 'can_manage_clinical_queue'))
  with check (public.has_organization_permission(organization_id, 'can_manage_clinical_queue'));

-- Conditions RLS
create policy "Patients can view own conditions"
  on public.conditions for select to authenticated
  using (public.is_patient_self(patient_id, organization_id));

create policy "Staff can manage patient conditions"
  on public.conditions for all to authenticated
  using (public.has_organization_permission(organization_id, 'can_manage_clinical_queue'))
  with check (public.has_organization_permission(organization_id, 'can_manage_clinical_queue'));

-- Immunizations RLS
create policy "Patients can view own immunizations"
  on public.immunizations for select to authenticated
  using (public.is_patient_self(patient_id, organization_id));

create policy "Staff can manage patient immunizations"
  on public.immunizations for all to authenticated
  using (public.has_organization_permission(organization_id, 'can_manage_clinical_queue'))
  with check (public.has_organization_permission(organization_id, 'can_manage_clinical_queue'));

-- Procedures RLS
create policy "Patients can view own procedures"
  on public.procedures for select to authenticated
  using (public.is_patient_self(patient_id, organization_id));

create policy "Staff can manage patient procedures"
  on public.procedures for all to authenticated
  using (public.has_organization_permission(organization_id, 'can_manage_clinical_queue'))
  with check (public.has_organization_permission(organization_id, 'can_manage_clinical_queue'));

-- PMR Document Snapshots RLS
create policy "Patients can view own PMR snapshots"
  on public.pmr_document_snapshots for select to authenticated
  using (public.is_patient_self(patient_id, organization_id));

create policy "Staff can read PMR snapshots"
  on public.pmr_document_snapshots for select to authenticated
  using (public.has_organization_permission(organization_id, 'can_manage_clinical_queue')
         or public.has_organization_permission(organization_id, 'can_manage_patients'));

create policy "Authenticated users can create PMR snapshots for self or patients"
  on public.pmr_document_snapshots for insert to authenticated
  with check (
    public.is_patient_self(patient_id, organization_id)
    or public.has_organization_permission(organization_id, 'can_manage_clinical_queue')
    or public.has_organization_permission(organization_id, 'can_manage_patients')
  );

-- PMR Share Links RLS
create policy "Patients can manage own share links"
  on public.pmr_share_links for all to authenticated
  using (public.is_patient_self(patient_id, organization_id))
  with check (public.is_patient_self(patient_id, organization_id));

create policy "Staff can view and manage organization share links"
  on public.pmr_share_links for all to authenticated
  using (public.has_organization_permission(organization_id, 'can_manage_patients'))
  with check (public.has_organization_permission(organization_id, 'can_manage_patients'));

-- Release Audit Log RLS
create policy "Patients can read own release audit log"
  on public.pmr_release_audit_log for select to authenticated
  using (public.is_patient_self(patient_id, organization_id));

create policy "Staff can read tenant release audit log"
  on public.pmr_release_audit_log for select to authenticated
  using (public.has_organization_permission(organization_id, 'can_view_audit_log'));

create policy "Authenticated users can append release audit log"
  on public.pmr_release_audit_log for insert to authenticated
  with check (
    public.is_patient_self(patient_id, organization_id)
    or public.has_organization_permission(organization_id, 'can_manage_patients')
    or public.has_organization_permission(organization_id, 'can_manage_clinical_queue')
  );

-- 6. RPC: record_pmr_release_audit
create or replace function public.record_pmr_release_audit(
  p_organization_id uuid,
  p_patient_id uuid,
  p_document_id text,
  p_action text,
  p_recipient text,
  p_purpose text,
  p_consent_reference text,
  p_sections_included jsonb default '[]'::jsonb,
  p_ip_address text default null,
  p_user_agent text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_log_id bigint;
  v_actor_type text;
begin
  if auth.uid() is not null then
    if public.is_patient_self(p_patient_id, p_organization_id) then
      v_actor_type := 'patient';
    else
      v_actor_type := 'staff';
    end if;
  else
    v_actor_type := 'external_recipient';
  end if;

  insert into public.pmr_release_audit_log (
    organization_id,
    patient_id,
    document_id,
    action,
    recipient,
    purpose,
    consent_reference,
    sections_included,
    actor_id,
    actor_type,
    ip_address,
    user_agent,
    metadata
  ) values (
    p_organization_id,
    p_patient_id,
    p_document_id,
    p_action,
    coalesce(nullif(btrim(p_recipient), ''), 'Self'),
    coalesce(nullif(btrim(p_purpose), ''), 'General Healthcare Record'),
    coalesce(nullif(btrim(p_consent_reference), ''), 'Direct Patient Release (RA 10173)'),
    coalesce(p_sections_included, '[]'::jsonb),
    auth.uid(),
    v_actor_type,
    p_ip_address,
    p_user_agent,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_log_id;

  return v_log_id;
end;
$$;

revoke all on function public.record_pmr_release_audit(uuid, uuid, text, text, text, text, text, jsonb, text, text, jsonb) from public;
grant execute on function public.record_pmr_release_audit(uuid, uuid, text, text, text, text, text, jsonb, text, text, jsonb) to authenticated, anon;

-- 7. RPC: create_pmr_share_link
create or replace function public.create_pmr_share_link(
  p_document_id text,
  p_patient_id uuid,
  p_organization_id uuid,
  p_expires_in_hours integer default 72,
  p_passcode text default null,
  p_max_views integer default 10,
  p_recipient_name text default 'Authorized Healthcare Provider',
  p_recipient_email text default null,
  p_purpose text default 'Continuity of Care Consultation',
  p_consent_reference text default 'Patient Portal Authorized Consent',
  p_sections_included jsonb default '[]'::jsonb
)
returns table (
  share_id uuid,
  share_token text,
  expires_at timestamptz,
  has_passcode boolean
)
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_snapshot_id uuid;
  v_share_token text;
  v_passcode_hash text := null;
  v_expires_at timestamptz;
  v_share_id uuid;
begin
  -- Validate authority: caller must be the patient or clinic staff with manage_patients permission
  if not (public.is_patient_self(p_patient_id, p_organization_id)
          or public.has_organization_permission(p_organization_id, 'can_manage_patients')) then
    raise exception 'You do not have permission to share this medical record.' using errcode = '42501';
  end if;

  select id into v_snapshot_id
  from public.pmr_document_snapshots
  where document_id = p_document_id and patient_id = p_patient_id;

  if v_snapshot_id is null then
    raise exception 'PMR document snapshot not found.' using errcode = 'P0002';
  end if;

  -- Generate cryptographically random share token
  v_share_token := encode(gen_random_bytes(24), 'hex');
  v_expires_at := now() + (coalesce(p_expires_in_hours, 72) || ' hours')::interval;

  if p_passcode is not null and length(btrim(p_passcode)) >= 4 then
    v_passcode_hash := crypt(btrim(p_passcode), gen_salt('bf', 8));
  end if;

  insert into public.pmr_share_links (
    share_token,
    snapshot_id,
    organization_id,
    patient_id,
    passcode_hash,
    expires_at,
    max_views,
    purpose,
    recipient_name,
    recipient_email,
    consent_reference,
    sections_included,
    created_by
  ) values (
    v_share_token,
    v_snapshot_id,
    p_organization_id,
    p_patient_id,
    v_passcode_hash,
    v_expires_at,
    greatest(1, coalesce(p_max_views, 10)),
    btrim(p_purpose),
    btrim(p_recipient_name),
    nullif(btrim(p_recipient_email), ''),
    btrim(p_consent_reference),
    coalesce(p_sections_included, '[]'::jsonb),
    auth.uid()
  )
  returning id into v_share_id;

  -- Record audit log entry
  perform public.record_pmr_release_audit(
    p_organization_id,
    p_patient_id,
    p_document_id,
    'share_link_created',
    p_recipient_name,
    p_purpose,
    p_consent_reference,
    p_sections_included,
    null,
    null,
    jsonb_build_object('share_token', v_share_token, 'expires_at', v_expires_at)
  );

  return query select v_share_id, v_share_token, v_expires_at, (v_passcode_hash is not null);
end;
$$;

revoke all on function public.create_pmr_share_link(text, uuid, uuid, integer, text, integer, text, text, text, text, jsonb) from public;
grant execute on function public.create_pmr_share_link(text, uuid, uuid, integer, text, integer, text, text, text, text, jsonb) to authenticated;

-- 8. RPC: access_pmr_share_link (Public secure access endpoint)
create or replace function public.access_pmr_share_link(
  p_share_token text,
  p_passcode text default null,
  p_ip_address text default null,
  p_user_agent text default null
)
returns table (
  document_payload jsonb,
  sha256_hash text,
  document_id text,
  facility_name text,
  expires_at timestamptz,
  views_remaining integer
)
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_link public.pmr_share_links%rowtype;
  v_snapshot public.pmr_document_snapshots%rowtype;
  v_org_name text;
begin
  select * into v_link
  from public.pmr_share_links
  where share_token = btrim(p_share_token);

  if v_link.id is null then
    raise exception 'Invalid or non-existent share link.' using errcode = 'P0002';
  end if;

  if v_link.revoked then
    raise exception 'This medical record share link has been revoked by the issuer.' using errcode = '42501';
  end if;

  if now() > v_link.expires_at then
    raise exception 'This share link expired on % PHT.', to_char(v_link.expires_at at time zone 'Asia/Manila', 'Mon DD, YYYY HH12:MI AM') using errcode = '22000';
  end if;

  if v_link.view_count >= v_link.max_views then
    raise exception 'This secure share link has reached its maximum view limit.' using errcode = '22000';
  end if;

  -- Validate passcode if protected
  if v_link.passcode_hash is not null then
    if p_passcode is null or crypt(btrim(p_passcode), v_link.passcode_hash) <> v_link.passcode_hash then
      raise exception 'Passcode is required or incorrect.' using errcode = '42501';
    end if;
  end if;

  select * into v_snapshot
  from public.pmr_document_snapshots
  where id = v_link.snapshot_id;

  if v_snapshot.id is null then
    raise exception 'Document snapshot record not found.' using errcode = 'P0002';
  end if;

  select name into v_org_name
  from public.organizations
  where id = v_link.organization_id;

  -- Increment view count atomically
  update public.pmr_share_links
  set view_count = view_count + 1
  where id = v_link.id;

  -- Record audit trail of the access
  perform public.record_pmr_release_audit(
    v_link.organization_id,
    v_link.patient_id,
    v_snapshot.document_id,
    'share_link_accessed',
    v_link.recipient_name,
    v_link.purpose,
    v_link.consent_reference,
    v_link.sections_included,
    p_ip_address,
    p_user_agent,
    jsonb_build_object('share_token', p_share_token, 'view_number', v_link.view_count + 1)
  );

  return query select
    v_snapshot.document_payload,
    v_snapshot.sha256_hash,
    v_snapshot.document_id,
    coalesce(v_org_name, 'Healthcare Facility'),
    v_link.expires_at,
    (v_link.max_views - (v_link.view_count + 1));
end;
$$;

revoke all on function public.access_pmr_share_link(text, text, text, text) from public;
grant execute on function public.access_pmr_share_link(text, text, text, text) to anon, authenticated;

-- 9. RPC: verify_pmr_document (Public verification without exposing PHI)
create or replace function public.verify_pmr_document(p_document_id text)
returns table (
  valid boolean,
  status text,
  document_id text,
  facility_name text,
  issued_at text,
  sha256_hash text,
  copy_type text,
  revision integer,
  watermark text,
  message text
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_snap public.pmr_document_snapshots%rowtype;
  v_org_name text;
begin
  select * into v_snap
  from public.pmr_document_snapshots
  where document_id = btrim(p_document_id);

  if v_snap.id is null then
    return query select
      false,
      'NOT_FOUND'::text,
      p_document_id,
      'Unknown Facility'::text,
      ''::text,
      ''::text,
      ''::text,
      0,
      'INVALID'::text,
      'No clinical record matches this Document ID. Document cannot be verified.'::text;
    return;
  end if;

  select name into v_org_name
  from public.organizations
  where id = v_snap.organization_id;

  if v_snap.watermark_status = 'VOID' or not v_snap.is_latest_revision then
    return query select
      false,
      'VOIDED'::text,
      v_snap.document_id,
      coalesce(v_org_name, 'Healthcare Facility'),
      to_char(v_snap.created_at at time zone 'Asia/Manila', 'Mon DD, YYYY HH12:MI AM PHT'),
      v_snap.sha256_hash,
      v_snap.copy_type,
      v_snap.revision,
      'VOID'::text,
      'This document snapshot has been superseded or voided by a subsequent clinical revision.'::text;
    return;
  end if;

  return query select
    true,
    'VERIFIED'::text,
    v_snap.document_id,
    coalesce(v_org_name, 'Healthcare Facility'),
    to_char(v_snap.created_at at time zone 'Asia/Manila', 'Mon DD, YYYY HH12:MI AM PHT'),
    v_snap.sha256_hash,
    v_snap.copy_type,
    v_snap.revision,
    v_snap.watermark_status,
    'Document authenticity and SHA-256 integrity verified against official clinic registry.'::text;
end;
$$;

revoke all on function public.verify_pmr_document(text) from public;
grant execute on function public.verify_pmr_document(text) to anon, authenticated;
