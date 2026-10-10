-- Patients + clinical record access contract. Runs against the seeded local database:
--   npx supabase test db
-- Ana is linked to Lucas Silva (Psicologia); Pedro Santos is not hers.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

create or replace function pg_temp.act_as(seed text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', md5(seed)::uuid, 'role', 'authenticated')::text, true);
end;
$$;

create or replace function pg_temp.reset_role() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- Fixtures: clinical record of Pedro Santos written by another therapist.
insert into public.session_notes (patient_id, therapist_id, content)
values (md5('pat-Pedro Santos')::uuid, md5('u-mariana')::uuid, 'Evolução de teste do Pedro');
insert into public.treatment_plans (patient_id, therapist_id, therapy_id, goals)
values (md5('pat-Pedro Santos')::uuid, md5('u-mariana')::uuid, md5('th-fono')::uuid, 'Plano de teste do Pedro');

-- (a) Therapist without a link cannot read or write the clinical record.
select pg_temp.act_as('u-ana');
select is((select count(*)::int from public.session_notes where patient_id = md5('pat-Pedro Santos')::uuid), 0,
  'unlinked therapist cannot read session notes');
select is((select count(*)::int from public.treatment_plans where patient_id = md5('pat-Pedro Santos')::uuid), 0,
  'unlinked therapist cannot read treatment plans');
select throws_ok(
  $$ insert into public.treatment_plans (patient_id, therapist_id, therapy_id) values (md5('pat-Pedro Santos')::uuid, md5('u-ana')::uuid, md5('th-psi')::uuid) $$,
  '23514', null, 'unlinked therapist cannot create a treatment plan (rejected by assignment check before RLS)');
select is_empty(
  $$ update public.session_notes set content = 'alterado' where patient_id = md5('pat-Pedro Santos')::uuid returning id $$,
  'unlinked therapist cannot edit session notes');
select is_empty(
  $$ update public.treatment_plans set goals = 'alterado' where patient_id = md5('pat-Pedro Santos')::uuid returning id $$,
  'unlinked therapist cannot edit treatment plans');
select throws_ok(
  $$ select public.log_record_access(md5('pat-Pedro Santos')::uuid) $$,
  '42501', null, 'unlinked therapist cannot open the record (audit RPC refuses)');

-- Linked therapist sanity check: Ana can write Lucas' record.
select lives_ok(
  $$ insert into public.session_notes (patient_id, therapist_id, content) values (md5('pat-Lucas Silva')::uuid, md5('u-ana')::uuid, 'Evolução de teste') $$,
  'linked therapist writes a session note');

-- (c) Coordination reads the record but does not write it.
select pg_temp.act_as('u-coord');
select ok((select count(*) from public.session_notes where patient_id = md5('pat-Lucas Silva')::uuid) >= 1,
  'coordination reads session notes');
select ok((select count(*) from public.treatment_plans where patient_id = md5('pat-Lucas Silva')::uuid) >= 1,
  'coordination reads treatment plans');
select throws_ok(
  $$ insert into public.session_notes (patient_id, therapist_id, content) values (md5('pat-Lucas Silva')::uuid, md5('u-ana')::uuid, 'x') $$,
  '42501', null, 'coordination cannot write session notes');
select is_empty(
  $$ update public.session_notes set content = 'alterado' where patient_id = md5('pat-Lucas Silva')::uuid returning id $$,
  'coordination cannot edit session notes');
select throws_ok(
  $$ insert into public.treatment_plans (patient_id, therapist_id, therapy_id) values (md5('pat-Lucas Silva')::uuid, md5('u-ana')::uuid, md5('th-psi')::uuid) $$,
  '42501', null, 'coordination cannot write treatment plans');

-- Reception does not manage care assignments.
select pg_temp.act_as('u-reception');
select throws_ok(
  $$ insert into public.care_assignments (patient_id, therapist_id, therapy_id) values (md5('pat-Pedro Santos')::uuid, md5('u-ana')::uuid, md5('th-psi')::uuid) $$,
  '42501', null, 'reception cannot create care assignments');

-- (b) Coordination ends Ana's assignment with Lucas (end date in the past).
select pg_temp.act_as('u-coord');
select isnt_empty(
  $$ update public.care_assignments set ends_on = current_date - 1
     where patient_id = md5('pat-Lucas Silva')::uuid and therapist_id = md5('u-ana')::uuid and ends_on is null returning id $$,
  'coordination ends a care assignment');

select pg_temp.act_as('u-ana');
select is((select count(*)::int from public.patients where id = md5('pat-Lucas Silva')::uuid), 0,
  'therapist loses access to the patient after the assignment ends');
select is((select count(*)::int from public.session_notes where patient_id = md5('pat-Lucas Silva')::uuid), 0,
  'therapist loses access to the session notes after the assignment ends');
select is((select count(*)::int from public.treatment_plans where patient_id = md5('pat-Lucas Silva')::uuid), 0,
  'therapist loses access to the treatment plans after the assignment ends');
select throws_ok(
  $$ insert into public.session_notes (patient_id, therapist_id, content) values (md5('pat-Lucas Silva')::uuid, md5('u-ana')::uuid, 'x') $$,
  '42501', null, 'therapist cannot write notes after the assignment ends');
select ok(not public.can_message(md5('u-ana')::uuid, md5('g-carla@despertar.local')::uuid),
  'therapist loses the chat with the family after the assignment ends');
select throws_ok(
  $$ select public.log_record_access(md5('pat-Lucas Silva')::uuid) $$,
  '42501', null, 'audit RPC refuses after the assignment ends');

select pg_temp.reset_role();
select * from finish();
rollback;
