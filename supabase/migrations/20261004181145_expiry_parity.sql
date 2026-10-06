create or replace function public.enforce_perishable_stock_batch_parity()
returns trigger language plpgsql set search_path = public as $$
declare v_stock_id uuid; v_item_id uuid; v_quantity numeric(14,3); v_batch_quantity numeric(14,3);
begin
 if tg_table_name = 'department_stock' then v_stock_id := coalesce(new.id, old.id); else v_stock_id := coalesce(new.stock_id, old.stock_id); end if;
 select item_id, quantity into v_item_id, v_quantity from public.department_stock where id = v_stock_id;
 if exists (select 1 from public.inventory_items where id=v_item_id and is_perishable) then
  select coalesce(sum(quantity),0) into v_batch_quantity from public.inventory_batches where stock_id=v_stock_id;
  if v_quantity is distinct from v_batch_quantity then raise exception 'Perishable department stock must equal the sum of its batches.' using errcode='23514'; end if;
 end if; return null;
end $$;
create constraint trigger department_stock_perishable_batch_parity after insert or update of quantity on public.department_stock deferrable initially deferred for each row execute function public.enforce_perishable_stock_batch_parity();
create constraint trigger inventory_batches_perishable_stock_parity after insert or update or delete on public.inventory_batches deferrable initially deferred for each row execute function public.enforce_perishable_stock_batch_parity();
create or replace function public.set_inventory_item_perishable(p_item_id uuid, p_is_perishable boolean) returns void language plpgsql security definer set search_path=public,auth as $$ declare v_org uuid; r record; begin select organization_id into v_org from public.inventory_items where id=p_item_id for update; if v_org is null or not public.has_organization_permission(v_org,'can_manage_inventory') then raise exception 'Inventory management permission is required.' using errcode='42501'; end if; update public.inventory_items set is_perishable=p_is_perishable where id=p_item_id; if p_is_perishable then for r in select * from public.department_stock where item_id=p_item_id and quantity>0 for update loop insert into public.inventory_batches(organization_id,stock_id,item_id,department_id,quantity,legacy_unassigned_expiry) values(r.organization_id,r.id,r.item_id,r.department_id,r.quantity,true) on conflict do nothing; end loop; end if; end $$;
