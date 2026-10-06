-- Perishable stock remains represented by one item master and one department
-- stock row. Batches are its lot-level allocation ledger.
alter table public.inventory_items
  add column if not exists is_perishable boolean not null default false,
  add column if not exists near_expiry_days_override integer;
alter table public.inventory_items
  add constraint inventory_items_near_expiry_days_override_check
  check (near_expiry_days_override is null or near_expiry_days_override between 1 and 3650);

create table public.inventory_expiry_settings (
  organization_id uuid primary key references public.organizations(id),
  near_expiry_days integer not null default 90 check (near_expiry_days between 1 and 3650),
  updated_at timestamptz not null default now()
);

create table public.inventory_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  stock_id uuid not null,
  item_id uuid not null,
  department_id uuid not null,
  lot_number text,
  expiry_date date,
  quantity numeric(14,3) not null check (quantity >= 0),
  received_at timestamptz not null default now(),
  legacy_unassigned_expiry boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (stock_id, organization_id) references public.department_stock(id, organization_id),
  foreign key (item_id, organization_id) references public.inventory_items(id, organization_id),
  foreign key (department_id, organization_id) references public.departments(id, organization_id),
  check ((expiry_date is not null and not legacy_unassigned_expiry) or (expiry_date is null and legacy_unassigned_expiry))
);
create unique index inventory_batches_stock_expiry_lot_unique
  on public.inventory_batches (stock_id, expiry_date, coalesce(lot_number, ''));
create index inventory_batches_fefo_idx on public.inventory_batches
  (organization_id, item_id, department_id, expiry_date nulls last, received_at, id)
  where quantity > 0;

create table public.inventory_usage_batch_consumptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  usage_id uuid not null references public.inventory_usages(id),
  batch_id uuid not null references public.inventory_batches(id),
  quantity numeric(14,3) not null check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (usage_id, batch_id)
);
create index inventory_usage_batch_consumptions_batch_idx on public.inventory_usage_batch_consumptions(batch_id);
alter table public.inventory_stock_movements add column if not exists batch_id uuid references public.inventory_batches(id);

create or replace function public.inventory_manila_today() returns date
language sql stable set search_path = public as $$ select (now() at time zone 'Asia/Manila')::date $$;

create or replace function public.reject_inventory_batch_mutation() returns trigger language plpgsql set search_path = public as $$
begin raise exception 'Inventory batch consumption rows are immutable.' using errcode = '55000'; end $$;
create trigger inventory_usage_batch_consumptions_immutable before update or delete on public.inventory_usage_batch_consumptions
for each row execute function public.reject_inventory_batch_mutation();
create trigger inventory_batches_set_updated_at before update on public.inventory_batches for each row execute function public.set_updated_at();
create trigger inventory_batches_audit after insert or update or delete on public.inventory_batches for each row execute function public.write_audit_log();
create trigger inventory_usage_batch_consumptions_audit after insert on public.inventory_usage_batch_consumptions for each row execute function public.write_audit_log();

alter table public.inventory_expiry_settings enable row level security;
alter table public.inventory_batches enable row level security;
alter table public.inventory_usage_batch_consumptions enable row level security;
create policy inventory_expiry_settings_select on public.inventory_expiry_settings for select to authenticated using (public.has_organization_permission(organization_id, 'can_view_inventory') or public.has_organization_permission(organization_id, 'can_tag_inventory_usage'));
create policy inventory_batches_select on public.inventory_batches for select to authenticated using (public.has_organization_permission(organization_id, 'can_view_inventory') or public.has_organization_permission(organization_id, 'can_tag_inventory_usage'));
create policy inventory_usage_batch_consumptions_select on public.inventory_usage_batch_consumptions for select to authenticated using (public.has_organization_permission(organization_id, 'can_manage_inventory') or public.has_organization_permission(organization_id, 'can_tag_inventory_usage'));
revoke all on public.inventory_expiry_settings, public.inventory_batches, public.inventory_usage_batch_consumptions from anon, authenticated;
grant select on public.inventory_expiry_settings, public.inventory_batches, public.inventory_usage_batch_consumptions to authenticated;

create view public.inventory_batch_statuses with (security_invoker = true) as
select b.*, case when b.expiry_date is null then 'legacy_unassigned' when b.expiry_date < public.inventory_manila_today() then 'expired'
  when b.expiry_date <= public.inventory_manila_today() + coalesce(i.near_expiry_days_override, s.near_expiry_days, 90) then 'near_expiry' else 'ok' end as expiry_status,
case when b.expiry_date is null or b.expiry_date >= public.inventory_manila_today() then b.quantity else 0 end as usable_quantity
from public.inventory_batches b join public.inventory_items i on i.id = b.item_id
left join public.inventory_expiry_settings s on s.organization_id = b.organization_id;
grant select on public.inventory_batch_statuses to authenticated;
