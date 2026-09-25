-- Restore platform-configuration privileges narrowed by the clinic permission CMS.
-- This intentionally does not modify can_access_organization or any clinical
-- data policy: platform administrators remain unable to inherit patient access.

create or replace function public.can_manage_organization_accounts(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_superadmin()
    or public.has_organization_permission(p_organization_id, 'can_manage_staff_roles');
$$;

drop policy if exists document_templates_select on public.document_templates;
create policy document_templates_select on public.document_templates
  for select to authenticated
  using (
    public.is_superadmin()
    or public.has_organization_permission(organization_id, 'can_manage_document_templates')
  );

drop policy if exists organization_modules_select on public.organization_modules;
create policy organization_modules_select on public.organization_modules
  for select to authenticated
  using (
    public.is_superadmin()
    or public.can_access_organization(organization_id)
  );

create or replace function public.set_organization_module(
  p_organization_id uuid,
  p_module_key text,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not (
    public.is_superadmin()
    or public.has_organization_permission(p_organization_id, 'can_manage_feature_modules')
  ) then
    raise exception 'Module management permission is required.' using errcode = '42501';
  end if;
  if p_module_key = 'governance' and not p_enabled then
    raise exception 'The governance module cannot disable itself.' using errcode = '22023';
  end if;
  insert into public.organization_modules (
    organization_id, module_key, enabled, updated_by
  ) values (
    p_organization_id, p_module_key, p_enabled, auth.uid()
  )
  on conflict (organization_id, module_key) do update
    set enabled = excluded.enabled, updated_by = auth.uid();
end;
$$;

create or replace function public.save_organization_branding(
  p_organization_id uuid,
  p_display_name text,
  p_tagline text,
  p_logo_url text,
  p_primary_color text,
  p_accent_color text,
  p_support_email text,
  p_support_phone text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare saved_id uuid;
begin
  if not (
    public.is_superadmin()
    or public.has_organization_permission(p_organization_id, 'can_manage_clinic_branding')
  ) then
    raise exception 'Brand management permission is required.' using errcode = '42501';
  end if;
  insert into public.organization_branding (
    organization_id, display_name, tagline, logo_url, primary_color,
    accent_color, support_email, support_phone, updated_by
  ) values (
    p_organization_id, btrim(p_display_name), nullif(btrim(p_tagline), ''),
    nullif(btrim(p_logo_url), ''), upper(p_primary_color), upper(p_accent_color),
    nullif(btrim(p_support_email), ''), nullif(btrim(p_support_phone), ''), auth.uid()
  )
  on conflict (organization_id) do update set
    display_name = excluded.display_name,
    tagline = excluded.tagline,
    logo_url = excluded.logo_url,
    primary_color = excluded.primary_color,
    accent_color = excluded.accent_color,
    support_email = excluded.support_email,
    support_phone = excluded.support_phone,
    updated_by = auth.uid()
  returning id into saved_id;
  update public.organizations
    set name = btrim(p_display_name)
    where id = p_organization_id;
  return saved_id;
end;
$$;

revoke all on function public.can_manage_organization_accounts(uuid) from public;
revoke all on function public.set_organization_module(uuid, text, boolean) from public;
revoke all on function public.save_organization_branding(uuid, text, text, text, text, text, text, text) from public;
grant execute on function public.can_manage_organization_accounts(uuid) to authenticated;
grant execute on function public.set_organization_module(uuid, text, boolean) to authenticated;
grant execute on function public.save_organization_branding(uuid, text, text, text, text, text, text, text) to authenticated;
