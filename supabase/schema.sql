-- ============================================================
-- Tutor Management System — Complete Schema
-- ============================================================
-- Idempotent. Safe to re-run.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- ENUMS ----------
do $$ begin
  create type user_role as enum ('tutor', 'student');
exception when duplicate_object then null; end $$;

do $$ begin
  create type student_status as enum ('active', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type session_kind as enum ('regular', 'extra', 'test');
exception when duplicate_object then null; end $$;

do $$ begin
  create type session_status as enum (
    'scheduled', 'present', 'absent',
    'tutor_cancelled', 'student_cancelled', 'completed'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type compensation_status as enum (
    'none', 'pending', 'scheduled', 'completed', 'declined'
  );
exception when duplicate_object then null; end $$;

-- ---------- TABLES ----------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'student',
  full_name text not null,
  phone text unique,
  timezone text not null default 'Asia/Kolkata',
  working_hours jsonb not null default '{"start":"09:00","end":"21:00"}'::jsonb,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.profiles(id) on delete cascade,
  user_id uuid unique references auth.users(id) on delete set null,
  full_name text not null,
  phone text not null,
  status student_status not null default 'active',
  fee_amount numeric(10,2) not null default 0,
  due_day smallint not null default 1 check (due_day between 1 and 28),
  pending_balance numeric(10,2) not null default 0,
  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists students_tutor_idx on public.students(tutor_id);
create index if not exists students_user_idx on public.students(user_id);
create index if not exists students_status_idx on public.students(status);

create table if not exists public.schedule_slots (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists slots_student_idx on public.schedule_slots(student_id);

create table if not exists public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  session_date date not null,
  start_time time not null,
  end_time time not null,
  kind session_kind not null default 'regular',
  status session_status not null default 'scheduled',
  topic text,
  notes text,
  cancel_reason text,
  compensation_status compensation_status not null default 'none',
  compensation_reason text,
  linked_extra_class_id uuid references public.class_sessions(id) on delete set null,
  source_slot_id uuid references public.schedule_slots(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sessions_tutor_idx on public.class_sessions(tutor_id);
create index if not exists sessions_student_idx on public.class_sessions(student_id);
create index if not exists sessions_date_idx on public.class_sessions(session_date);
create index if not exists sessions_kind_idx on public.class_sessions(kind);
create index if not exists sessions_status_idx on public.class_sessions(status);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  tutor_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(10,2) not null check (amount > 0),
  payment_date date not null default (now() at time zone 'utc')::date,
  method text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists payments_student_idx on public.payments(student_id);
create index if not exists payments_tutor_idx on public.payments(tutor_id);

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  actor_role user_role,
  tutor_id uuid references public.profiles(id) on delete cascade,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  description text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists activity_tutor_idx on public.activity_log(tutor_id);
create index if not exists activity_created_idx on public.activity_log(created_at desc);

-- ---------- TRIGGERS ----------
create or replace function public.tg_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists touch_profiles on public.profiles;
create trigger touch_profiles before update on public.profiles
  for each row execute function public.tg_touch_updated_at();

drop trigger if exists touch_students on public.students;
create trigger touch_students before update on public.students
  for each row execute function public.tg_touch_updated_at();

drop trigger if exists touch_sessions on public.class_sessions;
create trigger touch_sessions before update on public.class_sessions
  for each row execute function public.tg_touch_updated_at();

-- ---------- HELPERS ----------
create or replace function public.is_tutor()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'tutor');
$$;

create or replace function public.current_student_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.students where user_id = auth.uid() limit 1;
$$;

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.schedule_slots enable row level security;
alter table public.class_sessions enable row level security;
alter table public.payments enable row level security;
alter table public.activity_log enable row level security;

-- profiles: user can see own, tutors can see all
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_tutor());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles for insert
  with check (id = auth.uid());

-- students: tutors full; students only their own row
drop policy if exists students_select on public.students;
create policy students_select on public.students for select
  using (public.is_tutor() or user_id = auth.uid());
drop policy if exists students_write on public.students;
create policy students_write on public.students for all
  using (public.is_tutor()) with check (public.is_tutor());

-- schedule_slots
drop policy if exists slots_select on public.schedule_slots;
create policy slots_select on public.schedule_slots for select
  using (public.is_tutor() or student_id = public.current_student_id());
drop policy if exists slots_write on public.schedule_slots;
create policy slots_write on public.schedule_slots for all
  using (public.is_tutor()) with check (public.is_tutor());

-- class_sessions
drop policy if exists sessions_select on public.class_sessions;
create policy sessions_select on public.class_sessions for select
  using (public.is_tutor() or student_id = public.current_student_id());
drop policy if exists sessions_write on public.class_sessions;
create policy sessions_write on public.class_sessions for all
  using (public.is_tutor()) with check (public.is_tutor());

-- payments
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments for select
  using (public.is_tutor() or student_id = public.current_student_id());
drop policy if exists payments_write on public.payments;
create policy payments_write on public.payments for all
  using (public.is_tutor()) with check (public.is_tutor());

-- activity_log
drop policy if exists activity_select on public.activity_log;
create policy activity_select on public.activity_log for select
  using (public.is_tutor());
drop policy if exists activity_write on public.activity_log;
create policy activity_write on public.activity_log for all
  using (public.is_tutor()) with check (public.is_tutor());
