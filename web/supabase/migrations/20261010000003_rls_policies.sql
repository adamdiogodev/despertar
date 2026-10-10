-- Row Level Security. Every table has RLS on; anon has no grants at all.
-- Writes that encode business rules go through SECURITY DEFINER RPCs
-- (see business_logic migration) and have no direct write policy here.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon, public;

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Participant check without recursing into conversation_participants RLS.
create or replace function public.is_participant(target_conversation uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_participants
    where conversation_id = target_conversation and profile_id = auth.uid()
  )
$$;
revoke execute on function public.is_participant(uuid) from public, anon;
grant execute on function public.is_participant(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Settings & catalogs
-- ---------------------------------------------------------------------------
create policy clinic_settings_read on public.clinic_settings for select to authenticated using (true);
create policy clinic_settings_admin_update on public.clinic_settings for update to authenticated
  using (public.has_role('{admin}')) with check (public.has_role('{admin}'));

create policy therapies_read on public.therapies for select to authenticated using (true);
create policy therapies_admin_write on public.therapies for all to authenticated
  using (public.has_role('{admin}')) with check (public.has_role('{admin}'));

create policy rooms_read on public.rooms for select to authenticated using (true);
create policy rooms_admin_write on public.rooms for all to authenticated
  using (public.has_role('{admin}')) with check (public.has_role('{admin}'));

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
create policy profiles_read on public.profiles for select to authenticated
  using (public.can_see_profile(id));
-- Self-service edits are limited to these columns; role/active change only via
-- the service role in admin server actions.
revoke update on public.profiles from authenticated;
grant update (full_name, phone, last_seen_at) on public.profiles to authenticated;
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy therapists_read on public.therapists for select to authenticated
  using (public.current_app_role() <> 'guardian' or public.can_see_profile(id));
create policy therapists_admin_write on public.therapists for all to authenticated
  using (public.has_role('{admin}')) with check (public.has_role('{admin}'));

create policy families_read on public.families for select to authenticated
  using (public.is_staff() or public.is_therapist_of_family(id) or public.is_guardian_of_family(id));
create policy families_staff_insert on public.families for insert to authenticated
  with check (public.is_staff());
create policy families_staff_update on public.families for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy families_admin_delete on public.families for delete to authenticated
  using (public.has_role('{admin}'));

create policy family_notes_read on public.family_internal_notes for select to authenticated
  using (public.is_staff() or public.is_therapist_of_family(family_id));
create policy family_notes_write on public.family_internal_notes for insert to authenticated
  with check (public.is_staff());
create policy family_notes_update on public.family_internal_notes for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy guardians_read on public.guardians for select to authenticated
  using (
    public.is_staff()
    or profile_id = auth.uid()
    or public.is_guardian_of_family(family_id)
    or public.is_therapist_of_family(family_id)
  );
create policy guardians_staff_write on public.guardians for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy patients_read on public.patients for select to authenticated
  using (public.is_staff() or public.is_therapist_of(id) or public.is_guardian_of(id));
create policy patients_staff_insert on public.patients for insert to authenticated
  with check (public.is_staff());
create policy patients_staff_update on public.patients for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy patients_admin_delete on public.patients for delete to authenticated
  using (public.has_role('{admin}'));

create policy care_assignments_read on public.care_assignments for select to authenticated
  using (
    public.is_staff()
    or therapist_id = auth.uid()
    or public.is_therapist_of(patient_id)
    or public.is_guardian_of(patient_id)
  );
create policy care_assignments_manager_write on public.care_assignments for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

create policy therapist_rates_read on public.therapist_rates for select to authenticated
  using (public.is_manager() or therapist_id = auth.uid());
create policy therapist_rates_admin_write on public.therapist_rates for all to authenticated
  using (public.has_role('{admin}')) with check (public.has_role('{admin}'));

-- ---------------------------------------------------------------------------
-- Schedule
-- ---------------------------------------------------------------------------
create policy appointments_read on public.appointments for select to authenticated
  using (
    public.is_staff()
    or therapist_id = auth.uid()
    or public.is_therapist_of(patient_id)
    or public.is_guardian_of(patient_id)
  );
create policy appointments_staff_insert on public.appointments for insert to authenticated
  with check (public.is_staff());
-- Therapists may update their own sessions; the guard trigger limits which columns.
create policy appointments_update on public.appointments for update to authenticated
  using (public.is_staff() or therapist_id = auth.uid())
  with check (public.is_staff() or therapist_id = auth.uid());
create policy appointments_admin_delete on public.appointments for delete to authenticated
  using (public.has_role('{admin}'));

create policy reschedule_requests_read on public.reschedule_requests for select to authenticated
  using (
    public.is_staff()
    or requested_by = auth.uid()
    or exists (select 1 from public.appointments a where a.id = appointment_id and a.therapist_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Clinical record — assigned therapists + coordination. Admin/reception: no.
-- ---------------------------------------------------------------------------
create policy session_notes_read on public.session_notes for select to authenticated
  using (public.has_role('{coordination}') or public.is_therapist_of(patient_id));
create policy session_notes_insert on public.session_notes for insert to authenticated
  with check (therapist_id = auth.uid() and public.is_therapist_of(patient_id));
create policy session_notes_update on public.session_notes for update to authenticated
  using (therapist_id = auth.uid() and public.is_therapist_of(patient_id))
  with check (therapist_id = auth.uid() and public.is_therapist_of(patient_id));

create policy treatment_plans_read on public.treatment_plans for select to authenticated
  using (public.has_role('{coordination}') or public.is_therapist_of(patient_id));
create policy treatment_plans_insert on public.treatment_plans for insert to authenticated
  with check (therapist_id = auth.uid() and public.is_therapist_of(patient_id));
create policy treatment_plans_update on public.treatment_plans for update to authenticated
  using (therapist_id = auth.uid() and public.is_therapist_of(patient_id))
  with check (therapist_id = auth.uid() and public.is_therapist_of(patient_id));

create policy reports_read on public.reports for select to authenticated
  using (
    public.is_manager()
    or therapist_id = auth.uid()
    or (status = 'approved' and public.is_guardian_of(patient_id))
  );
create policy reports_insert on public.reports for insert to authenticated
  with check (
    public.is_manager()
    or (therapist_id = auth.uid() and public.is_therapist_of(patient_id))
  );
-- Status transitions are enforced by the reports guard trigger.
create policy reports_update on public.reports for update to authenticated
  using (public.is_manager() or therapist_id = auth.uid())
  with check (public.is_manager() or therapist_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Documents & signatures
-- ---------------------------------------------------------------------------
create policy documents_read on public.documents for select to authenticated
  using (
    public.is_manager()
    or uploaded_by = auth.uid()
    or (
      public.has_role('{therapist}') and (
        therapist_id = auth.uid()
        or (patient_id is not null and public.is_therapist_of(patient_id))
        or (patient_id is null and family_id is not null and category <> 'administrative'
            and public.is_therapist_of_family(family_id))
      )
    )
    or (visible_to_family and family_id is not null and public.is_guardian_of_family(family_id))
    or exists (select 1 from public.signature_requests s where s.document_id = documents.id and s.signer_id = auth.uid())
  );
create policy documents_insert on public.documents for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and split_part(file_path, '/', 1) = auth.uid()::text
    and (
      public.is_staff()
      or (public.has_role('{therapist}') and (patient_id is null or public.is_therapist_of(patient_id)))
      or (public.has_role('{guardian}') and family_id is not null and visible_to_family
          and public.is_guardian_of_family(family_id)
          and (patient_id is null or public.is_guardian_of(patient_id)))
    )
  );
create policy documents_update on public.documents for update to authenticated
  using (public.is_manager() or (uploaded_by = auth.uid() and not public.has_role('{guardian}')))
  with check (public.is_manager() or (uploaded_by = auth.uid() and not public.has_role('{guardian}')));
create policy documents_delete on public.documents for delete to authenticated
  using (public.is_manager() or uploaded_by = auth.uid());

create policy signature_requests_read on public.signature_requests for select to authenticated
  using (signer_id = auth.uid() or requested_by = auth.uid() or public.is_manager());
create policy signature_requests_insert on public.signature_requests for insert to authenticated
  with check (public.is_staff() and requested_by = auth.uid());
create policy signature_requests_cancel on public.signature_requests for update to authenticated
  using (public.is_manager()) with check (public.is_manager() and status = 'canceled');

-- ---------------------------------------------------------------------------
-- Communication
-- ---------------------------------------------------------------------------
create policy conversations_read on public.conversations for select to authenticated
  using (public.is_participant(id));

create policy participants_read on public.conversation_participants for select to authenticated
  using (public.is_participant(conversation_id));
revoke update on public.conversation_participants from authenticated;
grant update (last_read_at) on public.conversation_participants to authenticated;
create policy participants_mark_read on public.conversation_participants for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy messages_read on public.messages for select to authenticated
  using (public.is_participant(conversation_id));
-- A message can only be sent while the link that allowed the conversation still holds.
create policy messages_insert on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_participant(conversation_id)
    and not exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = messages.conversation_id
        and cp.profile_id <> auth.uid()
        and not public.can_message(auth.uid(), cp.profile_id)
    )
  );

create policy announcements_read on public.announcements for select to authenticated
  using (
    audience = 'all'
    or (audience = 'staff' and public.current_app_role() <> 'guardian')
    or (audience = 'guardians' and (public.current_app_role() = 'guardian' or public.is_staff()))
  );
create policy announcements_staff_insert on public.announcements for insert to authenticated
  with check (public.is_staff() and created_by = auth.uid());
create policy announcements_manager_delete on public.announcements for delete to authenticated
  using (public.is_manager());

create policy guardian_requests_read on public.guardian_requests for select to authenticated
  using (public.is_staff() or requested_by = auth.uid() or public.is_guardian_of_family(family_id));
create policy guardian_requests_insert on public.guardian_requests for insert to authenticated
  with check (
    requested_by = auth.uid()
    and public.is_guardian_of_family(family_id)
    and (patient_id is null or public.is_guardian_of(patient_id))
    and status = 'open'
  );
create policy guardian_requests_staff_update on public.guardian_requests for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy tasks_read on public.tasks for select to authenticated
  using (assigned_to = auth.uid() or created_by = auth.uid() or public.is_manager());
create policy tasks_insert on public.tasks for insert to authenticated
  with check (created_by = auth.uid() and public.current_app_role() <> 'guardian');
create policy tasks_update on public.tasks for update to authenticated
  using (assigned_to = auth.uid() or created_by = auth.uid() or public.is_manager())
  with check (assigned_to = auth.uid() or created_by = auth.uid() or public.is_manager());
create policy tasks_delete on public.tasks for delete to authenticated
  using (created_by = auth.uid() or public.is_manager());

create policy personal_notes_owner on public.personal_notes for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy notifications_read on public.notifications for select to authenticated
  using (user_id = auth.uid());
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy notifications_mark_read on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete_own on public.notifications for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Finance
-- ---------------------------------------------------------------------------
create policy charges_read on public.charges for select to authenticated
  using (public.is_manager() or public.is_guardian_of_family(family_id));
create policy charges_manager_write on public.charges for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

create policy payout_periods_read on public.payout_periods for select to authenticated
  using (public.is_manager() or public.has_role('{therapist}'));
create policy payout_periods_admin_write on public.payout_periods for all to authenticated
  using (public.has_role('{admin}')) with check (public.has_role('{admin}'));

create policy invoice_requests_read on public.invoice_requests for select to authenticated
  using (public.is_manager() or therapist_id = auth.uid());

create policy invoice_items_read on public.invoice_request_items for select to authenticated
  using (
    public.is_manager()
    or exists (select 1 from public.invoice_requests ir where ir.id = invoice_request_id and ir.therapist_id = auth.uid())
  );

create policy audit_log_admin_read on public.audit_log for select to authenticated
  using (public.has_role('{admin}'));
