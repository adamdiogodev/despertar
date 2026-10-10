-- Sistema Despertar — core schema
-- Identifiers in English; user-facing strings live in the app (pt-BR).

create extension if not exists btree_gist with schema extensions;
create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'coordination', 'reception', 'therapist', 'guardian');
create type public.record_status as enum ('active', 'pending', 'inactive');
create type public.appointment_status as enum ('scheduled', 'confirmed', 'completed', 'canceled', 'no_show');
create type public.pay_model as enum ('per_session', 'per_hour');
create type public.report_type as enum ('evaluation', 'quarterly', 'semiannual', 'school', 'other');
create type public.report_status as enum ('pending', 'in_review', 'approved', 'returned');
create type public.document_category as enum ('contract', 'anamnesis', 'report', 'medical', 'treatment_plan', 'administrative', 'other');
create type public.document_status as enum ('received', 'under_review', 'available');
create type public.signature_status as enum ('pending', 'signed', 'canceled');
create type public.request_status as enum ('pending', 'approved', 'rejected');
create type public.guardian_request_type as enum ('information', 'reschedule', 'billing', 'document', 'data_update', 'other');
create type public.guardian_request_status as enum ('open', 'answered', 'closed');
create type public.task_priority as enum ('normal', 'urgent');
create type public.task_status as enum ('open', 'done');
create type public.charge_status as enum ('pending', 'paid', 'awaiting_insurance', 'canceled');
create type public.payout_period_status as enum ('open', 'closed');
create type public.invoice_status as enum ('requested', 'submitted', 'approved', 'rejected', 'paid');
create type public.announcement_audience as enum ('all', 'staff', 'guardians');

-- ---------------------------------------------------------------------------
-- Clinic settings (singleton)
-- ---------------------------------------------------------------------------
create table public.clinic_settings (
  id smallint primary key default 1 check (id = 1),
  name text not null default 'Clínica Despertar',
  tax_id text,
  phone text,
  whatsapp text,
  address text,
  email text,
  reschedule_min_hours integer not null default 24 check (reschedule_min_hours between 0 and 168),
  updated_at timestamptz not null default now()
);
insert into public.clinic_settings (id) values (1);

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null,
  full_name text not null check (length(trim(full_name)) > 0),
  email text not null,
  phone text,
  active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);
create index profiles_role_idx on public.profiles (role) where active;

create table public.therapies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true
);

create table public.therapists (
  id uuid primary key references public.profiles (id) on delete cascade,
  specialty text not null,
  council_registry text,
  color text not null default '#2E86DE' check (color ~ '^#[0-9A-Fa-f]{6}$')
);

create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relationship text,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now()
);

-- Internal notes are kept apart so guardians can read their family row
-- without seeing what staff wrote about them.
create table public.family_internal_notes (
  family_id uuid primary key references public.families (id) on delete cascade,
  notes text not null default '',
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.guardians (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  relationship text not null default 'Responsável',
  is_primary boolean not null default false,
  primary key (profile_id, family_id)
);
create index guardians_family_idx on public.guardians (family_id);

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete restrict,
  full_name text not null check (length(trim(full_name)) > 0),
  birth_date date,
  diagnosis text,
  insurance_name text not null default 'Particular',
  insurance_number text,
  school text,
  status public.record_status not null default 'active',
  care_started_on date,
  created_at timestamptz not null default now()
);
create index patients_family_idx on public.patients (family_id);

-- The link that gates everything a therapist can see or do.
create table public.care_assignments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  therapist_id uuid not null references public.therapists (id) on delete cascade,
  therapy_id uuid not null references public.therapies (id) on delete restrict,
  frequency text,
  starts_on date not null default current_date,
  ends_on date,
  created_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);
create unique index care_assignments_open_unique
  on public.care_assignments (patient_id, therapist_id, therapy_id) where ends_on is null;
create index care_assignments_therapist_idx on public.care_assignments (therapist_id);
create index care_assignments_patient_idx on public.care_assignments (patient_id);

create table public.therapist_rates (
  id uuid primary key default gen_random_uuid(),
  therapist_id uuid not null references public.therapists (id) on delete cascade,
  therapy_id uuid not null references public.therapies (id) on delete restrict,
  pay_model public.pay_model not null,
  amount_cents integer not null check (amount_cents > 0),
  valid_from date not null default current_date,
  created_at timestamptz not null default now(),
  unique (therapist_id, therapy_id, valid_from)
);

-- ---------------------------------------------------------------------------
-- Schedule
-- ---------------------------------------------------------------------------
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  therapist_id uuid not null references public.therapists (id) on delete restrict,
  therapy_id uuid not null references public.therapies (id) on delete restrict,
  room_id uuid references public.rooms (id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.appointment_status not null default 'scheduled',
  notes text,
  cancel_reason text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (ends_at - starts_at <= interval '8 hours'),
  constraint appointments_no_therapist_overlap exclude using gist (
    therapist_id with =, tstzrange(starts_at, ends_at) with &&
  ) where (status <> 'canceled'),
  constraint appointments_no_room_overlap exclude using gist (
    room_id with =, tstzrange(starts_at, ends_at) with &&
  ) where (status <> 'canceled' and room_id is not null)
);
create index appointments_starts_idx on public.appointments (starts_at);
create index appointments_patient_idx on public.appointments (patient_id, starts_at);
create index appointments_therapist_idx on public.appointments (therapist_id, starts_at);

create table public.reschedule_requests (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  requested_by uuid not null references public.profiles (id) on delete cascade,
  proposed_starts_at timestamptz not null,
  reason text not null,
  status public.request_status not null default 'pending',
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);
create unique index reschedule_requests_one_pending
  on public.reschedule_requests (appointment_id) where status = 'pending';

-- ---------------------------------------------------------------------------
-- Clinical record
-- ---------------------------------------------------------------------------
create table public.session_notes (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid unique references public.appointments (id) on delete set null,
  patient_id uuid not null references public.patients (id) on delete cascade,
  therapist_id uuid not null references public.therapists (id) on delete restrict,
  session_date date not null default current_date,
  content text not null check (length(trim(content)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index session_notes_patient_idx on public.session_notes (patient_id, session_date desc);

create table public.treatment_plans (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  therapist_id uuid not null references public.therapists (id) on delete restrict,
  therapy_id uuid not null references public.therapies (id) on delete restrict,
  is_draft boolean not null default true,
  frequency text,
  session_minutes integer check (session_minutes between 10 and 480),
  care_type text,
  estimated_duration text,
  chief_complaint text,
  goals text,
  strategies text,
  home_guidance text,
  materials text,
  important_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index treatment_plans_patient_idx on public.treatment_plans (patient_id);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  therapist_id uuid not null references public.therapists (id) on delete restrict,
  report_type public.report_type not null,
  reference_label text not null,
  due_date date,
  status public.report_status not null default 'pending',
  file_path text,
  submitted_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  return_reason text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index reports_status_idx on public.reports (status);
create index reports_therapist_idx on public.reports (therapist_id);

-- ---------------------------------------------------------------------------
-- Documents & signatures
-- ---------------------------------------------------------------------------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  file_path text not null unique,
  mime_type text,
  size_bytes bigint check (size_bytes >= 0 and size_bytes <= 20 * 1024 * 1024),
  category public.document_category not null default 'other',
  status public.document_status not null default 'available',
  family_id uuid references public.families (id) on delete cascade,
  patient_id uuid references public.patients (id) on delete cascade,
  therapist_id uuid references public.therapists (id) on delete cascade,
  visible_to_family boolean not null default false,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index documents_family_idx on public.documents (family_id);
create index documents_patient_idx on public.documents (patient_id);

create table public.signature_requests (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  signer_id uuid not null references public.profiles (id) on delete cascade,
  status public.signature_status not null default 'pending',
  requested_by uuid references public.profiles (id) on delete set null,
  due_date date,
  signed_at timestamptz,
  signer_ip text,
  signer_user_agent text,
  created_at timestamptz not null default now(),
  unique (document_id, signer_id)
);

-- ---------------------------------------------------------------------------
-- Communication
-- ---------------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  last_message_at timestamptz
);

create table public.conversation_participants (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz,
  primary key (conversation_id, profile_id)
);
create index conversation_participants_profile_idx on public.conversation_participants (profile_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  audience public.announcement_audience not null default 'all',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.guardian_requests (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  patient_id uuid references public.patients (id) on delete set null,
  requested_by uuid not null references public.profiles (id) on delete cascade,
  request_type public.guardian_request_type not null,
  message text not null check (length(trim(message)) between 1 and 4000),
  status public.guardian_request_status not null default 'open',
  response text,
  responded_by uuid references public.profiles (id) on delete set null,
  responded_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  assigned_to uuid not null references public.profiles (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  patient_id uuid references public.patients (id) on delete set null,
  due_date date,
  priority public.task_priority not null default 'normal',
  status public.task_status not null default 'open',
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index tasks_assignee_idx on public.tasks (assigned_to, status);

create table public.personal_notes (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  content text not null default '',
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Finance
-- ---------------------------------------------------------------------------
create table public.charges (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  reference text not null,
  amount_cents integer not null check (amount_cents > 0),
  due_date date not null,
  payment_method text not null default 'Pix',
  status public.charge_status not null default 'pending',
  paid_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index charges_family_idx on public.charges (family_id);

create table public.payout_periods (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  starts_on date not null,
  ends_on date not null,
  status public.payout_period_status not null default 'open',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create table public.invoice_requests (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.payout_periods (id) on delete cascade,
  therapist_id uuid not null references public.therapists (id) on delete restrict,
  therapy_id uuid not null references public.therapies (id) on delete restrict,
  sessions_count integer not null,
  total_minutes integer not null,
  amount_cents integer not null check (amount_cents >= 0),
  status public.invoice_status not null default 'requested',
  invoice_number text,
  invoice_file_path text,
  submitted_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (period_id, therapist_id, therapy_id)
);

create table public.invoice_request_items (
  invoice_request_id uuid not null references public.invoice_requests (id) on delete cascade,
  appointment_id uuid not null unique references public.appointments (id) on delete restrict,
  pay_model public.pay_model not null,
  rate_cents integer not null,
  minutes integer not null,
  amount_cents integer not null,
  primary key (invoice_request_id, appointment_id)
);

-- ---------------------------------------------------------------------------
-- Audit (LGPD) — stores who touched what, never the clinical content itself
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  changed_columns text[],
  created_at timestamptz not null default now()
);
create index audit_log_entity_idx on public.audit_log (entity, entity_id);
create index audit_log_created_idx on public.audit_log (created_at desc);
