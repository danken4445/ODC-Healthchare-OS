-- Pharmacy prescription transcription queue.
-- A nurse may transcribe a physical prescription and see Pharmacy availability;
-- only an assigned Pharmacy staff member can review and complete a dispense.

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
    'can_reassign_appointments', 'can_encode_pharmacy_prescriptions',
    'can_dispense_pharmacy_prescriptions', 'can_export_epidemiology_records'
  ));

create or replace function public.save_clinic_role_definition(
  p_organization_id uuid, p_code text, p_name text, p_permissions text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  normalized_code text := coalesce(
    nullif(lower(btrim(p_code)), ''),
    lower(replace(public.system_generated_code('role'), '-', '_'))
  );
  normalized_name text := btrim(p_name);
  allowed_permissions text[] := array[
    'can_access_admin_portal', 'can_access_provider_portal',
    'can_manage_appointments', 'can_record_triage', 'can_start_consultation',
    'can_manage_provider_schedule', 'can_manage_staff_roles',
    'can_view_inventory', 'can_manage_inventory', 'can_tag_inventory_usage',
    'can_order_diagnostics', 'can_view_diagnostics',
    'can_view_lab_worklist', 'can_record_lab_results',
    'can_view_referrals', 'can_update_referrals',
    'can_manage_laboratory_services', 'can_manage_billing',
    'can_view_billing', 'can_manage_pos', 'can_manage_claims',
    'can_view_claims', 'can_view_payouts', 'can_manage_payouts',
    'can_view_analytics', 'can_manage_patients', 'can_view_audit_log',
    'can_identify_patients', 'can_manage_clinic_branding',
    'can_manage_service_catalog', 'can_manage_document_templates',
    'can_manage_feature_modules', 'can_manage_services',
    'can_manage_professional_fees', 'can_view_clinic_queue',
    'can_manage_rooms', 'can_reassign_appointments',
    'can_encode_pharmacy_prescriptions', 'can_dispense_pharmacy_prescriptions',
    'can_export_epidemiology_records'
  ];
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
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
$function$;

create table public.pharmacy_prescription_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  patient_id uuid not null references public.patients(id),
  encounter_id uuid not null references public.encounters(id),
  medication_request_id uuid references public.medication_requests(id),
  physical_prescription_reference text,
  prescriber_name text,
  source_type text not null default 'physical_transcription' check (
    source_type in ('physical_transcription', 'native_prescription')
  ),
  priority text not null default 'routine' check (priority in ('routine', 'urgent', 'emergency')),
  status text not null default 'submitted' check (status in (
    'draft', 'submitted', 'under_pharmacist_review', 'ready_to_dispense',
    'partially_dispensed', 'completed', 'cancelled', 'rejected'
  )),
  notes text,
  submitted_by uuid not null references auth.users(id),
  reviewed_by uuid references auth.users(id),
  completed_by uuid references auth.users(id),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  check (
    nullif(btrim(coalesce(physical_prescription_reference, '')), '') is not null
    or medication_request_id is not null
  )
);

create table public.pharmacy_prescription_order_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  order_id uuid not null,
  item_id uuid references public.inventory_items(id),
  original_medication text not null,
  dosage_instruction text,
  requested_quantity numeric(14,3) not null,
  dispensed_quantity numeric(14,3) not null default 0,
  unit_of_measure text,
  status text not null default 'entered' check (status in (
    'entered', 'available', 'unavailable', 'pharmacist_verified',
    'partially_dispensed', 'dispensed', 'cancelled', 'external_referral'
  )),
  notes text,
  pharmacist_reason text,
  unit_price_in_centavos bigint,
  line_total_in_centavos bigint,
  usage_id uuid references public.inventory_usages(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (order_id, organization_id)
    references public.pharmacy_prescription_orders(id, organization_id) on delete cascade,
  foreign key (item_id, organization_id)
    references public.inventory_items(id, organization_id),
  check (requested_quantity > 0),
  check (dispensed_quantity >= 0 and dispensed_quantity <= requested_quantity),
  check (unit_price_in_centavos is null or unit_price_in_centavos >= 0),
  check (line_total_in_centavos is null or line_total_in_centavos >= 0)
);

create table public.pharmacy_prescription_order_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  order_id uuid not null,
  line_id uuid references public.pharmacy_prescription_order_lines(id),
  status text not null check (status in (
    'draft', 'submitted', 'under_pharmacist_review', 'ready_to_dispense',
    'available', 'entered', 'unavailable', 'pharmacist_verified',
    'partially_dispensed', 'dispensed', 'cancelled', 'external_referral',
    'completed', 'rejected'
  )),
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (order_id, organization_id)
    references public.pharmacy_prescription_orders(id, organization_id) on delete cascade
);

create index pharmacy_prescription_orders_queue_idx
  on public.pharmacy_prescription_orders (organization_id, status, priority, submitted_at);
create index pharmacy_prescription_orders_patient_idx
  on public.pharmacy_prescription_orders (organization_id, patient_id, submitted_at desc);
create index pharmacy_prescription_order_lines_order_idx
  on public.pharmacy_prescription_order_lines (organization_id, order_id, status);
create index pharmacy_prescription_order_events_order_idx
  on public.pharmacy_prescription_order_events (organization_id, order_id, created_at);

create or replace function public.set_pharmacy_prescription_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger pharmacy_prescription_orders_set_updated_at
  before update on public.pharmacy_prescription_orders
  for each row execute function public.set_pharmacy_prescription_updated_at();
create trigger pharmacy_prescription_order_lines_set_updated_at
  before update on public.pharmacy_prescription_order_lines
  for each row execute function public.set_pharmacy_prescription_updated_at();

create or replace function public.reject_pharmacy_prescription_event_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Pharmacy prescription status events are immutable.' using errcode = '42501';
end;
$$;

create trigger pharmacy_prescription_order_events_immutable
  before update or delete on public.pharmacy_prescription_order_events
  for each row execute function public.reject_pharmacy_prescription_event_mutation();

alter table public.pharmacy_prescription_orders enable row level security;
alter table public.pharmacy_prescription_order_lines enable row level security;
alter table public.pharmacy_prescription_order_events enable row level security;

create policy pharmacy_prescription_orders_select on public.pharmacy_prescription_orders
  for select to authenticated using (
    public.has_organization_permission(organization_id, 'can_dispense_pharmacy_prescriptions')
    or (
      public.has_organization_permission(organization_id, 'can_encode_pharmacy_prescriptions')
      and submitted_by = auth.uid()
    )
  );
create policy pharmacy_prescription_order_lines_select on public.pharmacy_prescription_order_lines
  for select to authenticated using (
    exists (
      select 1 from public.pharmacy_prescription_orders order_row
      where order_row.id = order_id and order_row.organization_id = organization_id
        and (
          public.has_organization_permission(order_row.organization_id, 'can_dispense_pharmacy_prescriptions')
          or (public.has_organization_permission(order_row.organization_id, 'can_encode_pharmacy_prescriptions') and order_row.submitted_by = auth.uid())
        )
    )
  );
create policy pharmacy_prescription_order_events_select on public.pharmacy_prescription_order_events
  for select to authenticated using (
    exists (
      select 1 from public.pharmacy_prescription_orders order_row
      where order_row.id = order_id and order_row.organization_id = organization_id
        and (
          public.has_organization_permission(order_row.organization_id, 'can_dispense_pharmacy_prescriptions')
          or (public.has_organization_permission(order_row.organization_id, 'can_encode_pharmacy_prescriptions') and order_row.submitted_by = auth.uid())
        )
    )
  );

revoke all on public.pharmacy_prescription_orders, public.pharmacy_prescription_order_lines, public.pharmacy_prescription_order_events from anon;
grant select on public.pharmacy_prescription_orders, public.pharmacy_prescription_order_lines, public.pharmacy_prescription_order_events to authenticated;

alter table public.pharmacy_prescription_orders replica identity full;
alter table public.pharmacy_prescription_order_lines replica identity full;
alter table public.pharmacy_prescription_order_events replica identity full;
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pharmacy_prescription_orders') then
      alter publication supabase_realtime add table public.pharmacy_prescription_orders;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pharmacy_prescription_order_lines') then
      alter publication supabase_realtime add table public.pharmacy_prescription_order_lines;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pharmacy_prescription_order_events') then
      alter publication supabase_realtime add table public.pharmacy_prescription_order_events;
    end if;
  end if;
end;
$$;

create or replace function public.create_pharmacy_prescription_transcription(
  p_organization_id uuid,
  p_patient_id uuid,
  p_encounter_id uuid,
  p_prescription_reference text,
  p_prescriber_name text,
  p_items jsonb,
  p_priority text default 'routine'
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_order_id uuid;
  v_item jsonb;
  v_item_id uuid;
  v_qty numeric;
  v_status text;
begin
  if auth.uid() is null or not public.has_organization_permission(p_organization_id, 'can_encode_pharmacy_prescriptions') then
    raise exception 'Pharmacy prescription encoder permission is required.' using errcode = '42501';
  end if;
  if p_priority not in ('routine', 'urgent', 'emergency') then
    raise exception 'Invalid prescription priority.' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_prescription_reference, '')), '') is null then
    raise exception 'A physical prescription reference is required.' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_prescriber_name, '')), '') is null then
    raise exception 'The prescriber name is required.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one prescription line is required.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.patients patient where patient.id = p_patient_id and patient.organization_id = p_organization_id) then
    raise exception 'The patient is not available in this organization.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.encounters encounter where encounter.id = p_encounter_id and encounter.organization_id = p_organization_id and encounter.patient_id = p_patient_id and encounter.status = 'in_progress') then
    raise exception 'An in-progress patient encounter is required.' using errcode = '22023';
  end if;

  insert into public.pharmacy_prescription_orders (
    organization_id, patient_id, encounter_id, physical_prescription_reference,
    prescriber_name, priority, status, submitted_by
  ) values (
    p_organization_id, p_patient_id, p_encounter_id, btrim(p_prescription_reference),
    btrim(p_prescriber_name), p_priority, 'submitted', auth.uid()
  ) returning id into v_order_id;

  insert into public.pharmacy_prescription_order_events (organization_id, order_id, status, actor_id, metadata)
  values (p_organization_id, v_order_id, 'submitted', auth.uid(), jsonb_build_object('source', 'physical_transcription'));

  for v_item in select value from jsonb_array_elements(p_items) loop
    if nullif(btrim(coalesce(v_item ->> 'original_medication', '')), '') is null then
      raise exception 'Every prescription line requires the original medication text.' using errcode = '22023';
    end if;
    v_qty := (v_item ->> 'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Prescription quantities must be positive.' using errcode = '22023';
    end if;
    v_item_id := nullif(v_item ->> 'item_id', '')::uuid;
    if v_item_id is not null and not exists (
      select 1 from public.inventory_items item
      where item.id = v_item_id and item.organization_id = p_organization_id and item.active
    ) then
      raise exception 'The selected Pharmacy item is not available.' using errcode = '22023';
    end if;
    v_status := case when v_item_id is not null and exists (
      select 1
      from public.department_stock stock
      join public.departments department on department.id = stock.department_id and department.organization_id = stock.organization_id
      where stock.organization_id = p_organization_id and stock.item_id = v_item_id and stock.quantity > 0 and department.active
        and (lower(department.code) in ('pharmacy', 'pharm') or lower(department.name) like '%pharmacy%')
    ) then 'available' else 'entered' end;
    insert into public.pharmacy_prescription_order_lines (
      organization_id, order_id, item_id, original_medication, dosage_instruction,
      requested_quantity, unit_of_measure, status, notes
    ) values (
      p_organization_id, v_order_id, v_item_id, btrim(v_item ->> 'original_medication'),
      nullif(btrim(v_item ->> 'dosage_instruction'), ''), v_qty,
      nullif(btrim(v_item ->> 'unit_of_measure'), ''), v_status,
      nullif(btrim(v_item ->> 'notes'), '')
    );
  end loop;
  return v_order_id;
end;
$$;

create or replace function public.get_pharmacy_prescription_availability(
  p_organization_id uuid, p_items jsonb
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_item jsonb;
  v_item_id uuid;
  v_result jsonb := '[]'::jsonb;
  v_qty numeric;
begin
  if auth.uid() is null or not (
    public.has_organization_permission(p_organization_id, 'can_encode_pharmacy_prescriptions')
    or public.has_organization_permission(p_organization_id, 'can_dispense_pharmacy_prescriptions')
  ) then
    raise exception 'Pharmacy prescription access is required.' using errcode = '42501';
  end if;
  for v_item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_item_id := nullif(v_item ->> 'item_id', '')::uuid;
    v_qty := coalesce((v_item ->> 'quantity')::numeric, 0);
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'item_id', v_item_id,
      'requested_quantity', v_qty,
      'available_quantity', coalesce((
        select sum(stock.quantity)
        from public.department_stock stock
        join public.departments department on department.id = stock.department_id and department.organization_id = stock.organization_id
        where stock.organization_id = p_organization_id and stock.item_id = v_item_id and department.active
          and (lower(department.code) in ('pharmacy', 'pharm') or lower(department.name) like '%pharmacy%')
      ), 0),
      'status', case when coalesce((select sum(stock.quantity) from public.department_stock stock join public.departments department on department.id = stock.department_id and department.organization_id = stock.organization_id where stock.organization_id = p_organization_id and stock.item_id = v_item_id and department.active and (lower(department.code) in ('pharmacy', 'pharm') or lower(department.name) like '%pharmacy%')), 0) >= v_qty then 'available' else 'unavailable' end
    ));
  end loop;
  return v_result;
end;
$$;

create or replace function public.list_pharmacy_prescription_queue(
  p_organization_id uuid, p_status text default null
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_can_dispense boolean := public.has_organization_permission(p_organization_id, 'can_dispense_pharmacy_prescriptions');
begin
  if auth.uid() is null or not (v_can_dispense or public.has_organization_permission(p_organization_id, 'can_encode_pharmacy_prescriptions')) then
    raise exception 'Pharmacy prescription access is required.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', order_row.id, 'organization_id', order_row.organization_id,
    'patient_id', order_row.patient_id, 'encounter_id', order_row.encounter_id,
    'physical_prescription_reference', order_row.physical_prescription_reference,
    'prescriber_name', order_row.prescriber_name, 'priority', order_row.priority,
    'status', order_row.status, 'submitted_by', order_row.submitted_by,
    'submitted_at', order_row.submitted_at, 'reviewed_at', order_row.reviewed_at,
    'completed_at', order_row.completed_at,
    'lines', (select coalesce(jsonb_agg(to_jsonb(line_row) order by line_row.created_at), '[]'::jsonb)
      from public.pharmacy_prescription_order_lines line_row where line_row.order_id = order_row.id)
  ) order by order_row.submitted_at)
  from public.pharmacy_prescription_orders order_row
  where order_row.organization_id = p_organization_id
    and (p_status is null or p_status = '' or order_row.status = p_status)
    and (v_can_dispense or order_row.submitted_by = auth.uid())), '[]'::jsonb);
end;
$$;

create or replace function public.review_pharmacy_prescription_order(
  p_order_id uuid, p_updates jsonb, p_reason text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_order public.pharmacy_prescription_orders%rowtype;
  v_line public.pharmacy_prescription_order_lines%rowtype;
  v_update jsonb;
  v_item_id uuid;
  v_qty numeric;
  v_unit_price bigint;
  v_pharmacy_dept_id uuid;
  v_has_unavailable boolean;
begin
  select * into v_order from public.pharmacy_prescription_orders where id = p_order_id for update;
  if not found then raise exception 'Pharmacy prescription order not found.' using errcode = 'P0002'; end if;
  if not public.has_organization_permission(v_order.organization_id, 'can_dispense_pharmacy_prescriptions') then
    raise exception 'Pharmacy dispensing permission is required.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.staff_department_assignments assignment join public.departments department on department.id = assignment.department_id and department.organization_id = assignment.organization_id where assignment.organization_id = v_order.organization_id and assignment.user_id = auth.uid() and department.active and (lower(department.code) in ('pharmacy', 'pharm') or lower(department.name) like '%pharmacy%')) then
    raise exception 'Pharmacy Department assignment is required.' using errcode = '42501';
  end if;
  if v_order.status in ('completed', 'cancelled', 'rejected') then
    raise exception 'This prescription order is already terminal.' using errcode = '22023';
  end if;

  select department.id into v_pharmacy_dept_id
  from public.departments department
  where department.organization_id = v_order.organization_id and department.active
    and (lower(department.code) in ('pharmacy', 'pharm') or lower(department.name) like '%pharmacy%')
  order by department.created_at limit 1;

  update public.pharmacy_prescription_orders
  set status = 'under_pharmacist_review', reviewed_by = auth.uid(), reviewed_at = now()
  where id = v_order.id;
  insert into public.pharmacy_prescription_order_events (organization_id, order_id, status, reason, actor_id)
  values (v_order.organization_id, v_order.id, 'under_pharmacist_review', p_reason, auth.uid());

  for v_update in select value from jsonb_array_elements(coalesce(p_updates, '[]'::jsonb)) loop
    select * into v_line from public.pharmacy_prescription_order_lines where id = (v_update ->> 'line_id')::uuid and order_id = v_order.id for update;
    if not found then raise exception 'Prescription line not found.' using errcode = 'P0002'; end if;
    v_item_id := nullif(v_update ->> 'item_id', '')::uuid;
    v_qty := coalesce((v_update ->> 'requested_quantity')::numeric, v_line.requested_quantity);
    if v_item_id is null or not exists (select 1 from public.inventory_items item where item.id = v_item_id and item.organization_id = v_order.organization_id and item.active) then
      raise exception 'A valid active Pharmacy item mapping is required.' using errcode = '22023';
    end if;
    if v_qty <= 0 then raise exception 'Requested quantity must be positive.' using errcode = '22023'; end if;
    select round(coalesce(item.selling_price, item.unit_price, 0) * 100)::bigint into v_unit_price from public.inventory_items item where item.id = v_item_id;
    update public.pharmacy_prescription_order_lines
    set item_id = v_item_id,
        requested_quantity = v_qty,
        unit_of_measure = coalesce(nullif(btrim(v_update ->> 'unit_of_measure'), ''), unit_of_measure),
        pharmacist_reason = nullif(btrim(coalesce(p_reason, '')), ''),
        status = case when exists (select 1 from public.department_stock stock where stock.organization_id = v_order.organization_id and stock.item_id = v_item_id and stock.department_id = v_pharmacy_dept_id and stock.quantity >= v_qty) then 'pharmacist_verified' else 'unavailable' end,
        unit_price_in_centavos = v_unit_price,
        line_total_in_centavos = round(v_unit_price * v_qty)::bigint
    where id = v_line.id;
    insert into public.pharmacy_prescription_order_events (organization_id, order_id, line_id, status, reason, actor_id, metadata)
    select v_order.organization_id, v_order.id, v_line.id, updated.status, p_reason, auth.uid(), jsonb_build_object('item_id', updated.item_id, 'requested_quantity', updated.requested_quantity)
    from public.pharmacy_prescription_order_lines updated where updated.id = v_line.id;
  end loop;

  select exists (select 1 from public.pharmacy_prescription_order_lines line where line.order_id = v_order.id and line.status = 'unavailable') into v_has_unavailable;
  update public.pharmacy_prescription_orders
  set status = case when not v_has_unavailable then 'ready_to_dispense' else 'under_pharmacist_review' end,
      updated_at = now()
  where id = v_order.id;
  insert into public.pharmacy_prescription_order_events (organization_id, order_id, status, actor_id)
  values (v_order.organization_id, v_order.id, case when not v_has_unavailable then 'ready_to_dispense' else 'under_pharmacist_review' end, auth.uid());
end;
$$;

create or replace function public.complete_pharmacy_prescription_order(
  p_order_id uuid, p_outcomes jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_order public.pharmacy_prescription_orders%rowtype;
  v_line public.pharmacy_prescription_order_lines%rowtype;
  v_outcome jsonb;
  v_action text;
  v_qty numeric;
  v_usage_id uuid;
  v_pharmacy_dept_id uuid;
  v_stock_id uuid;
  v_all_terminal boolean;
  v_any_dispensed boolean;
  v_next_status text;
begin
  select * into v_order from public.pharmacy_prescription_orders where id = p_order_id for update;
  if not found then raise exception 'Pharmacy prescription order not found.' using errcode = 'P0002'; end if;
  if not public.has_organization_permission(v_order.organization_id, 'can_dispense_pharmacy_prescriptions') then
    raise exception 'Pharmacy dispensing permission is required.' using errcode = '42501';
  end if;
  if not public.has_organization_permission(v_order.organization_id, 'can_tag_inventory_usage') then
    raise exception 'Pharmacy inventory tagging permission is required.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.staff_department_assignments assignment join public.departments department on department.id = assignment.department_id and department.organization_id = assignment.organization_id where assignment.organization_id = v_order.organization_id and assignment.user_id = auth.uid() and department.active and (lower(department.code) in ('pharmacy', 'pharm') or lower(department.name) like '%pharmacy%')) then
    raise exception 'Pharmacy Department assignment is required.' using errcode = '42501';
  end if;
  if v_order.status in ('completed', 'cancelled', 'rejected') then
    raise exception 'This prescription order is already terminal.' using errcode = '22023';
  end if;

  select department.id into v_pharmacy_dept_id
  from public.departments department
  where department.organization_id = v_order.organization_id and department.active
    and (lower(department.code) in ('pharmacy', 'pharm') or lower(department.name) like '%pharmacy%')
  order by department.created_at limit 1;

  for v_outcome in select value from jsonb_array_elements(coalesce(p_outcomes, '[]'::jsonb)) loop
    select * into v_line from public.pharmacy_prescription_order_lines where id = (v_outcome ->> 'line_id')::uuid and order_id = v_order.id for update;
    if not found then raise exception 'Prescription line not found.' using errcode = 'P0002'; end if;
    v_action := coalesce(v_outcome ->> 'action', '');
    if v_action = 'dispense' then
      if v_line.item_id is null or v_line.status not in ('available', 'pharmacist_verified', 'partially_dispensed') then
        raise exception 'Only verified available lines can be dispensed.' using errcode = '22023';
      end if;
      v_qty := coalesce((v_outcome ->> 'quantity')::numeric, v_line.requested_quantity - v_line.dispensed_quantity);
      if v_qty <= 0 or v_qty > (v_line.requested_quantity - v_line.dispensed_quantity) then
        raise exception 'Invalid dispense quantity.' using errcode = '22023';
      end if;
      select stock.id into v_stock_id
      from public.department_stock stock
      where stock.organization_id = v_order.organization_id and stock.item_id = v_line.item_id and stock.department_id = v_pharmacy_dept_id
      for update;
      if v_stock_id is null then raise exception 'Pharmacy stock is unavailable.' using errcode = '22023'; end if;
      v_usage_id := public.tag_inventory_usage(v_order.encounter_id, v_stock_id, v_qty, v_pharmacy_dept_id);
      update public.pharmacy_prescription_order_lines
      set dispensed_quantity = dispensed_quantity + v_qty,
          usage_id = v_usage_id,
          status = case when dispensed_quantity + v_qty >= requested_quantity then 'dispensed' else 'partially_dispensed' end,
          updated_at = now()
      where id = v_line.id;
      insert into public.pharmacy_prescription_order_events (organization_id, order_id, line_id, status, actor_id, metadata)
      select v_order.organization_id, v_order.id, v_line.id, updated.status, auth.uid(), jsonb_build_object('usage_id', v_usage_id, 'quantity', v_qty)
      from public.pharmacy_prescription_order_lines updated where updated.id = v_line.id;
    elsif v_action in ('cancel', 'external_referral') then
      if nullif(btrim(coalesce(v_outcome ->> 'reason', '')), '') is null then
        raise exception 'A reason is required for an undispensed line.' using errcode = '22023';
      end if;
      update public.pharmacy_prescription_order_lines
      set status = case when v_action = 'cancel' then 'cancelled' else 'external_referral' end,
          pharmacist_reason = btrim(v_outcome ->> 'reason'), updated_at = now()
      where id = v_line.id;
      insert into public.pharmacy_prescription_order_events (organization_id, order_id, line_id, status, reason, actor_id)
      values (v_order.organization_id, v_order.id, v_line.id, case when v_action = 'cancel' then 'cancelled' else 'external_referral' end, btrim(v_outcome ->> 'reason'), auth.uid());
    else
      raise exception 'Unsupported dispense outcome.' using errcode = '22023';
    end if;
  end loop;

  select not exists (select 1 from public.pharmacy_prescription_order_lines line where line.order_id = v_order.id and line.status not in ('dispensed', 'cancelled', 'external_referral')), exists (select 1 from public.pharmacy_prescription_order_lines line where line.order_id = v_order.id and line.status in ('dispensed', 'partially_dispensed')) into v_all_terminal, v_any_dispensed;
  v_next_status := case when v_all_terminal then 'completed' when v_any_dispensed then 'partially_dispensed' else 'under_pharmacist_review' end;
  update public.pharmacy_prescription_orders
  set status = v_next_status, completed_by = case when v_all_terminal then auth.uid() else completed_by end, completed_at = case when v_all_terminal then now() else completed_at end, updated_at = now()
  where id = v_order.id;
  insert into public.pharmacy_prescription_order_events (organization_id, order_id, status, actor_id)
  values (v_order.organization_id, v_order.id, v_next_status, auth.uid());
  return jsonb_build_object('order_id', v_order.id, 'status', v_next_status, 'completed', v_all_terminal);
end;
$$;

revoke all on function public.create_pharmacy_prescription_transcription(uuid, uuid, uuid, text, text, jsonb, text) from public, anon;
revoke all on function public.get_pharmacy_prescription_availability(uuid, jsonb) from public, anon;
revoke all on function public.list_pharmacy_prescription_queue(uuid, text) from public, anon;
revoke all on function public.review_pharmacy_prescription_order(uuid, jsonb, text) from public, anon;
revoke all on function public.complete_pharmacy_prescription_order(uuid, jsonb) from public, anon;
grant execute on function public.create_pharmacy_prescription_transcription(uuid, uuid, uuid, text, text, jsonb, text) to authenticated;
grant execute on function public.get_pharmacy_prescription_availability(uuid, jsonb) to authenticated;
grant execute on function public.list_pharmacy_prescription_queue(uuid, text) to authenticated;
grant execute on function public.review_pharmacy_prescription_order(uuid, jsonb, text) to authenticated;
grant execute on function public.complete_pharmacy_prescription_order(uuid, jsonb) to authenticated;
