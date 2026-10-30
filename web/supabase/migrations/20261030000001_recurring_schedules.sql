-- Agenda fixa: a weekly rule ("Arthur, terça e quinta às 15h, Psicologia") that
-- keeps the next weeks of real appointments materialized. Sessions stay ordinary
-- rows in public.appointments, so confirmation, no-show, NF and conflicts are
-- unchanged; a daily pg_cron job rolls the horizon forward.

create extension if not exists pg_cron;

create table public.recurring_schedules (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  therapist_id uuid not null references public.therapists (id) on delete restrict,
  therapy_id uuid not null references public.therapies (id) on delete restrict,
  room_id uuid references public.rooms (id) on delete set null,
  -- 0 = Sunday … 6 = Saturday (extract(dow)).
  weekdays smallint[] not null check (cardinality(weekdays) between 1 and 7 and weekdays <@ '{0,1,2,3,4,5,6}'),
  start_time time not null,
  duration_minutes integer not null check (duration_minutes between 10 and 480),
  starts_on date not null,
  ends_on date,
  notes text,
  -- Last local date already materialized; dates up to it are never generated again.
  generated_until date,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index recurring_schedules_patient_idx on public.recurring_schedules (patient_id);

create trigger recurring_schedules_touch before update on public.recurring_schedules
  for each row execute function public.touch_updated_at();

-- Read like appointments; writes only through the RPCs below.
alter table public.recurring_schedules enable row level security;
revoke all on public.recurring_schedules from anon;
revoke insert, update, delete on public.recurring_schedules from authenticated;
create policy recurring_schedules_read on public.recurring_schedules for select to authenticated
  using (public.is_staff() or therapist_id = auth.uid() or public.is_therapist_of(patient_id));

alter table public.appointments
  add column recurring_schedule_id uuid references public.recurring_schedules (id) on delete set null;
create index appointments_recurring_idx on public.appointments (recurring_schedule_id, starts_at)
  where recurring_schedule_id is not null;

-- Generated sessions do not notify one by one: the rule sends a single summary.
create or replace function public.appointments_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  label text := public.patient_name(new.patient_id) || ' — ' || public.therapy_name(new.therapy_id);
begin
  if tg_op = 'INSERT' then
    if new.recurring_schedule_id is not null then return null; end if;
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

-- "ter e qui às 15:00"
create or replace function public.recurring_schedule_label(rule public.recurring_schedules)
returns text language sql immutable set search_path = '' as $$
  select array_to_string(array(
           select (array['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'])[d + 1]
           from unnest(rule.weekdays) d order by d), ', ')
         || ' às ' || to_char(rule.start_time, 'HH24:MI')
$$;

-- Internal: creates the rule's sessions from where it stopped up to `horizon`.
-- One row per date; a conflict on one date does not block the others.
create or replace function public.materialize_recurring_schedule(target uuid, horizon date)
returns table (session_date date, created boolean, reason text)
language plpgsql security definer set search_path = '' as $$
declare
  rule public.recurring_schedules;
  day date;
  last_day date;
  starts timestamptz;
  failed_constraint text;
begin
  select * into rule from public.recurring_schedules where id = target for update;
  if rule.id is null then return; end if;
  last_day := least(horizon, coalesce(rule.ends_on, horizon));
  day := greatest(rule.starts_on, rule.generated_until + 1, public.local_date(now()));

  while day <= last_day loop
    starts := (day + rule.start_time) at time zone 'America/Sao_Paulo';
    if extract(dow from day)::smallint = any (rule.weekdays) and starts > now() then
      session_date := day;
      begin
        insert into public.appointments (patient_id, therapist_id, therapy_id, room_id, starts_at, ends_at, notes, created_by, recurring_schedule_id)
        values (rule.patient_id, rule.therapist_id, rule.therapy_id, rule.room_id, starts,
                starts + make_interval(mins => rule.duration_minutes), rule.notes, rule.created_by, rule.id);
        created := true;
        reason := null;
      exception
        when exclusion_violation then
          get stacked diagnostics failed_constraint = constraint_name;
          created := false;
          reason := case when failed_constraint = 'appointments_no_room_overlap'
                         then 'A sala já está ocupada neste horário.'
                         else 'O terapeuta já tem uma sessão neste horário.' end;
        when check_violation then
          created := false;
          reason := 'Sem vínculo vigente nesta data.';
      end;
      return next;
    end if;
    day := day + 1;
  end loop;

  if last_day > coalesce(rule.generated_until, last_day - 1) then
    update public.recurring_schedules set generated_until = last_day where id = rule.id;
  end if;
end;
$$;

-- Eight weeks of sessions always exist ahead of today.
create or replace function public.recurring_horizon()
returns date language sql stable set search_path = '' as $$
  select public.local_date(now()) + 56
$$;

create or replace function public.create_recurring_schedule(
  target_patient uuid, target_therapist uuid, target_therapy uuid, days smallint[], start_at time, minutes integer,
  first_day date, target_room uuid default null, last_day date default null, schedule_notes text default null)
returns table (session_date date, created boolean, reason text)
language plpgsql security definer set search_path = '' as $$
declare
  rule public.recurring_schedules;
  body text;
begin
  if not public.is_staff() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if last_day is not null and last_day < first_day then
    raise exception 'O término deve ser depois do início' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.care_assignments ca
    where ca.patient_id = target_patient and ca.therapist_id = target_therapist and ca.therapy_id = target_therapy
      and ca.starts_on <= first_day and (ca.ends_on is null or ca.ends_on >= first_day)
  ) then
    raise exception 'Terapeuta não está vinculado a este paciente nesta terapia na data de início' using errcode = '23514';
  end if;

  insert into public.recurring_schedules (patient_id, therapist_id, therapy_id, room_id, weekdays, start_time,
    duration_minutes, starts_on, ends_on, notes, created_by)
  values (target_patient, target_therapist, target_therapy, target_room,
    (select array_agg(distinct d order by d) from unnest(days) d), start_at, minutes, first_day, last_day,
    nullif(trim(schedule_notes), ''), auth.uid())
  returning * into rule;

  return query select * from public.materialize_recurring_schedule(rule.id, public.recurring_horizon());

  body := public.patient_name(rule.patient_id) || ' — ' || public.therapy_name(rule.therapy_id) || ': '
    || public.recurring_schedule_label(rule) || ', a partir de ' || to_char(rule.starts_on, 'DD/MM')
    || coalesce(' até ' || to_char(rule.ends_on, 'DD/MM'), '');
  perform public.notify(rule.therapist_id, 'appointment', 'Agenda fixa criada', body, '/schedule');
  perform public.notify_guardians(rule.patient_id, 'appointment', 'Agenda fixa criada', body, '/portal/sessions');
end;
$$;

-- Ends the rule after `last_day` and removes its sessions after that date that
-- have not happened yet. Returns how many sessions were removed.
create or replace function public.end_recurring_schedule(target uuid, last_day date)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  rule public.recurring_schedules;
  removed integer;
begin
  if not public.is_staff() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  select * into rule from public.recurring_schedules where id = target for update;
  if rule.id is null then
    raise exception 'Agenda fixa não encontrada' using errcode = 'P0002';
  end if;
  if last_day < public.local_date(now()) - 1 then
    raise exception 'O término não pode ser no passado' using errcode = '23514';
  end if;

  update public.recurring_schedules
    set ends_on = last_day, generated_until = least(generated_until, last_day)
    where id = rule.id
    returning * into rule;

  delete from public.appointments
    where recurring_schedule_id = rule.id
      and public.local_date(starts_at) > last_day
      and starts_at > now()
      and status in ('scheduled', 'confirmed');
  get diagnostics removed = row_count;

  perform public.notify(rule.therapist_id, 'appointment', 'Agenda fixa encerrada',
    public.patient_name(rule.patient_id) || ' — ' || public.therapy_name(rule.therapy_id) || ': '
      || public.recurring_schedule_label(rule) || ', última sessão até ' || to_char(last_day, 'DD/MM'), '/schedule');
  perform public.notify_guardians(rule.patient_id, 'appointment', 'Agenda fixa encerrada',
    public.patient_name(rule.patient_id) || ' — ' || public.therapy_name(rule.therapy_id) || ': '
      || public.recurring_schedule_label(rule) || ', última sessão até ' || to_char(last_day, 'DD/MM'), '/portal/sessions');
  return removed;
end;
$$;

-- Daily job: rolls every open rule forward and warns reception about dates that
-- could not be booked because the slot was taken.
create or replace function public.extend_recurring_schedules()
returns void language plpgsql security definer set search_path = '' as $$
declare
  rule public.recurring_schedules;
  conflicts integer;
begin
  for rule in
    select * from public.recurring_schedules
    where ends_on is null or ends_on > coalesce(generated_until, starts_on - 1)
  loop
    select count(*) into conflicts
      from public.materialize_recurring_schedule(rule.id, public.recurring_horizon()) m
      where not m.created and m.reason <> 'Sem vínculo vigente nesta data.';
    if conflicts > 0 then
      perform public.notify_roles('{admin,reception}', 'appointment', 'Agenda fixa com conflito',
        public.patient_name(rule.patient_id) || ' — ' || public.therapy_name(rule.therapy_id) || ': '
          || conflicts || ' sessão(ões) não agendada(s) por conflito de horário',
        '/patients/' || rule.patient_id || '?tab=sessions');
    end if;
  end loop;
end;
$$;

revoke execute on function public.materialize_recurring_schedule(uuid, date), public.extend_recurring_schedules(),
  public.recurring_horizon(), public.recurring_schedule_label(public.recurring_schedules)
  from public, anon, authenticated;
revoke execute on function public.create_recurring_schedule(uuid, uuid, uuid, smallint[], time, integer, date, uuid, date, text),
  public.end_recurring_schedule(uuid, date) from public, anon;
grant execute on function public.create_recurring_schedule(uuid, uuid, uuid, smallint[], time, integer, date, uuid, date, text),
  public.end_recurring_schedule(uuid, date) to authenticated;

-- 06:00 UTC = 03:00 in São Paulo.
select cron.schedule('extend-recurring-schedules', '0 6 * * *', 'select public.extend_recurring_schedules()');
