-- Business rules, notifications, audit and RPCs.

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger appointments_touch before update on public.appointments
  for each row execute function public.touch_updated_at();
create trigger session_notes_touch before update on public.session_notes
  for each row execute function public.touch_updated_at();
create trigger treatment_plans_touch before update on public.treatment_plans
  for each row execute function public.touch_updated_at();

create or replace function public.local_date(ts timestamptz)
returns date language sql immutable as $$
  select (ts at time zone 'America/Sao_Paulo')::date
$$;

create or replace function public.format_brl(cents integer)
returns text language sql immutable as $$
  select 'R$ ' || replace(replace(replace(to_char(cents / 100.0, 'FM999G999G990D00'), ',', '#'), '.', ','), '#', '.')
$$;

create or replace function public.format_local(ts timestamptz)
returns text language sql immutable as $$
  select to_char(ts at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI')
$$;

-- ---------------------------------------------------------------------------
-- Notifications (internal — not callable by clients)
-- ---------------------------------------------------------------------------
create or replace function public.notify(target uuid, notification_kind text, notification_title text,
  notification_body text default null, notification_link text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if target is null then return; end if;
  -- Do not notify people about what they did themselves.
  if target = auth.uid() then return; end if;
  insert into public.notifications (user_id, kind, title, body, link)
  select target, notification_kind, notification_title, notification_body, notification_link
  where exists (select 1 from public.profiles where id = target and active);
end;
$$;

create or replace function public.notify_roles(roles public.app_role[], notification_kind text,
  notification_title text, notification_body text default null, notification_link text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select id from public.profiles where role = any (roles) and active loop
    perform public.notify(r.id, notification_kind, notification_title, notification_body, notification_link);
  end loop;
end;
$$;

create or replace function public.notify_guardians(target_patient uuid, notification_kind text,
  notification_title text, notification_body text default null, notification_link text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in
    select g.profile_id from public.guardians g
    join public.patients p on p.family_id = g.family_id
    where p.id = target_patient
  loop
    perform public.notify(r.profile_id, notification_kind, notification_title, notification_body, notification_link);
  end loop;
end;
$$;

create or replace function public.notify_family(target_family uuid, notification_kind text,
  notification_title text, notification_body text default null, notification_link text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select profile_id from public.guardians where family_id = target_family loop
    perform public.notify(r.profile_id, notification_kind, notification_title, notification_body, notification_link);
  end loop;
end;
$$;

create or replace function public.patient_name(target_patient uuid)
returns text language sql stable security definer set search_path = '' as $$
  select full_name from public.patients where id = target_patient
$$;

create or replace function public.therapy_name(target_therapy uuid)
returns text language sql stable security definer set search_path = '' as $$
  select name from public.therapies where id = target_therapy
$$;

-- ---------------------------------------------------------------------------
-- Appointments
-- ---------------------------------------------------------------------------
create or replace function public.appointments_validate()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  actor_role public.app_role := public.current_app_role();
begin
  -- Therapists can only confirm/complete/no-show their own sessions and adjust
  -- the real end time; they cannot move, reassign or cancel sessions.
  if tg_op = 'UPDATE' and actor_role = 'therapist' then
    if new.patient_id is distinct from old.patient_id
       or new.therapist_id is distinct from old.therapist_id
       or new.therapy_id is distinct from old.therapy_id
       or new.room_id is distinct from old.room_id
       or new.starts_at is distinct from old.starts_at then
      raise exception 'Terapeutas não podem mover ou reatribuir sessões' using errcode = '42501';
    end if;
    if new.status is distinct from old.status
       and new.status not in ('confirmed', 'completed', 'no_show') then
      raise exception 'Status não permitido para terapeuta' using errcode = '42501';
    end if;
    if new.ends_at is distinct from old.ends_at and new.status <> 'completed' then
      raise exception 'A duração real só pode ser ajustada ao concluir a sessão' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'UPDATE' and old.status = 'completed' and actor_role is not null
     and actor_role <> 'admin'
     and exists (select 1 from public.invoice_request_items where appointment_id = old.id) then
    raise exception 'Sessão já incluída em nota fiscal não pode ser alterada' using errcode = '42501';
  end if;

  if tg_op = 'INSERT'
     or new.patient_id is distinct from old.patient_id
     or new.therapist_id is distinct from old.therapist_id
     or new.therapy_id is distinct from old.therapy_id
     or new.starts_at is distinct from old.starts_at then
    if not exists (
      select 1 from public.care_assignments ca
      where ca.patient_id = new.patient_id
        and ca.therapist_id = new.therapist_id
        and ca.therapy_id = new.therapy_id
        and ca.starts_on <= public.local_date(new.starts_at)
        and (ca.ends_on is null or ca.ends_on >= public.local_date(new.starts_at))
    ) then
      raise exception 'Terapeuta não está vinculado a este paciente nesta terapia na data da sessão'
        using errcode = '23514';
    end if;
  end if;

  if new.status = 'canceled' and (tg_op = 'INSERT' or old.status <> 'canceled') and new.cancel_reason is null then
    new.cancel_reason := 'Não informado';
  end if;

  return new;
end;
$$;

create trigger appointments_validate before insert or update on public.appointments
  for each row execute function public.appointments_validate();

create or replace function public.appointments_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  label text := public.patient_name(new.patient_id) || ' — ' || public.therapy_name(new.therapy_id);
begin
  if tg_op = 'INSERT' then
    perform public.notify(new.therapist_id, 'appointment', 'Nova sessão agendada',
      label || ' em ' || public.format_local(new.starts_at), '/schedule');
    perform public.notify_guardians(new.patient_id, 'appointment', 'Nova sessão agendada',
      label || ' em ' || public.format_local(new.starts_at), '/portal/sessions');
  elsif new.starts_at is distinct from old.starts_at then
    perform public.notify(new.therapist_id, 'appointment', 'Sessão remarcada',
      label || ': ' || public.format_local(old.starts_at) || ' → ' || public.format_local(new.starts_at), '/schedule');
    perform public.notify_guardians(new.patient_id, 'appointment', 'Sessão remarcada',
      label || ': ' || public.format_local(old.starts_at) || ' → ' || public.format_local(new.starts_at), '/portal/sessions');
  elsif new.status = 'canceled' and old.status <> 'canceled' then
    perform public.notify(new.therapist_id, 'appointment', 'Sessão cancelada',
      label || ' em ' || public.format_local(new.starts_at), '/schedule');
    perform public.notify_guardians(new.patient_id, 'appointment', 'Sessão cancelada',
      label || ' em ' || public.format_local(new.starts_at), '/portal/sessions');
  end if;
  return null;
end;
$$;

create trigger appointments_notify after insert or update on public.appointments
  for each row execute function public.appointments_notify();

-- Guardian (or staff) asks to move a session. Guardians must respect the
-- clinic's minimum notice (24h by default).
create or replace function public.request_reschedule(target_appointment uuid, proposed_start timestamptz, request_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  appt public.appointments;
  min_hours integer;
  new_id uuid;
begin
  select * into appt from public.appointments where id = target_appointment;
  if appt.id is null then
    raise exception 'Sessão não encontrada' using errcode = 'P0002';
  end if;
  if not (public.is_staff() or public.is_guardian_of(appt.patient_id)) then
    raise exception 'Sem permissão para esta sessão' using errcode = '42501';
  end if;
  if appt.status not in ('scheduled', 'confirmed') then
    raise exception 'Somente sessões agendadas podem ser remarcadas' using errcode = '23514';
  end if;

  select reschedule_min_hours into min_hours from public.clinic_settings where id = 1;
  if not public.is_staff() and appt.starts_at - now() < make_interval(hours => min_hours) then
    raise exception 'Remarcações devem ser solicitadas com pelo menos % horas de antecedência', min_hours
      using errcode = '23514';
  end if;
  if proposed_start <= now() then
    raise exception 'A nova data precisa estar no futuro' using errcode = '23514';
  end if;
  if coalesce(length(trim(request_reason)), 0) = 0 then
    raise exception 'Informe o motivo' using errcode = '23514';
  end if;

  insert into public.reschedule_requests (appointment_id, requested_by, proposed_starts_at, reason)
  values (appt.id, auth.uid(), proposed_start, request_reason)
  returning id into new_id;

  perform public.notify_roles('{admin,reception}', 'reschedule', 'Remarcação solicitada',
    public.patient_name(appt.patient_id) || ': ' || public.format_local(appt.starts_at) || ' → ' || public.format_local(proposed_start),
    '/schedule/requests');
  perform public.notify(appt.therapist_id, 'reschedule', 'Remarcação solicitada',
    public.patient_name(appt.patient_id) || ': ' || public.format_local(appt.starts_at), '/schedule');
  return new_id;
end;
$$;

create or replace function public.decide_reschedule(target_request uuid, approve boolean, note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  req public.reschedule_requests;
  appt public.appointments;
begin
  if not public.is_staff() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  select * into req from public.reschedule_requests where id = target_request for update;
  if req.id is null or req.status <> 'pending' then
    raise exception 'Solicitação não está pendente' using errcode = '23514';
  end if;
  select * into appt from public.appointments where id = req.appointment_id;

  if approve then
    update public.appointments
      set starts_at = req.proposed_starts_at,
          ends_at = req.proposed_starts_at + (appt.ends_at - appt.starts_at),
          status = 'scheduled'
      where id = appt.id;
  end if;

  update public.reschedule_requests
    set status = case when approve then 'approved'::public.request_status else 'rejected'::public.request_status end,
        decided_by = auth.uid(), decided_at = now(), decision_note = note
    where id = req.id;

  perform public.notify(req.requested_by, 'reschedule',
    case when approve then 'Remarcação aprovada' else 'Remarcação recusada' end,
    public.patient_name(appt.patient_id) || coalesce(' — ' || note, ''), '/portal/sessions');
end;
$$;

create or replace function public.guardian_cancel_appointment(target_appointment uuid, cancel_reason_text text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  appt public.appointments;
  min_hours integer;
begin
  select * into appt from public.appointments where id = target_appointment for update;
  if appt.id is null or not public.is_guardian_of(appt.patient_id) then
    raise exception 'Sem permissão para esta sessão' using errcode = '42501';
  end if;
  if appt.status not in ('scheduled', 'confirmed') then
    raise exception 'Esta sessão não pode mais ser cancelada' using errcode = '23514';
  end if;
  select reschedule_min_hours into min_hours from public.clinic_settings where id = 1;
  if appt.starts_at - now() < make_interval(hours => min_hours) then
    raise exception 'Cancelamentos devem ser feitos com pelo menos % horas de antecedência. Entre em contato com a clínica.', min_hours
      using errcode = '23514';
  end if;
  update public.appointments
    set status = 'canceled', cancel_reason = coalesce(nullif(trim(cancel_reason_text), ''), 'Cancelado pela família')
    where id = appt.id;
  perform public.notify_roles('{admin,reception}', 'appointment', 'Sessão cancelada pela família',
    public.patient_name(appt.patient_id) || ' em ' || public.format_local(appt.starts_at), '/schedule');
end;
$$;

-- ---------------------------------------------------------------------------
-- Reports workflow: pending → in_review → approved | returned → in_review …
-- ---------------------------------------------------------------------------
create or replace function public.reports_validate()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  manager boolean := public.is_manager();
begin
  if auth.uid() is null then
    return new; -- service role / seeds
  end if;

  if tg_op = 'INSERT' then
    if not manager then
      new.status := 'pending';
    end if;
    new.created_by := auth.uid();
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'in_review' then
      if old.status not in ('pending', 'returned') then
        raise exception 'Relatório não pode ser enviado neste status' using errcode = '23514';
      end if;
      if new.file_path is null then
        raise exception 'Anexe o arquivo do relatório antes de enviar' using errcode = '23514';
      end if;
      if not manager and old.therapist_id <> auth.uid() then
        raise exception 'Sem permissão' using errcode = '42501';
      end if;
      new.submitted_at := now();
    elsif new.status in ('approved', 'returned') then
      if not manager then
        raise exception 'Somente a coordenação aprova ou devolve relatórios' using errcode = '42501';
      end if;
      if old.status <> 'in_review' then
        raise exception 'Somente relatórios em revisão podem ser aprovados ou devolvidos' using errcode = '23514';
      end if;
      if new.status = 'returned' and coalesce(length(trim(new.return_reason)), 0) = 0 then
        raise exception 'Informe o motivo da devolução' using errcode = '23514';
      end if;
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
    else
      raise exception 'Transição de status inválida' using errcode = '23514';
    end if;
  elsif not manager and old.status in ('in_review', 'approved') then
    raise exception 'Relatório em revisão ou aprovado não pode ser alterado' using errcode = '42501';
  end if;

  if not manager then
    new.patient_id := old.patient_id;
    new.therapist_id := old.therapist_id;
  end if;
  return new;
end;
$$;

create trigger reports_validate before insert or update on public.reports
  for each row execute function public.reports_validate();

create or replace function public.reports_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  label text := public.patient_name(new.patient_id) || ' (' || new.reference_label || ')';
begin
  if tg_op = 'INSERT' then
    perform public.notify(new.therapist_id, 'report', 'Relatório solicitado',
      label || coalesce(' — prazo ' || to_char(new.due_date, 'DD/MM/YYYY'), ''), '/reports');
  elsif new.status is distinct from old.status then
    if new.status = 'in_review' then
      perform public.notify_roles('{coordination}', 'report', 'Relatório aguardando revisão', label, '/reports?tab=in_review');
    elsif new.status = 'approved' then
      perform public.notify(new.therapist_id, 'report', 'Relatório aprovado', label, '/reports');
      perform public.notify_guardians(new.patient_id, 'report', 'Novo relatório disponível', label, '/portal/documents');
    elsif new.status = 'returned' then
      perform public.notify(new.therapist_id, 'report', 'Relatório devolvido para correção',
        label || ': ' || new.return_reason, '/reports');
    end if;
  end if;
  return null;
end;
$$;

create trigger reports_notify after insert or update on public.reports
  for each row execute function public.reports_notify();

-- ---------------------------------------------------------------------------
-- Documents & signatures
-- ---------------------------------------------------------------------------
create or replace function public.documents_prepare()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.patient_id is not null then
    select family_id into new.family_id from public.patients where id = new.patient_id;
  end if;
  if public.current_app_role() = 'guardian' then
    new.status := 'under_review';
    new.visible_to_family := true;
  end if;
  return new;
end;
$$;

create trigger documents_prepare before insert on public.documents
  for each row execute function public.documents_prepare();

create or replace function public.documents_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.current_app_role() = 'guardian' then
    perform public.notify_roles('{admin,coordination,reception}', 'document', 'Família enviou um documento',
      new.title, '/documents');
    if new.patient_id is not null then
      perform public.notify(ca.therapist_id, 'document', 'Família enviou um documento', new.title, '/documents')
      from public.care_assignments ca
      where ca.patient_id = new.patient_id and public.is_assignment_active(ca.starts_on, ca.ends_on);
    end if;
  elsif new.visible_to_family and new.family_id is not null then
    perform public.notify_family(new.family_id, 'document', 'Novo documento disponível', new.title, '/portal/documents');
  end if;
  return null;
end;
$$;

create trigger documents_notify after insert on public.documents
  for each row execute function public.documents_notify();

create or replace function public.signature_requests_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  doc_title text;
  signer_role public.app_role;
begin
  select title into doc_title from public.documents where id = new.document_id;
  select role into signer_role from public.profiles where id = new.signer_id;
  perform public.notify(new.signer_id, 'signature', 'Documento aguardando sua assinatura', doc_title,
    case when signer_role = 'guardian' then '/portal/documents' else '/documents/signatures' end);
  return null;
end;
$$;

create trigger signature_requests_notify after insert on public.signature_requests
  for each row execute function public.signature_requests_notify();

create or replace function public.sign_document(target_request uuid, client_ip text, client_user_agent text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  req public.signature_requests;
  doc_title text;
begin
  select * into req from public.signature_requests where id = target_request for update;
  if req.id is null or req.signer_id <> auth.uid() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if req.status <> 'pending' then
    raise exception 'Documento já assinado ou cancelado' using errcode = '23514';
  end if;
  update public.signature_requests
    set status = 'signed', signed_at = now(), signer_ip = left(client_ip, 64), signer_user_agent = left(client_user_agent, 300)
    where id = req.id;
  select title into doc_title from public.documents where id = req.document_id;
  perform public.notify(req.requested_by, 'signature', 'Documento assinado',
    doc_title || ' — ' || (select full_name from public.profiles where id = auth.uid()), '/documents/signatures');
end;
$$;

-- ---------------------------------------------------------------------------
-- Messaging
-- ---------------------------------------------------------------------------
create or replace function public.start_conversation(other_profile uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  existing uuid;
begin
  if not public.can_message(auth.uid(), other_profile) then
    raise exception 'Você não tem permissão para conversar com esta pessoa' using errcode = '42501';
  end if;

  select cp1.conversation_id into existing
  from public.conversation_participants cp1
  join public.conversation_participants cp2 on cp2.conversation_id = cp1.conversation_id
  where cp1.profile_id = auth.uid() and cp2.profile_id = other_profile
    and (select count(*) from public.conversation_participants c where c.conversation_id = cp1.conversation_id) = 2
  limit 1;

  if existing is not null then
    return existing;
  end if;

  insert into public.conversations default values returning id into existing;
  insert into public.conversation_participants (conversation_id, profile_id, last_read_at)
  values (existing, auth.uid(), now()), (existing, other_profile, null);
  return existing;
end;
$$;

create or replace function public.messages_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  sender_name text;
  r record;
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  update public.conversation_participants set last_read_at = new.created_at
    where conversation_id = new.conversation_id and profile_id = new.sender_id;
  select full_name into sender_name from public.profiles where id = new.sender_id;

  for r in
    select cp.profile_id, p.role from public.conversation_participants cp
    join public.profiles p on p.id = cp.profile_id
    where cp.conversation_id = new.conversation_id and cp.profile_id <> new.sender_id
  loop
    -- Collapse unread message notifications per conversation into one.
    update public.notifications
      set body = left(new.body, 140), created_at = now(), title = 'Nova mensagem de ' || sender_name
      where user_id = r.profile_id and kind = 'message' and read_at is null
        and link like '%' || new.conversation_id::text;
    if not found then
      perform public.notify(r.profile_id, 'message', 'Nova mensagem de ' || sender_name, left(new.body, 140),
        case when r.role = 'guardian' then '/portal/messages?c=' else '/messages?c=' end || new.conversation_id::text);
    end if;
  end loop;
  return null;
end;
$$;

create trigger messages_after_insert after insert on public.messages
  for each row execute function public.messages_after_insert();

create or replace function public.announcements_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.audience in ('all', 'staff') then
    perform public.notify_roles('{admin,coordination,reception,therapist}', 'announcement', new.title, left(new.body, 140), '/dashboard');
  end if;
  if new.audience in ('all', 'guardians') then
    perform public.notify_roles('{guardian}', 'announcement', new.title, left(new.body, 140), '/portal');
  end if;
  return null;
end;
$$;

create trigger announcements_notify after insert on public.announcements
  for each row execute function public.announcements_notify();

create or replace function public.guardian_requests_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify_roles('{admin,reception}', 'request', 'Nova solicitação da família',
      left(new.message, 140), '/families/requests');
  elsif new.status = 'answered' and old.status <> 'answered' then
    perform public.notify(new.requested_by, 'request', 'Sua solicitação foi respondida',
      left(new.response, 140), '/portal/messages');
  end if;
  return null;
end;
$$;

create trigger guardian_requests_notify after insert or update on public.guardian_requests
  for each row execute function public.guardian_requests_notify();

create or replace function public.guardian_requests_stamp()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'answered' and old.status <> 'answered' then
    new.responded_by := auth.uid();
    new.responded_at := now();
  end if;
  return new;
end;
$$;

create trigger guardian_requests_stamp before update on public.guardian_requests
  for each row execute function public.guardian_requests_stamp();

create or replace function public.tasks_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify(new.assigned_to, 'task',
      case when new.priority = 'urgent' then 'Nova tarefa urgente' else 'Nova tarefa' end,
      new.title, '/tasks');
  elsif new.status = 'done' and old.status <> 'done' then
    perform public.notify(new.created_by, 'task', 'Tarefa concluída', new.title, '/tasks');
  end if;
  return null;
end;
$$;

create trigger tasks_notify after insert or update on public.tasks
  for each row execute function public.tasks_notify();

create or replace function public.tasks_stamp()
returns trigger language plpgsql as $$
begin
  if new.status = 'done' and old.status <> 'done' then
    new.completed_at := now();
  elsif new.status = 'open' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger tasks_stamp before update on public.tasks
  for each row execute function public.tasks_stamp();

create or replace function public.care_assignments_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.notify(new.therapist_id, 'assignment', 'Novo paciente vinculado',
    public.patient_name(new.patient_id) || ' — ' || public.therapy_name(new.therapy_id), '/patients/' || new.patient_id);
  return null;
end;
$$;

create trigger care_assignments_notify after insert on public.care_assignments
  for each row execute function public.care_assignments_notify();

create or replace function public.charges_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.notify_family(new.family_id, 'charge', 'Nova cobrança',
    new.reference || ' — ' || public.format_brl(new.amount_cents) || ' — vence ' || to_char(new.due_date, 'DD/MM/YYYY'),
    '/portal/finance');
  return null;
end;
$$;

create trigger charges_notify after insert on public.charges
  for each row execute function public.charges_notify();

-- ---------------------------------------------------------------------------
-- Therapist invoices (NF)
-- ---------------------------------------------------------------------------
-- per_session: fixed rate regardless of length.
-- per_hour: proportional to the real duration in minutes, rounded to the cent.
create or replace function public.compute_session_amount(model public.pay_model, rate_cents integer, minutes integer)
returns integer language sql immutable as $$
  select case model
    when 'per_session' then rate_cents
    when 'per_hour' then round(rate_cents::numeric * minutes / 60)::integer
  end
$$;

create or replace function public.rate_for(target_therapist uuid, target_therapy uuid, on_date date)
returns public.therapist_rates language sql stable security definer set search_path = '' as $$
  select * from public.therapist_rates
  where therapist_id = target_therapist and therapy_id = target_therapy and valid_from <= on_date
  order by valid_from desc
  limit 1
$$;

-- Completed sessions in the period not yet billed, with the amount each one is worth.
create or replace function public.preview_invoice_items(target_period uuid)
returns table (
  appointment_id uuid, therapist_id uuid, therapy_id uuid, session_date date,
  minutes integer, pay_model public.pay_model, rate_cents integer, amount_cents integer
)
language plpgsql stable security definer set search_path = '' as $$
declare
  period public.payout_periods;
begin
  if not public.is_manager() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  select * into period from public.payout_periods where id = target_period;
  return query
    select a.id, a.therapist_id, a.therapy_id, public.local_date(a.starts_at),
           (extract(epoch from (a.ends_at - a.starts_at)) / 60)::integer,
           r.pay_model, r.amount_cents,
           case when r.id is null then null
                else public.compute_session_amount(r.pay_model, r.amount_cents,
                       (extract(epoch from (a.ends_at - a.starts_at)) / 60)::integer) end
    from public.appointments a
    left join lateral (select * from public.rate_for(a.therapist_id, a.therapy_id, public.local_date(a.starts_at))) r on true
    where a.status = 'completed'
      and public.local_date(a.starts_at) between period.starts_on and period.ends_on
      and not exists (select 1 from public.invoice_request_items i where i.appointment_id = a.id);
end;
$$;

-- Creates (or tops up, while still 'requested') one invoice request per
-- therapist × therapy and notifies each therapist of the amount to invoice.
-- Sessions without a configured rate are left out and reported back.
create or replace function public.generate_invoice_requests(target_period uuid)
returns table (therapist_id uuid, therapy_id uuid, sessions integer, amount_cents integer, missing_rate boolean)
language plpgsql security definer set search_path = '' as $$
declare
  period public.payout_periods;
  grp record;
  req_id uuid;
  req_status public.invoice_status;
begin
  if not public.has_role('{admin}') then
    raise exception 'Somente o administrador gera solicitações de nota fiscal' using errcode = '42501';
  end if;
  select * into period from public.payout_periods where id = target_period for update;
  if period.id is null or period.status <> 'open' then
    raise exception 'Período inexistente ou já fechado' using errcode = '23514';
  end if;

  create temp table _items on commit drop as
    select * from public.preview_invoice_items(target_period);

  for grp in
    select i.therapist_id, i.therapy_id, count(*)::integer as n, sum(i.minutes)::integer as total_minutes,
           sum(i.amount_cents)::integer as total, bool_or(i.amount_cents is null) as has_missing
    from _items i group by i.therapist_id, i.therapy_id
  loop
    if grp.has_missing then
      therapist_id := grp.therapist_id; therapy_id := grp.therapy_id;
      sessions := grp.n; amount_cents := null; missing_rate := true;
      return next;
      continue;
    end if;

    select ir.id, ir.status into req_id, req_status from public.invoice_requests ir
      where ir.period_id = target_period and ir.therapist_id = grp.therapist_id and ir.therapy_id = grp.therapy_id;

    if req_id is not null and req_status <> 'requested' then
      continue; -- already submitted; late sessions roll into the next period
    end if;

    if req_id is null then
      insert into public.invoice_requests (period_id, therapist_id, therapy_id, sessions_count, total_minutes, amount_cents)
      values (target_period, grp.therapist_id, grp.therapy_id, 0, 0, 0)
      returning id into req_id;
    end if;

    insert into public.invoice_request_items (invoice_request_id, appointment_id, pay_model, rate_cents, minutes, amount_cents)
    select req_id, i.appointment_id, i.pay_model, i.rate_cents, i.minutes, i.amount_cents
    from _items i where i.therapist_id = grp.therapist_id and i.therapy_id = grp.therapy_id;

    update public.invoice_requests ir set
      sessions_count = s.n, total_minutes = s.m, amount_cents = s.total
    from (select count(*)::integer n, sum(minutes)::integer m, sum(it.amount_cents)::integer total
          from public.invoice_request_items it where it.invoice_request_id = req_id) s
    where ir.id = req_id;

    perform public.notify(grp.therapist_id, 'invoice', 'Emitir nota fiscal',
      'Emita a NF de ' || public.format_brl((select ir.amount_cents from public.invoice_requests ir where ir.id = req_id))
      || ' referente a ' || public.therapy_name(grp.therapy_id) || ' — ' || period.label,
      '/invoices');

    therapist_id := grp.therapist_id; therapy_id := grp.therapy_id;
    sessions := (select ir.sessions_count from public.invoice_requests ir where ir.id = req_id);
    amount_cents := (select ir.amount_cents from public.invoice_requests ir where ir.id = req_id);
    missing_rate := false;
    return next;
  end loop;
end;
$$;

create or replace function public.submit_invoice(target_request uuid, number text, file_path text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  req public.invoice_requests;
begin
  select * into req from public.invoice_requests where id = target_request for update;
  if req.id is null or req.therapist_id <> auth.uid() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if req.status not in ('requested', 'rejected') then
    raise exception 'Esta nota já foi enviada' using errcode = '23514';
  end if;
  if coalesce(length(trim(number)), 0) = 0 or file_path is null then
    raise exception 'Informe o número da NF e anexe o arquivo' using errcode = '23514';
  end if;
  if split_part(file_path, '/', 1) <> auth.uid()::text then
    raise exception 'Arquivo inválido' using errcode = '42501';
  end if;
  update public.invoice_requests
    set status = 'submitted', invoice_number = trim(number), invoice_file_path = file_path,
        submitted_at = now(), rejection_reason = null
    where id = req.id;
  perform public.notify_roles('{admin}', 'invoice', 'Nota fiscal recebida',
    (select full_name from public.profiles where id = auth.uid()) || ' — NF ' || trim(number) || ' — ' || public.format_brl(req.amount_cents),
    '/finance/invoices');
end;
$$;

create or replace function public.review_invoice(target_request uuid, approve boolean, reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  req public.invoice_requests;
begin
  if not public.has_role('{admin}') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  select * into req from public.invoice_requests where id = target_request for update;
  if req.id is null or req.status <> 'submitted' then
    raise exception 'Nota não está aguardando conferência' using errcode = '23514';
  end if;
  if not approve and coalesce(length(trim(reason)), 0) = 0 then
    raise exception 'Informe o motivo da recusa' using errcode = '23514';
  end if;
  update public.invoice_requests
    set status = case when approve then 'approved'::public.invoice_status else 'rejected'::public.invoice_status end,
        reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = case when approve then null else reason end
    where id = req.id;
  perform public.notify(req.therapist_id, 'invoice',
    case when approve then 'Nota fiscal aprovada' else 'Nota fiscal recusada' end,
    case when approve then 'Pagamento de ' || public.format_brl(req.amount_cents) || ' será processado'
         else reason end, '/invoices');
end;
$$;

create or replace function public.mark_invoice_paid(target_request uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  req public.invoice_requests;
begin
  if not public.has_role('{admin}') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  select * into req from public.invoice_requests where id = target_request for update;
  if req.id is null or req.status <> 'approved' then
    raise exception 'Somente notas aprovadas podem ser pagas' using errcode = '23514';
  end if;
  update public.invoice_requests set status = 'paid', paid_at = now() where id = req.id;
  perform public.notify(req.therapist_id, 'invoice', 'Repasse realizado',
    public.format_brl(req.amount_cents) || ' — NF ' || req.invoice_number, '/invoices');
end;
$$;

-- ---------------------------------------------------------------------------
-- Guardian-facing reads that must not expose clinical columns
-- ---------------------------------------------------------------------------
create or replace function public.get_family_guidance(target_patient uuid)
returns table (therapist_name text, therapy text, home_guidance text, materials text, updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_guardian_of(target_patient) or public.is_therapist_of(target_patient) or public.has_role('{coordination}')) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  return query
    select pr.full_name, t.name, tp.home_guidance, tp.materials, tp.updated_at
    from public.treatment_plans tp
    join public.profiles pr on pr.id = tp.therapist_id
    join public.therapies t on t.id = tp.therapy_id
    where tp.patient_id = target_patient and not tp.is_draft
      and (tp.home_guidance is not null or tp.materials is not null)
    order by tp.updated_at desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- Global search — SECURITY INVOKER, so RLS decides what each user finds.
-- ---------------------------------------------------------------------------
create or replace function public.global_search(term text)
returns table (kind text, id uuid, title text, subtitle text)
language sql stable security invoker set search_path = '' as $$
  with q as (select '%' || extensions.unaccent(lower(trim(term))) || '%' as pattern)
  (select 'patient', p.id, p.full_name, coalesce(p.diagnosis, '')
     from public.patients p, q where extensions.unaccent(lower(p.full_name)) like q.pattern limit 8)
  union all
  (select 'family', f.id, f.name, coalesce(f.status::text, '')
     from public.families f, q where extensions.unaccent(lower(f.name)) like q.pattern limit 8)
  union all
  (select 'document', d.id, d.title, d.category::text
     from public.documents d, q where extensions.unaccent(lower(d.title)) like q.pattern limit 8)
  union all
  (select 'report', r.id, pt.full_name || ' — ' || r.reference_label, r.status::text
     from public.reports r join public.patients pt on pt.id = r.patient_id, q
     where extensions.unaccent(lower(pt.full_name || ' ' || r.reference_label)) like q.pattern limit 8)
  union all
  (select 'person', pr.id, pr.full_name, pr.role::text
     from public.profiles pr, q where pr.active and extensions.unaccent(lower(pr.full_name)) like q.pattern limit 8)
$$;

-- ---------------------------------------------------------------------------
-- Audit (LGPD): writes on sensitive tables + explicit reads of clinical records
-- ---------------------------------------------------------------------------
create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  cols text[];
  row_id text;
begin
  if tg_op = 'UPDATE' then
    select array_agg(n.key) into cols
    from jsonb_each(to_jsonb(new)) n
    join jsonb_each(to_jsonb(old)) o on o.key = n.key
    where n.value is distinct from o.value;
  end if;
  row_id := coalesce(to_jsonb(coalesce(new, old)) ->> 'id', to_jsonb(coalesce(new, old)) ->> 'profile_id');
  insert into public.audit_log (actor_id, action, entity, entity_id, changed_columns)
  values (auth.uid(), lower(tg_op), tg_table_name, row_id, cols);
  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['profiles', 'patients', 'guardians', 'care_assignments', 'session_notes',
    'treatment_plans', 'reports', 'documents', 'signature_requests', 'therapist_rates',
    'invoice_requests', 'charges', 'families']
  loop
    execute format('create trigger %I after insert or update or delete on public.%I
      for each row execute function public.audit_row_change()', t || '_audit', t);
  end loop;
end $$;

create or replace function public.log_record_access(target_patient uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (public.is_therapist_of(target_patient) or public.has_role('{coordination}')) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  insert into public.audit_log (actor_id, action, entity, entity_id)
  values (auth.uid(), 'view', 'clinical_record', target_patient::text);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: internal helpers stay private; RPCs are callable by signed-in users
-- (each one checks the caller's role itself).
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;

grant execute on function
  public.current_app_role(), public.has_role(public.app_role[]), public.is_staff(), public.is_manager(),
  public.is_assignment_active(date, date), public.is_therapist_of(uuid, uuid), public.is_therapist_of_family(uuid, uuid),
  public.is_guardian_of_family(uuid, uuid), public.is_guardian_of(uuid, uuid), public.can_message(uuid, uuid),
  public.can_see_profile(uuid), public.is_participant(uuid),
  public.local_date(timestamptz), public.format_brl(integer), public.compute_session_amount(public.pay_model, integer, integer),
  public.request_reschedule(uuid, timestamptz, text), public.decide_reschedule(uuid, boolean, text),
  public.guardian_cancel_appointment(uuid, text), public.sign_document(uuid, text, text),
  public.start_conversation(uuid), public.preview_invoice_items(uuid), public.generate_invoice_requests(uuid),
  public.submit_invoice(uuid, text, text), public.review_invoice(uuid, boolean, text), public.mark_invoice_paid(uuid),
  public.get_family_guidance(uuid), public.global_search(text), public.log_record_access(uuid)
to authenticated;

-- Realtime for chat and notifications (RLS applies to realtime too).
alter publication supabase_realtime add table public.messages, public.notifications;
