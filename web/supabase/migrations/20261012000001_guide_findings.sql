-- Fixes found while writing the training guides:
--   * coordination manages the professionals' side of finance (NF requests,
--     review, payment, receipts) like the admin — never for their own NF;
--   * sessions disputed by the family stay out of NFs until a manager resolves
--     the dispute (session kept by the clinic, or canceled);
--   * coordination is told about reschedule requests, family cancellations and
--     family requests; the admin about reports awaiting review;
--   * reception is no longer told about family documents it cannot open.

-- ---------------------------------------------------------------------------
-- Dispute resolution
-- ---------------------------------------------------------------------------
alter table public.appointments drop constraint appointments_family_confirmation_check;
alter table public.appointments add constraint appointments_family_confirmation_check
  check (family_confirmation in ('confirmed', 'disputed', 'resolved'));
alter table public.appointments
  add column dispute_resolution_note text,
  add column dispute_resolved_at timestamptz,
  add column dispute_resolved_by uuid references public.profiles (id) on delete set null;

-- The resolution columns are written only by resolve_session_dispute().
create or replace function public.appointments_confirmation_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.family_confirmation, new.family_confirmation_note, new.family_confirmed_at, new.family_confirmed_by,
      new.dispute_resolution_note, new.dispute_resolved_at, new.dispute_resolved_by)
     is distinct from (old.family_confirmation, old.family_confirmation_note, old.family_confirmed_at, old.family_confirmed_by,
      old.dispute_resolution_note, old.dispute_resolved_at, old.dispute_resolved_by)
     and current_user <> 'postgres' then
    raise exception 'A confirmação é feita pela família' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- happened = true: the clinic checked and the session took place (it goes back
-- into the NF). happened = false: the session is canceled with the note as reason.
create or replace function public.resolve_session_dispute(target_appointment uuid, happened boolean, note text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  appt public.appointments;
  label text;
begin
  if not public.is_manager() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  select * into appt from public.appointments where id = target_appointment for update;
  if appt.id is null or appt.family_confirmation is distinct from 'disputed' then
    raise exception 'Esta sessão não está contestada' using errcode = '23514';
  end if;
  if coalesce(length(trim(note)), 0) < 3 then
    raise exception 'Explique como a contestação foi resolvida' using errcode = '23514';
  end if;
  if exists (select 1 from public.invoice_request_items i where i.appointment_id = appt.id) then
    raise exception 'Sessão já incluída em nota fiscal' using errcode = '23514';
  end if;

  update public.appointments
    set family_confirmation = 'resolved',
        dispute_resolution_note = trim(note),
        dispute_resolved_at = now(),
        dispute_resolved_by = auth.uid(),
        status = case when happened then status else 'canceled'::public.appointment_status end,
        cancel_reason = case when happened then cancel_reason else trim(note) end
    where id = appt.id;

  label := public.patient_name(appt.patient_id) || ' — ' || public.format_local(appt.starts_at);
  perform public.notify(appt.therapist_id, 'session_record',
    case when happened then 'Contestação resolvida: sessão mantida' else 'Contestação resolvida: sessão cancelada' end,
    label || ': ' || trim(note), '/schedule');
  perform public.notify_guardians(appt.patient_id, 'session_record',
    case when happened then 'A clínica analisou sua contestação' else 'Sessão cancelada após sua contestação' end,
    label || ': ' || trim(note), '/portal/sessions');
end;
$$;

-- ---------------------------------------------------------------------------
-- NF: disputed sessions stay out; managers (admin + coordination) run it
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.preview_invoice_items(target_period uuid)
 RETURNS TABLE(appointment_id uuid, therapist_id uuid, therapy_id uuid, session_date date, minutes integer, pay_model pay_model, rate_cents integer, amount_cents integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
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
      and a.family_confirmation is distinct from 'disputed'
      and public.local_date(a.starts_at) between period.starts_on and period.ends_on
      and not exists (select 1 from public.invoice_request_items i where i.appointment_id = a.id);
end;
$$;

CREATE OR REPLACE FUNCTION public.generate_invoice_requests(target_period uuid)
 RETURNS TABLE(therapist_id uuid, therapy_id uuid, sessions integer, amount_cents integer, missing_rate boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  period public.payout_periods;
  grp record;
  req_id uuid;
  req_status public.invoice_status;
begin
  if not public.is_manager() then
    raise exception 'Somente a administração ou a coordenação gera solicitações de nota fiscal' using errcode = '42501';
  end if;
  select * into period from public.payout_periods where id = target_period for update;
  if period.id is null or period.status <> 'open' then
    raise exception 'Período inexistente ou já fechado' using errcode = '23514';
  end if;

  drop table if exists pg_temp._items;
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

CREATE OR REPLACE FUNCTION public.review_invoice(target_request uuid, approve boolean, reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  req public.invoice_requests;
begin
  if not public.is_manager() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  select * into req from public.invoice_requests where id = target_request for update;
  if req.therapist_id = auth.uid() then
    raise exception 'Você não pode conferir a própria nota fiscal' using errcode = '42501';
  end if;
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

CREATE OR REPLACE FUNCTION public.mark_invoice_paid(target_request uuid, receipt_path text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  req public.invoice_requests;
begin
  if not public.is_manager() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  select * into req from public.invoice_requests where id = target_request for update;
  if req.therapist_id = auth.uid() then
    raise exception 'Você não pode pagar a própria nota fiscal' using errcode = '42501';
  end if;
  if req.id is null or req.status <> 'approved' then
    raise exception 'Somente notas aprovadas podem ser pagas' using errcode = '23514';
  end if;
  if receipt_path is not null and split_part(receipt_path, '/', 1) <> auth.uid()::text then
    raise exception 'Arquivo inválido' using errcode = '42501';
  end if;
  update public.invoice_requests set status = 'paid', paid_at = now(), payment_receipt_path = receipt_path where id = req.id;
  perform public.notify(req.therapist_id, 'invoice', 'Repasse realizado',
    public.format_brl(req.amount_cents) || ' — NF ' || coalesce(req.invoice_number, ''), '/invoices');
end;
$$;

CREATE OR REPLACE FUNCTION public.create_manual_invoice_request(payee uuid, amount integer, request_description text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  new_id uuid;
begin
  if not public.is_manager() then
    raise exception 'Somente a administração ou a coordenação solicita notas fiscais' using errcode = '42501';
  end if;
  if payee = auth.uid() then
    raise exception 'Você não pode solicitar nota fiscal para si mesmo' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = payee and active and role <> 'guardian') then
    raise exception 'Escolha um profissional ativo da equipe' using errcode = '23514';
  end if;
  if amount is null or amount <= 0 or coalesce(length(trim(request_description)), 0) = 0 then
    raise exception 'Informe valor e descrição' using errcode = '23514';
  end if;
  insert into public.invoice_requests (therapist_id, amount_cents, description, created_by)
  values (payee, amount, trim(request_description), auth.uid())
  returning id into new_id;
  perform public.notify(payee, 'invoice', 'Emitir nota fiscal',
    'Emita a NF de ' || public.format_brl(amount) || ' — ' || trim(request_description), '/invoices');
  return new_id;
end;
$$;

CREATE OR REPLACE FUNCTION public.attach_payout_receipt(target_request uuid, path text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
begin
  if not public.is_manager() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if path is null or split_part(path, '/', 1) <> auth.uid()::text then
    raise exception 'Arquivo inválido' using errcode = '42501';
  end if;
  update public.invoice_requests set payment_receipt_path = path where id = target_request and status = 'paid' and therapist_id <> auth.uid();
  if not found then
    raise exception 'Anexe o comprovante a uma nota já paga' using errcode = '23514';
  end if;
end;
$$;

CREATE OR REPLACE FUNCTION public.submit_invoice(target_request uuid, number text, file_path text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
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
  perform public.notify_roles('{admin,coordination}', 'invoice', 'Nota fiscal recebida',
    (select full_name from public.profiles where id = auth.uid()) || ' — NF ' || trim(number) || ' — ' || public.format_brl(req.amount_cents),
    '/finance/invoices');
end;
$$;

drop policy payout_periods_admin_write on public.payout_periods;
create policy payout_periods_manager_write on public.payout_periods for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- ---------------------------------------------------------------------------
-- Who gets told
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.request_reschedule(target_appointment uuid, proposed_start timestamp with time zone, request_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
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

  perform public.notify_roles('{admin,coordination,reception}', 'reschedule', 'Remarcação solicitada',
    public.patient_name(appt.patient_id) || ': ' || public.format_local(appt.starts_at) || ' → ' || public.format_local(proposed_start),
    '/schedule/requests');
  perform public.notify(appt.therapist_id, 'reschedule', 'Remarcação solicitada',
    public.patient_name(appt.patient_id) || ': ' || public.format_local(appt.starts_at), '/schedule');
  return new_id;
end;
$$;

CREATE OR REPLACE FUNCTION public.guardian_cancel_appointment(target_appointment uuid, cancel_reason_text text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
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
  perform public.notify_roles('{admin,coordination,reception}', 'appointment', 'Sessão cancelada pela família',
    public.patient_name(appt.patient_id) || ' em ' || public.format_local(appt.starts_at), '/schedule');
end;
$$;

CREATE OR REPLACE FUNCTION public.guardian_requests_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
begin
  if tg_op = 'INSERT' then
    perform public.notify_roles('{admin,coordination,reception}', 'request', 'Nova solicitação da família',
      left(new.message, 140), '/families/requests');
  elsif new.status = 'answered' and old.status <> 'answered' then
    perform public.notify(new.requested_by, 'request', 'Sua solicitação foi respondida',
      left(new.response, 140), '/portal/messages');
  end if;
  return null;
end;
$$;

CREATE OR REPLACE FUNCTION public.reports_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  label text := public.patient_name(new.patient_id) || ' (' || new.reference_label || ')';
begin
  if tg_op = 'INSERT' then
    perform public.notify(new.therapist_id, 'report', 'Relatório solicitado',
      label || coalesce(' — prazo ' || to_char(new.due_date, 'DD/MM/YYYY'), ''), '/reports');
  elsif new.status is distinct from old.status then
    if new.status = 'in_review' then
      perform public.notify_roles('{admin,coordination}', 'report', 'Relatório aguardando revisão', label, '/reports?tab=in_review');
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

CREATE OR REPLACE FUNCTION public.documents_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
begin
  if public.current_app_role() = 'guardian' then
    perform public.notify_roles('{admin,coordination}', 'document', 'Família enviou um documento',
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

revoke execute on function public.resolve_session_dispute(uuid, boolean, text) from public, anon;
grant execute on function public.resolve_session_dispute(uuid, boolean, text) to authenticated;
revoke execute on function public.appointments_confirmation_guard() from public, anon, authenticated;
