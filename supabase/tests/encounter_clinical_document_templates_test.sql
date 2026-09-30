begin;
select plan(4);

select ok(
  to_regprocedure('public.list_encounter_clinical_document_templates(uuid,text)') is not null,
  'encounter-scoped template lookup is available'
);
select ok(
  has_function_privilege('authenticated', 'public.list_encounter_clinical_document_templates(uuid,text)', 'execute'),
  'authenticated clinicians may call the encounter-scoped template lookup'
);
select ok(
  not has_function_privilege('anon', 'public.list_encounter_clinical_document_templates(uuid,text)', 'execute'),
  'anonymous callers cannot call the encounter-scoped template lookup'
);
select ok(
  pg_get_functiondef('public.list_encounter_clinical_document_templates(uuid,text)'::regprocedure)
    like '%template.status = ''published''%'
    and pg_get_functiondef('public.list_encounter_clinical_document_templates(uuid,text)'::regprocedure)
      like '%template.owner_doctor_id is null or template.owner_doctor_id = current_doctor_id%',
  'lookup returns published shared templates and only the current doctors personal templates'
);

select * from finish();
rollback;
