begin;

-- Permission gate: a normal clinician cannot call the patient-level release.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000101"}', true);
set local role authenticated;

do $$
begin
  perform public.export_doh_pidsr_cases(
    '10000000-0000-0000-0000-000000000001', 'RA 11332 mandatory notification test', 2026::smallint, 1::smallint
  );
  raise exception 'Expected DSO permission rejection.';
exception when insufficient_privilege then null;
end;
$$;

reset role;

-- Grant only the DSO role inside this transaction. It is never persisted.
insert into public.user_roles (organization_id, user_id, role_id)
select '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101', id
from public.roles where name = 'disease_surveillance_officer';

insert into public.patients (id, organization_id, auth_user_id, name, birth_date, gender)
values ('00000000-0000-0000-0000-000000009001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101', '{"text":"Export Test Patient"}', '2000-01-01', 'female');
insert into public.conditions (id, organization_id, patient_id, code, code_display, onset_date, created_at)
values
  ('00000000-0000-0000-0000-000000009101', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000009001', 'A90', 'Dengue fever', '2026-01-02', '2026-01-02T00:00:00Z'),
  ('00000000-0000-0000-0000-000000009102', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000009001', 'A90', 'Dengue fever', '2026-01-02', '2026-01-02T00:00:00Z');
update public.conditions set is_sensitive = true, sensitive_category = 'infectious_disease_hiv'
where id = '00000000-0000-0000-0000-000000009102';

set local role authenticated;

do $$
declare v_export jsonb;
begin
  -- A DSO cannot redirect an organization-scoped release to another tenant.
  begin
    perform public.export_doh_pidsr_cases(
      '10000000-0000-0000-0000-000000000002', 'RA 11332 cross tenant rejection test', 2026::smallint, 1::smallint
    );
    raise exception 'Expected cross-tenant rejection.';
  exception when insufficient_privilege then null;
  end;

  select public.export_doh_pidsr_cases(
    '10000000-0000-0000-0000-000000000001', 'RA 11332 mandatory weekly notification test', 2026::smallint, 1::smallint
  ) into v_export;
  if jsonb_array_length(v_export -> 'cases') <> 1
    or (v_export::text ilike '%infectious_disease_hiv%') then
    raise exception 'Sensitive Category I/II record was not excluded from PIDSR export.';
  end if;
end;
$$;

reset role;

do $$
declare v_audit_id uuid;
begin
  select id into v_audit_id from public.disease_surveillance_audit_log
  where organization_id = '10000000-0000-0000-0000-000000000001' and action = 'doh_release'
  order by created_at desc limit 1;
  if v_audit_id is null then raise exception 'Audit was not written before release.'; end if;
  begin
    update public.disease_surveillance_audit_log set purpose = 'tampered' where id = v_audit_id;
    raise exception 'Expected immutable audit rejection.';
  exception when object_not_in_prerequisite_state then null;
  end;
end;
$$;

rollback;
