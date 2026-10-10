-- Reports workflow, documents visibility and signatures.
--   npx supabase test db
-- Seeded ids are md5(<seed>)::uuid (see supabase/seed.sql).
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

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

-- Fixtures (as postgres, auth.uid() is null so triggers let them through).
insert into public.reports (id, patient_id, therapist_id, report_type, reference_label, status, file_path)
values
  (md5('t-rep-review')::uuid, md5('pat-Lucas Silva')::uuid, md5('u-ana')::uuid, 'quarterly', 'Teste revisão', 'in_review', md5('u-ana')::text || '/r1.pdf'),
  (md5('t-rep-nofile')::uuid, md5('pat-Lucas Silva')::uuid, md5('u-ana')::uuid, 'quarterly', 'Teste sem arquivo', 'pending', null),
  (md5('t-rep-approved')::uuid, md5('pat-Lucas Silva')::uuid, md5('u-ana')::uuid, 'evaluation', 'Teste aprovado', 'approved', md5('u-ana')::text || '/r2.pdf');

insert into public.documents (id, title, file_path, category, family_id, patient_id, visible_to_family, uploaded_by)
values
  (md5('t-doc-admin-silva')::uuid, 'Administrativo Silva', md5('u-admin')::text || '/d1.pdf', 'administrative',
   md5('fam-Família Silva')::uuid, null, false, md5('u-admin')::uuid),
  (md5('t-doc-contract-santos')::uuid, 'Contrato Santos', md5('u-admin')::text || '/d2.pdf', 'contract',
   md5('fam-Família Santos')::uuid, null, true, md5('u-admin')::uuid),
  (md5('t-doc-contract-silva')::uuid, 'Contrato Silva', md5('u-admin')::text || '/d3.pdf', 'contract',
   md5('fam-Família Silva')::uuid, null, false, md5('u-admin')::uuid);

insert into public.signature_requests (id, document_id, signer_id, requested_by)
values (md5('t-sig-carla')::uuid, md5('t-doc-contract-silva')::uuid, md5('g-carla@despertar.local')::uuid, md5('u-admin')::uuid);

-- Reports ------------------------------------------------------------------
select pg_temp.act_as('u-ana');
select throws_ok(
  $$ update public.reports set status = 'approved' where id = md5('t-rep-review')::uuid $$,
  '42501', null, 'therapist cannot approve a report');
select throws_ok(
  $$ update public.reports set status = 'in_review' where id = md5('t-rep-nofile')::uuid $$,
  '23514', 'Anexe o arquivo do relatório antes de enviar', 'report cannot be sent to review without a file');

select pg_temp.act_as('u-coord');
select throws_ok(
  $$ update public.reports set status = 'returned' where id = md5('t-rep-review')::uuid $$,
  '23514', 'Informe o motivo da devolução', 'returning a report requires a reason');
select lives_ok(
  $$ update public.reports set status = 'returned', return_reason = 'Descrever evolução' where id = md5('t-rep-review')::uuid $$,
  'coordination returns a report with a reason');

select pg_temp.act_as('g-carla@despertar.local');
select is(
  (select array_agg(id) from public.reports), array[md5('t-rep-approved')::uuid],
  'guardian sees only approved reports of own child');

-- Signatures ---------------------------------------------------------------
select pg_temp.act_as('g-roberto.silva');
select throws_ok(
  $$ select public.sign_document(md5('t-sig-carla')::uuid, '1.2.3.4', 'test') $$,
  '42501', null, 'guardian cannot sign a request addressed to someone else');

select pg_temp.act_as('g-carla@despertar.local');
select is((select count(*)::int from public.documents where id = md5('t-doc-contract-silva')::uuid), 1,
  'signer can read the document to be signed even when not visible to family');
select lives_ok(
  $$ select public.sign_document(md5('t-sig-carla')::uuid, '1.2.3.4', 'test-agent') $$,
  'guardian signs own request');
select is((select signer_ip from public.signature_requests where id = md5('t-sig-carla')::uuid), '1.2.3.4',
  'signature keeps the IP audit trail');

-- Documents visibility -------------------------------------------------------
select pg_temp.act_as('u-ana');
select is((select count(*)::int from public.documents where id = md5('t-doc-admin-silva')::uuid), 0,
  'therapist cannot see administrative family document even with a linked patient');
select is((select count(*)::int from public.documents where id = md5('t-doc-contract-santos')::uuid), 0,
  'therapist cannot see documents of a family without linked patient');
select is((select count(*)::int from public.documents where id = md5('t-doc-contract-silva')::uuid), 1,
  'therapist sees non-administrative document of a linked family');

select pg_temp.reset_role();
select * from finish();
rollback;
