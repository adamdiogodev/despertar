-- Family portal contract: a guardian only reaches their own family, the minimum
-- notice rule holds in the database, and family uploads go to review.
--   npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

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

-- Fixtures (as postgres): a clinic document for another family and a session for
-- Lucas starting in 2 hours (overlapping sessions of Ana are moved out of the way).
update public.appointments set status = 'canceled'
  where therapist_id = md5('u-ana')::uuid and starts_at < now() + interval '3 hours' and ends_at > now() + interval '1 hour';
insert into public.appointments (id, patient_id, therapist_id, therapy_id, starts_at, ends_at, status)
values (md5('test-soon-session')::uuid, md5('pat-Lucas Silva')::uuid, md5('u-ana')::uuid, md5('th-psi')::uuid,
        now() + interval '2 hours', now() + interval '2 hours 50 minutes', 'confirmed');
insert into public.documents (id, title, file_path, category, family_id, visible_to_family)
values (md5('test-santos-doc')::uuid, 'Contrato Santos', 'test/santos-contract.pdf', 'contract', md5('fam-Família Santos')::uuid, true);

-- Carla (Lucas's mother) sees only her family's sessions and documents.
select pg_temp.act_as('g-carla@despertar.local');
select ok((select count(*) from public.appointments) > 0, 'guardian sees own child sessions');
select is((select count(*)::int from public.appointments where patient_id <> md5('pat-Lucas Silva')::uuid), 0,
  'guardian does not see sessions of another family');
select is((select count(*)::int from public.documents where family_id <> md5('fam-Família Silva')::uuid), 0,
  'guardian does not see documents of another family');
select is((select count(*)::int from public.charges where family_id <> md5('fam-Família Silva')::uuid), 0,
  'guardian does not see charges of another family');

-- Minimum notice: the database refuses a guardian cancellation inside the window.
select throws_ok(
  $$ select public.guardian_cancel_appointment(md5('test-soon-session')::uuid, 'Imprevisto') $$,
  '23514', null, 'guardian cannot cancel a session inside the minimum notice');
select throws_ok(
  $$ select public.request_reschedule(md5('test-soon-session')::uuid, now() + interval '5 days', 'Imprevisto') $$,
  '23514', null, 'guardian cannot request a reschedule inside the minimum notice');
select throws_ok(
  $$ select public.guardian_cancel_appointment(
       (select id from public.appointments where patient_id = md5('pat-Lucas Silva')::uuid limit 0), 'x') $$,
  '42501', null, 'cancel of an unknown session is refused');

-- Uploads: own family → under review and visible to the family; another family → refused.
select lives_ok(
  $$ insert into public.documents (id, title, file_path, category, family_id, patient_id, visible_to_family, uploaded_by)
     values (md5('test-carla-upload')::uuid, 'Laudo neuropediatra', md5('g-carla@despertar.local')::uuid || '/laudo.pdf', 'medical',
             md5('fam-Família Silva')::uuid, md5('pat-Lucas Silva')::uuid, true, md5('g-carla@despertar.local')::uuid) $$,
  'guardian uploads a document for own child');
select throws_ok(
  $$ insert into public.documents (title, file_path, category, family_id, visible_to_family, uploaded_by)
     values ('Intruso', md5('g-carla@despertar.local')::uuid || '/intruso.pdf', 'other',
             md5('fam-Família Santos')::uuid, true, md5('g-carla@despertar.local')::uuid) $$,
  '42501', null, 'guardian cannot insert a document for another family');
select is_empty(
  $$ update public.documents set status = 'available' where id = md5('test-carla-upload')::uuid returning id $$,
  'guardian cannot mark own upload as received');

select pg_temp.reset_role();
select is((select status::text from public.documents where id = md5('test-carla-upload')::uuid), 'under_review',
  'document sent by a guardian starts under review');

-- The other guardian of the family sees it; a guardian of another family does not.
select pg_temp.act_as('g-roberto.silva');
select is((select count(*)::int from public.documents where id = md5('test-carla-upload')::uuid), 1,
  'document sent by a guardian is visible to the family');
select pg_temp.act_as('g-roberto@despertar.local');
select is((select count(*)::int from public.documents where id = md5('test-carla-upload')::uuid), 0,
  'document sent by a guardian is not visible to another family');

select pg_temp.reset_role();
select * from finish();
rollback;
