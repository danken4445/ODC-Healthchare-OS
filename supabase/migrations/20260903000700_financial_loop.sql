-- Loop 5: Financial Loop — billing, invoicing, payments, POS, HMO/PhilHealth claims.
-- Pricing and payment are two separate steps: every billable event generates line
-- items at standard catalog prices. The payor_type determines what happens next:
-- self_pay → invoice → patient payment; hmo/philhealth_nbb → claim.

-- ──────────────────────────────────────────────────────────────────────
-- 1. New enums
-- ──────────────────────────────────────────────────────────────────────
create type public.payor_type as enum (
  'self_pay', 'hmo', 'philhealth_nbb', 'government_subsidized'
);

create type public.billing_event_status as enum (
  'draft', 'finalized', 'cancelled'
);

create type public.invoice_status as enum (
  'draft', 'issued', 'paid', 'partially_paid', 'void', 'cancelled'
);

create type public.payment_method as enum (
  'cash', 'card', 'qr_ewallet', 'bank_transfer', 'check'
);

create type public.payment_status as enum (
  'pending', 'confirmed', 'failed', 'refunded'
);

create type public.pos_sale_status as enum (
  'open', 'completed', 'void'
);

-- ──────────────────────────────────────────────────────────────────────
-- 2. Organization-level default payor type
-- ──────────────────────────────────────────────────────────────────────
alter table public.organizations
  add column if not exists default_payor_type public.payor_type not null default 'self_pay';

-- ──────────────────────────────────────────────────────────────────────
-- 3. billing_events — one per billable occasion
-- ──────────────────────────────────────────────────────────────────────
create table public.billing_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  encounter_id uuid references public.encounters(id),
  patient_id uuid references public.patients(id),
  payor_type public.payor_type not null default 'self_pay',
  status public.billing_event_status not null default 'draft',
  coverage_id uuid references public.coverages(id),
  finalized_at timestamptz,
  finalized_by uuid references auth.users(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index billing_events_org_status_idx
  on public.billing_events (organization_id, status, created_at desc);
create index billing_events_patient_idx
  on public.billing_events (organization_id, patient_id, created_at desc);
create index billing_events_encounter_idx
  on public.billing_events (encounter_id)
  where encounter_id is not null;

-- ──────────────────────────────────────────────────────────────────────
-- 4. billing_line_items — every chargeable item at catalog price
-- ──────────────────────────────────────────────────────────────────────
create table public.billing_line_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  billing_event_id uuid not null references public.billing_events(id),
  source_type text not null check (source_type in (
    'clinic_service', 'inventory_usage', 'laboratory_service', 'pos_item'
  )),
  source_id uuid,
  description text not null,
  quantity numeric(14,3) not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  currency text not null default 'PHP' check (currency ~ '^[A-Z]{3}$'),
  line_total numeric(14,2) not null generated always as (
    round(quantity * unit_price, 2)
  ) stored,
  created_at timestamptz not null default now(),
  check (length(btrim(description)) between 1 and 500)
);

create index billing_line_items_event_idx
  on public.billing_line_items (billing_event_id);
create index billing_line_items_source_idx
  on public.billing_line_items (source_type, source_id)
  where source_id is not null;

-- ──────────────────────────────────────────────────────────────────────
-- 5. invoices — self-pay and partial-pay patient invoices
-- ──────────────────────────────────────────────────────────────────────
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  billing_event_id uuid not null references public.billing_events(id),
  patient_id uuid references public.patients(id),
  invoice_number text not null,
  status public.invoice_status not null default 'draft',
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  tax_amount numeric(14,2) not null default 0 check (tax_amount >= 0),
  total_due numeric(14,2) not null default 0 check (total_due >= 0),
  amount_paid numeric(14,2) not null default 0 check (amount_paid >= 0),
  balance_due numeric(14,2) not null default 0 check (balance_due >= 0),
  issued_at timestamptz,
  due_at timestamptz,
  paid_at timestamptz,
  qr_payment_token text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, invoice_number)
);

create index invoices_org_status_idx
  on public.invoices (organization_id, status, created_at desc);
create index invoices_patient_idx
  on public.invoices (organization_id, patient_id, created_at desc);
create index invoices_qr_token_idx
  on public.invoices (qr_payment_token)
  where qr_payment_token is not null;

-- ──────────────────────────────────────────────────────────────────────
-- 6. payments — individual payment transactions against an invoice
-- ──────────────────────────────────────────────────────────────────────
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  invoice_id uuid not null references public.invoices(id),
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'PHP' check (currency ~ '^[A-Z]{3}$'),
  method public.payment_method not null,
  status public.payment_status not null default 'pending',
  reference_number text,
  qr_token text,
  confirmed_at timestamptz,
  recorded_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payments_invoice_idx
  on public.payments (invoice_id, created_at desc);
create index payments_org_status_idx
  on public.payments (organization_id, status, created_at desc);

-- ──────────────────────────────────────────────────────────────────────
-- 7. pos_sales — retail POS without encounter
-- ──────────────────────────────────────────────────────────────────────
create table public.pos_sales (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  billing_event_id uuid not null references public.billing_events(id),
  cashier_user_id uuid not null references auth.users(id),
  status public.pos_sale_status not null default 'open',
  customer_name text,
  receipt_number text not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, receipt_number)
);

create index pos_sales_org_status_idx
  on public.pos_sales (organization_id, status, created_at desc);

-- ──────────────────────────────────────────────────────────────────────
-- 8. Enhanced claims table — structured workflow
-- ──────────────────────────────────────────────────────────────────────
alter table public.claims
  add column if not exists billing_event_id uuid references public.billing_events(id),
  add column if not exists payor_type public.payor_type,
  add column if not exists submitted_at timestamptz,
  add column if not exists adjudicated_at timestamptz,
  add column if not exists adjudication_result text check (
    adjudication_result is null or adjudication_result in ('approved', 'denied', 'partial')
  ),
  add column if not exists approved_amount numeric(14,2),
  add column if not exists denied_reason text,
  add column if not exists philhealth_claim_number text;

-- ──────────────────────────────────────────────────────────────────────
-- 9. Enhanced coverages table — HMO/PhilHealth fields
-- ──────────────────────────────────────────────────────────────────────
alter table public.coverages
  add column if not exists payor_type public.payor_type,
  add column if not exists hmo_provider_name text,
  add column if not exists hmo_member_number text,
  add column if not exists philhealth_id text,
  add column if not exists philhealth_category text check (
    philhealth_category is null or philhealth_category in (
      'employed', 'voluntary', 'indigent', 'senior', 'sponsored', 'lifetime'
    )
  ),
  add column if not exists max_benefit_limit numeric(14,2),
  add column if not exists remaining_benefit numeric(14,2);

-- ──────────────────────────────────────────────────────────────────────
-- 10. Triggers: updated_at, audit, immutability
-- ──────────────────────────────────────────────────────────────────────
create trigger billing_events_set_updated_at before update on public.billing_events
  for each row execute function public.set_updated_at();
create trigger billing_line_items_set_updated_at before update on public.billing_line_items
  for each row execute function public.set_updated_at();
create trigger invoices_set_updated_at before update on public.invoices
  for each row execute function public.set_updated_at();
create trigger payments_set_updated_at before update on public.payments
  for each row execute function public.set_updated_at();
create trigger pos_sales_set_updated_at before update on public.pos_sales
  for each row execute function public.set_updated_at();

create trigger billing_events_audit after insert or update or delete on public.billing_events
  for each row execute function public.write_audit_log();
create trigger billing_line_items_audit after insert or update or delete on public.billing_line_items
  for each row execute function public.write_audit_log();
create trigger invoices_audit after insert or update or delete on public.invoices
  for each row execute function public.write_audit_log();
create trigger payments_audit after insert or update or delete on public.payments
  for each row execute function public.write_audit_log();
create trigger pos_sales_audit after insert or update or delete on public.pos_sales
  for each row execute function public.write_audit_log();

-- billing_line_items: line_total is a generated column, so we add updated_at manually
alter table public.billing_line_items
  add column if not exists updated_at timestamptz not null default now();

-- ──────────────────────────────────────────────────────────────────────
-- 11. RLS policies
-- ──────────────────────────────────────────────────────────────────────
alter table public.billing_events enable row level security;
alter table public.billing_line_items enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.pos_sales enable row level security;

-- billing_events: org staff can see, billing-capable roles can manage
create policy billing_events_select on public.billing_events for select to authenticated
  using (
    public.can_access_organization(organization_id)
    or (patient_id is not null and exists (
      select 1 from public.patients p where p.id = patient_id and p.auth_user_id = auth.uid()
    ))
  );
create policy billing_events_manage on public.billing_events for all to authenticated
  using (public.has_organization_permission(organization_id, 'can_manage_billing'))
  with check (public.has_organization_permission(organization_id, 'can_manage_billing'));

-- billing_line_items: read through billing_events access, manage through billing permission
create policy billing_line_items_select on public.billing_line_items for select to authenticated
  using (
    public.can_access_organization(organization_id)
    or exists (
      select 1 from public.billing_events be
      join public.patients p on p.id = be.patient_id
      where be.id = billing_event_id and p.auth_user_id = auth.uid()
    )
  );
create policy billing_line_items_manage on public.billing_line_items for all to authenticated
  using (public.has_organization_permission(organization_id, 'can_manage_billing'))
  with check (public.has_organization_permission(organization_id, 'can_manage_billing'));

-- invoices: org staff + own patient
create policy invoices_select on public.invoices for select to authenticated
  using (
    public.can_access_organization(organization_id)
    or (patient_id is not null and exists (
      select 1 from public.patients p where p.id = patient_id and p.auth_user_id = auth.uid()
    ))
  );
create policy invoices_manage on public.invoices for all to authenticated
  using (public.has_organization_permission(organization_id, 'can_manage_billing'))
  with check (public.has_organization_permission(organization_id, 'can_manage_billing'));

-- payments
create policy payments_select on public.payments for select to authenticated
  using (
    public.can_access_organization(organization_id)
    or exists (
      select 1 from public.invoices inv
      join public.patients p on p.id = inv.patient_id
      where inv.id = invoice_id and p.auth_user_id = auth.uid()
    )
  );
create policy payments_manage on public.payments for all to authenticated
  using (public.has_organization_permission(organization_id, 'can_manage_billing'))
  with check (public.has_organization_permission(organization_id, 'can_manage_billing'));

-- pos_sales: front desk / admin / owner only
create policy pos_sales_select on public.pos_sales for select to authenticated
  using (public.can_access_organization(organization_id));
create policy pos_sales_manage on public.pos_sales for all to authenticated
  using (public.has_organization_permission(organization_id, 'can_manage_pos'))
  with check (public.has_organization_permission(organization_id, 'can_manage_pos'));

-- ──────────────────────────────────────────────────────────────────────
-- 12. Permission grants
-- ──────────────────────────────────────────────────────────────────────
insert into public.role_permissions (role_id, organization_id, permission)
select role.id, null, grant_row.permission
from public.roles role
join (values
  ('front_desk', 'can_manage_billing'),
  ('front_desk', 'can_view_billing'),
  ('front_desk', 'can_manage_pos'),
  ('front_desk', 'can_view_claims'),
  ('doctor',     'can_view_billing'),
  ('nurse',      'can_view_billing'),
  ('admin',      'can_manage_billing'),
  ('admin',      'can_view_billing'),
  ('admin',      'can_manage_pos'),
  ('admin',      'can_manage_claims'),
  ('admin',      'can_view_claims'),
  ('owner',      'can_manage_billing'),
  ('owner',      'can_view_billing'),
  ('owner',      'can_manage_pos'),
  ('owner',      'can_manage_claims'),
  ('owner',      'can_view_claims')
) as grant_row(role_name, permission)
  on grant_row.role_name = role.name
on conflict (role_id, organization_id, permission) do nothing;

-- Extend the permission check constraint to include new billing permissions
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
    'can_manage_claims', 'can_view_claims'
  ));

-- Backfill clinic-level overrides for existing organizations
insert into public.clinic_role_permission_overrides (organization_id, role_code, permission)
select organization.id, role_code, permission
from public.organizations organization
cross join (values
  ('front_desk', 'can_manage_billing'),
  ('front_desk', 'can_view_billing'),
  ('front_desk', 'can_manage_pos'),
  ('front_desk', 'can_view_claims'),
  ('admin', 'can_manage_billing'),
  ('admin', 'can_view_billing'),
  ('admin', 'can_manage_pos'),
  ('admin', 'can_manage_claims'),
  ('admin', 'can_view_claims'),
  ('owner', 'can_manage_billing'),
  ('owner', 'can_view_billing'),
  ('owner', 'can_manage_pos'),
  ('owner', 'can_manage_claims'),
  ('owner', 'can_view_claims'),
  ('doctor', 'can_view_billing'),
  ('nurse', 'can_view_billing')
) as grants(role_code, permission)
on conflict (organization_id, role_code, permission) do nothing;

-- Update the save_clinic_role_definition function to include the new permissions
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
    'can_manage_claims', 'can_view_claims'
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

-- ──────────────────────────────────────────────────────────────────────
-- 13. Tenant integrity
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.enforce_billing_tenant_integrity()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_table_name = 'billing_events' then
    if new.encounter_id is not null and not exists (
      select 1 from public.encounters e
      where e.id = new.encounter_id and e.organization_id = new.organization_id
    ) then
      raise exception 'Billing event encounter must belong to the same organization.' using errcode = '23514';
    end if;
    if new.patient_id is not null and not exists (
      select 1 from public.patients p
      where p.id = new.patient_id and p.organization_id = new.organization_id
    ) then
      raise exception 'Billing event patient must belong to the same organization.' using errcode = '23514';
    end if;
    if new.coverage_id is not null and not exists (
      select 1 from public.coverages c
      where c.id = new.coverage_id and c.organization_id = new.organization_id
    ) then
      raise exception 'Billing event coverage must belong to the same organization.' using errcode = '23514';
    end if;
  elsif tg_table_name = 'billing_line_items' then
    if not exists (
      select 1 from public.billing_events be
      where be.id = new.billing_event_id and be.organization_id = new.organization_id
    ) then
      raise exception 'Billing line item must belong to the same organization as its event.' using errcode = '23514';
    end if;
  elsif tg_table_name = 'invoices' then
    if not exists (
      select 1 from public.billing_events be
      where be.id = new.billing_event_id and be.organization_id = new.organization_id
    ) then
      raise exception 'Invoice must belong to the same organization as its billing event.' using errcode = '23514';
    end if;
    if new.patient_id is not null and not exists (
      select 1 from public.patients p
      where p.id = new.patient_id and p.organization_id = new.organization_id
    ) then
      raise exception 'Invoice patient must belong to the same organization.' using errcode = '23514';
    end if;
  elsif tg_table_name = 'payments' then
    if not exists (
      select 1 from public.invoices inv
      where inv.id = new.invoice_id and inv.organization_id = new.organization_id
    ) then
      raise exception 'Payment must belong to the same organization as its invoice.' using errcode = '23514';
    end if;
  elsif tg_table_name = 'pos_sales' then
    if not exists (
      select 1 from public.billing_events be
      where be.id = new.billing_event_id and be.organization_id = new.organization_id
    ) then
      raise exception 'POS sale must belong to the same organization as its billing event.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger billing_events_tenant_integrity
  before insert or update on public.billing_events
  for each row execute function public.enforce_billing_tenant_integrity();
create trigger billing_line_items_tenant_integrity
  before insert or update on public.billing_line_items
  for each row execute function public.enforce_billing_tenant_integrity();
create trigger invoices_tenant_integrity
  before insert or update on public.invoices
  for each row execute function public.enforce_billing_tenant_integrity();
create trigger payments_tenant_integrity
  before insert or update on public.payments
  for each row execute function public.enforce_billing_tenant_integrity();
create trigger pos_sales_tenant_integrity
  before insert or update on public.pos_sales
  for each row execute function public.enforce_billing_tenant_integrity();

-- ──────────────────────────────────────────────────────────────────────
-- 14. Database functions
-- ──────────────────────────────────────────────────────────────────────

-- Sequential invoice number per organization
create or replace function public.generate_invoice_number(p_organization_id uuid)
returns text language plpgsql set search_path = public as $$
declare v_seq integer;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_organization_id::text || ':invoice_seq', 0)
  );
  select coalesce(max(
    nullif(regexp_replace(invoice_number, '^INV-\d{8}-', ''), invoice_number)::integer
  ), 0) + 1
  into v_seq
  from public.invoices
  where organization_id = p_organization_id;

  return 'INV-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(v_seq::text, 5, '0');
end;
$$;

-- Sequential receipt number per organization
create or replace function public.generate_receipt_number(p_organization_id uuid)
returns text language plpgsql set search_path = public as $$
declare v_seq integer;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_organization_id::text || ':receipt_seq', 0)
  );
  select coalesce(max(
    nullif(regexp_replace(receipt_number, '^RCT-\d{8}-', ''), receipt_number)::integer
  ), 0) + 1
  into v_seq
  from public.pos_sales
  where organization_id = p_organization_id;

  return 'RCT-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(v_seq::text, 5, '0');
end;
$$;

-- Generate a billing event from a finished encounter, auto-populating line items
create or replace function public.generate_billing_event(
  p_organization_id uuid,
  p_encounter_id uuid,
  p_payor_type_override public.payor_type default null
)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare
  v_encounter public.encounters%rowtype;
  v_org public.organizations%rowtype;
  v_event_id uuid;
  v_payor public.payor_type;
  v_service public.clinic_services%rowtype;
begin
  if not public.has_organization_permission(p_organization_id, 'can_manage_billing') then
    raise exception 'Billing management permission is required.' using errcode = '42501';
  end if;

  select * into v_encounter from public.encounters
  where id = p_encounter_id and organization_id = p_organization_id;
  if not found then
    raise exception 'Encounter not found in this organization.' using errcode = 'P0002';
  end if;
  if v_encounter.status not in ('finished', 'in_progress') then
    raise exception 'Encounter must be finished or in progress to bill.' using errcode = '22023';
  end if;

  -- Check no existing billing event for this encounter
  if exists (select 1 from public.billing_events be where be.encounter_id = p_encounter_id and be.status <> 'cancelled') then
    raise exception 'A billing event already exists for this encounter.' using errcode = '23505';
  end if;

  select * into v_org from public.organizations where id = p_organization_id;
  v_payor := coalesce(p_payor_type_override, v_org.default_payor_type);

  -- Create billing event
  insert into public.billing_events (organization_id, encounter_id, patient_id, payor_type, status)
  values (p_organization_id, p_encounter_id, v_encounter.patient_id, v_payor, 'draft')
  returning id into v_event_id;

  -- Line item: clinic service (consultation fee) from appointment
  if v_encounter.appointment_id is not null then
    select cs.* into v_service
    from public.clinic_services cs
    join public.appointments a on a.clinic_service_id = cs.id
    where a.id = v_encounter.appointment_id and cs.organization_id = p_organization_id;

    if found and v_service.base_price is not null then
      insert into public.billing_line_items (organization_id, billing_event_id, source_type, source_id, description, quantity, unit_price, currency)
      values (p_organization_id, v_event_id, 'clinic_service', v_service.id, v_service.name, 1, v_service.base_price, v_service.currency);
    end if;
  end if;

  -- Line items: inventory usages
  insert into public.billing_line_items (organization_id, billing_event_id, source_type, source_id, description, quantity, unit_price, currency)
  select p_organization_id, v_event_id, 'inventory_usage', usage_row.id,
    item.name, usage_row.quantity, usage_row.unit_price, usage_row.currency
  from public.inventory_usages usage_row
  join public.inventory_items item on item.id = usage_row.item_id
  where usage_row.encounter_id = p_encounter_id
    and usage_row.organization_id = p_organization_id;

  -- Line items: completed laboratory service requests
  insert into public.billing_line_items (organization_id, billing_event_id, source_type, source_id, description, quantity, unit_price, currency)
  select p_organization_id, v_event_id, 'laboratory_service', sr.id,
    coalesce(sr.code_display, sr.code), 1, coalesce(ls.lab_cost, 0), 'PHP'
  from public.service_requests sr
  left join public.laboratory_services ls
    on ls.organization_id = sr.organization_id
    and ls.code = sr.code
  where sr.encounter_id = p_encounter_id
    and sr.organization_id = p_organization_id
    and sr.category = 'laboratory'
    and sr.status = 'completed';

  return v_event_id;
end;
$$;

-- Finalize a billing event and route to invoice or claim
create or replace function public.finalize_billing_event(p_billing_event_id uuid)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  v_event public.billing_events%rowtype;
  v_subtotal numeric(14,2);
  v_invoice_id uuid;
  v_claim_id uuid;
  v_result jsonb := '{}'::jsonb;
begin
  select * into v_event from public.billing_events where id = p_billing_event_id for update;
  if not found then raise exception 'Billing event not found.' using errcode = 'P0002'; end if;
  if v_event.status <> 'draft' then raise exception 'Only draft billing events can be finalized.' using errcode = '22023'; end if;
  if not public.has_organization_permission(v_event.organization_id, 'can_manage_billing') then
    raise exception 'Billing management permission is required.' using errcode = '42501';
  end if;

  -- Calculate subtotal
  select coalesce(sum(line_total), 0) into v_subtotal
  from public.billing_line_items
  where billing_event_id = p_billing_event_id;

  -- Mark finalized
  update public.billing_events
  set status = 'finalized', finalized_at = now(), finalized_by = auth.uid()
  where id = p_billing_event_id;

  -- Route based on payor_type
  if v_event.payor_type = 'self_pay' then
    insert into public.invoices (
      organization_id, billing_event_id, patient_id, invoice_number,
      status, subtotal, total_due, balance_due, issued_at,
      qr_payment_token
    ) values (
      v_event.organization_id, p_billing_event_id, v_event.patient_id,
      public.generate_invoice_number(v_event.organization_id),
      'issued', v_subtotal, v_subtotal, v_subtotal, now(),
      encode(gen_random_bytes(24), 'hex')
    ) returning id into v_invoice_id;

    v_result := jsonb_build_object('route', 'invoice', 'invoice_id', v_invoice_id);

  elsif v_event.payor_type in ('hmo', 'philhealth_nbb') then
    insert into public.claims (
      organization_id, patient_id, encounter_id, coverage_id,
      status, use, claim_type, billing_event_id, payor_type,
      billable_period_start, billable_period_end,
      provider_organization_id, total,
      items
    ) values (
      v_event.organization_id, v_event.patient_id, v_event.encounter_id,
      v_event.coverage_id, 'active', 'claim',
      case when v_event.payor_type = 'hmo' then 'institutional' else 'professional' end,
      p_billing_event_id, v_event.payor_type,
      current_date, current_date,
      v_event.organization_id, v_subtotal,
      (select coalesce(jsonb_agg(jsonb_build_object(
        'description', li.description,
        'quantity', li.quantity,
        'unit_price', li.unit_price,
        'line_total', li.line_total
      )), '[]'::jsonb) from public.billing_line_items li where li.billing_event_id = p_billing_event_id)
    ) returning id into v_claim_id;

    -- For PhilHealth NBB or full HMO, also create a zero-balance invoice for the patient
    if v_event.patient_id is not null then
      insert into public.invoices (
        organization_id, billing_event_id, patient_id, invoice_number,
        status, subtotal, total_due, balance_due, issued_at
      ) values (
        v_event.organization_id, p_billing_event_id, v_event.patient_id,
        public.generate_invoice_number(v_event.organization_id),
        'paid', v_subtotal, 0, 0, now()
      ) returning id into v_invoice_id;
    end if;

    v_result := jsonb_build_object('route', 'claim', 'claim_id', v_claim_id, 'invoice_id', v_invoice_id);

  elsif v_event.payor_type = 'government_subsidized' then
    -- Partial subsidy: create invoice for the patient share (placeholder: full amount for now)
    insert into public.invoices (
      organization_id, billing_event_id, patient_id, invoice_number,
      status, subtotal, total_due, balance_due, issued_at,
      qr_payment_token
    ) values (
      v_event.organization_id, p_billing_event_id, v_event.patient_id,
      public.generate_invoice_number(v_event.organization_id),
      'issued', v_subtotal, v_subtotal, v_subtotal, now(),
      encode(gen_random_bytes(24), 'hex')
    ) returning id into v_invoice_id;

    v_result := jsonb_build_object('route', 'invoice', 'invoice_id', v_invoice_id);
  end if;

  return v_result;
end;
$$;

-- Record a payment against an invoice
create or replace function public.record_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_method public.payment_method,
  p_reference text default null
)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare
  v_invoice public.invoices%rowtype;
  v_payment_id uuid;
  v_new_paid numeric(14,2);
  v_new_balance numeric(14,2);
begin
  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found.' using errcode = 'P0002'; end if;
  if v_invoice.status not in ('issued', 'partially_paid') then
    raise exception 'Invoice must be issued or partially paid to accept payment.' using errcode = '22023';
  end if;
  if not public.has_organization_permission(v_invoice.organization_id, 'can_manage_billing') then
    raise exception 'Billing management permission is required.' using errcode = '42501';
  end if;
  if p_amount <= 0 or p_amount > v_invoice.balance_due then
    raise exception 'Payment amount must be between 0 and the balance due.' using errcode = '22023';
  end if;

  insert into public.payments (
    organization_id, invoice_id, amount, currency, method, status,
    reference_number, confirmed_at, recorded_by
  ) values (
    v_invoice.organization_id, p_invoice_id, p_amount, 'PHP', p_method,
    'confirmed', p_reference, now(), auth.uid()
  ) returning id into v_payment_id;

  v_new_paid := v_invoice.amount_paid + p_amount;
  v_new_balance := v_invoice.total_due - v_new_paid;

  update public.invoices
  set amount_paid = v_new_paid,
      balance_due = v_new_balance,
      status = case when v_new_balance <= 0 then 'paid' else 'partially_paid' end,
      paid_at = case when v_new_balance <= 0 then now() else null end
  where id = p_invoice_id;

  return v_payment_id;
end;
$$;

-- Create a POS sale — retail checkout without an encounter
create or replace function public.create_pos_sale(
  p_organization_id uuid,
  p_items jsonb,
  p_customer_name text default null,
  p_payment_method public.payment_method default 'cash'
)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  v_event_id uuid;
  v_sale_id uuid;
  v_invoice_id uuid;
  v_payment_id uuid;
  v_item jsonb;
  v_subtotal numeric(14,2) := 0;
  v_inv_item public.inventory_items%rowtype;
begin
  if not public.has_organization_permission(p_organization_id, 'can_manage_pos') then
    raise exception 'POS permission is required.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one item is required.' using errcode = '22023';
  end if;

  -- Create billing event (no encounter, no patient)
  insert into public.billing_events (organization_id, payor_type, status)
  values (p_organization_id, 'self_pay', 'draft')
  returning id into v_event_id;

  -- Add line items from cart
  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_inv_item from public.inventory_items
    where id = (v_item ->> 'item_id')::uuid
      and organization_id = p_organization_id and active;
    if not found then
      raise exception 'Item % not found.', v_item ->> 'item_id' using errcode = 'P0002';
    end if;

    insert into public.billing_line_items (
      organization_id, billing_event_id, source_type, source_id,
      description, quantity, unit_price, currency
    ) values (
      p_organization_id, v_event_id, 'pos_item', v_inv_item.id,
      v_inv_item.name,
      coalesce((v_item ->> 'quantity')::numeric, 1),
      v_inv_item.unit_price, v_inv_item.currency
    );
  end loop;

  -- Calculate subtotal
  select coalesce(sum(line_total), 0) into v_subtotal
  from public.billing_line_items where billing_event_id = v_event_id;

  -- Finalize billing event
  update public.billing_events
  set status = 'finalized', finalized_at = now(), finalized_by = auth.uid()
  where id = v_event_id;

  -- Create POS sale
  insert into public.pos_sales (
    organization_id, billing_event_id, cashier_user_id, status,
    customer_name, receipt_number, completed_at
  ) values (
    p_organization_id, v_event_id, auth.uid(), 'completed',
    nullif(btrim(p_customer_name), ''),
    public.generate_receipt_number(p_organization_id), now()
  ) returning id into v_sale_id;

  -- Create invoice + immediate payment
  insert into public.invoices (
    organization_id, billing_event_id, invoice_number,
    status, subtotal, total_due, amount_paid, balance_due, issued_at, paid_at
  ) values (
    p_organization_id, v_event_id,
    public.generate_invoice_number(p_organization_id),
    'paid', v_subtotal, v_subtotal, v_subtotal, 0, now(), now()
  ) returning id into v_invoice_id;

  insert into public.payments (
    organization_id, invoice_id, amount, currency, method, status,
    confirmed_at, recorded_by
  ) values (
    p_organization_id, v_invoice_id, v_subtotal, 'PHP', p_payment_method,
    'confirmed', now(), auth.uid()
  ) returning id into v_payment_id;

  return jsonb_build_object(
    'billing_event_id', v_event_id,
    'pos_sale_id', v_sale_id,
    'invoice_id', v_invoice_id,
    'payment_id', v_payment_id,
    'receipt_number', (select receipt_number from public.pos_sales where id = v_sale_id),
    'total', v_subtotal
  );
end;
$$;

-- Get billing workspace data for admin/front-desk
create or replace function public.get_billing_workspace(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare v_result jsonb;
begin
  if not public.has_organization_permission(p_organization_id, 'can_view_billing') then
    raise exception 'Billing view permission is required.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'billing_events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', be.id, 'organization_id', be.organization_id,
        'encounter_id', be.encounter_id, 'patient_id', be.patient_id,
        'payor_type', be.payor_type, 'status', be.status,
        'coverage_id', be.coverage_id, 'finalized_at', be.finalized_at,
        'notes', be.notes, 'created_at', be.created_at,
        'patient_name', coalesce(p.name ->> 'text', 'Unknown'),
        'line_item_count', (select count(*) from public.billing_line_items li where li.billing_event_id = be.id),
        'total', (select coalesce(sum(li.line_total), 0) from public.billing_line_items li where li.billing_event_id = be.id)
      ) order by be.created_at desc)
      from public.billing_events be
      left join public.patients p on p.id = be.patient_id
      where be.organization_id = p_organization_id
    ), '[]'::jsonb),
    'invoices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', inv.id, 'organization_id', inv.organization_id,
        'billing_event_id', inv.billing_event_id, 'patient_id', inv.patient_id,
        'invoice_number', inv.invoice_number, 'status', inv.status,
        'subtotal', inv.subtotal, 'discount_amount', inv.discount_amount,
        'tax_amount', inv.tax_amount, 'total_due', inv.total_due,
        'amount_paid', inv.amount_paid, 'balance_due', inv.balance_due,
        'issued_at', inv.issued_at, 'paid_at', inv.paid_at,
        'patient_name', coalesce(p.name ->> 'text', 'Walk-in'),
        'qr_payment_token', inv.qr_payment_token
      ) order by inv.created_at desc)
      from public.invoices inv
      left join public.patients p on p.id = inv.patient_id
      where inv.organization_id = p_organization_id
    ), '[]'::jsonb),
    'recent_payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pmt.id, 'invoice_id', pmt.invoice_id,
        'amount', pmt.amount, 'method', pmt.method, 'status', pmt.status,
        'reference_number', pmt.reference_number,
        'confirmed_at', pmt.confirmed_at, 'created_at', pmt.created_at
      ) order by pmt.created_at desc)
      from public.payments pmt
      where pmt.organization_id = p_organization_id
      limit 100
    ), '[]'::jsonb),
    'pos_sales', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ps.id, 'billing_event_id', ps.billing_event_id,
        'status', ps.status, 'customer_name', ps.customer_name,
        'receipt_number', ps.receipt_number, 'completed_at', ps.completed_at,
        'total', (select coalesce(sum(li.line_total), 0)
          from public.billing_line_items li where li.billing_event_id = ps.billing_event_id)
      ) order by ps.created_at desc)
      from public.pos_sales ps
      where ps.organization_id = p_organization_id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- Get line items for a billing event
create or replace function public.get_billing_line_items(p_billing_event_id uuid)
returns table (
  id uuid, source_type text, source_id uuid, description text,
  quantity numeric, unit_price numeric, currency text, line_total numeric
)
language sql stable security definer set search_path = public, auth as $$
  select li.id, li.source_type, li.source_id, li.description,
    li.quantity, li.unit_price, li.currency, li.line_total
  from public.billing_line_items li
  join public.billing_events be on be.id = li.billing_event_id
  where li.billing_event_id = p_billing_event_id
    and (public.can_access_organization(be.organization_id)
      or exists (select 1 from public.patients p where p.id = be.patient_id and p.auth_user_id = auth.uid()))
  order by li.created_at;
$$;

-- Get billable encounters (finished, not yet billed)
create or replace function public.get_billable_encounters(p_organization_id uuid)
returns table (
  id uuid, patient_id uuid, patient_name text, appointment_id uuid,
  service_type text, period_start timestamptz, period_end timestamptz,
  status public.encounter_status, service_name text, service_price numeric
)
language sql stable security definer set search_path = public, auth as $$
  select e.id, e.patient_id, coalesce(p.name ->> 'text', 'Unknown'),
    e.appointment_id, e.service_type, e.period_start, e.period_end,
    e.status, cs.name, cs.base_price
  from public.encounters e
  join public.patients p on p.id = e.patient_id
  left join public.appointments a on a.id = e.appointment_id
  left join public.clinic_services cs on cs.id = a.clinic_service_id
  where e.organization_id = p_organization_id
    and e.status in ('finished', 'in_progress')
    and not exists (
      select 1 from public.billing_events be
      where be.encounter_id = e.id and be.status <> 'cancelled'
    )
    and public.has_organization_permission(p_organization_id, 'can_manage_billing')
  order by e.period_start desc;
$$;

-- Get patient invoices (for patient portal)
create or replace function public.get_patient_invoices(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare v_patient_id uuid; v_result jsonb;
begin
  select p.id into v_patient_id from public.patients p
  where p.auth_user_id = auth.uid() and p.organization_id = p_organization_id;
  if v_patient_id is null then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', inv.id, 'invoice_number', inv.invoice_number,
    'status', inv.status, 'subtotal', inv.subtotal,
    'total_due', inv.total_due, 'amount_paid', inv.amount_paid,
    'balance_due', inv.balance_due, 'issued_at', inv.issued_at,
    'paid_at', inv.paid_at, 'qr_payment_token', inv.qr_payment_token,
    'payor_type', be.payor_type,
    'line_items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'description', li.description, 'quantity', li.quantity,
        'unit_price', li.unit_price, 'line_total', li.line_total
      ) order by li.created_at) from public.billing_line_items li
      where li.billing_event_id = inv.billing_event_id
    ), '[]'::jsonb)
  ) order by inv.created_at desc), '[]'::jsonb) into v_result
  from public.invoices inv
  join public.billing_events be on be.id = inv.billing_event_id
  where inv.patient_id = v_patient_id and inv.organization_id = p_organization_id;

  return v_result;
end;
$$;

-- Get claims workspace for admin
create or replace function public.get_claims_workspace(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare v_result jsonb;
begin
  if not public.has_organization_permission(p_organization_id, 'can_view_claims') then
    raise exception 'Claims view permission is required.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'patient_id', c.patient_id,
    'patient_name', coalesce(p.name ->> 'text', 'Unknown'),
    'encounter_id', c.encounter_id, 'coverage_id', c.coverage_id,
    'status', c.status, 'use', c.use, 'claim_type', c.claim_type,
    'payor_type', c.payor_type, 'total', c.total,
    'submitted_at', c.submitted_at, 'adjudicated_at', c.adjudicated_at,
    'adjudication_result', c.adjudication_result,
    'approved_amount', c.approved_amount, 'denied_reason', c.denied_reason,
    'philhealth_claim_number', c.philhealth_claim_number,
    'items', c.items, 'created_at', c.created_at
  ) order by c.created_at desc), '[]'::jsonb) into v_result
  from public.claims c
  left join public.patients p on p.id = c.patient_id
  where c.organization_id = p_organization_id;

  return v_result;
end;
$$;

-- Submit a claim
create or replace function public.submit_claim(p_claim_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_claim public.claims%rowtype;
begin
  select * into v_claim from public.claims where id = p_claim_id for update;
  if not found then raise exception 'Claim not found.' using errcode = 'P0002'; end if;
  if v_claim.status <> 'active' then raise exception 'Only active claims can be submitted.' using errcode = '22023'; end if;
  if not public.has_organization_permission(v_claim.organization_id, 'can_manage_claims') then
    raise exception 'Claims management permission is required.' using errcode = '42501';
  end if;
  update public.claims set submitted_at = now() where id = p_claim_id;
end;
$$;

-- Adjudicate a claim
create or replace function public.adjudicate_claim(
  p_claim_id uuid,
  p_result text,
  p_approved_amount numeric default null,
  p_denied_reason text default null
)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_claim public.claims%rowtype;
begin
  select * into v_claim from public.claims where id = p_claim_id for update;
  if not found then raise exception 'Claim not found.' using errcode = 'P0002'; end if;
  if v_claim.submitted_at is null then raise exception 'Claim must be submitted first.' using errcode = '22023'; end if;
  if not public.has_organization_permission(v_claim.organization_id, 'can_manage_claims') then
    raise exception 'Claims management permission is required.' using errcode = '42501';
  end if;
  if p_result not in ('approved', 'denied', 'partial') then
    raise exception 'Result must be approved, denied, or partial.' using errcode = '22023';
  end if;
  update public.claims set
    adjudicated_at = now(),
    adjudication_result = p_result,
    approved_amount = p_approved_amount,
    denied_reason = nullif(btrim(p_denied_reason), ''),
    status = case when p_result = 'denied' then 'cancelled'::public.claim_status else 'active'::public.claim_status end
  where id = p_claim_id;
end;
$$;

-- Grant execution to authenticated
grant select, insert, update, delete on public.billing_events to authenticated;
grant select, insert, update, delete on public.billing_line_items to authenticated;
grant select, insert, update, delete on public.invoices to authenticated;
grant select, insert, update, delete on public.payments to authenticated;
grant select, insert, update, delete on public.pos_sales to authenticated;
grant execute on function
  public.generate_billing_event(uuid, uuid, public.payor_type),
  public.finalize_billing_event(uuid),
  public.record_payment(uuid, numeric, public.payment_method, text),
  public.create_pos_sale(uuid, jsonb, text, public.payment_method),
  public.get_billing_workspace(uuid),
  public.get_billing_line_items(uuid),
  public.get_billable_encounters(uuid),
  public.get_patient_invoices(uuid),
  public.get_claims_workspace(uuid),
  public.submit_claim(uuid),
  public.adjudicate_claim(uuid, text, numeric, text)
to authenticated;

comment on table public.billing_events is 'FHIR-adjacent billing event linking encounters, POS sales, and other billable occasions to priced line items.';
comment on table public.billing_line_items is 'Individual priced line items within a billing event — clinic services, inventory usages, lab tests, or POS items.';
comment on table public.invoices is 'FHIR Invoice mapping — patient-facing invoice for self-pay or partial-balance billing.';
comment on table public.payments is 'FHIR PaymentReconciliation mapping — individual payment transaction against an invoice.';
comment on table public.pos_sales is 'Point-of-sale retail transaction — walk-in purchase without an encounter.';
