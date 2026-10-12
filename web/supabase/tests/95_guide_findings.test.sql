-- Fixes from the training-guide review: disputed sessions stay out of NFs until
-- a manager resolves them; coordination runs the professionals' NF flow (never
-- for itself); coordination is told about family requests.
--   npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

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

-- Fixtures (as postgres): three completed sessions of Lucas with Ana on a day of
-- their own, two of them disputed by the family, and a payout period for that day.
insert into public.appointments (id, patient_id, therapist_id, therapy_id, starts_at, ends_at, status, family_confirmation, family_confirmation_note)
values
  (md5('t95-ok')::uuid, md5('pat-Lucas Silva')::uuid, md5('u-ana')::uuid, md5('th-psi')::uuid,
   current_date - 3 + time '21:00', current_date - 3 + time '21:50', 'completed', 'confirmed', null),
  (md5('t95-kept')::uuid, md5('pat-Lucas Silva')::uuid, md5('u-ana')::uuid, md5('th-psi')::uuid,
   current_date - 3 + time '22:00', current_date - 3 + time '22:50', 'completed', 'disputed', 'Não houve sessão'),
  (md5('t95-dropped')::uuid, md5('pat-Lucas Silva')::uuid, md5('u-ana')::uuid, md5('th-psi')::uuid,
   current_date - 3 + time '23:00', current_date - 3 + time '23:50', 'completed', 'disputed', 'Chegamos e estava fechado');
insert into public.payout_periods (id, label, starts_on, ends_on, created_by)
values (md5('t95-period')::uuid, 'Teste 95', current_date - 4, current_date - 2, md5('u-admin')::uuid);
-- Own and someone else's submitted NF for the coordination to review.
insert into public.invoice_requests (id, therapist_id, amount_cents, description, created_by, status, invoice_number, submitted_at)
values
  (md5('t95-nf-coord')::uuid, md5('u-coord')::uuid, 50000, 'Supervisão', md5('u-admin')::uuid, 'submitted', '1', now()),
  (md5('t95-nf-ana')::uuid, md5('u-ana')::uuid, 30000, 'Oficina', md5('u-admin')::uuid, 'submitted', '2', now());

-- Disputed sessions are left out of the NF.
select pg_temp.act_as('u-coord');
select is((select count(*)::int from public.preview_invoice_items(md5('t95-period')::uuid) where appointment_id in (md5('t95-ok')::uuid, md5('t95-kept')::uuid, md5('t95-dropped')::uuid)), 1,
  'only the undisputed session counts towards the NF');

-- Only managers resolve a dispute, and they must explain it.
select pg_temp.act_as('u-reception');
select throws_ok($$ select public.resolve_session_dispute(md5('t95-kept')::uuid, true, 'Conferido') $$,
  '42501', null, 'reception cannot resolve a dispute');
select pg_temp.act_as('u-coord');
select throws_ok($$ select public.resolve_session_dispute(md5('t95-kept')::uuid, true, ' ') $$,
  '23514', null, 'resolving needs an explanation');
select lives_ok($$ select public.resolve_session_dispute(md5('t95-kept')::uuid, true, 'Conferido na lista de presença') $$,
  'coordination keeps a disputed session');
select lives_ok($$ select public.resolve_session_dispute(md5('t95-dropped')::uuid, false, 'Clínica fechada por falta de luz') $$,
  'coordination cancels a disputed session');
select is((select count(*)::int from public.preview_invoice_items(md5('t95-period')::uuid) where appointment_id in (md5('t95-ok')::uuid, md5('t95-kept')::uuid, md5('t95-dropped')::uuid)), 2,
  'the kept session goes back into the NF; the canceled one does not');
select pg_temp.reset_role();
select is((select status::text || '/' || family_confirmation from public.appointments where id = md5('t95-dropped')::uuid),
  'canceled/resolved', 'a dropped session is canceled and marked as resolved');
select ok(exists (select 1 from public.notifications where user_id = md5('g-carla@despertar.local')::uuid
                  and title = 'A clínica analisou sua contestação'), 'the family is told how the dispute ended');
select throws_ok($$ select public.resolve_session_dispute(md5('t95-kept')::uuid, true, 'De novo') $$,
  '42501', null, 'resolution needs a signed-in manager');

-- Coordination runs the professionals' NF flow, never for itself.
select pg_temp.act_as('u-coord');
select lives_ok($$ select public.create_manual_invoice_request(md5('u-ana')::uuid, 12000, 'Oficina de pais') $$,
  'coordination requests an NF from a therapist');
select throws_ok($$ select public.create_manual_invoice_request(md5('u-coord')::uuid, 12000, 'Para mim') $$,
  '42501', null, 'coordination cannot request an NF for itself');
select lives_ok($$ select public.review_invoice(md5('t95-nf-ana')::uuid, true) $$, 'coordination approves a therapist NF');
select throws_ok($$ select public.review_invoice(md5('t95-nf-coord')::uuid, true) $$,
  '42501', null, 'coordination cannot approve its own NF');
select lives_ok($$ insert into public.payout_periods (label, starts_on, ends_on, created_by)
                   values ('Coord 95', '2025-02-01', '2025-02-28', md5('u-coord')::uuid) $$,
  'coordination opens a payout period');

-- Family requests now reach the coordination.
select pg_temp.act_as('g-carla@despertar.local');
insert into public.guardian_requests (family_id, requested_by, request_type, message)
values (md5('fam-Família Silva')::uuid, md5('g-carla@despertar.local')::uuid, 'information', 'pgtap 95 request');
select pg_temp.reset_role();
select ok(exists (select 1 from public.notifications where user_id = md5('u-coord')::uuid and title = 'Nova solicitação da família'
                  and body = 'pgtap 95 request'), 'coordination is told about family requests');

select * from finish();
rollback;
