-- Foundation smoke-test resource. Clinical tables added after this migration must
-- map to a FHIR resource and include audit triggers before use.
create table if not exists public.hello_world (
  id uuid primary key default gen_random_uuid(),
  message text not null check (char_length(message) <= 200),
  created_at timestamptz not null default now()
);

alter table public.hello_world enable row level security;

create policy "Authenticated users can read hello-world smoke tests"
  on public.hello_world for select to authenticated using (true);
create policy "Authenticated users can create hello-world smoke tests"
  on public.hello_world for insert to authenticated with check (true);

-- Every patient-linked table must use an audit trigger modeled after this function.
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid references auth.users(id),
  action text not null,
  table_name text not null,
  record_id uuid,
  metadata jsonb not null default '{}'::jsonb
);
alter table public.audit_log enable row level security;
-- No direct client policy: audit records are written by SECURITY DEFINER triggers/functions only.
