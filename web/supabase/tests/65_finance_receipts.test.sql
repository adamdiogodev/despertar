-- Finance receipts (family charges and payouts) and ad hoc invoice requests for any team member.
--   npx supabase test db
-- Runs inside a transaction that is rolled back at the end.
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

-- Fixture: one charge for the Silva family (Carla) and one for the Santos family (Roberto).
insert into public.charges (id, family_id, reference, amount_cents, due_date, payment_method, status) values
  ('00000000-0000-0000-0000-00000000c651', md5('fam-Família Silva')::uuid, 'pgTAP Silva', 48000, current_date, 'Pix', 'pending'),
  ('00000000-0000-0000-0000-00000000c652', md5('fam-Família Santos')::uuid, 'pgTAP Santos', 48000, current_date, 'Pix', 'pending');
select set_config('test.carla', md5('g-carla@despertar.local')::uuid::text, true);

-- ---------------------------------------------------------------------------
-- Family receipts
-- ---------------------------------------------------------------------------
select pg_temp.act_as('g-carla@despertar.local');
select throws_ok(
  $$ select public.attach_charge_receipt('00000000-0000-0000-0000-00000000c652', current_setting('test.carla') || '/r.pdf') $$,
  '42501', null, 'guardian cannot attach a receipt to another family''s charge');
select throws_ok(
  $$ select public.attach_charge_receipt('00000000-0000-0000-0000-00000000c651', md5('u-admin')::uuid::text || '/r.pdf') $$,
  '42501', 'Arquivo inválido', 'guardian cannot reference a file outside her own folder');
select lives_ok(
  $$ select public.attach_charge_receipt('00000000-0000-0000-0000-00000000c651', current_setting('test.carla') || '/silva-receipt.pdf') $$,
  'guardian attaches a receipt to her family''s charge');

select pg_temp.reset_role();
select is((select receipt_path from public.charges where id = '00000000-0000-0000-0000-00000000c651'),
  md5('g-carla@despertar.local')::uuid::text || '/silva-receipt.pdf', 'receipt path stored on the charge');
select is((select receipt_uploaded_by from public.charges where id = '00000000-0000-0000-0000-00000000c651'),
  md5('g-carla@despertar.local')::uuid, 'uploader recorded');
select ok(exists (select 1 from public.notifications where title = 'Família enviou comprovante' and user_id = md5('u-admin')::uuid),
  'managers are notified when a family sends a receipt');

select pg_temp.act_as('u-reception');
select throws_ok(
  $$ select public.attach_charge_receipt('00000000-0000-0000-0000-00000000c651', md5('u-reception')::uuid::text || '/r.pdf') $$,
  '42501', null, 'reception cannot attach charge receipts');

-- Storage: the receipt object is readable by whoever can see the charge.
select pg_temp.reset_role();
insert into storage.objects (bucket_id, name) values ('files', md5('g-carla@despertar.local')::uuid::text || '/silva-receipt.pdf');

select pg_temp.act_as('u-admin');
select is((select count(*)::int from storage.objects where name = md5('g-carla@despertar.local')::uuid::text || '/silva-receipt.pdf'), 1,
  'admin can read the family receipt (referenced by a visible charge)');
select pg_temp.act_as('g-roberto@despertar.local');
select is((select count(*)::int from storage.objects where name = md5('g-carla@despertar.local')::uuid::text || '/silva-receipt.pdf'), 0,
  'another family cannot read the receipt');
select pg_temp.act_as('u-ana');
select is((select count(*)::int from storage.objects where name = md5('g-carla@despertar.local')::uuid::text || '/silva-receipt.pdf'), 0,
  'therapist cannot read family receipts');

-- ---------------------------------------------------------------------------
-- Ad hoc invoice requests: admin and coordination only, active team members only
-- ---------------------------------------------------------------------------
select pg_temp.act_as('u-reception');
select throws_ok($$ select public.create_manual_invoice_request(md5('u-ana')::uuid, 30000, 'Plantão') $$,
  '42501', null, 'reception cannot request invoices');

select pg_temp.act_as('u-admin');
select throws_ok($$ select public.create_manual_invoice_request(md5('g-carla@despertar.local')::uuid, 30000, 'x') $$,
  '23514', null, 'a guardian cannot be a payee');

select pg_temp.reset_role();
update public.profiles set active = false where id = md5('u-renata')::uuid;
select pg_temp.act_as('u-admin');
select throws_ok($$ select public.create_manual_invoice_request(md5('u-renata')::uuid, 30000, 'x') $$,
  '23514', null, 'an inactive professional cannot be a payee');
select throws_ok($$ select public.create_manual_invoice_request(md5('u-reception')::uuid, 0, 'x') $$,
  '23514', null, 'amount must be positive');

select lives_ok($$ create temp table manual_req as select public.create_manual_invoice_request(md5('u-reception')::uuid, 30000, 'Plantão de sábado') as id $$,
  'admin requests an ad hoc invoice from reception');
select pg_temp.reset_role();
select set_config('test.req', (select id::text from manual_req), true);
select ok((select period_id is null and therapy_id is null and description = 'Plantão de sábado' and created_by = md5('u-admin')::uuid
  from public.invoice_requests where id = current_setting('test.req')::uuid), 'ad hoc request has no period, a description and its author');

-- Visibility: the payee sees it, another professional does not.
select pg_temp.act_as('u-reception');
select is((select count(*)::int from public.invoice_requests where id = current_setting('test.req')::uuid), 1, 'payee sees her request');
select pg_temp.act_as('u-ana');
select is((select count(*)::int from public.invoice_requests where id = current_setting('test.req')::uuid), 0, 'therapist does not see another professional''s request');

-- Flow: reception submits the NF, admin approves and pays with the receipt.
select pg_temp.act_as('u-reception');
select public.submit_invoice(current_setting('test.req')::uuid, 'NF-1', md5('u-reception')::uuid::text || '/nf.pdf');
select pg_temp.act_as('u-admin');
select public.review_invoice(current_setting('test.req')::uuid, true);
select throws_ok($$ select public.attach_payout_receipt(current_setting('test.req')::uuid, md5('u-admin')::uuid::text || '/p.pdf') $$,
  '23514', null, 'receipt can only be attached after payment');
select throws_ok($$ select public.mark_invoice_paid(current_setting('test.req')::uuid, md5('u-reception')::uuid::text || '/p.pdf') $$,
  '42501', 'Arquivo inválido', 'payout receipt must be in the admin''s own folder');
select lives_ok($$ select public.mark_invoice_paid(current_setting('test.req')::uuid, md5('u-admin')::uuid::text || '/payout.pdf') $$,
  'admin pays with a receipt');

select pg_temp.reset_role();
select ok((select status = 'paid' and paid_at is not null and payment_receipt_path = md5('u-admin')::uuid::text || '/payout.pdf'
  from public.invoice_requests where id = current_setting('test.req')::uuid), 'request paid with the receipt path');

-- Storage: the payout receipt is readable by the payee, not by other professionals.
insert into storage.objects (bucket_id, name) values ('files', md5('u-admin')::uuid::text || '/payout.pdf');
select pg_temp.act_as('u-reception');
select is((select count(*)::int from storage.objects where name = md5('u-admin')::uuid::text || '/payout.pdf'), 1,
  'payee can read her payout receipt');
select pg_temp.act_as('u-ana');
select is((select count(*)::int from storage.objects where name = md5('u-admin')::uuid::text || '/payout.pdf'), 0,
  'another professional cannot read the payout receipt');

select pg_temp.reset_role();
select * from finish();
rollback;
