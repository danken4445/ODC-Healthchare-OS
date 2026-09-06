-- POS staff need read access to the sellable catalog and its current stock,
-- but inventory-management writes remain restricted to inventory roles.
drop policy if exists inventory_items_select on public.inventory_items;
create policy inventory_items_select on public.inventory_items for select to authenticated using (
  public.has_organization_permission(organization_id, 'can_view_inventory')
  or public.has_organization_permission(organization_id, 'can_tag_inventory_usage')
  or public.has_organization_permission(organization_id, 'can_manage_pos')
);

drop policy if exists department_stock_select on public.department_stock;
create policy department_stock_select on public.department_stock for select to authenticated using (
  public.has_organization_permission(organization_id, 'can_view_inventory')
  or public.has_organization_permission(organization_id, 'can_tag_inventory_usage')
  or public.has_organization_permission(organization_id, 'can_manage_pos')
);
