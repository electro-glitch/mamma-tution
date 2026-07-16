# Tutor Management System — PRD & Status

## Original Problem Statement
Build a production-ready Tutor Management System using React + Supabase.
Two roles (Tutor, Student). Phone-based auth. Comprehensive workflows for
students, weekly recurring schedules, sessions, attendance, cancellations
with compensation tracking, extra classes, tests, payments, activity log,
and settings. Modern minimal SaaS UI (Linear / Stripe / Vercel style) with
both light and dark modes.

## Tech Stack
- React 19 (JSX) via CRA + craco (platform supervisor uses CRA; TypeScript
  requested but not adopted due to CRA-only supervisor; runtime type-safety
  via Zod). Documented deviation.
- Tailwind 3, shadcn/ui (all primitives available under `components/ui/`),
  React Router 7, React Query, React Hook Form, Zod, Recharts.
- Supabase (Postgres + Auth email/password + RLS) — phone digits are mapped
  to synthetic email `{digits}@phone.tutor.app` so no SMS provider is
  required. Service-role seeded via `/app/supabase/seed.js`.

## User Personas
- **Tutor** (single user per workspace): full CRUD across students,
  schedules, sessions, tests, payments, activity.
- **Student**: read-only view of their own record, schedule, sessions,
  tests, payments.

## Database (see /app/supabase/schema.sql)
- profiles, students, schedule_slots, class_sessions, payments,
  activity_log — with FK, indexes, updated_at triggers, PostgreSQL enums,
  helper functions `is_tutor()` and `current_student_id()`, and RLS
  policies on every table. Soft-archive on students.

## Implemented (2026-02-16 → 2026-02-17)
- Full auth flow — including new-student **self-signup** via `signup_student` RPC (bypasses GoTrue's synthetic-email validator by inserting into `auth.users` directly with pgcrypto bcrypt). Auto-links to any tutor-pre-created student row with matching phone. Empty-string initialization on all GoTrue token columns to keep sign-in working.
- Role-based routing, 401/403/404/500 error pages.
- Tutor Dashboard: 4-metric KPI strip, Today's Schedule, Recent Activity, Teaching load chart (indigo), Present-rate summary.
- Student Dashboard (`/me`): Next class, attendance %, pending balance, weekly schedule, today's classes, upcoming tests, month-labelled payments.
- **Calendar with Day/Week/Month/Agenda + drag-and-drop rescheduling in Week view** (HTML5 native DnD, per-student conflict detection).
- **Multi-student class creation dialog** with Select-all / clear, per-student agenda override, batch conflict detection reporting specific clashing students.
- Session drawer: attendance actions + tutor-cancel compensation workflow (link extra class / decline).
- Students list with search, active/archived tabs, create / archive / restore, **unique(tutor_id, phone) constraint** enforced with friendly toast on duplicate.
- Student detail with recurring slots CRUD, immutable attendance history, month-by-month **fee_records** panel and side "Record payment" form.
- **fee_records** model: one row per (student, month), status enum ('unpaid' | 'partial' | 'paid'), auto-computed days-delayed vs 15th cutoff. Materialised via `ensure_fee_records_for_month` RPC on landing.
- **Payments page** with tutor Record-payment dialog (pick student → check outstanding month(s) → auto-fill amount = fee×N → date/method), quick-Record per row, month-grouped listing, and **Excel export** via SheetJS (`fees_YYYY-MM-DD.xlsx` with student/phone/month/due/paid/balance/paid-on/method/days-delayed/status).
- Tests page (upcoming/past), Activity log grouped by day, Settings (profile, timezone, working hours, theme, password change).
- Design: indigo primary (244 75% 57%) applied across primary tokens, sidebar active pill, today-column tint, KPI chart bars — light + dark themes matched. Toaster moved to `bottom-right` so it never overlaps header controls.
- Seed script provisions 1 tutor + 4 students + 60+ sessions + tests + fee_records + activity in one command.

## Verified Flows (testing_agent iteration_1 + main-agent smoke)
- Sign-in tutor / student, sign-out.
- SPA + hard-reload + deep-link routing on every page.
- Metric loading states, conflict detection on new class, RLS scoping.
- Dark mode via header toggle.

## Deferred / P1 Backlog
- P1: Drag-and-drop rescheduling in Calendar (currently: edit/create only).
- P1: True Supabase Phone-OTP provider (currently: phone+password via
  synthetic email — user chose option b).
- P1: File attachments per session (needs Supabase Storage bucket).
- P2: Announcements table for students.
- P2: Bulk attendance marking, CSV export.
- P2: Advanced filters (has extra classes, has scheduled tests) on
  Students list — search+status only for now.

## Files of Interest
- `/app/supabase/schema.sql`      complete DDL + RLS
- `/app/supabase/seed.js`         seed script (idempotent)
- `/app/frontend/src/App.js`      router
- `/app/frontend/src/contexts/`   AuthContext, ThemeContext
- `/app/frontend/src/lib/`        supabase client, dates, schemas, api
- `/app/frontend/src/pages/`      all pages
- `/app/frontend/src/components/` AppShell, ProtectedRoute

## Credentials
See `/app/memory/test_credentials.md`.
