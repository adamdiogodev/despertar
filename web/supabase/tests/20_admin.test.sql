-- Admin front contract: settings, therapist pay rates, family notes, guardian
-- requests and audit log. Complements 00_access_core (does not repeat it).
--   npx supabase test db
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

insert into public.audit_log (actor_id, action, entity, entity_id) values (md5('u-admin')::uuid, 'update', 'families', 'x');

-- Reception: operational staff, but no say over pay rates or clinic settings.
select pg_temp.act_as('u-reception');
update public.therapist_rates set amount_cents = 1;
update public.clinic_settings set reschedule_min_hours = 0;
select throws_ok(
  $$ insert into public.therapist_rates (therapist_id, therapy_id, pay_model, amount_cents, valid_from)
     values (md5('u-ana')::uuid, md5('th-psi')::uuid, 'per_session', 1, '2030-01-01') $$,
  '42501', null, 'reception cannot create therapist rates');
select is((select count(*)::int from public.therapist_rates), 0, 'reception cannot read therapist rates');
select throws_ok(
  $$ insert into public.therapists (id, specialty) values (md5('u-reception')::uuid, 'x') $$,
  '42501', null, 'reception cannot create therapists');
select throws_ok(
  $$ update public.profiles set active = false where id = md5('u-ana')::uuid $$,
  '42501', null, 'reception cannot deactivate accounts directly');
select is((select count(*)::int from public.audit_log), 0, 'reception cannot read the audit log');
select pg_temp.reset_role();
select is((select count(*)::int from public.therapist_rates where amount_cents = 1), 0, 'reception update on rates had no effect');
select isnt((select reschedule_min_hours from public.clinic_settings), 0, 'reception update on clinic settings had no effect');

-- Coordination: reads every rate, but only admin registers them.
select pg_temp.act_as('u-coord');
select ok((select count(distinct therapist_id) from public.therapist_rates) > 1, 'coordination reads rates of all therapists');
select throws_ok(
  $$ insert into public.therapist_rates (therapist_id, therapy_id, pay_model, amount_cents, valid_from)
     values (md5('u-ana')::uuid, md5('th-psi')::uuid, 'per_session', 1, '2030-01-01') $$,
  '42501', null, 'coordination cannot create therapist rates');
update public.clinic_settings set reschedule_min_hours = 0;
select pg_temp.reset_role();
select isnt((select reschedule_min_hours from public.clinic_settings), 0, 'coordination update on clinic settings had no effect');

-- Therapist Ana: own rates only, read-only; internal notes only of linked families.
select pg_temp.act_as('u-ana');
select ok((select count(*) from public.therapist_rates where therapist_id = md5('u-ana')::uuid) >= 1, 'therapist reads own rates');
select throws_ok(
  $$ insert into public.therapist_rates (therapist_id, therapy_id, pay_model, amount_cents, valid_from)
     values (md5('u-ana')::uuid, md5('th-psi')::uuid, 'per_session', 99999, '2030-01-01') $$,
  '42501', null, 'therapist cannot set own rate');
select is((select count(*)::int from public.family_internal_notes where family_id = md5('fam-Família Silva')::uuid), 1,
  'therapist reads internal notes of a linked family');
select is((select count(*)::int from public.family_internal_notes where family_id = md5('fam-Família Santos')::uuid), 0,
  'therapist cannot read internal notes of an unlinked family');
update public.family_internal_notes set notes = 'therapist edit' where family_id = md5('fam-Família Silva')::uuid;
select pg_temp.reset_role();
select isnt((select notes from public.family_internal_notes where family_id = md5('fam-Família Silva')::uuid), 'therapist edit',
  'therapist cannot edit internal notes');

-- Guardian Carla: cannot write internal notes nor answer requests herself.
select pg_temp.act_as('g-carla@despertar.local');
select throws_ok(
  $$ insert into public.family_internal_notes (family_id, notes) values (md5('fam-Família Pereira')::uuid, 'x') $$,
  '42501', null, 'guardian cannot write internal notes');
insert into public.guardian_requests (family_id, requested_by, request_type, message)
values (md5('fam-Família Silva')::uuid, md5('g-carla@despertar.local')::uuid, 'information', 'pgtap request');
update public.guardian_requests set status = 'answered', response = 'self answered' where message = 'pgtap request';
select pg_temp.reset_role();
select is((select status::text from public.guardian_requests where message = 'pgtap request'), 'open',
  'guardian cannot answer own request');

-- Reception answers it: the trigger stamps who answered and notifies the family.
select pg_temp.act_as('u-reception');
update public.guardian_requests set status = 'answered', response = 'ok' where message = 'pgtap request';
select pg_temp.reset_role();
select is((select responded_by from public.guardian_requests where message = 'pgtap request'), md5('u-reception')::uuid,
  'answering stamps responded_by');
select ok(exists (select 1 from public.notifications where user_id = md5('g-carla@despertar.local')::uuid and kind = 'request'),
  'answering notifies the guardian');

-- Admin reads the audit log.
select pg_temp.act_as('u-admin');
select ok((select count(*) from public.audit_log) >= 1, 'admin reads the audit log');

select pg_temp.reset_role();
select * from finish();
rollback;
