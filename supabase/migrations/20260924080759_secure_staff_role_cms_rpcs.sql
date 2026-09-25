-- Staff and role administration is authenticated-only. Each function also
-- performs its own organization permission check, but anonymous callers do
-- not need an exposed RPC surface.

revoke all on function public.list_clinic_role_definitions(uuid)
  from public, anon;
revoke all on function public.save_clinic_role_definition(uuid, text, text, text[])
  from public, anon;
revoke all on function public.list_staff_departments(uuid)
  from public, anon;
revoke all on function public.list_clinic_staff(uuid)
  from public, anon;
revoke all on function public.assign_staff_department(uuid, uuid, uuid)
  from public, anon;
revoke all on function public.set_clinic_user_active(uuid, uuid, boolean)
  from public, anon;

grant execute on function public.list_clinic_role_definitions(uuid)
  to authenticated;
grant execute on function public.save_clinic_role_definition(uuid, text, text, text[])
  to authenticated;
grant execute on function public.list_staff_departments(uuid)
  to authenticated;
grant execute on function public.list_clinic_staff(uuid)
  to authenticated;
grant execute on function public.assign_staff_department(uuid, uuid, uuid)
  to authenticated;
grant execute on function public.set_clinic_user_active(uuid, uuid, boolean)
  to authenticated;
