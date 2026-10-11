-- Session records + family "de acordo": the family sees its own child's record
-- and attachments, reception does not, registering completes the session and only
-- the family answers the confirmation (once; disputing needs a reason).
--   npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

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

-- Fixtures (as postgres): a session of Lucas with Ana that started 2 hours ago
-- (overlapping sessions of Ana are moved out of the way) and a record of Pedro
-- (another family) with one attachment.
update public.appointments set status = 'canceled'
  where therapist_id = md5('u-ana')::uuid and starts_at < now() - interval '1 hour' and ends_at > now() - interval '3 hours';
insert into public.appointments (id, patient_id, therapist_id, therapy_id, starts_at, ends_at, status)
values (md5('t80-lucas-session')::uuid, md5('pat-Lucas Silva')::uuid, md5('u-ana')::uuid, md5('th-psi')::uuid,
        now() - interval '2 hours', now() - interval '1 hour 10 minutes', 'confirmed');
insert into public.session_notes (id, patient_id, therapist_id, session_date, content)
select md5('t80-pedro-note')::uuid, md5('pat-Pedro Santos')::uuid, ca.therapist_id, current_date, 'Registro do Pedro'
  from public.care_assignments ca where ca.patient_id = md5('pat-Pedro Santos')::uuid limit 1;
insert into public.session_attachments (session_note_id, file_path, file_name, mime_type)
values (md5('t80-pedro-note')::uuid, 't80/pedro.jpg', 'pedro.jpg', 'image/jpeg');

-- The session's therapist registers it with a photo.
select pg_temp.act_as('u-ana');
select lives_ok(
  $$ insert into public.session_notes (id, appointment_id, patient_id, therapist_id, session_date, content)
     values (md5('t80-lucas-note')::uuid, md5('t80-lucas-session')::uuid, md5('pat-Lucas Silva')::uuid, md5('u-ana')::uuid,
             current_date, 'Trabalhamos atenção compartilhada') $$,
  'therapist registers own started session');
select lives_ok(
  $$ insert into public.session_attachments (session_note_id, file_path, file_name, mime_type, uploaded_by)
     values (md5('t80-lucas-note')::uuid, md5('u-ana')::uuid || '/foto.jpg', 'foto.jpg', 'image/jpeg', md5('u-ana')::uuid) $$,
  'author attaches a photo from own folder');
select is((select status::text from public.appointments where id = md5('t80-lucas-session')::uuid), 'completed',
  'registering the session marks it as completed');
select throws_ok(
  $$ update public.appointments set family_confirmation = 'confirmed' where id = md5('t80-lucas-session')::uuid $$,
  '42501', null, 'therapist cannot write the family confirmation');

-- Another therapist of Lucas cannot attach files to Ana's record.
select pg_temp.act_as('u-mariana');
select throws_ok(
  $$ insert into public.session_attachments (session_note_id, file_path, file_name, mime_type, uploaded_by)
     values (md5('t80-lucas-note')::uuid, md5('u-mariana')::uuid || '/x.jpg', 'x.jpg', 'image/jpeg', md5('u-mariana')::uuid) $$,
  '42501', null, 'only the record author attaches files');

-- Reception sees the session but not the record; admin sees the record.
select pg_temp.act_as('u-reception');
select is((select count(*)::int from public.session_notes where id = md5('t80-lucas-note')::uuid), 0, 'reception does not see session records');
select is((select count(*)::int from public.session_attachments where session_note_id = md5('t80-lucas-note')::uuid), 0,
  'reception does not see record attachments');
select throws_ok(
  $$ update public.appointments set family_confirmation = 'confirmed' where id = md5('t80-lucas-session')::uuid $$,
  '42501', null, 'staff cannot write the family confirmation');
select pg_temp.act_as('u-admin');
select is((select count(*)::int from public.session_notes where id = md5('t80-lucas-note')::uuid), 1, 'admin sees session records');

-- Carla (Lucas's mother) sees her child's record and photo, not Pedro's.
select pg_temp.act_as('g-carla@despertar.local');
select is((select count(*)::int from public.session_notes where id = md5('t80-lucas-note')::uuid), 1, 'guardian sees own child record');
select is((select count(*)::int from public.session_attachments where session_note_id = md5('t80-lucas-note')::uuid), 1,
  'guardian sees own child record attachments');
select is((select count(*)::int from public.session_notes where id = md5('t80-pedro-note')::uuid), 0, 'guardian does not see another child record');
select is((select count(*)::int from public.session_attachments where session_note_id = md5('t80-pedro-note')::uuid), 0,
  'guardian does not see another child attachments');

-- Confirmation: disputing needs a reason; confirming works once.
select throws_ok(
  $$ select public.respond_session_confirmation(md5('t80-lucas-session')::uuid, false, '  ') $$,
  '23514', null, 'dispute without a reason fails');
select lives_ok(
  $$ select public.respond_session_confirmation(md5('t80-lucas-session')::uuid, true, null) $$,
  'guardian confirms the session');
select throws_ok(
  $$ select public.respond_session_confirmation(md5('t80-lucas-session')::uuid, false, 'Mudei de ideia') $$,
  '23514', null, 'guardian answers only once');

-- A guardian of another family cannot answer.
select pg_temp.act_as('g-roberto@despertar.local');
select throws_ok(
  $$ select public.respond_session_confirmation(md5('t80-lucas-session')::uuid, true, null) $$,
  '42501', null, 'guardian of another family cannot answer');

select pg_temp.reset_role();
select is((select family_confirmation from public.appointments where id = md5('t80-lucas-session')::uuid), 'confirmed',
  'confirmation is stored');

select * from finish();
rollback;
