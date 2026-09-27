-- Provision platform superadmin account: superadmin@odc.com

do $$
declare
  v_user_id uuid;
begin
  select id into v_user_id
  from auth.users
  where email = 'superadmin@odc.com';

  if v_user_id is null then
    v_user_id := gen_random_uuid();
    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      'superadmin@odc.com',
      crypt('Test123!', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"Platform Superadmin"}'::jsonb,
      now(),
      now()
    );

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'auth' and table_name = 'identities' and column_name = 'provider_id'
    ) then
      insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (v_user_id, v_user_id::text, v_user_id, jsonb_build_object('sub', v_user_id::text, 'email', 'superadmin@odc.com'), 'email', now(), now(), now())
      on conflict do nothing;
    else
      insert into auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (v_user_id::text, v_user_id, jsonb_build_object('sub', v_user_id::text, 'email', 'superadmin@odc.com'), 'email', now(), now(), now())
      on conflict do nothing;
    end if;
  else
    -- Ensure confirmed status and password match requested credentials
    update auth.users
    set encrypted_password = crypt('Test123!', gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"display_name":"Platform Superadmin"}'::jsonb,
        updated_at = now()
    where id = v_user_id;
  end if;

  -- Ensure granted in platform_admins
  insert into public.platform_admins (user_id, granted_by)
  values (v_user_id, v_user_id)
  on conflict (user_id) do nothing;
end;
$$;
