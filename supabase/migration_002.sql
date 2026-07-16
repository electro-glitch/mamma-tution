-- ============================================================
-- Migration 002 — multi-student, fee_records, phone-uniqueness
-- ============================================================
-- Idempotent. Safe to re-run.

-- 1) Enforce phone uniqueness per tutor (prevents duplicate student records
--    for the same phone in the same practice).
do $$ begin
  create unique index students_tutor_phone_uniq on public.students(tutor_id, phone);
exception when duplicate_table then null; when duplicate_object then null; end $$;

-- 2) fee_records — one row per (student, month). Source of truth for
--    "is this month paid" and days-delayed metrics.
create table if not exists public.fee_records (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  month date not null, -- first day of the month, e.g. 2026-02-01
  amount_due numeric(10,2) not null default 0,
  amount_paid numeric(10,2) not null default 0,
  paid_date date,
  method text,
  notes text,
  status text not null default 'unpaid' check (status in ('unpaid','partial','paid')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, month)
);
create index if not exists fee_records_tutor_idx on public.fee_records(tutor_id);
create index if not exists fee_records_student_idx on public.fee_records(student_id);
create index if not exists fee_records_month_idx on public.fee_records(month);

drop trigger if exists touch_fee_records on public.fee_records;
create trigger touch_fee_records before update on public.fee_records
  for each row execute function public.tg_touch_updated_at();

alter table public.fee_records enable row level security;
drop policy if exists fee_records_select on public.fee_records;
create policy fee_records_select on public.fee_records for select
  using (public.is_tutor() or student_id = public.current_student_id());
drop policy if exists fee_records_write on public.fee_records;
create policy fee_records_write on public.fee_records for all
  using (public.is_tutor()) with check (public.is_tutor());

-- 3) claim_student_by_phone — allows a freshly signed-up student to link
--    to any pre-created students row with the same phone.
create or replace function public.claim_student_by_phone(_phone text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _sid uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  update public.students
     set user_id = auth.uid()
   where phone = _phone and user_id is null
   returning id into _sid;
  return _sid;
end $$;

grant execute on function public.claim_student_by_phone(text) to authenticated, anon;

-- 4) Ensure_month_fee_record — atomic upsert helper for the tutor UI.
create or replace function public.ensure_fee_records_for_month(_tutor uuid, _month date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.fee_records (tutor_id, student_id, month, amount_due)
  select s.tutor_id, s.id, _month, s.fee_amount
    from public.students s
   where s.tutor_id = _tutor and s.status = 'active'
   on conflict (student_id, month) do nothing;
end $$;
grant execute on function public.ensure_fee_records_for_month(uuid, date) to authenticated;
