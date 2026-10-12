-- Finance + therapist invoices (NF) contract. Runs against the seeded local database:
--   npx supabase test db
-- Everything happens inside a transaction that is rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

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

-- ---------------------------------------------------------------------------
-- Session amount math
-- ---------------------------------------------------------------------------
select is(public.compute_session_amount('per_session', 12000, 75), 12000, 'per_session pays the fixed rate regardless of length');
select is(public.compute_session_amount('per_hour', 12000, 45), 9000, 'per_hour: 45 min at R$ 120/h = R$ 90,00');
select is(public.compute_session_amount('per_hour', 14000, 50), 11667, 'per_hour: 50 min at R$ 140/h = R$ 116,67 (rounded to the cent)');

-- ---------------------------------------------------------------------------
-- Fixture: a period covering every session, and the amounts each therapist ×
-- therapy should get, computed independently from appointments + rates.
-- ---------------------------------------------------------------------------
insert into public.payout_periods (id, label, starts_on, ends_on)
values ('00000000-0000-0000-0000-0000000f1600', 'pgTAP', '2000-01-01', current_date + 365);
select set_config('test.period', '00000000-0000-0000-0000-0000000f1600', true);

create temp table expected as
select a.therapist_id, a.therapy_id, count(*)::int as sessions,
       sum(case r.pay_model when 'per_session' then r.amount_cents
           else round(r.amount_cents::numeric * (extract(epoch from (a.ends_at - a.starts_at)) / 60) / 60) end)::int as total
from public.appointments a
join lateral (
  select * from public.therapist_rates tr
  where tr.therapist_id = a.therapist_id and tr.therapy_id = a.therapy_id
    and tr.valid_from <= (a.starts_at at time zone 'America/Sao_Paulo')::date
  order by tr.valid_from desc limit 1
) r on true
where a.status = 'completed'
  and not exists (select 1 from public.invoice_request_items i where i.appointment_id = a.id)
group by a.therapist_id, a.therapy_id;

-- ---------------------------------------------------------------------------
-- Only the admin generates invoice requests
-- ---------------------------------------------------------------------------
select pg_temp.act_as('u-ana');
select throws_ok($$ select * from public.generate_invoice_requests(current_setting('test.period')::uuid) $$,
  '42501', null, 'therapist cannot generate invoice requests');
select throws_ok($$ select * from public.preview_invoice_items(current_setting('test.period')::uuid) $$,
  '42501', null, 'therapist cannot preview the billing of other therapists');
select throws_ok($$ insert into public.payout_periods (label, starts_on, ends_on) values ('x', current_date, current_date) $$,
  '42501', null, 'therapist cannot create payout periods');

select pg_temp.act_as('u-ana');
select throws_ok($$ select * from public.generate_invoice_requests(current_setting('test.period')::uuid) $$,
  '42501', null, 'therapist cannot generate invoice requests');

select pg_temp.act_as('u-admin');
select lives_ok($$ create temp table gen1 as select * from public.generate_invoice_requests(current_setting('test.period')::uuid) $$,
  'admin generates invoice requests');

select pg_temp.reset_role();
drop table if exists pg_temp._items; -- the RPC's "on commit drop" scratch table outlives the call inside this test transaction

select is((select count(*)::int from gen1 where not missing_rate),
  (select count(*)::int from expected), 'one request per therapist × therapy with a rate');
select is(
  (select amount_cents from public.invoice_requests
    where period_id = current_setting('test.period')::uuid and therapist_id = md5('u-ana')::uuid),
  (select total from expected where therapist_id = md5('u-ana')::uuid),
  'per-session therapist (Ana) total matches sessions × fixed rate');
select is(
  (select sessions_count from public.invoice_requests
    where period_id = current_setting('test.period')::uuid and therapist_id = md5('u-ana')::uuid),
  (select sessions from expected where therapist_id = md5('u-ana')::uuid),
  'only completed sessions are counted');
select is(
  (select amount_cents from public.invoice_requests
    where period_id = current_setting('test.period')::uuid and therapist_id = md5('u-mariana')::uuid),
  (select total from expected where therapist_id = md5('u-mariana')::uuid),
  'per-hour therapist (Mariana) total is proportional to real durations');
select is(
  (select count(*)::int from public.invoice_requests ir
    where ir.period_id = current_setting('test.period')::uuid
      and ir.amount_cents <> (select sum(it.amount_cents) from public.invoice_request_items it where it.invoice_request_id = ir.id)),
  0, 'every request total equals the sum of its session items');
select ok(
  exists (select 1 from public.notifications where user_id = md5('u-ana')::uuid and kind = 'invoice' and title = 'Emitir nota fiscal'),
  'therapist is notified to issue the invoice');

select set_config('test.items_after_first', (select count(*)::text from public.invoice_request_items), true);
select set_config('test.requests_after_first', (select count(*)::text from public.invoice_requests), true);
select set_config('test.ana_req', (select id::text from public.invoice_requests
  where period_id = current_setting('test.period')::uuid and therapist_id = md5('u-ana')::uuid), true);
select set_config('test.mariana_req', (select id::text from public.invoice_requests
  where period_id = current_setting('test.period')::uuid and therapist_id = md5('u-mariana')::uuid), true);

-- Running it again never bills the same session twice.
select pg_temp.act_as('u-admin');
select lives_ok($$ create temp table gen2 as select * from public.generate_invoice_requests(current_setting('test.period')::uuid) $$,
  'admin can run generation again');
select pg_temp.reset_role();
drop table if exists pg_temp._items;
select is((select count(*)::int from gen2 where not missing_rate), 0, 'second run has nothing new to bill');
select is((select count(*)::text from public.invoice_request_items), current_setting('test.items_after_first'), 'second run adds no items');
select is((select count(*)::text from public.invoice_requests), current_setting('test.requests_after_first'), 'second run adds no requests');

-- ---------------------------------------------------------------------------
-- Therapists only see and submit their own invoices
-- ---------------------------------------------------------------------------
select pg_temp.act_as('u-ana');
select ok((select count(*) from public.invoice_requests) > 0, 'therapist sees own invoice requests');
select is((select count(*)::int from public.invoice_requests where therapist_id <> md5('u-ana')::uuid), 0,
  'therapist cannot see invoice requests of other therapists');
select is((select count(*)::int from public.invoice_request_items where invoice_request_id = current_setting('test.mariana_req')::uuid), 0,
  'therapist cannot see session items of another therapist');
select throws_ok(
  $$ select public.submit_invoice(current_setting('test.mariana_req')::uuid, 'NF-1', md5('u-ana')::uuid::text || '/nf.pdf') $$,
  '42501', null, 'therapist cannot submit the invoice of another therapist');
select throws_ok(
  $$ select public.submit_invoice(current_setting('test.ana_req')::uuid, 'NF-1', md5('u-mariana')::uuid::text || '/nf.pdf') $$,
  '42501', 'Arquivo inválido', 'invoice file must be in the submitter''s own folder');
select throws_ok(
  $$ select public.submit_invoice(current_setting('test.ana_req')::uuid, 'NF-1', null) $$,
  '23514', null, 'invoice submission requires a file');
select lives_ok(
  $$ select public.submit_invoice(current_setting('test.ana_req')::uuid, 'NF-1', md5('u-ana')::uuid::text || '/nf.pdf') $$,
  'therapist submits own invoice with a file in own folder');

-- ---------------------------------------------------------------------------
-- Admin review and payout
-- ---------------------------------------------------------------------------
select pg_temp.act_as('u-admin');
select throws_ok($$ select public.mark_invoice_paid(current_setting('test.mariana_req')::uuid) $$,
  '23514', null, 'only approved invoices can be paid');
select throws_ok($$ select public.review_invoice(current_setting('test.ana_req')::uuid, false, ' ') $$,
  '23514', null, 'rejecting requires a reason');
select lives_ok($$ select public.review_invoice(current_setting('test.ana_req')::uuid, true) $$, 'admin approves the invoice');
select lives_ok($$ select public.mark_invoice_paid(current_setting('test.ana_req')::uuid) $$, 'admin marks the invoice as paid');
select is((select status::text from public.invoice_requests where id = current_setting('test.ana_req')::uuid), 'paid', 'invoice ends as paid');

-- ---------------------------------------------------------------------------
-- Who sees family charges
-- ---------------------------------------------------------------------------
select pg_temp.act_as('u-reception');
select is((select count(*)::int from public.charges), 0, 'reception cannot see family charges');
select is((select count(*)::int from public.invoice_requests), 0, 'reception cannot see therapist invoices');

select pg_temp.act_as('g-carla@despertar.local');
select is((select count(*)::int from public.charges where family_id <> md5('fam-Família Silva')::uuid), 0,
  'guardian sees only own family charges');

select pg_temp.reset_role();
select * from finish();
rollback;
