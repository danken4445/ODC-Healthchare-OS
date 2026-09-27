begin;
select plan(6);

select ok((select relrowsecurity from pg_class where oid = 'public.icd10_reference'::regclass), 'global ICD-10 lookup has RLS enabled');
select ok(not has_table_privilege('anon', 'public.icd10_reference', 'select'), 'anonymous callers cannot read ICD-10 reference data');
select ok(has_table_privilege('authenticated', 'public.icd10_reference', 'select'), 'authenticated providers can read ICD-10 reference data');
select ok(not has_table_privilege('authenticated', 'public.icd10_reference', 'insert, update, delete'), 'authenticated providers cannot mutate ICD-10 reference data');

select ok(exists (
  select 1 from pg_policies
  where schemaname = 'public' and tablename = 'document_templates'
    and policyname = 'document_templates_select'
    and qual like '%owner_doctor_id%'
), 'personal template visibility is constrained by owner_doctor_id');

select ok(exists (
  select 1 from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname = 'template_assets_select'
    and qual like '%practitioner%'
), 'template asset read policy constrains personal assets to the owning practitioner');

select * from finish();
rollback;
