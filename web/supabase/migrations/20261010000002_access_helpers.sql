-- Access-control helpers. SECURITY DEFINER so policies can call them without
-- recursing into RLS; search_path pinned to avoid hijacking.

create or replace function public.current_app_role()
returns public.app_role
language sql stable security definer set search_path = ''
as $$
  select p.role from public.profiles p where p.id = auth.uid() and p.active
$$;

create or replace function public.has_role(roles public.app_role[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.current_app_role() = any (roles), false)
$$;

-- Admin, coordination, reception.
create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.has_role(array['admin', 'coordination', 'reception']::public.app_role[])
$$;

-- Admin and coordination — management with access to clinical/finance views.
create or replace function public.is_manager()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.has_role(array['admin', 'coordination']::public.app_role[])
$$;

create or replace function public.is_assignment_active(starts_on date, ends_on date)
returns boolean
language sql immutable
as $$
  select starts_on <= current_date and (ends_on is null or ends_on >= current_date)
$$;

-- Therapist currently linked to the patient.
create or replace function public.is_therapist_of(target_patient uuid, therapist uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.care_assignments ca
    where ca.patient_id = target_patient
      and ca.therapist_id = therapist
      and ca.starts_on <= current_date
      and (ca.ends_on is null or ca.ends_on >= current_date)
  )
$$;

create or replace function public.is_therapist_of_family(target_family uuid, therapist uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.care_assignments ca
    join public.patients p on p.id = ca.patient_id
    where p.family_id = target_family
      and ca.therapist_id = therapist
      and ca.starts_on <= current_date
      and (ca.ends_on is null or ca.ends_on >= current_date)
  )
$$;

create or replace function public.is_guardian_of_family(target_family uuid, guardian uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.guardians g
    join public.profiles pr on pr.id = g.profile_id and pr.active
    where g.family_id = target_family and g.profile_id = guardian
  )
$$;

create or replace function public.is_guardian_of(target_patient uuid, guardian uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.patients p
    join public.guardians g on g.family_id = p.family_id
    join public.profiles pr on pr.id = g.profile_id and pr.active
    where p.id = target_patient and g.profile_id = guardian
  )
$$;

-- Who may message whom. This is the communication policy of the clinic:
--   * staff (admin/coordination/reception) ↔ anyone active
--   * therapist ↔ therapist
--   * therapist ↔ guardian only while a care assignment links them
--   * guardian ↔ guardian: never
create or replace function public.can_message(a uuid, b uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  role_a public.app_role;
  role_b public.app_role;
begin
  if a is null or b is null or a = b then
    return false;
  end if;

  select role into role_a from public.profiles where id = a and active;
  select role into role_b from public.profiles where id = b and active;
  if role_a is null or role_b is null then
    return false;
  end if;

  if role_a in ('admin', 'coordination', 'reception') or role_b in ('admin', 'coordination', 'reception') then
    return true;
  end if;

  if role_a = 'therapist' and role_b = 'therapist' then
    return true;
  end if;

  if role_a = 'therapist' and role_b = 'guardian' then
    return exists (
      select 1 from public.guardians g
      join public.patients p on p.family_id = g.family_id
      where g.profile_id = b and public.is_therapist_of(p.id, a)
    );
  end if;

  if role_a = 'guardian' and role_b = 'therapist' then
    return public.can_message(b, a);
  end if;

  return false;
end;
$$;

-- Profile visibility: staff see everyone; therapists see staff, therapists and
-- the guardians of their patients; guardians see staff and their kids' therapists.
create or replace function public.can_see_profile(target uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  me public.app_role := public.current_app_role();
  target_role public.app_role;
begin
  if me is null then
    return false;
  end if;
  if target = auth.uid() or me in ('admin', 'coordination', 'reception') then
    return true;
  end if;

  select role into target_role from public.profiles where id = target;
  if target_role in ('admin', 'coordination', 'reception') then
    return true;
  end if;

  if me = 'therapist' then
    return target_role = 'therapist' or public.can_message(auth.uid(), target);
  end if;

  if me = 'guardian' then
    return target_role = 'therapist' and public.can_message(auth.uid(), target);
  end if;

  return false;
end;
$$;

-- Creates the profile from app_metadata (set only by the service role when an
-- admin creates the account — never from user-editable user_metadata).
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  requested_role text := new.raw_app_meta_data ->> 'role';
begin
  if requested_role is null then
    return new;
  end if;
  insert into public.profiles (id, role, full_name, email, phone)
  values (
    new.id,
    requested_role::public.app_role,
    coalesce(new.raw_app_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email,
    new.raw_app_meta_data ->> 'phone'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Lock helpers down: callable by signed-in users (policies need them), never by anon.
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.current_app_role(),
  public.has_role(public.app_role[]),
  public.is_staff(),
  public.is_manager(),
  public.is_assignment_active(date, date),
  public.is_therapist_of(uuid, uuid),
  public.is_therapist_of_family(uuid, uuid),
  public.is_guardian_of_family(uuid, uuid),
  public.is_guardian_of(uuid, uuid),
  public.can_message(uuid, uuid),
  public.can_see_profile(uuid)
to authenticated;
revoke execute on function public.handle_new_user() from authenticated;
