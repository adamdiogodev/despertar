-- Database-level integrity for clinical records (previously only checked in server actions).

-- One treatment plan per patient × therapist × therapy.
create unique index treatment_plans_unique_per_therapy
  on public.treatment_plans (patient_id, therapist_id, therapy_id);

create or replace function public.session_notes_check_appointment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.appointment_id is not null and not exists (
    select 1 from public.appointments a
    where a.id = new.appointment_id
      and a.patient_id = new.patient_id
      and a.therapist_id = new.therapist_id
      and a.status = 'completed'
  ) then
    raise exception 'A evolução só pode ser vinculada a uma sessão concluída sua com este paciente' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.treatment_plans_check_assignment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.care_assignments ca
    where ca.patient_id = new.patient_id
      and ca.therapist_id = new.therapist_id
      and ca.therapy_id = new.therapy_id
      and ca.starts_on <= current_date
      and (ca.ends_on is null or ca.ends_on >= current_date)
  ) then
    raise exception 'Plano só pode ser feito para uma terapia com vínculo ativo' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger session_notes_check_appointment before insert or update on public.session_notes
  for each row execute function public.session_notes_check_appointment();
create trigger treatment_plans_check_assignment before insert or update on public.treatment_plans
  for each row execute function public.treatment_plans_check_assignment();

revoke execute on function public.session_notes_check_appointment(), public.treatment_plans_check_assignment()
  from public, anon, authenticated;
