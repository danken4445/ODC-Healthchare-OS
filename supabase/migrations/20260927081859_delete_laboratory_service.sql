-- The catalog is mutable only by staff with the existing laboratory-service permission.
-- Deletion is audited by the table trigger defined with the catalog itself.
create or replace function public.delete_laboratory_service(
  p_service_id uuid,
  p_organization_id uuid
) returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.can_manage_laboratory_services(p_organization_id) then
    raise exception 'Laboratory service management permission is required.' using errcode = '42501';
  end if;

  delete from public.laboratory_services
  where id = p_service_id
    and organization_id = p_organization_id;

  if not found then
    raise exception 'Laboratory service not found.' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.delete_laboratory_service(uuid, uuid) from public, anon;
grant execute on function public.delete_laboratory_service(uuid, uuid) to authenticated;
