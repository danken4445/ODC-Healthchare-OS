-- Add CMS booking confirmation message fields to organization_branding
-- and update save_organization_branding RPC.

alter table public.organization_branding
  add column if not exists clinic_visit_message text,
  add column if not exists teleconsult_message text,
  add column if not exists booking_confirmation_message text;

create or replace function public.save_organization_branding(
  p_organization_id uuid,
  p_display_name text,
  p_tagline text default '',
  p_logo_url text default '',
  p_primary_color text default '#155EEF',
  p_accent_color text default '#12B76A',
  p_support_email text default '',
  p_support_phone text default '',
  p_clinic_visit_message text default '',
  p_teleconsult_message text default '',
  p_booking_confirmation_message text default ''
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
    accent_color, support_email, support_phone,
    clinic_visit_message, teleconsult_message, booking_confirmation_message,
    updated_by
  ) values (
    p_organization_id, btrim(p_display_name), nullif(btrim(p_tagline), ''),
    nullif(btrim(p_logo_url), ''), upper(p_primary_color), upper(p_accent_color),
    nullif(btrim(p_support_email), ''), nullif(btrim(p_support_phone), ''),
    nullif(btrim(p_clinic_visit_message), ''), nullif(btrim(p_teleconsult_message), ''), nullif(btrim(p_booking_confirmation_message), ''),
    auth.uid()
  )
  on conflict (organization_id) do update set
    display_name = excluded.display_name,
    tagline = excluded.tagline,
    logo_url = excluded.logo_url,
    primary_color = excluded.primary_color,
    accent_color = excluded.accent_color,
    support_email = excluded.support_email,
    support_phone = excluded.support_phone,
    clinic_visit_message = excluded.clinic_visit_message,
    teleconsult_message = excluded.teleconsult_message,
    booking_confirmation_message = excluded.booking_confirmation_message,
    updated_by = auth.uid()
  returning id into saved_id;
  update public.organizations
    set name = btrim(p_display_name)
    where id = p_organization_id;
  return saved_id;
end;
$$;

revoke all on function public.save_organization_branding(uuid, text, text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.save_organization_branding(uuid, text, text, text, text, text, text, text, text, text, text) to authenticated;
