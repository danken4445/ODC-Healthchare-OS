-- Fixture for expiry_tracking_concurrency.ps1. Run after a local reset.
begin;
set local role postgres;
update public.inventory_items set is_perishable = true
where id = '91000000-0000-0000-0000-000000000001';
delete from public.inventory_usage_batch_consumptions
where batch_id in (select id from public.inventory_batches where stock_id = '92000000-0000-0000-0000-000000000001');
delete from public.inventory_batches where stock_id = '92000000-0000-0000-0000-000000000001';
update public.department_stock set quantity = 3
where id = '92000000-0000-0000-0000-000000000001';
insert into public.inventory_batches (organization_id, stock_id, item_id, department_id, lot_number, expiry_date, quantity)
values ('10000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 'CONCURRENT', (now() at time zone 'Asia/Manila')::date + 1, 3);
commit;
