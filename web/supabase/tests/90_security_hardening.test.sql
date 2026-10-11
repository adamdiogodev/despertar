-- Regression tests for the findings of the security/LGPD review.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

create or replace function pg_temp.act_as(seed text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', md5(seed)::uuid, 'role', 'authenticated')::text, true);
end;
$$;

-- Fixture: a medical document of the Santos family (Pedro), uploaded by Mariana.
insert into public.documents (id, title, file_path, category, patient_id, uploaded_by)
values (md5('doc-pedro-laudo')::uuid, 'Laudo Pedro', md5('u-mariana')::text || '/laudo.pdf', 'medical',
        md5('pat-Pedro Santos')::uuid, md5('u-mariana')::uuid);

-- 1. Internal functions are not callable by signed-in users.
select ok(not has_function_privilege('authenticated', 'public.notify(uuid,text,text,text,text)', 'execute'), 'notify is not exposed');
select ok(not has_function_privilege('authenticated', 'public.notify_roles(public.app_role[],text,text,text,text)', 'execute'), 'notify_roles is not exposed');
select ok(not has_function_privilege('authenticated', 'public.patient_name(uuid)', 'execute'), 'patient_name is not exposed');
select ok(not has_function_privilege('authenticated', 'public.rate_for(uuid,uuid,date)', 'execute'), 'rate_for is not exposed');
select ok(has_function_privilege('authenticated', 'public.request_reschedule(uuid,timestamptz,text)', 'execute'), 'public RPCs stay callable');

-- 2. Relationship oracle closed.
select pg_temp.act_as('g-carla@despertar.local');
select ok(not public.is_therapist_of(md5('pat-Pedro Santos')::uuid, md5('u-mariana')::uuid), 'guardian cannot probe who treats another child');
select ok(public.is_therapist_of(md5('pat-Lucas Silva')::uuid, md5('u-ana')::uuid), 'guardian can still check own child''s therapist');
select ok(public.can_message(md5('g-carla@despertar.local')::uuid, md5('u-ana')::uuid), 'chat rule still works for linked therapist');
select ok(not public.is_guardian_of(md5('pat-Pedro Santos')::uuid, md5('g-roberto@despertar.local')::uuid), 'guardian cannot probe other families');

-- 3. Self-signature trick no longer exposes documents.
select pg_temp.act_as('u-reception');
select throws_ok(
  $$ insert into public.signature_requests (document_id, signer_id, requested_by)
     values (md5('doc-pedro-laudo')::uuid, md5('u-reception')::uuid, md5('u-reception')::uuid) $$,
  '42501', null, 'reception cannot request a signature from itself on a clinical document');
select is((select count(*)::int from public.documents where id = md5('doc-pedro-laudo')::uuid), 0, 'reception still cannot see the document');

-- 4. Reports cannot point to someone else's file.
select pg_temp.act_as('u-ana');
select throws_ok(
  $$ insert into public.reports (patient_id, therapist_id, report_type, reference_label, file_path)
     values (md5('pat-Lucas Silva')::uuid, md5('u-ana')::uuid, 'other', 'x', md5('u-mariana')::text || '/laudo.pdf') $$,
  '42501', null, 'therapist cannot reference another user''s file in a report');

-- 5. Staff cannot attach themselves to a family as guardian.
select pg_temp.act_as('u-reception');
select throws_ok(
  $$ insert into public.guardians (profile_id, family_id) values (md5('u-reception')::uuid, md5('fam-Família Santos')::uuid) $$,
  '23514', null, 'only guardian accounts can be linked to a family');

-- 6. Download trail.
select lives_ok($$ select public.log_file_access('x/y.pdf') $$, 'file access can be logged');

select * from finish();
rollback;
