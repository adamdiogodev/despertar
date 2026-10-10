-- Core access-control contract. Runs against the seeded local database:
--   npx supabase test db
-- Seeded ids are md5(<seed>)::uuid (see supabase/seed.sql).
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

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

-- Therapist Ana: only her linked patients (Lucas, João, Isabella).
select pg_temp.act_as('u-ana');
select is((select count(*)::int from public.patients), 3, 'therapist sees only linked patients');
select is((select count(*)::int from public.patients where full_name = 'Pedro Santos'), 0, 'therapist cannot see unlinked patient');
select is((select count(*)::int from public.families), 3, 'therapist sees only families of linked patients');
select ok((select count(*) from public.session_notes) >= 1, 'therapist reads clinical notes of linked patients');
select is((select count(*)::int from public.charges), 0, 'therapist cannot see family charges');
select is((select count(*)::int from public.therapist_rates where therapist_id <> md5('u-ana')::uuid), 0, 'therapist sees only own rates');
select ok(public.can_message(md5('u-ana')::uuid, md5('g-carla@despertar.local')::uuid), 'therapist can message guardian of linked patient');
select ok(not public.can_message(md5('u-ana')::uuid, md5('g-roberto@despertar.local')::uuid), 'therapist cannot message guardian without link');
select throws_ok(
  $$ select public.start_conversation(md5('g-roberto@despertar.local')::uuid) $$,
  '42501', null, 'start_conversation refuses unlinked guardian');
select throws_ok(
  $$ insert into public.session_notes (patient_id, therapist_id, content)
     values (md5('pat-Pedro Santos')::uuid, md5('u-ana')::uuid, 'x') $$,
  '42501', null, 'therapist cannot write notes for unlinked patient');

-- Guardian Carla: only Lucas, no clinical record, only approved reports.
select pg_temp.act_as('g-carla@despertar.local');
select is((select count(*)::int from public.patients), 1, 'guardian sees only own child');
select is((select count(*)::int from public.session_notes), 0, 'guardian cannot read clinical notes');
select is((select count(*)::int from public.treatment_plans), 0, 'guardian cannot read treatment plans');
select is((select count(*)::int from public.family_internal_notes), 0, 'guardian cannot read internal notes about the family');
select is((select count(*)::int from public.reports), 0, 'guardian sees no report until approved');
select ok((select count(*) from public.get_family_guidance(md5('pat-Lucas Silva')::uuid)) >= 1, 'guardian reads home guidance via RPC');
select ok(not public.can_message(md5('g-carla@despertar.local')::uuid, md5('u-renata')::uuid), 'guardian cannot message therapist of another child');
select ok(public.can_message(md5('g-carla@despertar.local')::uuid, md5('u-reception')::uuid), 'guardian can message reception');
select ok(not public.can_message(md5('g-carla@despertar.local')::uuid, md5('g-roberto@despertar.local')::uuid), 'guardians never message each other');

-- Reception: operational data, no clinical record, no finance.
select pg_temp.act_as('u-reception');
select is((select count(*)::int from public.patients), 10, 'reception sees all patients');
select is((select count(*)::int from public.session_notes), 0, 'reception cannot read clinical notes');
select is((select count(*)::int from public.charges), 0, 'reception cannot see finance');

-- Admin: no clinical content either.
select pg_temp.act_as('u-admin');
select is((select count(*)::int from public.session_notes), 0, 'admin cannot read clinical notes');

-- A self-service profile update cannot escalate role.
select pg_temp.act_as('g-carla@despertar.local');
select throws_ok(
  $$ update public.profiles set role = 'admin' where id = md5('g-carla@despertar.local')::uuid $$,
  '42501', null, 'user cannot change own role');

select pg_temp.reset_role();
select * from finish();
rollback;
