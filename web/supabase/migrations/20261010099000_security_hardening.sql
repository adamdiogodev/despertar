-- Security hardening after the security/LGPD review.

-- ---------------------------------------------------------------------------
-- 1. Internal SECURITY DEFINER functions must not be callable through /rpc.
--    Supabase grants EXECUTE to authenticated directly, so revoking from
--    PUBLIC was not enough. Revoke everything, then re-grant the allow-list.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from authenticated;
alter default privileges in schema public revoke execute on functions from authenticated;

grant execute on function
  -- used inside RLS policies (evaluated with the caller's privileges)
  public.current_app_role(), public.has_role(public.app_role[]), public.is_staff(), public.is_manager(),
  public.is_assignment_active(date, date),
  public.is_therapist_of(uuid, uuid), public.is_therapist_of_family(uuid, uuid),
  public.is_guardian_of(uuid, uuid), public.is_guardian_of_family(uuid, uuid),
  public.can_message(uuid, uuid), public.can_see_profile(uuid), public.is_participant(uuid),
  -- pure helpers
  public.local_date(timestamptz), public.format_brl(integer), public.compute_session_amount(public.pay_model, integer, integer),
  -- RPCs (each checks the caller's role itself)
  public.request_reschedule(uuid, timestamptz, text), public.decide_reschedule(uuid, boolean, text),
  public.guardian_cancel_appointment(uuid, text), public.sign_document(uuid, text, text),
  public.start_conversation(uuid), public.list_message_contacts(), public.list_my_conversations(),
  public.preview_invoice_items(uuid), public.generate_invoice_requests(uuid),
  public.submit_invoice(uuid, text, text), public.review_invoice(uuid, boolean, text), public.mark_invoice_paid(uuid),
  public.get_family_guidance(uuid), public.global_search(text), public.log_record_access(uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Relationship helpers: the second argument let anyone ask "does therapist X
--    treat child Y?" (health data about minors). Callers may now only ask about
--    themselves, unless they already have a legitimate view of that patient.
-- ---------------------------------------------------------------------------
create or replace function public.is_therapist_of(target_patient uuid, therapist uuid default auth.uid())
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if therapist is distinct from auth.uid()
     and not public.is_staff()
     and not exists (select 1 from public.care_assignments ca
                     where ca.patient_id = target_patient and ca.therapist_id = auth.uid()
                       and ca.starts_on <= current_date and (ca.ends_on is null or ca.ends_on >= current_date))
     and not exists (select 1 from public.patients p join public.guardians g on g.family_id = p.family_id
                     where p.id = target_patient and g.profile_id = auth.uid()) then
    return false;
  end if;
  return exists (
    select 1 from public.care_assignments ca
    where ca.patient_id = target_patient and ca.therapist_id = therapist
      and ca.starts_on <= current_date and (ca.ends_on is null or ca.ends_on >= current_date)
  );
end;
$$;

create or replace function public.is_therapist_of_family(target_family uuid, therapist uuid default auth.uid())
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if therapist is distinct from auth.uid()
     and not public.is_staff()
     and not exists (select 1 from public.guardians g where g.family_id = target_family and g.profile_id = auth.uid()) then
    return false;
  end if;
  return exists (
    select 1 from public.care_assignments ca join public.patients p on p.id = ca.patient_id
    where p.family_id = target_family and ca.therapist_id = therapist
      and ca.starts_on <= current_date and (ca.ends_on is null or ca.ends_on >= current_date)
  );
end;
$$;

create or replace function public.is_guardian_of(target_patient uuid, guardian uuid default auth.uid())
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if guardian is distinct from auth.uid()
     and not public.is_staff()
     and not exists (select 1 from public.care_assignments ca
                     where ca.patient_id = target_patient and ca.therapist_id = auth.uid()
                       and ca.starts_on <= current_date and (ca.ends_on is null or ca.ends_on >= current_date)) then
    return false;
  end if;
  return exists (
    select 1 from public.patients p
    join public.guardians g on g.family_id = p.family_id
    join public.profiles pr on pr.id = g.profile_id and pr.active
    where p.id = target_patient and g.profile_id = guardian
  );
end;
$$;

create or replace function public.is_guardian_of_family(target_family uuid, guardian uuid default auth.uid())
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if guardian is distinct from auth.uid() and not public.is_staff() then
    return false;
  end if;
  return exists (
    select 1 from public.guardians g
    join public.profiles pr on pr.id = g.profile_id and pr.active
    where g.family_id = target_family and g.profile_id = guardian
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Signature requests could be used to grant oneself read access to any
--    document. Signer must be someone else and the requester must already see
--    the document (the EXISTS runs under the caller's RLS).
-- ---------------------------------------------------------------------------
drop policy signature_requests_insert on public.signature_requests;
create policy signature_requests_insert on public.signature_requests for insert to authenticated
  with check (
    public.is_staff()
    and requested_by = auth.uid()
    and signer_id <> auth.uid()
    and exists (
      select 1 from public.documents d
      where d.id = document_id and (public.is_manager() or d.category = 'administrative')
    )
  );

-- ---------------------------------------------------------------------------
-- 4. File paths: a row may only point to an object in the writer's own folder
--    (managers excepted), otherwise referencing a path grants read access to it.
-- ---------------------------------------------------------------------------
create or replace function public.owns_file_path(path text)
returns boolean language sql stable as $$
  select path is null or split_part(path, '/', 1) = auth.uid()::text
$$;
grant execute on function public.owns_file_path(text) to authenticated;

drop policy reports_insert on public.reports;
create policy reports_insert on public.reports for insert to authenticated
  with check (
    (public.is_manager() or (therapist_id = auth.uid() and public.is_therapist_of(patient_id)))
    and (public.is_manager() or public.owns_file_path(file_path))
  );

create or replace function public.reports_file_path_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.file_path is distinct from old.file_path and not public.is_manager()
     and not (new.file_path is null or split_part(new.file_path, '/', 1) = auth.uid()::text) then
    raise exception 'Arquivo inválido' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger reports_file_path_guard before update on public.reports
  for each row execute function public.reports_file_path_guard();

create or replace function public.documents_file_path_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.file_path is distinct from old.file_path and auth.uid() is not null then
    raise exception 'O arquivo de um documento não pode ser trocado; envie um novo documento' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger documents_file_path_guard before update on public.documents
  for each row execute function public.documents_file_path_guard();

-- ---------------------------------------------------------------------------
-- 5. guardians links may only point to guardian accounts — staff could
--    otherwise attach themselves to a family and read its clinical documents.
-- ---------------------------------------------------------------------------
create or replace function public.guardians_role_check()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select role from public.profiles where id = new.profile_id) is distinct from 'guardian' then
    raise exception 'Somente contas de responsável podem ser vinculadas a uma família' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger guardians_role_check before insert or update on public.guardians
  for each row execute function public.guardians_role_check();

-- ---------------------------------------------------------------------------
-- 6. Downloads of files are logged (LGPD access trail).
-- ---------------------------------------------------------------------------
create or replace function public.log_file_access(path text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return; end if;
  insert into public.audit_log (actor_id, action, entity, entity_id)
  values (auth.uid(), 'download', 'file', left(path, 300));
end;
$$;
grant execute on function public.log_file_access(text) to authenticated;
