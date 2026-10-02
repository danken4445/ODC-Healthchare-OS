-- Loop F: admin oversight, permission catalog completion, audit hardening, and
-- teleconsult coverage authorization.
-- Rollback: remove the F read RPC grants and policies, then drop the additive
-- room-assignment audit trigger; no contract columns are removed here.

-- F3: keep every initiative permission accepted by the Roles CMS. Labels live
-- in the admin client, while these constraints protect database writes.
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
    'can_manage_billing', 'can_view_billing', 'can_manage_pos', 'can_manage_claims',
    'can_view_claims', 'can_view_payouts', 'can_manage_payouts', 'can_view_analytics',
    'can_manage_patients', 'can_view_audit_log', 'can_identify_patients',
    'can_manage_clinic_branding', 'can_manage_service_catalog',
    'can_manage_document_templates', 'can_manage_feature_modules', 'can_manage_services',
    'can_manage_professional_fees', 'can_view_clinic_queue', 'can_manage_rooms',
    'can_reassign_appointments'
  ));

insert into public.role_permissions (role_id, organization_id, permission)
select role.id, null, permission.permission
from public.roles role
cross join (values
  ('can_manage_services'::text), ('can_view_clinic_queue'::text),
  ('can_manage_rooms'::text), ('can_reassign_appointments'::text)
) permission(permission)
where role.name in ('admin', 'owner')
on conflict (role_id, organization_id, permission) do nothing;

insert into public.clinic_role_permission_overrides (organization_id, role_code, permission)
select organization.id, defaults.role_code, defaults.permission
from public.organizations organization
cross join (values
  ('admin'::text, 'can_manage_services'::text),
  ('admin'::text, 'can_view_clinic_queue'::text),
  ('admin'::text, 'can_manage_rooms'::text),
  ('admin'::text, 'can_reassign_appointments'::text),
  ('owner'::text, 'can_manage_services'::text),
  ('owner'::text, 'can_view_clinic_queue'::text),
  ('owner'::text, 'can_manage_rooms'::text),
  ('owner'::text, 'can_reassign_appointments'::text)
) defaults(role_code, permission)
on conflict (organization_id, role_code, permission) do nothing;

-- The existing fee RPC keeps the established doctor permission for backwards
-- compatibility, then enforces private/practitioner_declared mode in Postgres.
-- The admin Fees tab must additionally check the organization fee model.
insert into public.clinic_role_permission_overrides (organization_id, role_code, permission)
select settings.organization_id, 'doctor', 'can_manage_professional_fees'
from public.organization_settings settings
where settings.fee_model = 'practitioner_declared'
on conflict (organization_id, role_code, permission) do nothing;

-- F4: room assignment mutations must be represented by the same immutable,
-- organization-scoped audit mechanism used by service assignments.
drop trigger if exists room_assignments_audit on public.room_assignments;
create trigger room_assignments_audit
  after insert or update or delete on public.room_assignments
  for each row execute function public.write_audit_log();

-- F5: direct room reads and the participant listing both accept an assigned
-- doctor or an active, date-valid E-1 covering doctor, never an unrelated doctor.
create or replace function public.is_active_practitioner_coverage(
  p_organization_id uuid, p_covered_practitioner_role_id uuid, p_on_date date
)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_organization_id is null or p_covered_practitioner_role_id is null or p_on_date is null then
    return false;
  end if;
  return exists (
    select 1
    from public.practitioner_coverage_grants coverage
    join public.practitioner_roles covering_role on covering_role.id = coverage.covering_practitioner_role_id
    join public.practitioners covering_practitioner on covering_practitioner.id = covering_role.practitioner_id
    where coverage.organization_id = p_organization_id
      and coverage.covered_practitioner_role_id = p_covered_practitioner_role_id
      and coverage.valid_from <= p_on_date
      and coverage.valid_to > p_on_date
      and covering_role.organization_id = p_organization_id
      and covering_role.active and covering_practitioner.active
      and covering_practitioner.auth_user_id = auth.uid()
  );
end;
$$;
revoke all on function public.is_active_practitioner_coverage(uuid, uuid, date) from public, anon;
grant execute on function public.is_active_practitioner_coverage(uuid, uuid, date) to authenticated;

drop policy if exists teleconsult_rooms_participant_select on public.teleconsult_rooms;
create policy teleconsult_rooms_participant_select on public.teleconsult_rooms
for select to authenticated using (
  exists (
    select 1
    from public.appointments appointment
    left join public.patients patient on patient.id = appointment.patient_id
    left join public.practitioner_roles assigned_role on assigned_role.id = appointment.practitioner_role_id
    left join public.practitioners assigned_practitioner on assigned_practitioner.id = assigned_role.practitioner_id
    where appointment.id = teleconsult_rooms.appointment_id
      and appointment.organization_id = teleconsult_rooms.organization_id
      and appointment.status in ('booked', 'arrived')
      and teleconsult_rooms.status in ('scheduled', 'open')
      and now() >= appointment.start_at - interval '30 minutes'
      and now() <= appointment.end_at + interval '2 hours'
      and (
        (patient.auth_user_id = auth.uid() and patient.active)
        or (assigned_practitioner.auth_user_id = auth.uid() and assigned_practitioner.active and assigned_role.active)
        or public.is_active_practitioner_coverage(appointment.organization_id, appointment.practitioner_role_id, (appointment.start_at at time zone 'Asia/Manila')::date)
      )
  )
);

create or replace function public.list_teleconsult_appointments(p_organization_id uuid)
returns table (
  appointment_id uuid, organization_id uuid, provider public.teleconsult_provider,
  room_name text, room_status public.teleconsult_room_status,
  appointment_status public.appointment_status, start_at timestamptz, end_at timestamptz,
  service_type text, patient_name text, practitioner_name text,
  can_join boolean, encounter_id uuid, encounter_status public.encounter_status
)
language sql stable security definer set search_path = '' as $$
  select appointment.id, appointment.organization_id, room.provider,
    case when now() between appointment.start_at - interval '30 minutes'
      and appointment.end_at + interval '2 hours'
      and appointment.status in ('booked', 'arrived')
      and room.status in ('scheduled', 'open') then room.room_name else null end,
    room.status, appointment.status, appointment.start_at, appointment.end_at,
    appointment.service_type, coalesce(patient.name ->> 'text', 'Patient'),
    coalesce(assigned_practitioner.name ->> 'text', 'Clinician'),
    now() between appointment.start_at - interval '30 minutes'
      and appointment.end_at + interval '2 hours'
      and appointment.status in ('booked', 'arrived')
      and room.status in ('scheduled', 'open')
      and (
        (patient.auth_user_id = auth.uid() and patient.active)
        or (assigned_practitioner.auth_user_id = auth.uid() and assigned_practitioner.active and assigned_role.active)
        or public.is_active_practitioner_coverage(appointment.organization_id, appointment.practitioner_role_id, (appointment.start_at at time zone 'Asia/Manila')::date)
      ),
    encounter.id, encounter.status
  from public.appointments appointment
  join public.teleconsult_rooms room on room.appointment_id = appointment.id
  join public.patients patient on patient.id = appointment.patient_id
  join public.practitioner_roles assigned_role on assigned_role.id = appointment.practitioner_role_id
  join public.practitioners assigned_practitioner on assigned_practitioner.id = assigned_role.practitioner_id
  left join public.encounters encounter on encounter.appointment_id = appointment.id
  where appointment.organization_id = p_organization_id
    and appointment.delivery_mode = 'virtual'
    and (
      (patient.auth_user_id = auth.uid() and patient.active)
      or (assigned_practitioner.auth_user_id = auth.uid() and assigned_practitioner.active and assigned_role.active)
      or public.is_active_practitioner_coverage(appointment.organization_id, appointment.practitioner_role_id, (appointment.start_at at time zone 'Asia/Manila')::date)
    )
  order by appointment.start_at desc;
$$;

revoke all on function public.list_teleconsult_appointments(uuid) from public;
grant execute on function public.list_teleconsult_appointments(uuid) to authenticated;

-- F1: narrow, organization-scoped admin calendar projection. It contains no
-- patient identity and is readable only with the dedicated queue permission.
create or replace function public.list_clinic_calendar(
  p_organization_id uuid, p_week_start date, p_doctor_role_id uuid default null,
  p_clinic_service_id uuid default null
)
returns table (
  doctor_role_id uuid, doctor_name text, service_name text, start_at timestamptz,
  end_at timestamptz, status text, queue_label text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication is required.' using errcode = '28000'; end if;
  if not public.has_organization_permission(p_organization_id, 'can_view_clinic_queue') then
    return;
  end if;
  return query
  select slot.practitioner_role_id,
    coalesce(practitioner.name ->> 'text', 'Practitioner'),
    coalesce(service.name, slot.service_type, 'Consultation'), slot.start_at, slot.end_at,
    case when appointment.id is null then slot.status::text else appointment.status::text end,
    appointment.queue_label
  from public.appointment_slots slot
  join public.practitioner_roles role on role.id = slot.practitioner_role_id and role.organization_id = slot.organization_id
  join public.practitioners practitioner on practitioner.id = role.practitioner_id
  left join public.clinic_services service on service.id = slot.clinic_service_id and service.organization_id = slot.organization_id
  left join public.appointments appointment on appointment.id = slot.appointment_id and appointment.organization_id = slot.organization_id
  where slot.organization_id = p_organization_id
    and slot.start_at >= p_week_start::timestamptz
    and slot.start_at < (p_week_start + 7)::timestamptz
    and (p_doctor_role_id is null or slot.practitioner_role_id = p_doctor_role_id)
    and (p_clinic_service_id is null or slot.clinic_service_id = p_clinic_service_id)
  order by slot.start_at, doctor_name;
end;
$$;
revoke all on function public.list_clinic_calendar(uuid, date, uuid, uuid) from public, anon;
grant execute on function public.list_clinic_calendar(uuid, date, uuid, uuid) to authenticated;

-- F2: one read projection for the doctor management screen. Fee detail is
-- deliberately blank for government/fixed-rate organizations.
create or replace function public.list_doctor_management(p_organization_id uuid, p_date date)
returns table (
  practitioner_role_id uuid, doctor_name text, assigned_services text[], room_label text,
  queue_prefix text, declared_fee_summary text
)
language plpgsql stable security definer set search_path = '' as $$
declare v_private boolean;
begin
  if auth.uid() is null then raise exception 'Authentication is required.' using errcode = '28000'; end if;
  if not public.has_organization_permission(p_organization_id, 'can_access_admin_portal') then
    raise exception 'Administrative workspace permission is required.' using errcode = '42501';
  end if;
  select settings.fee_model = 'practitioner_declared' into v_private
  from public.organization_settings settings where settings.organization_id = p_organization_id;
  return query
  select role.id, coalesce(practitioner.name ->> 'text', 'Practitioner'),
    coalesce((select array_agg(service.name order by service.name)
      from public.service_practitioners membership join public.clinic_services service on service.id = membership.clinic_service_id
      where membership.organization_id = p_organization_id and membership.practitioner_role_id = role.id and membership.is_active), '{}'::text[]),
    (select room.label from public.room_assignments assignment join public.clinic_rooms room on room.id = assignment.room_id
      where assignment.organization_id = p_organization_id and assignment.practitioner_role_id = role.id and assignment.date = p_date limit 1),
    role.queue_prefix,
    case when v_private then (select format('%s declared / %s services', count(*) filter (where fee.amount is not null), count(*))
      from public.service_practitioners membership left join public.practitioner_service_fees fee on fee.service_practitioner_id = membership.id and fee.superseded_at is null
      where membership.organization_id = p_organization_id and membership.practitioner_role_id = role.id and membership.is_active) else null end
  from public.practitioner_roles role join public.practitioners practitioner on practitioner.id = role.practitioner_id
  where role.organization_id = p_organization_id and role.role_code = 'doctor' and role.active and practitioner.active
  order by doctor_name;
end;
$$;
revoke all on function public.list_doctor_management(uuid, date) from public, anon;
grant execute on function public.list_doctor_management(uuid, date) to authenticated;
