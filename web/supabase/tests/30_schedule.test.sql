-- Schedule rules: who may move/cancel sessions, overlap constraints, care-assignment
-- requirement and the guardian's minimum notice for reschedule requests.
--   npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

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

-- Far-future slot (Monday 2027-03-01 10:00 São Paulo) so seeded sessions never collide.
select pg_temp.act_as('u-reception');
select lives_ok(
  $$ insert into public.appointments (id, patient_id, therapist_id, therapy_id, room_id, starts_at, ends_at)
     values ('00000000-0000-0000-0000-0000000000a1', md5('pat-Lucas Silva')::uuid, md5('u-ana')::uuid, md5('th-psi')::uuid,
             md5('room-1')::uuid, '2027-03-01 13:00+00', '2027-03-01 13:50+00') $$,
  'staff schedules a session for a linked therapist');

select throws_ok(
  $$ insert into public.appointments (patient_id, therapist_id, therapy_id, room_id, starts_at, ends_at)
     values (md5('pat-Pedro Santos')::uuid, md5('u-mariana')::uuid, md5('th-fono')::uuid,
             md5('room-1')::uuid, '2027-03-01 13:30+00', '2027-03-01 14:15+00') $$,
  '23P01', null, 'room overlap is rejected');

select throws_ok(
  $$ insert into public.appointments (patient_id, therapist_id, therapy_id, room_id, starts_at, ends_at)
     values (md5('pat-João Pereira')::uuid, md5('u-ana')::uuid, md5('th-psi')::uuid,
             md5('room-2')::uuid, '2027-03-01 13:20+00', '2027-03-01 14:10+00') $$,
  '23P01', null, 'therapist overlap is rejected');

select throws_ok(
  $$ insert into public.appointments (patient_id, therapist_id, therapy_id, starts_at, ends_at)
     values (md5('pat-Pedro Santos')::uuid, md5('u-ana')::uuid, md5('th-psi')::uuid,
             '2027-03-02 13:00+00', '2027-03-02 13:50+00') $$,
  '23514', null, 'session without an active care assignment is rejected');

-- Therapist Ana on her own session.
select pg_temp.act_as('u-ana');
select throws_ok(
  $$ update public.appointments set starts_at = '2027-03-01 15:00+00', ends_at = '2027-03-01 15:50+00'
     where id = '00000000-0000-0000-0000-0000000000a1' $$,
  '42501', null, 'therapist cannot move a session');
select throws_ok(
  $$ update public.appointments set status = 'canceled', cancel_reason = 'x'
     where id = '00000000-0000-0000-0000-0000000000a1' $$,
  '42501', null, 'therapist cannot cancel a session');
select throws_ok(
  $$ update public.appointments set ends_at = '2027-03-01 14:00+00'
     where id = '00000000-0000-0000-0000-0000000000a1' $$,
  '42501', null, 'therapist cannot change the end time without completing');
select lives_ok(
  $$ update public.appointments set status = 'confirmed' where id = '00000000-0000-0000-0000-0000000000a1' $$,
  'therapist confirms own session');

-- Colleague with a shared patient sees the session but cannot change it (RLS: 0 rows).
select pg_temp.act_as('u-mariana');
select is((select count(*)::int from public.appointments where id = '00000000-0000-0000-0000-0000000000a1'), 1,
  'colleague sharing the patient sees the session');
update public.appointments set status = 'no_show' where id = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.reset_role();
select is((select status::text from public.appointments where id = '00000000-0000-0000-0000-0000000000a1'), 'confirmed',
  'colleague update affects no rows');

select pg_temp.act_as('u-ana');
select lives_ok(
  $$ update public.appointments set status = 'completed', ends_at = '2027-03-01 14:05+00'
     where id = '00000000-0000-0000-0000-0000000000a1' $$,
  'therapist completes own session adjusting the real end');

-- Guardian minimum notice (24h by default).
select pg_temp.reset_role();
insert into public.care_assignments (patient_id, therapist_id, therapy_id, starts_on)
values (md5('pat-Lucas Silva')::uuid, md5('u-renata')::uuid, md5('th-to')::uuid, current_date - 1);
insert into public.appointments (id, patient_id, therapist_id, therapy_id, starts_at, ends_at)
values ('00000000-0000-0000-0000-0000000000a2', md5('pat-Lucas Silva')::uuid, md5('u-renata')::uuid, md5('th-to')::uuid,
        date_trunc('minute', now()) + interval '3 hours', date_trunc('minute', now()) + interval '3 hours 10 minutes'),
       ('00000000-0000-0000-0000-0000000000a3', md5('pat-Lucas Silva')::uuid, md5('u-renata')::uuid, md5('th-to')::uuid,
        '2027-03-03 13:00+00', '2027-03-03 13:50+00');

select pg_temp.act_as('g-carla@despertar.local');
select throws_ok(
  $$ select public.request_reschedule('00000000-0000-0000-0000-0000000000a2', now() + interval '3 days', 'Viagem') $$,
  '23514', null, 'guardian cannot request a reschedule with less than 24h notice');
select lives_ok(
  $$ select public.request_reschedule('00000000-0000-0000-0000-0000000000a3', '2027-03-10 13:00+00', 'Viagem') $$,
  'guardian requests a reschedule with enough notice');

select pg_temp.act_as('u-reception');
select public.decide_reschedule(
  (select id from public.reschedule_requests where appointment_id = '00000000-0000-0000-0000-0000000000a3'), true, 'Ok');
select pg_temp.reset_role();
select is((select starts_at from public.appointments where id = '00000000-0000-0000-0000-0000000000a3'),
  '2027-03-10 13:00+00'::timestamptz, 'approved request moves the session keeping its duration');

select * from finish();
rollback;
