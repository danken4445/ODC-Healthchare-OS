-- Persist the live-call workspace without exposing provider preferences through the Data API.
alter table public.provider_preferences
  add column if not exists teleconsult_split_ratio numeric not null default 55
    check (teleconsult_split_ratio between 45 and 70),
  add column if not exists teleconsult_chart_collapsed boolean not null default false;

create or replace function public.get_my_teleconsult_workspace_preference()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
stable
as $$
declare
  caller_id uuid := auth.uid();
  preference public.provider_preferences%rowtype;
begin
  if caller_id is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;
  if not exists (
    select 1
    from public.practitioners practitioner
    join public.practitioner_roles practitioner_role on practitioner_role.practitioner_id = practitioner.id
    where practitioner.auth_user_id = caller_id
      and practitioner.active
      and practitioner_role.active
      and public.has_organization_permission(practitioner_role.organization_id, 'can_access_provider_portal')
  ) then
    raise exception 'Provider portal access is required.' using errcode = '42501';
  end if;

  select * into preference from public.provider_preferences where user_id = caller_id;
  return jsonb_build_object(
    'split_ratio', coalesce(preference.teleconsult_split_ratio, 55),
    'chart_collapsed', coalesce(preference.teleconsult_chart_collapsed, false)
  );
end;
$$;

create or replace function public.save_my_teleconsult_workspace_preference(
  p_split_ratio numeric,
  p_chart_collapsed boolean
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;
  if p_split_ratio is null or p_split_ratio < 45 or p_split_ratio > 70 then
    raise exception 'Teleconsult split ratio must be between 45 and 70.' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.practitioners practitioner
    join public.practitioner_roles practitioner_role on practitioner_role.practitioner_id = practitioner.id
    where practitioner.auth_user_id = caller_id
      and practitioner.active
      and practitioner_role.active
      and public.has_organization_permission(practitioner_role.organization_id, 'can_access_provider_portal')
  ) then
    raise exception 'Provider portal access is required.' using errcode = '42501';
  end if;

  insert into public.provider_preferences (user_id, teleconsult_split_ratio, teleconsult_chart_collapsed)
  values (caller_id, p_split_ratio, p_chart_collapsed)
  on conflict (user_id) do update
    set teleconsult_split_ratio = excluded.teleconsult_split_ratio,
        teleconsult_chart_collapsed = excluded.teleconsult_chart_collapsed,
        updated_at = now();
end;
$$;

revoke all on function public.get_my_teleconsult_workspace_preference() from public, anon;
revoke all on function public.save_my_teleconsult_workspace_preference(numeric, boolean) from public, anon;
grant execute on function public.get_my_teleconsult_workspace_preference() to authenticated;
grant execute on function public.save_my_teleconsult_workspace_preference(numeric, boolean) to authenticated;
