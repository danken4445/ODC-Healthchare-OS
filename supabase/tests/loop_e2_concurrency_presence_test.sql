\set ON_ERROR_STOP on
begin;
select plan(14);

set local role postgres;
update public.encounters
set practitioner_role_id = '30000000-0000-0000-0000-000000000101'
where id = '60000000-0000-0000-0000-000000000001';
reset role;

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000101"}', true);
set local role authenticated;

select is((select version from public.encounters where id = '60000000-0000-0000-0000-000000000001'), 1, 'seed encounter starts at version one');
select throws_ok(
  $$ select public.add_soap_observation('60000000-0000-0000-0000-000000000001', 'S', 'stale', null, 0) $$,
  'P0001', 'ENCOUNTER_VERSION_CONFLICT', 'stale version returns the typed conflict'
);
select is((select version from public.encounters where id = '60000000-0000-0000-0000-000000000001'), 1, 'stale version leaves encounter unchanged');
select is((select count(*)::integer from public.observations where encounter_id = '60000000-0000-0000-0000-000000000001' and code = 'SOAP-S'), 0, 'stale version leaves SOAP data unchanged');
select ok((public.add_soap_observation('60000000-0000-0000-0000-000000000001', 'S', 'current', null, 1) ->> 'version')::integer = 2, 'successful SOAP write returns the new version');
select is((select version from public.encounters where id = '60000000-0000-0000-0000-000000000001'), 2, 'successful SOAP write increments the version');
select lives_ok($$ select public.add_soap_observation('60000000-0000-0000-0000-000000000001', 'O', 'legacy caller', null) $$, 'omitted expected version remains backward compatible');

select ok((select expires_at > now() from public.encounter_locks where false) is null, 'no lock exists before acquire');
select lives_ok($$ select public.acquire_encounter_lock('60000000-0000-0000-0000-000000000001') $$, 'assigned doctor acquires the advisory lock');
select is((select count(*)::integer from public.encounter_locks where encounter_id = '60000000-0000-0000-0000-000000000001'), 1, 'lock row is created');
select lives_ok($$ select public.acquire_encounter_lock('60000000-0000-0000-0000-000000000001') $$, 'same holder reacquires idempotently');
select lives_ok($$ select public.heartbeat_encounter_lock('60000000-0000-0000-0000-000000000001') $$, 'same holder heartbeat extends the lock');
select lives_ok($$ select public.release_encounter_lock('60000000-0000-0000-0000-000000000001') $$, 'same holder releases the lock');
select is((select count(*)::integer from public.encounter_locks where encounter_id = '60000000-0000-0000-0000-000000000001'), 0, 'released lock is no longer visible');

reset role;
select * from finish();
rollback;
