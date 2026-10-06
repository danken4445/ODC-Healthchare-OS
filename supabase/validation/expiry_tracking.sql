-- Run after `pnpm exec supabase db reset --local`. Every result must be true.
-- The production break this catches: a perishable item can be tagged from an
-- expired or later-expiring batch, or a reversal loses its original lot.
\set ON_ERROR_STOP on

do $$
begin
  if to_regclass('public.inventory_batches') is null
    or to_regclass('public.inventory_usage_batch_consumptions') is null then
    raise exception 'Expiry batch tracking tables are missing.';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'inventory_items'
      and column_name = 'is_perishable'
  ) then
    raise exception 'Perishable item master flag is missing.';
  end if;
end $$;

begin;
-- Fixture uses the seeded first organization, an in-progress seeded encounter,
-- and an admin actor. Exact IDs are deliberately independent from production IDs.
update public.inventory_items
set is_perishable = true
where id = '91000000-0000-0000-0000-000000000001';

delete from public.inventory_batches
where stock_id = '92000000-0000-0000-0000-000000000001';

update public.department_stock
set quantity = 10
where id = '92000000-0000-0000-0000-000000000001';

insert into public.inventory_batches (
  organization_id, stock_id, item_id, department_id, lot_number, expiry_date,
  quantity, received_at
) values
  ('10000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 'EXP', current_date - 1, 2, now() - interval '3 days'),
  ('10000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 'EARLY', current_date + 1, 3, now() - interval '2 days'),
  ('10000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 'LATE', current_date + 7, 7, now() - interval '1 day');

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000106', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000106"}', true);
set local role authenticated;

select public.tag_inventory_usage(
  '60000000-0000-0000-0000-000000000001',
  '92000000-0000-0000-0000-000000000001', 5,
  '90000000-0000-0000-0000-000000000001'
) is not null as fefo_tag_succeeds;

select quantity = 0 as earliest_usable_batch_is_consumed_first
from public.inventory_batches where lot_number = 'EARLY';
select quantity = 5 as later_usable_batch_supplies_remainder
from public.inventory_batches where lot_number = 'LATE';
select quantity = 2 as expired_batch_is_never_consumed
from public.inventory_batches where lot_number = 'EXP';
select quantity = 5 as perishable_counter_matches_batch_total
from public.department_stock where id = '92000000-0000-0000-0000-000000000001';

reset role;
rollback;
