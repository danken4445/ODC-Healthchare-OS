-- Expand update_own_patient_profile to allow patients to edit all required profile fields:
-- name, birth_date, gender, blood_type, photo_url, phone, email, address, and emergency contact.

drop function if exists public.update_own_patient_profile(uuid, text, date, text, text, text);
drop function if exists public.update_own_patient_profile(uuid, text, date, text, text, text, text, text, text, text, text, text);

create or replace function public.update_own_patient_profile(
  p_patient_id uuid,
  p_display_name text,
  p_birth_date date default null,
  p_gender text default null,
  p_phone text default null,
  p_address text default null,
  p_blood_type text default null,
  p_photo_url text default null,
  p_email text default null,
  p_emergency_contact_name text default null,
  p_emergency_contact_phone text default null,
  p_emergency_contact_relationship text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.patients where id = p_patient_id;
  if v_org is null or not public.is_patient_self(p_patient_id, v_org) then
    raise exception 'The patient profile is not accessible.' using errcode = '42501';
  end if;

  if p_display_name is null or length(btrim(p_display_name)) < 2 or length(btrim(p_display_name)) > 120
    or (p_gender is not null and nullif(p_gender, '') is not null and p_gender not in ('female', 'male', 'other', 'unknown'))
    or (p_blood_type is not null and nullif(p_blood_type, '') is not null and p_blood_type not in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'))
    or length(coalesce(p_phone, '')) > 40
    or length(coalesce(p_address, '')) > 500 then
    raise exception 'Profile values are invalid.' using errcode = '22023';
  end if;

  update public.patients set
    name = jsonb_build_object('text', btrim(p_display_name)),
    birth_date = p_birth_date,
    gender = nullif(p_gender, ''),
    blood_type = nullif(btrim(p_blood_type), ''),
    photo_url = nullif(btrim(p_photo_url), ''),
    telecom = (
      select coalesce(jsonb_agg(elem), '[]'::jsonb)
      from (
        select jsonb_build_object('system', 'phone', 'value', btrim(p_phone)) as elem
        where nullif(btrim(p_phone), '') is not null
        union all
        select jsonb_build_object('system', 'email', 'value', btrim(p_email)) as elem
        where nullif(btrim(p_email), '') is not null
      ) s
    ),
    address = case
      when nullif(btrim(p_address), '') is null then '[]'::jsonb
      else jsonb_build_array(jsonb_build_object('text', btrim(p_address)))
    end,
    contact = case
      when nullif(btrim(p_emergency_contact_name), '') is null and nullif(btrim(p_emergency_contact_phone), '') is null then '[]'::jsonb
      else jsonb_build_array(
        jsonb_build_object(
          'name', jsonb_build_object('text', btrim(coalesce(p_emergency_contact_name, ''))),
          'telecom', jsonb_build_array(jsonb_build_object('system', 'phone', 'value', btrim(coalesce(p_emergency_contact_phone, '')))),
          'relationship', jsonb_build_array(jsonb_build_object('text', btrim(coalesce(p_emergency_contact_relationship, 'Emergency Contact'))))
        )
      )
    end,
    updated_at = now()
  where id = p_patient_id;
end;
$$;

revoke all on function public.update_own_patient_profile(uuid, text, date, text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.update_own_patient_profile(uuid, text, date, text, text, text, text, text, text, text, text, text) to authenticated;
