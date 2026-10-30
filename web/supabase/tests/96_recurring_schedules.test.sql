-- Agenda fixa: who may create/end rules, materialized sessions, skipped conflicts,
-- single summary notification, rolling horizon and ending a rule.
--   npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

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

-- Tuesdays and Thursdays at 21:10 (outside the seeded grid) from next week on.
create temp table t_range as
  select public.local_date(now()) + 7 as first_day, public.local_date(now()) + 56 as horizon;
create temp table t_expected as
  select d::date as day from t_range, generate_series(first_day, horizon, interval '1 day') d
  where extract(dow from d) in (2, 4);
grant select on t_range, t_expected to authenticated;

-- A session already in Ana's slot on the first expected date.
insert into public.appointments (patient_id, therapist_id, therapy_id, starts_at, ends_at)
select md5('pat-João Pereira')::uuid, md5('u-ana')::uuid, md5('th-psi')::uuid,
       (min(day) + time '21:10') at time zone 'America/Sao_Paulo',
       (min(day) + time '22:00') at time zone 'America/Sao_Paulo'
from t_expected;

create temp table t_before as
  select count(*) as n from public.notifications where user_id = md5('u-ana')::uuid and title = 'Nova sessão agendada';
grant select on t_before to authenticated;

select pg_temp.act_as('u-ana');
select throws_ok(
  $$ select * from public.create_recurring_schedule(md5('pat-Lucas Silva')::uuid, md5('u-ana')::uuid, md5('th-psi')::uuid,
       '{2,4}', '21:10', 50, (select first_day from t_range)) $$,
  '42501', null, 'therapist cannot create an agenda fixa');

select pg_temp.act_as('u-reception');
select throws_ok(
  $$ insert into public.recurring_schedules (patient_id, therapist_id, therapy_id, weekdays, start_time, duration_minutes, starts_on)
     values (md5('pat-Lucas Silva')::uuid, md5('u-ana')::uuid, md5('th-psi')::uuid, '{2}', '21:10', 50, current_date) $$,
  '42501', null, 'rules are written only through the RPC');
select throws_ok(
  $$ select * from public.create_recurring_schedule(md5('pat-Pedro Santos')::uuid, md5('u-ana')::uuid, md5('th-psi')::uuid,
       '{2,4}', '21:10', 50, (select first_day from t_range)) $$,
  '23514', null, 'rule without an active care assignment is rejected');

create temp table t_result as
  select * from public.create_recurring_schedule(md5('pat-Lucas Silva')::uuid, md5('u-ana')::uuid, md5('th-psi')::uuid,
    '{4,2,2}', '21:10', 50, (select first_day from t_range), schedule_notes => 'Agenda do Lucas');

select is((select count(*)::int from t_result), (select count(*)::int from t_expected),
  'one result per Tuesday/Thursday up to the 8-week horizon');
select is((select count(*)::int from t_result where not created), 1, 'the occupied date is skipped');
select is((select reason from t_result where not created), 'O terapeuta já tem uma sessão neste horário.',
  'the skipped date explains the conflict');
select is((select weekdays from public.recurring_schedules where notes = 'Agenda do Lucas'), '{2,4}'::smallint[],
  'weekdays are deduplicated and sorted');

select pg_temp.reset_role();
create temp table t_rule as select id from public.recurring_schedules where notes = 'Agenda do Lucas';
grant select on t_rule to authenticated;

select is(
  (select count(*)::int from public.appointments where recurring_schedule_id = (select id from t_rule)),
  (select count(*)::int from t_expected) - 1,
  'generated sessions are linked to the rule');
select ok(
  (select bool_and(public.local_date(starts_at) in (select day from t_expected)
                   and to_char(starts_at at time zone 'America/Sao_Paulo', 'HH24:MI') = '21:10'
                   and ends_at - starts_at = interval '50 minutes')
   from public.appointments where recurring_schedule_id = (select id from t_rule)),
  'sessions fall on the chosen weekdays, time and duration (São Paulo)');
select is(
  (select count(*) from public.notifications where user_id = md5('u-ana')::uuid and title = 'Nova sessão agendada'),
  (select n from t_before), 'generated sessions do not notify one by one');
select is(
  (select count(*)::int from public.notifications where user_id = md5('u-ana')::uuid and title = 'Agenda fixa criada'),
  1, 'the therapist gets a single summary');
select is(
  (select count(*)::int from public.notifications where user_id = md5('g-carla@despertar.local')::uuid and title = 'Agenda fixa criada'),
  1, 'the family gets a single summary');

-- Visibility follows the appointments rules.
select pg_temp.act_as('u-ana');
select is((select count(*)::int from public.recurring_schedules where id = (select id from t_rule)), 1, 'linked therapist sees the rule');
select pg_temp.act_as('g-roberto@despertar.local');
select is((select count(*)::int from public.recurring_schedules where id = (select id from t_rule)), 0, 'guardians do not read rules');
select pg_temp.reset_role();

-- Rolling horizon: pretend the last week was not generated yet; the daily job fills it in without duplicating.
delete from public.appointments
  where recurring_schedule_id = (select id from t_rule) and public.local_date(starts_at) > (select horizon - 7 from t_range);
update public.recurring_schedules set generated_until = (select horizon - 7 from t_range) where id = (select id from t_rule);
select public.extend_recurring_schedules();
select public.extend_recurring_schedules();
select is(
  (select count(*)::int from public.appointments where recurring_schedule_id = (select id from t_rule)),
  (select count(*)::int from t_expected) - 1,
  'the daily job rolls the horizon forward without duplicates');

-- Ending the rule removes only the sessions after the last day.
select pg_temp.act_as('u-ana');
select throws_ok(
  $$ select public.end_recurring_schedule((select id from t_rule), (select first_day + 13 from t_range)) $$,
  '42501', null, 'therapist cannot end an agenda fixa');
select pg_temp.act_as('u-reception');
select is(
  public.end_recurring_schedule((select id from t_rule), (select first_day + 13 from t_range)),
  (select count(*)::int from t_expected where day > (select first_day + 13 from t_range)),
  'ending removes the sessions after the last day');
select pg_temp.reset_role();
select is(
  (select count(*)::int from public.appointments where recurring_schedule_id = (select id from t_rule)),
  (select count(*)::int from t_expected where day <= (select first_day + 13 from t_range)) - 1,
  'sessions up to the last day are kept');
select public.extend_recurring_schedules();
select is(
  (select count(*)::int from public.appointments where recurring_schedule_id = (select id from t_rule)),
  (select count(*)::int from t_expected where day <= (select first_day + 13 from t_range)) - 1,
  'an ended rule is not extended again');

select * from finish();
rollback;
