-- Communication contract: chat link rules, contacts and tasks.
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

-- Contacts of a guardian: staff and their kids' therapists, never other guardians.
select pg_temp.act_as('g-carla@despertar.local');
select is((select count(*)::int from public.list_message_contacts() where role = 'guardian'), 0,
  'guardian contacts never include other guardians');
select is((select count(*)::int from public.list_message_contacts() where id = md5('u-renata')::uuid), 0,
  'guardian contacts exclude therapists without link');
select is((select count(*)::int from public.list_message_contacts()
  where id in (md5('u-ana')::uuid, md5('u-mariana')::uuid)), 2,
  'guardian contacts include linked therapists');
select ok(exists (select 1 from public.list_message_contacts() where id = md5('u-reception')::uuid),
  'guardian contacts include staff');

-- While linked, the guardian can write to the therapist.
select lives_ok(
  $$ insert into public.messages (conversation_id, sender_id, body)
     values (md5('conv-ana-carla')::uuid, md5('g-carla@despertar.local')::uuid, 'Obrigada!') $$,
  'guardian sends message while the care link is active');
select ok((select can_send from public.list_my_conversations() where conversation_id = md5('conv-ana-carla')::uuid),
  'conversation is writable while linked');

-- Non-participants cannot read the thread.
select pg_temp.act_as('u-renata');
select is((select count(*)::int from public.messages where conversation_id = md5('conv-ana-carla')::uuid), 0,
  'non-participant therapist cannot read messages');
select pg_temp.act_as('g-roberto@despertar.local');
select is((select count(*)::int from public.messages where conversation_id = md5('conv-ana-carla')::uuid), 0,
  'non-participant guardian cannot read messages');

-- End the care link: the conversation becomes read-only.
select pg_temp.reset_role();
update public.care_assignments set ends_on = current_date - 1
  where patient_id = md5('pat-Lucas Silva')::uuid and therapist_id = md5('u-ana')::uuid;

select pg_temp.act_as('g-carla@despertar.local');
select throws_ok(
  $$ insert into public.messages (conversation_id, sender_id, body)
     values (md5('conv-ana-carla')::uuid, md5('g-carla@despertar.local')::uuid, 'Olá?') $$,
  '42501', null, 'guardian cannot send after the care link ended');
select ok(not (select can_send from public.list_my_conversations() where conversation_id = md5('conv-ana-carla')::uuid),
  'conversation is flagged read-only after the link ended');
select ok((select count(*) from public.messages where conversation_id = md5('conv-ana-carla')::uuid) > 0,
  'guardian still reads history after the link ended');
select is((select count(*)::int from public.list_message_contacts() where id = md5('u-ana')::uuid), 0,
  'former therapist leaves the guardian contacts');

-- Guardians cannot create tasks.
select throws_ok(
  $$ insert into public.tasks (title, assigned_to, created_by)
     values ('x', md5('u-reception')::uuid, md5('g-carla@despertar.local')::uuid) $$,
  '42501', null, 'guardian cannot create tasks');

select pg_temp.reset_role();
select * from finish();
rollback;
