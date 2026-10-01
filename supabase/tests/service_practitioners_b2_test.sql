begin;
select plan(4);

select is(
  (select count(*) from public.service_practitioners),
  (select count(*) from public.clinic_services where owner_practitioner_role_id is not null),
  'backfill creates one membership row for each legacy owned service'
);
select is(
  (select count(*) from public.service_practitioners as membership
   join public.clinic_services as service on service.id = membership.clinic_service_id
   where membership.organization_id <> service.organization_id
      or membership.practitioner_role_id <> service.owner_practitioner_role_id),
  0::bigint,
  'backfill preserves the legacy service owner and organization'
);
select col_is_null(
  'public',
  'clinic_services',
  'owner_practitioner_role_id',
  'legacy owner column is nullable during the compatibility release'
);
select ok(
  col_description(
    'public.clinic_services'::regclass,
    (
      select attnum
      from pg_attribute
      where attrelid = 'public.clinic_services'::regclass
        and attname = 'owner_practitioner_role_id'
        and not attisdropped
    )
  ) like '%DEPRECATED%',
  'legacy owner column is explicitly deprecated'
);

select * from finish();
rollback;
