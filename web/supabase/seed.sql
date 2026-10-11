-- Local development seed, based on the data in docs/mock/sistema-despertar.html.
-- Every account uses the password: Despertar@2026  (local only — never in production)
-- Triggers are disabled while seeding so no notifications/audit noise is produced.

set session_replication_role = replica;

create or replace function pg_temp.sid(seed text) returns uuid language sql immutable as $$
  select md5(seed)::uuid
$$;

create or replace function pg_temp.add_user(seed text, user_email text, user_name text, user_role public.app_role, user_phone text default null)
returns uuid language plpgsql as $$
declare uid uuid := pg_temp.sid(seed);
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', user_email,
    extensions.crypt('Despertar@2026', extensions.gen_salt('bf')), now(),
    jsonb_build_object('provider', 'email', 'providers', array['email'], 'role', user_role, 'full_name', user_name),
    '{}'::jsonb, now(), now(), '', '', '', '', '', '', '', '');
  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (uid::text, uid, jsonb_build_object('sub', uid::text, 'email', user_email, 'email_verified', true),
    'email', now(), now(), now());
  insert into public.profiles (id, role, full_name, email, phone) values (uid, user_role, user_name, user_email, user_phone);
  return uid;
end;
$$;

update public.clinic_settings set
  name = 'Clínica Despertar', tax_id = '12.345.678/0001-90', phone = '(11) 3456-7890',
  whatsapp = '(11) 98765-4321', address = 'Rua das Flores, 456 — São Paulo/SP',
  email = 'contato@clinicadespertar.com.br'
where id = 1;

insert into public.therapies (id, name) values
  (pg_temp.sid('th-psi'), 'Psicologia'),
  (pg_temp.sid('th-fono'), 'Fonoaudiologia'),
  (pg_temp.sid('th-to'), 'Terapia Ocupacional'),
  (pg_temp.sid('th-psp'), 'Psicopedagogia'),
  (pg_temp.sid('th-aba'), 'ABA');

insert into public.rooms (id, name) values
  (pg_temp.sid('room-1'), 'Sala 1'), (pg_temp.sid('room-2'), 'Sala 2'), (pg_temp.sid('room-3'), 'Sala 3'),
  (pg_temp.sid('room-4'), 'Sala 4'), (pg_temp.sid('room-5'), 'Sala 5');

-- Staff
select pg_temp.add_user('u-admin', 'admin@despertar.local', 'Marina Albuquerque', 'admin', '(11) 99000-0001');
select pg_temp.add_user('u-reception', 'recepcao@despertar.local', 'Fernanda Luz', 'reception', '(11) 99000-0002');
select pg_temp.add_user('u-coord', 'coordenacao@despertar.local', 'Cristiane Barros', 'coordination', '(11) 99000-0003');

-- Therapists
select pg_temp.add_user('u-ana', 'ana@despertar.local', 'Ana Paula Souza', 'therapist');
select pg_temp.add_user('u-mariana', 'mariana@despertar.local', 'Mariana Costa', 'therapist');
select pg_temp.add_user('u-juliana', 'juliana@despertar.local', 'Juliana Ferreira', 'therapist');
select pg_temp.add_user('u-camila', 'camila@despertar.local', 'Camila Alves', 'therapist');
select pg_temp.add_user('u-renata', 'renata@despertar.local', 'Renata Lima', 'therapist');

insert into public.therapists (id, specialty, council_registry, color) values
  (pg_temp.sid('u-ana'), 'Psicóloga', 'CRP 06/12345', '#2E86DE'),
  (pg_temp.sid('u-mariana'), 'Fonoaudióloga', 'CRFa 2/45678', '#9B59B6'),
  (pg_temp.sid('u-juliana'), 'Terapeuta Ocupacional', 'CREFITO 3/12890', '#27AE60'),
  (pg_temp.sid('u-camila'), 'Psicopedagoga', null, '#E67E22'),
  (pg_temp.sid('u-renata'), 'Psicóloga', 'CRP 06/54321', '#E74C3C');

-- Rates: a mix of per-session and per-hour to exercise the invoice math.
insert into public.therapist_rates (therapist_id, therapy_id, pay_model, amount_cents, valid_from) values
  (pg_temp.sid('u-ana'), pg_temp.sid('th-psi'), 'per_session', 12000, '2026-01-01'),
  (pg_temp.sid('u-mariana'), pg_temp.sid('th-fono'), 'per_hour', 14000, '2026-01-01'),
  (pg_temp.sid('u-juliana'), pg_temp.sid('th-to'), 'per_hour', 13000, '2026-01-01'),
  (pg_temp.sid('u-camila'), pg_temp.sid('th-psp'), 'per_session', 10000, '2026-01-01'),
  (pg_temp.sid('u-renata'), pg_temp.sid('th-psi'), 'per_hour', 15000, '2026-01-01');

-- Families, guardians, patients, assignments, weekly schedule
do $$
declare
  fam record;
  fam_id uuid;
  pat_id uuid;
  guardian_id uuid;
  week integer;
  slot_start timestamptz;
  minutes integer;
  appt_status public.appointment_status;
  monday date := date_trunc('week', (now() at time zone 'America/Sao_Paulo'))::date;
begin
  for fam in
    select * from (values
      -- family, patient, birth, diagnosis, insurance, guardian name, email, phone, therapist seed, therapy seed, room, weekday(0=mon), hour, minutes, status
      ('Família Silva', 'Lucas Silva', date '2018-03-12', 'TEA nível 1 · F84.0', 'Unimed', 'Carla Silva', 'carla@despertar.local', '(11) 98765-4321', 'u-ana', 'th-psi', 'room-1', 0, 9, 50, 'active'),
      ('Família Santos', 'Pedro Santos', date '2014-07-02', 'TEA nível 1 · F84.0', 'Particular', 'Roberto Santos', 'roberto@despertar.local', '(11) 97654-3210', 'u-mariana', 'th-fono', 'room-2', 1, 8, 45, 'active'),
      ('Família Oliveira', 'Marina Oliveira', date '2020-05-20', 'TEA nível 2 · F84.0', 'Bradesco Saúde', 'Fernanda Oliveira', 'fernanda.oliveira@despertar.local', '(11) 96543-2109', 'u-juliana', 'th-to', 'room-3', 2, 9, 60, 'active'),
      ('Família Pereira', 'João Pereira', date '2016-01-15', 'TEA nível 1 · F84.0', 'Particular', 'Marcos Pereira', 'marcos@despertar.local', '(11) 95432-1098', 'u-ana', 'th-psi', 'room-1', 0, 11, 50, 'pending'),
      ('Família Fernandes', 'Beatriz Fernandes', date '2017-09-30', 'TEA nível 1 · F84.0', 'SulAmérica', 'Cláudia Fernandes', 'claudia@despertar.local', '(11) 94321-0987', 'u-camila', 'th-psp', 'room-4', 3, 8, 50, 'active'),
      ('Família Ramos', 'Gabriel Ramos', date '2019-02-11', 'TEA nível 2 · F84.0', 'Unimed', 'Alexandre Ramos', 'alexandre@despertar.local', '(11) 93210-9876', 'u-mariana', 'th-fono', 'room-2', 1, 10, 60, 'active'),
      ('Família Carvalho', 'Sofia Carvalho', date '2015-11-05', 'TEA nível 1 · F84.0', 'Particular', 'Patrícia Carvalho', 'patricia@despertar.local', '(11) 92109-8765', 'u-renata', 'th-psi', 'room-5', 4, 9, 75, 'active'),
      ('Família Mendes', 'Enzo Mendes', date '2021-04-18', 'TEA nível 3 · F84.0', 'Unimed', 'Tatiane Mendes', 'tatiane@despertar.local', '(11) 91098-7654', 'u-juliana', 'th-to', 'room-3', 2, 13, 45, 'active'),
      ('Família Rodrigues', 'Isabella Rodrigues', date '2013-08-22', 'TEA nível 1 · F84.0 · TDAH', 'Particular', 'Sergio Rodrigues', 'sergio@despertar.local', '(11) 90987-6543', 'u-ana', 'th-psi', 'room-1', 4, 14, 50, 'active'),
      ('Família Costa', 'Miguel Costa', date '2018-06-09', 'TEA nível 1 · F84.0', 'Bradesco Saúde', 'Viviane Costa', 'viviane@despertar.local', '(11) 99876-5432', 'u-camila', 'th-psp', 'room-4', 3, 11, 50, 'active')
    ) as t(family_name, patient_name, birth, diagnosis, insurance, guardian_name, guardian_email, guardian_phone,
           therapist_seed, therapy_seed, room_seed, weekday, start_hour, session_minutes, fam_status)
  loop
    fam_id := pg_temp.sid('fam-' || fam.family_name);
    pat_id := pg_temp.sid('pat-' || fam.patient_name);
    insert into public.families (id, name, address, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, status)
    values (fam_id, fam.family_name, 'São Paulo/SP', null, null, null, fam.fam_status::public.record_status);
    guardian_id := pg_temp.add_user('g-' || fam.guardian_email, fam.guardian_email, fam.guardian_name, 'guardian', fam.guardian_phone);
    insert into public.guardians (profile_id, family_id, relationship, is_primary) values (guardian_id, fam_id, 'Responsável', true);
    insert into public.patients (id, family_id, full_name, birth_date, diagnosis, insurance_name, status, care_started_on)
    values (pat_id, fam_id, fam.patient_name, fam.birth, fam.diagnosis, fam.insurance, fam.fam_status::public.record_status, monday - 120);
    insert into public.care_assignments (patient_id, therapist_id, therapy_id, frequency, starts_on)
    values (pat_id, pg_temp.sid(fam.therapist_seed), pg_temp.sid(fam.therapy_seed), 'Semanal', monday - 120);

    -- 6 past weeks + current + 3 upcoming
    for week in -6..3 loop
      slot_start := ((monday + week * 7 + fam.weekday)::timestamp + make_interval(hours => fam.start_hour)) at time zone 'America/Sao_Paulo';
      minutes := fam.session_minutes;
      if slot_start < now() then
        appt_status := case when week = -3 and fam.weekday = 2 then 'no_show' else 'completed' end;
        -- real duration varies a little on completed sessions
        if appt_status = 'completed' and week % 2 = 0 then minutes := minutes + 10; end if;
      else
        appt_status := case when week = 0 or week = 1 then 'confirmed' else 'scheduled' end;
      end if;
      insert into public.appointments (patient_id, therapist_id, therapy_id, room_id, starts_at, ends_at, status)
      values (pat_id, pg_temp.sid(fam.therapist_seed), pg_temp.sid(fam.therapy_seed), pg_temp.sid(fam.room_seed),
              slot_start, slot_start + make_interval(mins => minutes), appt_status);
    end loop;
  end loop;

  -- Multidisciplinary case: Lucas also does speech therapy with Mariana.
  insert into public.care_assignments (patient_id, therapist_id, therapy_id, frequency, starts_on)
  values (pg_temp.sid('pat-Lucas Silva'), pg_temp.sid('u-mariana'), pg_temp.sid('th-fono'), 'Semanal', monday - 60);
  for week in -4..3 loop
    slot_start := ((monday + week * 7 + 1)::timestamp + make_interval(hours => 14)) at time zone 'America/Sao_Paulo';
    insert into public.appointments (patient_id, therapist_id, therapy_id, room_id, starts_at, ends_at, status)
    values (pg_temp.sid('pat-Lucas Silva'), pg_temp.sid('u-mariana'), pg_temp.sid('th-fono'), pg_temp.sid('room-2'),
            slot_start, slot_start + interval '40 minutes',
            case when slot_start < now() then 'completed'::public.appointment_status else 'scheduled'::public.appointment_status end);
  end loop;

  -- Second guardian for the Silva family (father).
  guardian_id := pg_temp.add_user('g-roberto.silva', 'roberto.silva@despertar.local', 'Roberto Silva', 'guardian', '(11) 97654-3299');
  insert into public.guardians (profile_id, family_id, relationship) values (guardian_id, pg_temp.sid('fam-Família Silva'), 'Pai');
  update public.families set emergency_contact_name = 'Roberto Silva', emergency_contact_phone = '(11) 97654-3299',
    emergency_contact_relationship = 'Pai', address = 'R. das Acácias, 123 — São Paulo/SP'
  where id = pg_temp.sid('fam-Família Silva');
  update public.patients set insurance_number = '9876543', school = 'EMEF Jardim das Flores'
  where id = pg_temp.sid('pat-Lucas Silva');
end $$;

insert into public.family_internal_notes (family_id, notes) values
  (pg_temp.sid('fam-Família Silva'), 'Família muito engajada. Mãe sempre pontual. Pai participa das reuniões de devolutiva.'),
  (pg_temp.sid('fam-Família Santos'), 'Remarcação solicitada para próxima semana. Pai viajou a trabalho.'),
  (pg_temp.sid('fam-Família Pereira'), 'Cobrança em atraso. Contato realizado pela recepção.');

-- Clinical content
insert into public.session_notes (patient_id, therapist_id, session_date, content)
select pg_temp.sid('pat-Lucas Silva'), pg_temp.sid('u-ana'), current_date - 7,
  'Lucas conseguiu nomear 4 emoções com apoio visual. Boa tolerância a transições. Manter cartões de emoção.';

insert into public.treatment_plans (patient_id, therapist_id, therapy_id, is_draft, frequency, session_minutes, care_type,
  estimated_duration, chief_complaint, goals, strategies, home_guidance, materials, important_notes)
values (pg_temp.sid('pat-Lucas Silva'), pg_temp.sid('u-ana'), pg_temp.sid('th-psi'), false, '1x por semana', 50, 'Individual',
  '6 meses', 'Dificuldade de regulação emocional · F84.0',
  '• Desenvolver habilidades de autorregulação' || chr(10) || '• Ampliar repertório de nomeação emocional',
  'TCC adaptada, Terapia do Brincar, suportes visuais',
  'Nomear as emoções antes de dormir usando os cartões. Manter rotina visual da manhã.',
  'Cartões de emoções, quadro de rotina', 'Sensível a ruídos altos.');

insert into public.reports (patient_id, therapist_id, report_type, reference_label, due_date, status) values
  (pg_temp.sid('pat-Lucas Silva'), pg_temp.sid('u-ana'), 'semiannual', '2º Sem. 2026', current_date + 5, 'pending'),
  (pg_temp.sid('pat-João Pereira'), pg_temp.sid('u-ana'), 'quarterly', '3º Tri. 2026', current_date + 10, 'pending'),
  (pg_temp.sid('pat-Beatriz Fernandes'), pg_temp.sid('u-camila'), 'school', 'Setembro 2026', current_date + 2, 'pending'),
  (pg_temp.sid('pat-Gabriel Ramos'), pg_temp.sid('u-mariana'), 'semiannual', '2º Sem. 2026', current_date + 8, 'pending'),
  (pg_temp.sid('pat-Sofia Carvalho'), pg_temp.sid('u-renata'), 'quarterly', '3º Tri. 2026', current_date + 15, 'pending');

insert into public.tasks (title, assigned_to, created_by, due_date, priority, patient_id) values
  ('Enviar relatório semestral de Lucas Silva', pg_temp.sid('u-ana'), pg_temp.sid('u-coord'), current_date + 5, 'urgent', pg_temp.sid('pat-Lucas Silva')),
  ('Confirmar disponibilidade às quartas, 16h — família Fernandes solicitou', pg_temp.sid('u-camila'), pg_temp.sid('u-reception'), null, 'normal', pg_temp.sid('pat-Beatriz Fernandes')),
  ('Enviar cobranças do mês para convênio Unimed', pg_temp.sid('u-admin'), pg_temp.sid('u-coord'), current_date + 1, 'urgent', null);

insert into public.announcements (title, body, audience, created_by) values
  ('Reunião de equipe', 'Reunião de equipe na segunda-feira às 9h. Confirme sua presença.', 'staff', pg_temp.sid('u-coord')),
  ('Feriado', 'A clínica não abrirá no feriado de 02/11. As sessões serão remarcadas pela recepção.', 'all', pg_temp.sid('u-admin'));

insert into public.charges (family_id, reference, amount_cents, due_date, payment_method, status, paid_at) values
  (pg_temp.sid('fam-Família Silva'), 'Outubro/2026 — Sessões', 96000, current_date + 5, 'Pix', 'paid', now()),
  (pg_temp.sid('fam-Família Santos'), 'Outubro/2026 — Sessões', 48000, current_date + 5, 'Boleto', 'pending', null),
  (pg_temp.sid('fam-Família Oliveira'), 'Outubro/2026 — Convênio', 120000, current_date + 10, 'Convênio', 'awaiting_insurance', null),
  (pg_temp.sid('fam-Família Pereira'), 'Setembro/2026 — Sessões', 48000, current_date - 25, 'Pix', 'pending', null),
  (pg_temp.sid('fam-Família Carvalho'), 'Outubro/2026 — Sessões', 54000, current_date + 2, 'Pix', 'pending', null);

-- A conversation between Ana (therapist) and Carla (Lucas's mother).
insert into public.conversations (id, last_message_at) values (pg_temp.sid('conv-ana-carla'), now() - interval '1 day');
insert into public.conversation_participants (conversation_id, profile_id, last_read_at) values
  (pg_temp.sid('conv-ana-carla'), pg_temp.sid('u-ana'), now()),
  (pg_temp.sid('conv-ana-carla'), pg_temp.sid('g-carla@despertar.local'), now() - interval '2 days');
insert into public.messages (conversation_id, sender_id, body, created_at) values
  (pg_temp.sid('conv-ana-carla'), pg_temp.sid('u-ana'), 'Olá, Carla! O Lucas teve um avanço muito significativo nesta semana. Ele conseguiu verbalizar melhor suas emoções durante a sessão. 🌟', now() - interval '3 days'),
  (pg_temp.sid('conv-ana-carla'), pg_temp.sid('g-carla@despertar.local'), 'Que notícia maravilhosa! Em casa também temos notado mais comunicação dele.', now() - interval '3 days' + interval '20 minutes'),
  (pg_temp.sid('conv-ana-carla'), pg_temp.sid('u-ana'), 'Seria muito útil continuarem a prática de nomear as emoções antes de dormir. Tem funcionado? 😊', now() - interval '1 day');

insert into public.notifications (user_id, kind, title, body, link) values
  (pg_temp.sid('g-carla@despertar.local'), 'message', 'Nova mensagem de Ana Paula Souza', 'Seria muito útil continuarem a prática de nomear as emoções…', '/portal/messages?c=' || pg_temp.sid('conv-ana-carla')),
  (pg_temp.sid('u-ana'), 'report', 'Relatório solicitado', 'Lucas Silva (2º Sem. 2026)', '/reports'),
  (pg_temp.sid('u-admin'), 'charge', 'Cobrança em atraso', 'Família Pereira — R$ 480,00', '/finance');

-- A payout period for last month, ready for the admin to generate invoice requests.
insert into public.payout_periods (label, starts_on, ends_on, created_by)
values ('Período de teste (últimas 6 semanas)', date_trunc('week', now())::date - 42, current_date, pg_temp.sid('u-admin'));

set session_replication_role = origin;
