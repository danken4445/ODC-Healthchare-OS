-- Inventory hierarchy is a navigation model over the physical stock ledger.
-- Financial reconciliation remains in billing_events/billing_line_items.

create table if not exists public.inventory_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  department_id uuid not null,
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (department_id, organization_id)
    references public.departments(id, organization_id),
  unique (id, organization_id),
  unique (department_id, name),
  check (length(btrim(name)) between 2 and 120)
);

alter table public.inventory_categories enable row level security;
create policy inventory_categories_select on public.inventory_categories for select to authenticated using (
  public.has_organization_permission(organization_id, 'can_view_inventory')
  or public.has_organization_permission(organization_id, 'can_manage_inventory')
  or public.has_organization_permission(organization_id, 'can_tag_inventory_usage')
);
revoke all on public.inventory_categories from authenticated;
grant select on public.inventory_categories to authenticated;

alter table public.department_stock add column if not exists category_id uuid;
insert into public.inventory_categories (organization_id, department_id, name, description)
select d.organization_id, d.id, 'Department stock', 'Default storage category for existing stock.'
from public.departments d
on conflict (department_id, name) do nothing;

update public.department_stock stock
set category_id = category.id
from public.inventory_categories category
where category.department_id = stock.department_id
  and category.organization_id = stock.organization_id
  and category.name = 'Department stock'
  and stock.category_id is null;

alter table public.department_stock
  alter column category_id set not null,
  add constraint department_stock_category_id_fkey
    foreign key (category_id) references public.inventory_categories(id);

create or replace function public.enforce_department_stock_category_integrity()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (
    select 1 from public.inventory_categories category
    where category.id = new.category_id
      and category.organization_id = new.organization_id
      and category.department_id = new.department_id
      and category.active
  ) then
    raise exception 'Inventory category must belong to the stock department and organization.' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists department_stock_category_integrity on public.department_stock;
create trigger department_stock_category_integrity before insert or update of category_id, department_id, organization_id
  on public.department_stock for each row execute function public.enforce_department_stock_category_integrity();

-- The transaction that tags an item is the physical dispense event. It creates
-- a separate usage row and synchronizes a bill, but never waits for payment.
create or replace function public.tag_inventory_usage(
  p_encounter_id uuid, p_stock_id uuid, p_quantity numeric, p_department_id uuid
)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare
  v_encounter public.encounters%rowtype;
  v_stock public.department_stock%rowtype;
  v_item public.inventory_items%rowtype;
  v_usage_id uuid;
  v_assigned_department_id uuid;
  v_department_id uuid;
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
  select assignment.department_id into v_assigned_department_id
  from public.staff_department_assignments assignment
  where assignment.organization_id = v_encounter.organization_id and assignment.user_id = auth.uid();
  if v_assigned_department_id is not null and p_department_id is not null
    and v_assigned_department_id is distinct from p_department_id then
    raise exception 'Your inventory tagging is assigned to a different department.' using errcode = '42501';
  end if;
  v_department_id := coalesce(v_assigned_department_id, p_department_id);
  select * into v_stock from public.department_stock
  where id = p_stock_id and organization_id = v_encounter.organization_id
    and (v_department_id is null or department_id = v_department_id)
  for update;
  if not found then raise exception 'The selected department stock is not available for this clinic or department.' using errcode = '22023'; end if;
  select * into v_item from public.inventory_items where id = v_stock.item_id and active;
  if not found then raise exception 'The inventory item is inactive.' using errcode = '22023'; end if;
  update public.department_stock set quantity = quantity - p_quantity
  where id = v_stock.id and quantity >= p_quantity;
  if not found then raise exception 'Insufficient stock in the selected department.' using errcode = '22023'; end if;
  insert into public.inventory_usages (
    organization_id, stock_id, item_id, department_id, encounter_id, patient_id,
    quantity, unit_price, unit_cost, currency, tagged_by
  ) values (
    v_encounter.organization_id, v_stock.id, v_item.id, v_stock.department_id,
    v_encounter.id, v_encounter.patient_id, p_quantity, v_item.selling_price,
    v_item.unit_cost, v_item.currency, auth.uid()
  ) returning id into v_usage_id;
  insert into public.inventory_stock_movements (
    organization_id, stock_id, item_id, department_id, movement_type,
    quantity_delta, reason, usage_id, recorded_by
  ) values (
    v_encounter.organization_id, v_stock.id, v_item.id, v_stock.department_id,
    'usage', -p_quantity, 'Patient-tagged inventory usage', v_usage_id, auth.uid()
  );
  perform public.sync_inventory_usage_to_billing(v_usage_id);
  return v_usage_id;
end;
$$;
create or replace function public.tag_inventory_usage(p_encounter_id uuid, p_stock_id uuid, p_quantity numeric)
returns uuid language plpgsql security definer set search_path = public, auth as $$
begin return public.tag_inventory_usage(p_encounter_id, p_stock_id, p_quantity, null); end;
$$;

create table if not exists public.admin_inventory_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  view_mode text not null default 'visual' check (view_mode in ('visual', 'simple')),
  updated_at timestamptz not null default now(),
  primary key (user_id, organization_id)
);
alter table public.admin_inventory_preferences enable row level security;

create or replace function public.get_my_inventory_view_mode(p_organization_id uuid)
returns text language plpgsql security definer set search_path = public, auth stable as $$
begin
  if auth.uid() is null then raise exception 'Authentication is required.' using errcode = '28000'; end if;
  if not (public.has_organization_permission(p_organization_id, 'can_view_inventory')
    or public.has_organization_permission(p_organization_id, 'can_manage_inventory')
    or public.has_organization_permission(p_organization_id, 'can_tag_inventory_usage')) then
    raise exception 'Inventory access is required.' using errcode = '42501';
  end if;
  return coalesce((select view_mode from public.admin_inventory_preferences
    where user_id = auth.uid() and organization_id = p_organization_id), 'visual');
end;
$$;
create or replace function public.save_my_inventory_view_mode(p_organization_id uuid, p_mode text)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if p_mode not in ('visual', 'simple') then raise exception 'Unsupported inventory view mode.' using errcode = '22023'; end if;
  if not (public.has_organization_permission(p_organization_id, 'can_view_inventory')
    or public.has_organization_permission(p_organization_id, 'can_manage_inventory')
    or public.has_organization_permission(p_organization_id, 'can_tag_inventory_usage')) then
    raise exception 'Inventory access is required.' using errcode = '42501';
  end if;
  insert into public.admin_inventory_preferences (user_id, organization_id, view_mode)
  values (auth.uid(), p_organization_id, p_mode)
  on conflict (user_id, organization_id) do update set view_mode = excluded.view_mode, updated_at = now();
end;
$$;
revoke all on function public.get_my_inventory_view_mode(uuid), public.save_my_inventory_view_mode(uuid, text) from public, anon;
grant execute on function public.get_my_inventory_view_mode(uuid), public.save_my_inventory_view_mode(uuid, text) to authenticated;

-- Expose only the reconciliation label needed by the inventory UI. This keeps
-- payment data separate from, and unable to influence, physical stock counts.
create or replace function public.get_inventory_usage_billing_statuses(p_organization_id uuid)
returns table (usage_id uuid, billing_status text)
language sql security definer set search_path = public, auth stable as $$
  select usage_row.id,
    case
      when bill.payor_type = 'philhealth_nbb' then 'no-balance-billing'
      when bill.status = 'finalized' then 'paid'
      else 'unbilled'
    end
  from public.inventory_usages usage_row
  left join lateral (
    select billing_event.payor_type, billing_event.status
    from public.billing_line_items line_item
    join public.billing_events billing_event on billing_event.id = line_item.billing_event_id
    where line_item.organization_id = usage_row.organization_id
      and line_item.source_type = 'inventory_usage'
      and line_item.source_id = usage_row.id
    order by billing_event.created_at desc limit 1
  ) bill on true
  where usage_row.organization_id = p_organization_id
    and (public.has_organization_permission(p_organization_id, 'can_view_inventory')
      or public.has_organization_permission(p_organization_id, 'can_manage_inventory')
      or public.has_organization_permission(p_organization_id, 'can_tag_inventory_usage'));
$$;
revoke all on function public.get_inventory_usage_billing_statuses(uuid) from public, anon;
grant execute on function public.get_inventory_usage_billing_statuses(uuid) to authenticated;
