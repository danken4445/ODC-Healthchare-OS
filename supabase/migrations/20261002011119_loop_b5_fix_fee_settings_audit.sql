-- Loop B5 repair: organization_settings is keyed by organization_id, while the
-- legacy generic audit trigger requires an id column. Rollback: recreate this
-- trigger only with an audit helper that supports organization_id resources.

drop trigger if exists organization_settings_audit on public.organization_settings;

create or replace function public.initialize_organization_fee_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.organization_settings (organization_id, fee_model)
  values (new.id, 'fixed_rate')
  on conflict (organization_id) do nothing;
  return new;
end;
$$;

create trigger organizations_initialize_fee_settings
  after insert on public.organizations
  for each row execute function public.initialize_organization_fee_settings();
