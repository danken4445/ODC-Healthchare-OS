-- Loop 3: FHIR-aligned inventory master, location stock, and patient usage.
-- InventoryItem describes the product, Location describes the department,
-- department_stock is the single current-count ledger, and inventory_usages
-- represents a patient-linked supply delivery/dispense event.

alter table public.roles drop constraint if exists roles_name_check;
alter table public.roles add constraint roles_name_check check (
  name in (
    'patient', 'doctor', 'nurse', 'lab_staff', 'specialist', 'front_desk',
    'inventory_staff', 'admin', 'owner'
  )
);

insert into public.roles (name) values ('inventory_staff')
on conflict (name) do nothing;

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  code text not null,
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code),
  unique (id, organization_id),
  check (length(btrim(code)) between 1 and 40),
  check (length(btrim(name)) between 2 and 120)
);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  sku text not null,
  name text not null,
  description text,
  unit_of_measure text not null,
  unit_price numeric(12,2) not null default 0,
  currency text not null default 'PHP',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, sku),
  unique (id, organization_id),
  check (length(btrim(sku)) between 1 and 80),
  check (length(btrim(name)) between 2 and 200),
  check (length(btrim(unit_of_measure)) between 1 and 40),
  check (unit_price >= 0),
  check (currency ~ '^[A-Z]{3}$')
);

create table public.department_stock (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  item_id uuid not null,
  department_id uuid not null,
  quantity numeric(14,3) not null default 0,
  reorder_level numeric(14,3) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (item_id, organization_id)
    references public.inventory_items(id, organization_id),
  foreign key (department_id, organization_id)
    references public.departments(id, organization_id),
  unique (organization_id, item_id, department_id),
  unique (id, organization_id),
  check (quantity >= 0),
  check (reorder_level >= 0)
);

create table public.inventory_usages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  stock_id uuid not null,
  item_id uuid not null,
  department_id uuid not null,
  encounter_id uuid not null references public.encounters(id),
  patient_id uuid not null references public.patients(id),
  quantity numeric(14,3) not null,
  unit_price numeric(12,2) not null,
  currency text not null,
  tagged_by uuid not null references auth.users(id),
  used_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (stock_id, organization_id)
    references public.department_stock(id, organization_id),
  foreign key (item_id, organization_id)
    references public.inventory_items(id, organization_id),
  foreign key (department_id, organization_id)
    references public.departments(id, organization_id),
  check (quantity > 0),
  check (unit_price >= 0),
  check (currency ~ '^[A-Z]{3}$')
);

create table public.inventory_stock_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  stock_id uuid not null,
  item_id uuid not null,
  department_id uuid not null,
  movement_type text not null check (
    movement_type in ('opening', 'receipt', 'adjustment', 'transfer_in', 'transfer_out', 'usage')
  ),
  quantity_delta numeric(14,3) not null check (quantity_delta <> 0),
  reason text,
  usage_id uuid references public.inventory_usages(id),
  transfer_group_id uuid,
  recorded_by uuid references auth.users(id),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (stock_id, organization_id)
    references public.department_stock(id, organization_id),
  foreign key (item_id, organization_id)
    references public.inventory_items(id, organization_id),
  foreign key (department_id, organization_id)
    references public.departments(id, organization_id)
);

create index inventory_items_org_name_idx
  on public.inventory_items (organization_id, active, name);
create index department_stock_org_item_idx
  on public.department_stock (organization_id, item_id);
create index department_stock_org_department_idx
  on public.department_stock (organization_id, department_id);
create index inventory_usages_org_encounter_idx
  on public.inventory_usages (organization_id, encounter_id, used_at desc);
create index inventory_usages_org_patient_idx
  on public.inventory_usages (organization_id, patient_id, used_at desc);
create index inventory_stock_movements_stock_idx
  on public.inventory_stock_movements (stock_id, occurred_at desc);

-- Permission assignments are data, not UI role checks. Organization-specific
-- role_permissions can be added or removed later without changing application code.
insert into public.role_permissions (role_id, organization_id, permission)
select role.id, null, permission.permission
from public.roles role
join (values
  ('doctor', 'can_tag_inventory_usage'),
  ('nurse', 'can_tag_inventory_usage'),
  ('inventory_staff', 'can_view_inventory'),
  ('inventory_staff', 'can_manage_inventory'),
  ('inventory_staff', 'can_tag_inventory_usage'),
  ('admin', 'can_view_inventory'),
  ('admin', 'can_manage_inventory'),
  ('admin', 'can_tag_inventory_usage'),
  ('owner', 'can_view_inventory'),
  ('owner', 'can_manage_inventory'),
  ('owner', 'can_tag_inventory_usage')
) as permission(role_name, permission)
  on permission.role_name = role.name
on conflict (role_id, organization_id, permission) do nothing;

create or replace function public.has_organization_permission(
  target_organization_id uuid,
  target_permission text
)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.role_permissions permission
    join public.roles role on role.id = permission.role_id
    where permission.permission = target_permission
      and (permission.organization_id is null or permission.organization_id = target_organization_id)
      and (
        exists (
          select 1
          from public.practitioner_roles practitioner_role
          join public.practitioners practitioner
            on practitioner.id = practitioner_role.practitioner_id
          where practitioner.auth_user_id = auth.uid()
            and practitioner.active
            and practitioner_role.active
            and practitioner_role.organization_id = target_organization_id
            and practitioner_role.role_code = role.name
        )
        or exists (
          select 1
          from public.user_roles membership
          where membership.user_id = auth.uid()
            and membership.organization_id = target_organization_id
            and membership.role_id = role.id
        )
      )
  );
$$;

create or replace function public.enforce_staff_user_clinic_boundary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare assigned_role text;
begin
  select role.name into assigned_role from public.roles role where role.id = new.role_id;
  if assigned_role in ('doctor', 'nurse', 'lab_staff', 'specialist', 'front_desk', 'inventory_staff')
    and not exists (
      select 1 from public.practitioner_roles practitioner_role
      join public.practitioners practitioner on practitioner.id = practitioner_role.practitioner_id
      where practitioner.auth_user_id = new.user_id
        and practitioner.organization_id = new.organization_id
        and practitioner.active and practitioner_role.active
        and practitioner_role.role_code = assigned_role
    ) then
    raise exception 'Operational memberships require a matching active PractitionerRole.' using errcode = '23514';
  end if;
  if assigned_role in ('doctor', 'nurse', 'lab_staff', 'specialist', 'front_desk', 'inventory_staff')
    and exists (
      select 1 from public.practitioners practitioner
      where practitioner.auth_user_id = new.user_id
        and practitioner.organization_id <> new.organization_id
    ) then
    raise exception 'Operational access must match the practitioner clinic.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_practitioner_user_clinic_boundary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.auth_user_id is not null and exists (
    select 1 from public.user_roles membership
    join public.roles role on role.id = membership.role_id
    where membership.user_id = new.auth_user_id
      and membership.organization_id <> new.organization_id
      and role.name in ('doctor', 'nurse', 'lab_staff', 'specialist', 'front_desk', 'inventory_staff')
  ) then
    raise exception 'Operational access must match the practitioner clinic.' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Inventory staff are admitted to the administrative shell but are not added
-- to can_access_organization, which would expose unrelated clinical tables.
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
    into v_organizations, v_roles from public.practitioner_roles pr join public.practitioners p on p.id = pr.practitioner_id
    where p.auth_user_id = auth.uid() and p.active and pr.active and pr.role_code in ('doctor', 'nurse', 'specialist');
    return query select cardinality(v_organizations) > 0, false, v_organizations, v_roles; return;
  end if;
  if v_superadmin then return query select true, true, v_organizations, array['superadmin']::text[]; return; end if;
  select coalesce(array_agg(distinct a.organization_id), '{}'::uuid[]), coalesce(array_agg(distinct a.role_code), '{}'::text[])
  into v_organizations, v_roles from (
    select pr.organization_id, pr.role_code from public.practitioner_roles pr join public.practitioners p on p.id = pr.practitioner_id
      where p.auth_user_id = auth.uid() and p.active and pr.active and pr.role_code in ('front_desk', 'inventory_staff', 'admin', 'owner')
    union select ur.organization_id, r.name from public.user_roles ur join public.roles r on r.id = ur.role_id
      where ur.user_id = auth.uid() and r.name in ('admin', 'owner')
  ) a;
  return query select cardinality(v_organizations) > 0, false, v_organizations, v_roles;
end;
$$;

create or replace function public.adjust_department_stock(
  p_item_id uuid,
  p_department_id uuid,
  p_quantity_delta numeric,
  p_reason text,
  p_movement_type text default 'adjustment'
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_organization_id uuid;
  v_stock_id uuid;
begin
  select item.organization_id into v_organization_id
  from public.inventory_items item
  where item.id = p_item_id and item.active;
  if v_organization_id is null or not exists (
    select 1 from public.departments department
    where department.id = p_department_id
      and department.organization_id = v_organization_id
      and department.active
  ) then
    raise exception 'An active item and department in the same clinic are required.' using errcode = '22023';
  end if;
  if not public.has_organization_permission(v_organization_id, 'can_manage_inventory') then
    raise exception 'Inventory management permission is required.' using errcode = '42501';
  end if;
  if p_quantity_delta is null or p_quantity_delta = 0
    or p_movement_type not in ('opening', 'receipt', 'adjustment')
    or length(coalesce(btrim(p_reason), '')) < 2 then
    raise exception 'A non-zero quantity, valid movement type, and reason are required.' using errcode = '22023';
  end if;

  insert into public.department_stock (organization_id, item_id, department_id, quantity)
  values (v_organization_id, p_item_id, p_department_id, greatest(p_quantity_delta, 0))
  on conflict (organization_id, item_id, department_id) do nothing
  returning id into v_stock_id;

  if v_stock_id is null then
    update public.department_stock
    set quantity = quantity + p_quantity_delta
    where organization_id = v_organization_id
      and item_id = p_item_id
      and department_id = p_department_id
      and quantity + p_quantity_delta >= 0
    returning id into v_stock_id;
    if v_stock_id is null then
      raise exception 'The adjustment would make stock negative.' using errcode = '22023';
    end if;
  elsif p_quantity_delta < 0 then
    raise exception 'Opening stock cannot be negative.' using errcode = '22023';
  end if;

  insert into public.inventory_stock_movements (
    organization_id, stock_id, item_id, department_id,
    movement_type, quantity_delta, reason, recorded_by
  ) values (
    v_organization_id, v_stock_id, p_item_id, p_department_id,
    p_movement_type, p_quantity_delta, btrim(p_reason), auth.uid()
  );
  return v_stock_id;
end;
$$;

create or replace function public.transfer_department_stock(
  p_item_id uuid,
  p_from_department_id uuid,
  p_to_department_id uuid,
  p_quantity numeric,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_organization_id uuid;
  v_from_stock_id uuid;
  v_to_stock_id uuid;
  v_transfer_group_id uuid := gen_random_uuid();
begin
  select organization_id into v_organization_id from public.inventory_items where id = p_item_id and active;
  if v_organization_id is null or not public.has_organization_permission(v_organization_id, 'can_manage_inventory') then
    raise exception 'Inventory management permission is required.' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity <= 0 or p_from_department_id = p_to_department_id
    or length(coalesce(btrim(p_reason), '')) < 2 then
    raise exception 'A positive quantity, two departments, and reason are required.' using errcode = '22023';
  end if;
  if (select count(*) from public.departments where organization_id = v_organization_id and active and id in (p_from_department_id, p_to_department_id)) <> 2 then
    raise exception 'Both departments must be active and belong to the item clinic.' using errcode = '22023';
  end if;

  update public.department_stock
  set quantity = quantity - p_quantity
  where organization_id = v_organization_id and item_id = p_item_id
    and department_id = p_from_department_id and quantity >= p_quantity
  returning id into v_from_stock_id;
  if v_from_stock_id is null then
    raise exception 'Insufficient stock for this transfer.' using errcode = '22023';
  end if;

  insert into public.department_stock (organization_id, item_id, department_id, quantity)
  values (v_organization_id, p_item_id, p_to_department_id, p_quantity)
  on conflict (organization_id, item_id, department_id) do update
  set quantity = public.department_stock.quantity + excluded.quantity
  returning id into v_to_stock_id;

  insert into public.inventory_stock_movements (
    organization_id, stock_id, item_id, department_id, movement_type,
    quantity_delta, reason, transfer_group_id, recorded_by
  ) values
    (v_organization_id, v_from_stock_id, p_item_id, p_from_department_id, 'transfer_out', -p_quantity, btrim(p_reason), v_transfer_group_id, auth.uid()),
    (v_organization_id, v_to_stock_id, p_item_id, p_to_department_id, 'transfer_in', p_quantity, btrim(p_reason), v_transfer_group_id, auth.uid());
  return v_transfer_group_id;
end;
$$;

create or replace function public.tag_inventory_usage(
  p_encounter_id uuid,
  p_stock_id uuid,
  p_quantity numeric
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_encounter public.encounters%rowtype;
  v_stock public.department_stock%rowtype;
  v_item public.inventory_items%rowtype;
  v_usage_id uuid;
begin
  select * into v_encounter from public.encounters where id = p_encounter_id;
  if not found or v_encounter.status <> 'in_progress' then
    raise exception 'An in-progress encounter is required.' using errcode = '22023';
  end if;
  if not public.has_organization_permission(v_encounter.organization_id, 'can_tag_inventory_usage') then
    raise exception 'Inventory usage tagging permission is required.' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Usage quantity must be positive.' using errcode = '22023';
  end if;

  select * into v_stock from public.department_stock
  where id = p_stock_id and organization_id = v_encounter.organization_id;
  if not found then
    raise exception 'The selected department stock is not available for this clinic.' using errcode = '22023';
  end if;
  select * into v_item from public.inventory_items where id = v_stock.item_id and active;
  if not found then
    raise exception 'The inventory item is inactive.' using errcode = '22023';
  end if;

  update public.department_stock set quantity = quantity - p_quantity
  where id = v_stock.id and quantity >= p_quantity;
  if not found then
    raise exception 'Insufficient stock in the selected department.' using errcode = '22023';
  end if;

  insert into public.inventory_usages (
    organization_id, stock_id, item_id, department_id, encounter_id,
    patient_id, quantity, unit_price, currency, tagged_by
  ) values (
    v_encounter.organization_id, v_stock.id, v_item.id, v_stock.department_id,
    v_encounter.id, v_encounter.patient_id, p_quantity,
    v_item.unit_price, v_item.currency, auth.uid()
  ) returning id into v_usage_id;

  insert into public.inventory_stock_movements (
    organization_id, stock_id, item_id, department_id, movement_type,
    quantity_delta, reason, usage_id, recorded_by
  ) values (
    v_encounter.organization_id, v_stock.id, v_item.id, v_stock.department_id,
    'usage', -p_quantity, 'Encounter usage', v_usage_id, auth.uid()
  );
  return v_usage_id;
end;
$$;

create or replace function public.list_inventory_encounters(p_organization_id uuid)
returns table (id uuid, service_type text, period_start timestamptz)
language sql stable security definer set search_path = public, auth
as $$
  select encounter.id, encounter.service_type, encounter.period_start
  from public.encounters encounter
  where encounter.organization_id = p_organization_id
    and encounter.status = 'in_progress'
    and public.has_organization_permission(p_organization_id, 'can_tag_inventory_usage')
  order by encounter.period_start desc;
$$;

create or replace function public.reject_inventory_usage_mutation()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'Inventory usage records are immutable; create a correcting stock adjustment.' using errcode = '55000';
end;
$$;

create or replace function public.reject_inventory_movement_mutation()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'Inventory stock movements are append-only.' using errcode = '55000';
end;
$$;

create trigger departments_set_updated_at before update on public.departments
  for each row execute function public.set_updated_at();
create trigger inventory_items_set_updated_at before update on public.inventory_items
  for each row execute function public.set_updated_at();
create trigger department_stock_set_updated_at before update on public.department_stock
  for each row execute function public.set_updated_at();
create trigger inventory_usages_are_immutable before update or delete on public.inventory_usages
  for each row execute function public.reject_inventory_usage_mutation();
create trigger inventory_stock_movements_are_immutable before update or delete on public.inventory_stock_movements
  for each row execute function public.reject_inventory_movement_mutation();

create trigger departments_audit after insert or update or delete on public.departments
  for each row execute function public.write_audit_log();
create trigger inventory_items_audit after insert or update or delete on public.inventory_items
  for each row execute function public.write_audit_log();
create trigger department_stock_audit after insert or update or delete on public.department_stock
  for each row execute function public.write_audit_log();
create trigger inventory_usages_audit after insert on public.inventory_usages
  for each row execute function public.write_audit_log();
create trigger inventory_stock_movements_audit after insert on public.inventory_stock_movements
  for each row execute function public.write_audit_log();

alter table public.departments enable row level security;
alter table public.inventory_items enable row level security;
alter table public.department_stock enable row level security;
alter table public.inventory_usages enable row level security;
alter table public.inventory_stock_movements enable row level security;

create policy departments_select on public.departments for select to authenticated using (
  public.has_organization_permission(organization_id, 'can_view_inventory')
  or public.has_organization_permission(organization_id, 'can_tag_inventory_usage')
);
create policy departments_manage on public.departments for all to authenticated
  using (public.has_organization_permission(organization_id, 'can_manage_inventory'))
  with check (public.has_organization_permission(organization_id, 'can_manage_inventory'));
create policy inventory_items_select on public.inventory_items for select to authenticated using (
  public.has_organization_permission(organization_id, 'can_view_inventory')
  or public.has_organization_permission(organization_id, 'can_tag_inventory_usage')
);
create policy inventory_items_manage on public.inventory_items for all to authenticated
  using (public.has_organization_permission(organization_id, 'can_manage_inventory'))
  with check (public.has_organization_permission(organization_id, 'can_manage_inventory'));
create policy department_stock_select on public.department_stock for select to authenticated using (
  public.has_organization_permission(organization_id, 'can_view_inventory')
  or public.has_organization_permission(organization_id, 'can_tag_inventory_usage')
);
create policy inventory_usages_select on public.inventory_usages for select to authenticated using (
  public.has_organization_permission(organization_id, 'can_manage_inventory')
  or public.has_organization_permission(organization_id, 'can_tag_inventory_usage')
);
create policy inventory_stock_movements_select on public.inventory_stock_movements for select to authenticated using (
  public.has_organization_permission(organization_id, 'can_manage_inventory')
);
create policy inventory_organization_select on public.organizations for select to authenticated using (
  public.has_organization_permission(id, 'can_view_inventory')
  or public.has_organization_permission(id, 'can_tag_inventory_usage')
);

grant select, insert, update on public.departments, public.inventory_items to authenticated;
grant select on public.department_stock, public.inventory_usages, public.inventory_stock_movements to authenticated;
revoke insert, update, delete on public.department_stock, public.inventory_usages, public.inventory_stock_movements from authenticated;

revoke all on function public.has_organization_permission(uuid, text) from public, anon, authenticated;
revoke all on function public.adjust_department_stock(uuid, uuid, numeric, text, text) from public, anon, authenticated;
revoke all on function public.transfer_department_stock(uuid, uuid, uuid, numeric, text) from public, anon, authenticated;
revoke all on function public.tag_inventory_usage(uuid, uuid, numeric) from public, anon, authenticated;
revoke all on function public.list_inventory_encounters(uuid) from public, anon, authenticated;
grant execute on function public.has_organization_permission(uuid, text) to authenticated;
grant execute on function public.adjust_department_stock(uuid, uuid, numeric, text, text) to authenticated;
grant execute on function public.transfer_department_stock(uuid, uuid, uuid, numeric, text) to authenticated;
grant execute on function public.tag_inventory_usage(uuid, uuid, numeric) to authenticated;
grant execute on function public.list_inventory_encounters(uuid) to authenticated;

alter table public.department_stock replica identity full;
alter table public.inventory_usages replica identity full;
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='department_stock') then
      alter publication supabase_realtime add table public.department_stock;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='inventory_usages') then
      alter publication supabase_realtime add table public.inventory_usages;
    end if;
  end if;
end $$;

comment on table public.departments is 'FHIR Location mapping for a clinic department that holds inventory.';
comment on table public.inventory_items is 'FHIR InventoryItem mapping; one row defines one distinct consumable independent of stock and location.';
comment on table public.department_stock is 'Current stock per InventoryItem and department Location; organization totals are derived sums.';
comment on table public.inventory_usages is 'Encounter-linked supply delivery/dispense event and Loop 5 consumable billing source.';
comment on table public.inventory_stock_movements is 'Append-only logistics history supporting receipts, adjustments, transfers, and encounter usage.';
