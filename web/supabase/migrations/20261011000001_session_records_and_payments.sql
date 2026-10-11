-- Client feedback round 1:
--   * Session records (prontuário da sessão) with photos, visible to admin,
--     coordination, linked therapists and the patient's family.
--   * Family "de acordo": guardians confirm (or dispute) that a session happened.
--   * Finance: payment receipts for family charges and for payouts; manual
--     payout requests for any team member (not only session-based therapist NFs).

-- ---------------------------------------------------------------------------
-- Session records
-- ---------------------------------------------------------------------------
drop policy session_notes_read on public.session_notes;
create policy session_notes_read on public.session_notes for select to authenticated
  using (
    public.is_manager()
    or public.is_therapist_of(patient_id)
    or public.is_guardian_of(patient_id)
  );

-- A record may be attached to the therapist's own session of that patient once
-- it has started; registering it marks the session as completed.
create or replace function public.session_notes_check_appointment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.appointment_id is not null and not exists (
    select 1 from public.appointments a
    where a.id = new.appointment_id
      and a.patient_id = new.patient_id
      and a.therapist_id = new.therapist_id
      and a.status in ('scheduled', 'confirmed', 'completed')
      and a.starts_at <= now()
  ) then
    raise exception 'O registro só pode ser feito para uma sessão sua, deste paciente, que já começou' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.session_notes_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.appointment_id is not null then
    update public.appointments set status = 'completed'
      where id = new.appointment_id and status in ('scheduled', 'confirmed');
    perform public.notify_guardians(new.patient_id, 'session_record', 'Registro da sessão disponível',
      public.patient_name(new.patient_id) || ' — confirme que a sessão de ' || to_char(new.session_date, 'DD/MM') || ' foi realizada',
      '/portal/sessions');
  end if;
  return null;
end;
$$;
create trigger session_notes_after_insert after insert on public.session_notes
  for each row execute function public.session_notes_after_insert();

create table public.session_attachments (
  id uuid primary key default gen_random_uuid(),
  session_note_id uuid not null references public.session_notes (id) on delete cascade,
  file_path text not null unique,
  file_name text not null,
  mime_type text,
  size_bytes bigint check (size_bytes >= 0 and size_bytes <= 20 * 1024 * 1024),
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index session_attachments_note_idx on public.session_attachments (session_note_id);
alter table public.session_attachments enable row level security;
revoke all on public.session_attachments from anon;

-- Visible to whoever can see the record (subquery runs under the caller's RLS).
create policy session_attachments_read on public.session_attachments for select to authenticated
  using (exists (select 1 from public.session_notes n where n.id = session_note_id));
create policy session_attachments_insert on public.session_attachments for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and public.owns_file_path(file_path)
    and exists (select 1 from public.session_notes n where n.id = session_note_id and n.therapist_id = auth.uid())
  );
create policy session_attachments_delete on public.session_attachments for delete to authenticated
  using (uploaded_by = auth.uid());

-- ---------------------------------------------------------------------------
-- Family confirmation of the session ("de acordo")
-- ---------------------------------------------------------------------------
alter table public.appointments
  add column family_confirmation text check (family_confirmation in ('confirmed', 'disputed')),
  add column family_confirmation_note text,
  add column family_confirmed_at timestamptz,
  add column family_confirmed_by uuid references public.profiles (id) on delete set null;

create or replace function public.respond_session_confirmation(target_appointment uuid, confirmed boolean, note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  appt public.appointments;
  label text;
begin
  select * into appt from public.appointments where id = target_appointment for update;
  if appt.id is null or not public.is_guardian_of(appt.patient_id) then
    raise exception 'Sem permissão para esta sessão' using errcode = '42501';
  end if;
  if appt.status <> 'completed' then
    raise exception 'Só é possível confirmar sessões registradas como realizadas' using errcode = '23514';
  end if;
  if appt.family_confirmation is not null then
    raise exception 'Esta sessão já foi respondida' using errcode = '23514';
  end if;
  if not confirmed and coalesce(length(trim(note)), 0) = 0 then
    raise exception 'Conte o que aconteceu para a clínica verificar' using errcode = '23514';
  end if;

  -- Bypass the therapist-only column guard: this is a family-owned field.
  update public.appointments
    set family_confirmation = case when confirmed then 'confirmed' else 'disputed' end,
        family_confirmation_note = nullif(trim(note), ''),
        family_confirmed_at = now(),
        family_confirmed_by = auth.uid()
    where id = appt.id;

  label := public.patient_name(appt.patient_id) || ' — ' || public.format_local(appt.starts_at);
  if confirmed then
    perform public.notify(appt.therapist_id, 'session_record', 'Família confirmou a sessão', label, '/schedule');
  else
    perform public.notify(appt.therapist_id, 'session_record', 'Família contestou a sessão', label || ': ' || trim(note), '/schedule');
    perform public.notify_roles('{admin,coordination,reception}', 'session_record', 'Família contestou a sessão',
      label || ': ' || trim(note), '/patients/' || appt.patient_id || '?tab=sessions');
  end if;
end;
$$;

-- Only the RPC above may write the confirmation columns.
create or replace function public.appointments_confirmation_guard()
returns trigger language plpgsql as $$
begin
  if (new.family_confirmation, new.family_confirmation_note, new.family_confirmed_at, new.family_confirmed_by)
     is distinct from (old.family_confirmation, old.family_confirmation_note, old.family_confirmed_at, old.family_confirmed_by)
     and current_user <> 'postgres' then
    raise exception 'A confirmação é feita pela família' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger appointments_confirmation_guard before update on public.appointments
  for each row execute function public.appointments_confirmation_guard();

-- ---------------------------------------------------------------------------
-- Finance: receipts and manual payout requests
-- ---------------------------------------------------------------------------
alter table public.charges
  add column receipt_path text,
  add column receipt_uploaded_at timestamptz,
  add column receipt_uploaded_by uuid references public.profiles (id) on delete set null;

create or replace function public.attach_charge_receipt(target_charge uuid, path text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  charge public.charges;
begin
  select * into charge from public.charges where id = target_charge for update;
  if charge.id is null or not (public.is_manager() or public.is_guardian_of_family(charge.family_id)) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if path is null or split_part(path, '/', 1) <> auth.uid()::text then
    raise exception 'Arquivo inválido' using errcode = '42501';
  end if;
  update public.charges
    set receipt_path = path, receipt_uploaded_at = now(), receipt_uploaded_by = auth.uid()
    where id = charge.id;
  if not public.is_manager() then
    perform public.notify_roles('{admin,coordination}', 'charge', 'Família enviou comprovante',
      charge.reference || ' — ' || public.format_brl(charge.amount_cents), '/finance');
  end if;
end;
$$;

-- Payee can be any team member: therapist_id now references profiles
-- (therapists.id = profiles.id, so existing rows stay valid).
alter table public.invoice_requests drop constraint invoice_requests_therapist_id_fkey;
alter table public.invoice_requests
  add constraint invoice_requests_payee_fkey foreign key (therapist_id) references public.profiles (id) on delete restrict,
  alter column period_id drop not null,
  alter column therapy_id drop not null,
  alter column sessions_count set default 0,
  alter column total_minutes set default 0,
  add column description text,
  add column created_by uuid references public.profiles (id) on delete set null,
  add column payment_receipt_path text;
comment on column public.invoice_requests.therapist_id is 'Payee: the therapist or staff member who issues the invoice.';
alter table public.invoice_requests add constraint invoice_requests_kind_check
  check ((period_id is not null and therapy_id is not null) or (period_id is null and description is not null));

create or replace function public.create_manual_invoice_request(payee uuid, amount integer, request_description text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  new_id uuid;
begin
  if not public.has_role('{admin}') then
    raise exception 'Somente o administrador solicita notas fiscais' using errcode = '42501';
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

drop function public.mark_invoice_paid(uuid);
create or replace function public.mark_invoice_paid(target_request uuid, receipt_path text default null)
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
  if receipt_path is not null and split_part(receipt_path, '/', 1) <> auth.uid()::text then
    raise exception 'Arquivo inválido' using errcode = '42501';
  end if;
  update public.invoice_requests set status = 'paid', paid_at = now(), payment_receipt_path = receipt_path where id = req.id;
  perform public.notify(req.therapist_id, 'invoice', 'Repasse realizado',
    public.format_brl(req.amount_cents) || ' — NF ' || coalesce(req.invoice_number, ''), '/invoices');
end;
$$;

create or replace function public.attach_payout_receipt(target_request uuid, path text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_role('{admin}') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if path is null or split_part(path, '/', 1) <> auth.uid()::text then
    raise exception 'Arquivo inválido' using errcode = '42501';
  end if;
  update public.invoice_requests set payment_receipt_path = path where id = target_request and status = 'paid';
  if not found then
    raise exception 'Anexe o comprovante a uma nota já paga' using errcode = '23514';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Storage: new kinds of referenced files + photos/videos for session records
-- ---------------------------------------------------------------------------
update storage.buckets set allowed_mime_types = array[
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'video/mp4', 'video/quicktime',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/xml', 'text/xml'
] where id = 'files';

drop policy files_read_if_referenced on storage.objects;
create policy files_read_if_referenced on storage.objects for select to authenticated
  using (
    bucket_id = 'files' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (select 1 from public.documents d where d.file_path = name)
      or exists (select 1 from public.reports r where r.file_path = name)
      or exists (select 1 from public.invoice_requests i where i.invoice_file_path = name or i.payment_receipt_path = name)
      or exists (select 1 from public.charges c where c.receipt_path = name)
      or exists (select 1 from public.session_attachments sa where sa.file_path = name)
    )
  );

-- ---------------------------------------------------------------------------
-- Smarter global search: every word must match (accent/case-insensitive);
-- families also match by children and guardians names; people are typed.
-- ---------------------------------------------------------------------------
drop function public.global_search(text);
create or replace function public.global_search(term text)
returns table (kind text, id uuid, title text, subtitle text)
language sql stable security invoker set search_path = '' as $$
  with words as (
    select array_agg(w) as list
    from unnest(string_to_array(extensions.unaccent(lower(trim(term))), ' ')) w
    where length(w) > 0
  ),
  families as (
    select f.id, f.name,
      string_agg(distinct p.full_name, ', ') as children,
      extensions.unaccent(lower(f.name || ' ' || coalesce(string_agg(p.full_name, ' '), '') || ' ' || coalesce(string_agg(pr.full_name, ' '), ''))) as hay
    from public.families f
    left join public.patients p on p.family_id = f.id
    left join public.guardians g on g.family_id = f.id
    left join public.profiles pr on pr.id = g.profile_id
    group by f.id, f.name
  )
  select * from (
    (select 'patient'::text, p.id, p.full_name, coalesce(f.name, '')
       from public.patients p left join public.families f on f.id = p.family_id, words
       where not exists (select 1 from unnest(words.list) w
                         where extensions.unaccent(lower(p.full_name)) not like '%' || w || '%')
       limit 8)
    union all
    (select 'family', fa.id, fa.name, coalesce('Crianças: ' || fa.children, '')
       from families fa, words
       where not exists (select 1 from unnest(words.list) w where fa.hay not like '%' || w || '%')
       limit 8)
    union all
    (select case pr.role when 'therapist' then 'therapist' when 'guardian' then 'guardian' else 'staff' end,
            case when pr.role = 'guardian' then coalesce((select g.family_id from public.guardians g where g.profile_id = pr.id limit 1), pr.id) else pr.id end,
            pr.full_name, pr.role::text
       from public.profiles pr, words
       where pr.active and not exists (select 1 from unnest(words.list) w
                                       where extensions.unaccent(lower(pr.full_name || ' ' || pr.email)) not like '%' || w || '%')
       limit 8)
    union all
    (select 'document', d.id, d.title, d.category::text
       from public.documents d, words
       where not exists (select 1 from unnest(words.list) w where extensions.unaccent(lower(d.title)) not like '%' || w || '%')
       limit 8)
    union all
    (select 'report', r.id, pt.full_name || ' — ' || r.reference_label, r.status::text
       from public.reports r join public.patients pt on pt.id = r.patient_id, words
       where not exists (select 1 from unnest(words.list) w
                         where extensions.unaccent(lower(pt.full_name || ' ' || r.reference_label)) not like '%' || w || '%')
       limit 8)
  ) results
  where (select coalesce(array_length(list, 1), 0) from words) > 0
$$;

-- ---------------------------------------------------------------------------
-- Grants for the new RPCs
-- ---------------------------------------------------------------------------
revoke execute on function public.session_notes_after_insert(), public.appointments_confirmation_guard() from authenticated, anon, public;
grant execute on function
  public.respond_session_confirmation(uuid, boolean, text),
  public.attach_charge_receipt(uuid, text),
  public.create_manual_invoice_request(uuid, integer, text),
  public.mark_invoice_paid(uuid, text),
  public.attach_payout_receipt(uuid, text),
  public.global_search(text)
to authenticated;
