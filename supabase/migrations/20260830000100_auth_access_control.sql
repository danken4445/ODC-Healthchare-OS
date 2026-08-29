-- Phase 2: authentication identities, walk-in access, and database-enforced
-- authorization. Every browser-facing policy below is based on either an active
-- PractitionerRole or the exact Patient record named in the JWT.

alter table public.patients
  add column walk_in_pin_hash text,
  add column walk_in_failed_attempts integer not null default 0 check (walk_in_failed_attempts >= 0),
  add column walk_in_locked_until timestamptz;

alter table public.patients
  add constraint patients_walk_in_credentials_check check (
    (auth_user_id is not null and walk_in_pin_hash is null)
    or (auth_user_id is null and walk_in_id is not null)
  );

create sequence public.walk_in_reference_seq as bigint start with 1;

-- Walk-in JWT subjects are Patient IDs rather than auth.users IDs. Preserve an
-- auditable actor identifier for both identity kinds without pretending a
-- walk-in patient has an Auth user.
alter table public.audit_log
  drop constraint if exists audit_log_actor_id_fkey,
  add column actor_type text not null default 'system'
    check (actor_type in ('registered_user', 'walk_in_patient', 'system'));

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  resource jsonb;
  resource_id uuid;
  resource_org_id uuid;
  audit_actor_id uuid;
  audit_actor_type text;
begin
  resource := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  resource_id := (resource ->> 'id')::uuid;
  resource_org_id := nullif(resource ->> 'organization_id', '')::uuid;

  if coalesce(auth.jwt() ->> 'walk_in_access', 'false') = 'true' then
    audit_actor_id := (auth.jwt() ->> 'patient_id')::uuid;
    audit_actor_type := 'walk_in_patient';
  elsif auth.uid() is not null then
    audit_actor_id := auth.uid();
    audit_actor_type := 'registered_user';
  else
    audit_actor_id := null;
    audit_actor_type := 'system';
  end if;

  insert into public.audit_log (organization_id, actor_id, actor_type, action, table_name, record_id)
  values (resource_org_id, audit_actor_id, audit_actor_type, lower(tg_op), tg_table_name, resource_id);
  return coalesce(new, old);
end;
$$;

-- A staff session is valid only when its auth identity is connected to an active
-- Practitioner and an active PractitionerRole at the requested organization.
create or replace function public.has_organization_role(target_organization_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.practitioner_roles practitioner_role
    join public.practitioners practitioner on practitioner.id = practitioner_role.practitioner_id
    where practitioner_role.organization_id = target_organization_id
      and practitioner_role.active
      and practitioner.active
      and practitioner.auth_user_id = auth.uid()
      and practitioner_role.role_code = any(allowed_roles)
  );
$$;

create or replace function public.can_access_organization(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_organization_role(
    target_organization_id,
    array['doctor', 'nurse', 'lab_staff', 'specialist', 'front_desk', 'admin', 'owner']
  );
$$;

create or replace function public.is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.practitioner_roles practitioner_role
    join public.practitioners practitioner on practitioner.id = practitioner_role.practitioner_id
    where practitioner_role.active
      and practitioner.active
      and practitioner.auth_user_id = auth.uid()
  );
$$;

create or replace function public.is_walk_in_patient(target_patient_id uuid, target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(auth.jwt() ->> 'walk_in_access', 'false') = 'true'
    and auth.jwt() ->> 'patient_id' = target_patient_id::text
    and auth.jwt() ->> 'organization_id' = target_organization_id::text
    and exists (
      select 1
      from public.patients patient
      where patient.id = target_patient_id
        and patient.organization_id = target_organization_id
        and patient.active
        and patient.auth_user_id is null
        and patient.walk_in_id = auth.jwt() ->> 'walk_in_id'
    );
$$;

create or replace function public.is_patient_self(target_patient_id uuid, target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.patients patient
    where patient.id = target_patient_id
      and patient.organization_id = target_organization_id
      and patient.active
      and patient.auth_user_id = auth.uid()
  ) or public.is_walk_in_patient(target_patient_id, target_organization_id);
$$;

create or replace function public.is_any_owner()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.practitioner_roles practitioner_role
    join public.practitioners practitioner on practitioner.id = practitioner_role.practitioner_id
    where practitioner_role.active
      and practitioner.active
      and practitioner.auth_user_id = auth.uid()
      and practitioner_role.role_code = 'owner'
  );
$$;

-- A four-digit PIN must never be returned through PostgREST. The value is kept
-- on the Patient row as a bcrypt hash and can only be checked by the narrowly
-- scoped verifier used by the Edge Function and record-claim RPC.
revoke all on public.patients from anon, authenticated;
grant select (
  id, organization_id, auth_user_id, walk_in_id, active, identifier, name,
  telecom, gender, birth_date, address, contact, communication, created_at, updated_at
) on public.patients to authenticated;
grant insert (
  id, organization_id, auth_user_id, walk_in_id, active, identifier, name,
  telecom, gender, birth_date, address, contact, communication, created_at, updated_at
) on public.patients to authenticated;
grant update (
  id, organization_id, auth_user_id, walk_in_id, active, identifier, name,
  telecom, gender, birth_date, address, contact, communication, created_at, updated_at
) on public.patients to authenticated;
grant delete on public.patients to authenticated;

-- Front desk staff receive the PIN exactly once. No raw PIN is retained.
create or replace function public.create_walk_in_patient(
  p_organization_id uuid,
  p_name jsonb,
  p_telecom jsonb default '[]'::jsonb,
  p_birth_date date default null,
  p_gender text default null
)
returns table (patient_id uuid, walk_in_id text, pin text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_patient_id uuid;
  v_walk_in_id text;
  v_pin text;
  v_pin_bytes bytea;
begin
  if not public.has_organization_role(p_organization_id, array['front_desk', 'admin', 'owner']) then
    raise exception 'Only front desk or administrative staff may register walk-in patients.'
      using errcode = '42501';
  end if;

  if jsonb_typeof(p_name) <> 'object' then
    raise exception 'Patient name must be a JSON object.' using errcode = '22023';
  end if;

  v_walk_in_id := format(
    'WK-%s-%s',
    to_char(now() at time zone 'UTC', 'YYYY'),
    lpad(nextval('public.walk_in_reference_seq')::text, 6, '0')
  );
  v_pin_bytes := gen_random_bytes(2);
  v_pin := lpad(((get_byte(v_pin_bytes, 0) * 256 + get_byte(v_pin_bytes, 1)) % 10000)::text, 4, '0');

  insert into public.patients (
    organization_id, walk_in_id, walk_in_pin_hash, name, telecom, birth_date, gender
  ) values (
    p_organization_id, v_walk_in_id, crypt(v_pin, gen_salt('bf')), p_name,
    coalesce(p_telecom, '[]'::jsonb), p_birth_date, p_gender
  ) returning id into v_patient_id;

  return query select v_patient_id, v_walk_in_id, v_pin;
end;
$$;

-- The service-role Edge Function calls this verifier before signing a JWT. It
-- intentionally returns no demographics, credential material, or error detail.
create or replace function public.verify_walk_in_patient(
  p_organization_id uuid,
  p_walk_in_id text,
  p_pin text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_patient public.patients%rowtype;
begin
  select * into v_patient
  from public.patients patient
  where patient.organization_id = p_organization_id
    and patient.walk_in_id = p_walk_in_id
    and patient.active
    and patient.auth_user_id is null
  for update;

  if not found or v_patient.walk_in_locked_until > now() then
    return null;
  end if;

  if v_patient.walk_in_pin_hash = crypt(p_pin, v_patient.walk_in_pin_hash) then
    update public.patients
    set walk_in_failed_attempts = 0, walk_in_locked_until = null
    where id = v_patient.id;
    return v_patient.id;
  end if;

  update public.patients
  set walk_in_failed_attempts = walk_in_failed_attempts + 1,
      walk_in_locked_until = case
        when walk_in_failed_attempts + 1 >= 5 then now() + interval '15 minutes'
        else walk_in_locked_until
      end
  where id = v_patient.id;
  return null;
end;
$$;

-- Links a real Supabase Auth user to the existing Patient row. It never inserts
-- a second patient record and invalidates every previously issued walk-in token.
create or replace function public.claim_walk_in_patient(
  p_organization_id uuid,
  p_walk_in_id text,
  p_pin text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_patient_id uuid;
begin
  if auth.uid() is null or not exists (select 1 from auth.users where id = auth.uid()) then
    raise exception 'A registered patient session is required.' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.patients patient
    where patient.organization_id = p_organization_id and patient.auth_user_id = auth.uid()
  ) then
    raise exception 'This account is already linked to a patient record.' using errcode = '23505';
  end if;

  v_patient_id := public.verify_walk_in_patient(p_organization_id, p_walk_in_id, p_pin);
  if v_patient_id is null then
    raise exception 'Invalid walk-in credentials.' using errcode = '22023';
  end if;

  update public.patients patient
  set auth_user_id = auth.uid(), walk_in_pin_hash = null
  where patient.id = v_patient_id
  returning patient.id into v_patient_id;

  return v_patient_id;
end;
$$;

revoke all on function public.has_organization_role(uuid, text[]) from public;
revoke all on function public.can_access_organization(uuid) from public;
revoke all on function public.is_active_staff() from public;
revoke all on function public.is_walk_in_patient(uuid, uuid) from public;
revoke all on function public.is_patient_self(uuid, uuid) from public;
revoke all on function public.is_any_owner() from public;
revoke all on function public.create_walk_in_patient(uuid, jsonb, jsonb, date, text) from public;
revoke all on function public.verify_walk_in_patient(uuid, text, text) from public;
revoke all on function public.claim_walk_in_patient(uuid, text, text) from public;
grant execute on function public.create_walk_in_patient(uuid, jsonb, jsonb, date, text) to authenticated;
grant execute on function public.claim_walk_in_patient(uuid, text, text) to authenticated;
grant execute on function public.verify_walk_in_patient(uuid, text, text) to service_role;
grant execute on function public.has_organization_role(uuid, text[]) to authenticated;
grant execute on function public.can_access_organization(uuid) to authenticated;
grant execute on function public.is_active_staff() to authenticated;
grant execute on function public.is_walk_in_patient(uuid, uuid) to authenticated;
grant execute on function public.is_patient_self(uuid, uuid) to authenticated;
grant execute on function public.is_any_owner() to authenticated;

-- A patient may edit demographic fields, but identity linkage and credentials
-- cannot be changed by an ordinary client update. The narrow exception is the
-- claim RPC's atomic transition from an unclaimed walk-in to auth.uid().
create or replace function public.protect_patient_identity()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if old.organization_id is not distinct from new.organization_id
    and old.auth_user_id is not distinct from new.auth_user_id
    and old.walk_in_id is not distinct from new.walk_in_id
    and old.walk_in_pin_hash is not distinct from new.walk_in_pin_hash then
    return new;
  end if;

  if public.has_organization_role(old.organization_id, array['front_desk', 'admin', 'owner']) then
    return new;
  end if;

  if old.auth_user_id is null
    and new.auth_user_id = auth.uid()
    and new.walk_in_id is not distinct from old.walk_in_id
    and new.walk_in_pin_hash is null then
    return new;
  end if;

  raise exception 'Patient identity and walk-in credentials may only be changed through authorized workflows.'
    using errcode = '42501';
end;
$$;

create trigger patients_identity_protection before update on public.patients
  for each row execute function public.protect_patient_identity();

revoke all on function public.protect_patient_identity() from public;

-- RLS scopes a request by organization; these checks prevent an otherwise
-- authorized writer from attaching a guessed foreign key from another tenant.
create or replace function public.enforce_clinical_tenant_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resource jsonb := to_jsonb(new);
  v_organization_id uuid := (to_jsonb(new) ->> 'organization_id')::uuid;
begin
  if v_resource ? 'patient_id' and v_resource ->> 'patient_id' is not null and not exists (
    select 1 from public.patients patient
    where patient.id = (v_resource ->> 'patient_id')::uuid
      and patient.organization_id = v_organization_id
  ) then
    raise exception 'Patient must belong to the record organization.' using errcode = '23503';
  end if;

  if v_resource ? 'appointment_id' and v_resource ->> 'appointment_id' is not null and not exists (
    select 1 from public.appointments appointment
    where appointment.id = (v_resource ->> 'appointment_id')::uuid
      and appointment.organization_id = v_organization_id
  ) then
    raise exception 'Appointment must belong to the record organization.' using errcode = '23503';
  end if;

  if v_resource ? 'encounter_id' and v_resource ->> 'encounter_id' is not null and not exists (
    select 1 from public.encounters encounter
    where encounter.id = (v_resource ->> 'encounter_id')::uuid
      and encounter.organization_id = v_organization_id
  ) then
    raise exception 'Encounter must belong to the record organization.' using errcode = '23503';
  end if;

  if v_resource ? 'practitioner_id' and not exists (
    select 1 from public.practitioners practitioner
    where practitioner.id = (v_resource ->> 'practitioner_id')::uuid
      and practitioner.organization_id = v_organization_id
  ) then
    raise exception 'Practitioner must belong to the record organization.' using errcode = '23503';
  end if;

  if v_resource ? 'practitioner_role_id' and v_resource ->> 'practitioner_role_id' is not null and not exists (
    select 1 from public.practitioner_roles practitioner_role
    where practitioner_role.id = (v_resource ->> 'practitioner_role_id')::uuid
      and practitioner_role.organization_id = v_organization_id
  ) then
    raise exception 'Practitioner role must belong to the record organization.' using errcode = '23503';
  end if;

  if v_resource ? 'performer_practitioner_id' and v_resource ->> 'performer_practitioner_id' is not null and not exists (
    select 1 from public.practitioners practitioner
    where practitioner.id = (v_resource ->> 'performer_practitioner_id')::uuid
      and practitioner.organization_id = v_organization_id
  ) then
    raise exception 'Performer must belong to the record organization.' using errcode = '23503';
  end if;

  if v_resource ? 'requester_practitioner_id' and v_resource ->> 'requester_practitioner_id' is not null and not exists (
    select 1 from public.practitioners practitioner
    where practitioner.id = (v_resource ->> 'requester_practitioner_id')::uuid
      and practitioner.organization_id = v_organization_id
  ) then
    raise exception 'Requester must belong to the record organization.' using errcode = '23503';
  end if;

  if v_resource ? 'author_practitioner_id' and v_resource ->> 'author_practitioner_id' is not null and not exists (
    select 1 from public.practitioners practitioner
    where practitioner.id = (v_resource ->> 'author_practitioner_id')::uuid
      and practitioner.organization_id = v_organization_id
  ) then
    raise exception 'Author must belong to the record organization.' using errcode = '23503';
  end if;

  if v_resource ? 'based_on_service_request_id' and v_resource ->> 'based_on_service_request_id' is not null and not exists (
    select 1 from public.service_requests service_request
    where service_request.id = (v_resource ->> 'based_on_service_request_id')::uuid
      and service_request.organization_id = v_organization_id
  ) then
    raise exception 'Service request must belong to the record organization.' using errcode = '23503';
  end if;

  if v_resource ? 'coverage_id' and v_resource ->> 'coverage_id' is not null and not exists (
    select 1 from public.coverages coverage
    where coverage.id = (v_resource ->> 'coverage_id')::uuid
      and coverage.organization_id = v_organization_id
  ) then
    raise exception 'Coverage must belong to the record organization.' using errcode = '23503';
  end if;

  if v_resource ? 'performer_practitioner_role_id' and v_resource ->> 'performer_practitioner_role_id' is not null and not exists (
    select 1 from public.practitioner_roles practitioner_role
    where practitioner_role.id = (v_resource ->> 'performer_practitioner_role_id')::uuid
      and practitioner_role.organization_id = (v_resource ->> 'performer_organization_id')::uuid
  ) then
    raise exception 'Performer practitioner role must belong to the performer organization.' using errcode = '23503';
  end if;

  return new;
end;
$$;

create trigger practitioner_roles_tenant_integrity before insert or update on public.practitioner_roles
  for each row execute function public.enforce_clinical_tenant_integrity();
create trigger appointments_tenant_integrity before insert or update on public.appointments
  for each row execute function public.enforce_clinical_tenant_integrity();
create trigger encounters_tenant_integrity before insert or update on public.encounters
  for each row execute function public.enforce_clinical_tenant_integrity();
create trigger observations_tenant_integrity before insert on public.observations
  for each row execute function public.enforce_clinical_tenant_integrity();
create trigger medication_requests_tenant_integrity before insert or update on public.medication_requests
  for each row execute function public.enforce_clinical_tenant_integrity();
create trigger service_requests_tenant_integrity before insert or update on public.service_requests
  for each row execute function public.enforce_clinical_tenant_integrity();
create trigger diagnostic_reports_tenant_integrity before insert or update on public.diagnostic_reports
  for each row execute function public.enforce_clinical_tenant_integrity();
create trigger document_references_tenant_integrity before insert or update on public.document_references
  for each row execute function public.enforce_clinical_tenant_integrity();
create trigger coverages_tenant_integrity before insert or update on public.coverages
  for each row execute function public.enforce_clinical_tenant_integrity();
create trigger claims_tenant_integrity before insert or update on public.claims
  for each row execute function public.enforce_clinical_tenant_integrity();

revoke all on function public.enforce_clinical_tenant_integrity() from public;

-- Recreate Phase 1 policies so each table has an explicit, least-privilege
-- operation policy. The absence of a mutation policy is intentional for roles,
-- audit_log, and immutable observations. Patients and appointments are retained
-- rather than client-deleted; staff use status changes for lifecycle events.
drop policy if exists organizations_select on public.organizations;
drop policy if exists organizations_manage on public.organizations;
drop policy if exists practitioners_select on public.practitioners;
drop policy if exists practitioners_manage on public.practitioners;
drop policy if exists practitioner_roles_select on public.practitioner_roles;
drop policy if exists practitioner_roles_manage on public.practitioner_roles;
drop policy if exists patients_select on public.patients;
drop policy if exists patients_insert on public.patients;
drop policy if exists patients_update on public.patients;
drop policy if exists appointments_select on public.appointments;
drop policy if exists appointments_insert on public.appointments;
drop policy if exists appointments_update on public.appointments;
drop policy if exists clinical_staff_select on public.encounters;
drop policy if exists clinical_staff_manage on public.encounters;
drop policy if exists observations_select on public.observations;
drop policy if exists observations_insert on public.observations;
drop policy if exists medication_requests_select on public.medication_requests;
drop policy if exists medication_requests_manage on public.medication_requests;
drop policy if exists service_requests_select on public.service_requests;
drop policy if exists service_requests_manage on public.service_requests;
drop policy if exists diagnostic_reports_select on public.diagnostic_reports;
drop policy if exists diagnostic_reports_manage on public.diagnostic_reports;
drop policy if exists document_references_select on public.document_references;
drop policy if exists document_references_manage on public.document_references;
drop policy if exists coverages_patient_or_staff_select on public.coverages;
drop policy if exists coverages_manage on public.coverages;
drop policy if exists claims_patient_or_staff_select on public.claims;
drop policy if exists claims_manage on public.claims;
drop policy if exists roles_select on public.roles;
drop policy if exists role_permissions_select on public.role_permissions;
drop policy if exists role_permissions_manage on public.role_permissions;
drop policy if exists user_roles_select on public.user_roles;
drop policy if exists user_roles_manage on public.user_roles;
drop policy if exists audit_log_select on public.audit_log;

-- Organization, identity, and access catalogs.
create policy organizations_select on public.organizations for select to authenticated
  using (public.can_access_organization(id) or exists (
    select 1 from public.patients patient
    where patient.organization_id = id and public.is_patient_self(patient.id, patient.organization_id)
  ));
create policy organizations_manage on public.organizations for all to authenticated
  using (public.has_organization_role(id, array['owner', 'admin']))
  with check (public.has_organization_role(id, array['owner', 'admin']));

create policy practitioners_select on public.practitioners for select to authenticated
  using (auth_user_id = auth.uid() or public.can_access_organization(organization_id) or exists (
    select 1 from public.patients patient
    where patient.organization_id = practitioners.organization_id
      and public.is_patient_self(patient.id, patient.organization_id)
  ));
create policy practitioners_manage on public.practitioners for all to authenticated
  using (public.has_organization_role(organization_id, array['owner', 'admin']))
  with check (public.has_organization_role(organization_id, array['owner', 'admin']));

create policy practitioner_roles_select on public.practitioner_roles for select to authenticated
  using (public.can_access_organization(organization_id) or exists (
    select 1 from public.patients patient
    where patient.organization_id = practitioner_roles.organization_id
      and public.is_patient_self(patient.id, patient.organization_id)
  ));
create policy practitioner_roles_manage on public.practitioner_roles for all to authenticated
  using (public.has_organization_role(organization_id, array['owner', 'admin']))
  with check (public.has_organization_role(organization_id, array['owner', 'admin']));

create policy patients_select on public.patients for select to authenticated
  using (public.is_patient_self(id, organization_id) or public.can_access_organization(organization_id));
create policy patients_insert_self on public.patients for insert to authenticated
  with check (auth_user_id = auth.uid() and walk_in_id is null and walk_in_pin_hash is null);
create policy patients_insert_staff on public.patients for insert to authenticated
  with check (
    public.has_organization_role(organization_id, array['front_desk', 'admin', 'owner'])
    and auth_user_id is not null
    and walk_in_id is null
    and walk_in_pin_hash is null
  );
create policy patients_update on public.patients for update to authenticated
  using (public.is_patient_self(id, organization_id) or public.has_organization_role(organization_id, array['front_desk', 'admin', 'owner']))
  with check (public.is_patient_self(id, organization_id) or public.has_organization_role(organization_id, array['front_desk', 'admin', 'owner']));

-- Scheduling data: patients (including scoped walk-ins) see only their own appointments.
create policy appointments_select on public.appointments for select to authenticated
  using (public.is_patient_self(patient_id, organization_id) or public.can_access_organization(organization_id));
create policy appointments_insert on public.appointments for insert to authenticated
  with check (
    public.is_patient_self(patient_id, organization_id)
    or public.has_organization_role(organization_id, array['front_desk', 'admin', 'owner'])
  );
create policy appointments_update on public.appointments for update to authenticated
  using (public.has_organization_role(organization_id, array['front_desk', 'admin', 'owner']))
  with check (public.has_organization_role(organization_id, array['front_desk', 'admin', 'owner']));

-- Clinical resources: operational staff are limited by capability; patients see only their own record.
create policy encounters_select on public.encounters for select to authenticated
  using (public.is_patient_self(patient_id, organization_id) or public.has_organization_role(organization_id, array['doctor', 'nurse', 'specialist', 'admin', 'owner']));
create policy encounters_manage on public.encounters for all to authenticated
  using (public.has_organization_role(organization_id, array['doctor', 'nurse', 'specialist', 'admin', 'owner']))
  with check (public.has_organization_role(organization_id, array['doctor', 'nurse', 'specialist', 'admin', 'owner']));

create policy observations_select on public.observations for select to authenticated
  using (public.is_patient_self(patient_id, organization_id) or public.has_organization_role(organization_id, array['doctor', 'nurse', 'lab_staff', 'specialist', 'admin', 'owner']));
create policy observations_insert on public.observations for insert to authenticated
  with check (public.has_organization_role(organization_id, array['doctor', 'nurse', 'lab_staff', 'specialist', 'admin', 'owner']));

create policy medication_requests_select on public.medication_requests for select to authenticated
  using (public.is_patient_self(patient_id, organization_id) or public.has_organization_role(organization_id, array['doctor', 'nurse', 'specialist', 'admin', 'owner']));
create policy medication_requests_manage on public.medication_requests for all to authenticated
  using (public.has_organization_role(organization_id, array['doctor', 'specialist', 'admin', 'owner']))
  with check (public.has_organization_role(organization_id, array['doctor', 'specialist', 'admin', 'owner']));

create policy service_requests_select on public.service_requests for select to authenticated
  using (public.is_patient_self(patient_id, organization_id) or public.has_organization_role(organization_id, array['doctor', 'nurse', 'lab_staff', 'specialist', 'admin', 'owner']));
create policy service_requests_manage on public.service_requests for all to authenticated
  using (public.has_organization_role(organization_id, array['doctor', 'nurse', 'lab_staff', 'specialist', 'admin', 'owner']))
  with check (public.has_organization_role(organization_id, array['doctor', 'nurse', 'lab_staff', 'specialist', 'admin', 'owner']));

create policy diagnostic_reports_select on public.diagnostic_reports for select to authenticated
  using (public.is_patient_self(patient_id, organization_id) or public.has_organization_role(organization_id, array['doctor', 'nurse', 'lab_staff', 'specialist', 'admin', 'owner']));
create policy diagnostic_reports_manage on public.diagnostic_reports for all to authenticated
  using (public.has_organization_role(organization_id, array['lab_staff', 'doctor', 'specialist', 'admin', 'owner']))
  with check (public.has_organization_role(organization_id, array['lab_staff', 'doctor', 'specialist', 'admin', 'owner']));

create policy document_references_select on public.document_references for select to authenticated
  using (public.is_patient_self(patient_id, organization_id) or public.has_organization_role(organization_id, array['doctor', 'nurse', 'specialist', 'admin', 'owner']));
create policy document_references_manage on public.document_references for all to authenticated
  using (public.has_organization_role(organization_id, array['doctor', 'nurse', 'specialist', 'admin', 'owner']))
  with check (public.has_organization_role(organization_id, array['doctor', 'nurse', 'specialist', 'admin', 'owner']));

-- Financial data is intentionally narrower than general staff access.
create policy coverages_select on public.coverages for select to authenticated
  using (public.is_patient_self(patient_id, organization_id) or public.has_organization_role(organization_id, array['front_desk', 'admin', 'owner']));
create policy coverages_manage on public.coverages for all to authenticated
  using (public.has_organization_role(organization_id, array['front_desk', 'admin', 'owner']))
  with check (public.has_organization_role(organization_id, array['front_desk', 'admin', 'owner']));
create policy claims_select on public.claims for select to authenticated
  using (public.is_patient_self(patient_id, organization_id) or public.has_organization_role(organization_id, array['admin', 'owner']));
create policy claims_manage on public.claims for all to authenticated
  using (public.has_organization_role(organization_id, array['admin', 'owner']))
  with check (public.has_organization_role(organization_id, array['admin', 'owner']));

-- Authorization metadata and audit records have no direct client mutation policy.
create policy roles_select on public.roles for select to authenticated using (public.is_active_staff());
create policy role_permissions_select on public.role_permissions for select to authenticated
  using ((organization_id is null and public.is_active_staff()) or public.can_access_organization(organization_id));
create policy role_permissions_manage on public.role_permissions for all to authenticated
  using ((organization_id is null and public.is_any_owner()) or public.has_organization_role(organization_id, array['owner']))
  with check ((organization_id is null and public.is_any_owner()) or public.has_organization_role(organization_id, array['owner']));
create policy user_roles_select on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_organization_role(organization_id, array['admin', 'owner']));
create policy user_roles_manage on public.user_roles for all to authenticated
  using (public.has_organization_role(organization_id, array['owner']))
  with check (public.has_organization_role(organization_id, array['owner']));
create policy audit_log_select on public.audit_log for select to authenticated
  using (organization_id is not null and public.has_organization_role(organization_id, array['admin', 'owner']));

-- Audit the authorization metadata too. audit_log itself intentionally has no
-- trigger to avoid recursion; it has no browser write policy.
create trigger roles_audit after insert or update or delete on public.roles
  for each row execute function public.write_audit_log();
create trigger role_permissions_audit after insert or update or delete on public.role_permissions
  for each row execute function public.write_audit_log();
create trigger user_roles_audit after insert or update or delete on public.user_roles
  for each row execute function public.write_audit_log();

comment on column public.patients.walk_in_pin_hash is
  'Bcrypt hash of the one-time walk-in PIN. Deliberately unavailable to anon and authenticated API roles; five failed checks lock it for 15 minutes.';
comment on function public.create_walk_in_patient(uuid, jsonb, jsonb, date, text) is
  'Front-desk-only registration. Returns the four-digit PIN once; only its bcrypt hash is stored.';
comment on function public.claim_walk_in_patient(uuid, text, text) is
  'Claims an existing walk-in Patient for the current auth.users identity without creating a duplicate Patient.';
