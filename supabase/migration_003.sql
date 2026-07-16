-- ============================================================
-- Migration 003 — self-signup RPC (bypasses gotrue's email validator)
-- ============================================================
-- Rationale: Supabase GoTrue rejects new signups with our synthetic
-- `<phone>@phone.tutor.app` domain (400 email invalid). Since these
-- emails are purely identifiers (no mail is delivered), we insert
-- directly into auth.users using pgcrypto bf hashing. IMPORTANT:
-- GoTrue's login query compares nullable token columns using strict
-- equality (`WHERE confirmation_token = ''`), so we must initialise
-- them to empty strings, NOT NULL. Idempotent.

create extension if not exists "pgcrypto";

create or replace function public.signup_student(_phone text, _password text, _full_name text)
returns json
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  _uid uuid; _email text; _existing uuid; _linked uuid;
begin
  if _phone is null or length(trim(_phone)) < 10 then raise exception 'Phone must be at least 10 digits'; end if;
  if _password is null or length(_password) < 6 then raise exception 'Password must be at least 6 characters'; end if;
  if _full_name is null or length(trim(_full_name)) < 2 then raise exception 'Full name is required'; end if;

  _email := _phone || '@phone.tutor.app';
  select id into _existing from auth.users where email = _email;
  if _existing is not null then raise exception 'An account with this phone already exists'; end if;

  _uid := gen_random_uuid();

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) values (
    _uid, '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', _email,
    crypt(_password, gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('email_verified', false, 'full_name', _full_name, 'phone', _phone),
    '', '', '', '', '', '', '', ''
  );

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), _uid, _uid::text,
    jsonb_build_object('sub', _uid::text, 'email', _email, 'email_verified', false, 'phone_verified', false),
    'email', now(), now(), now());

  insert into public.profiles (id, role, full_name, phone, timezone)
  values (_uid, 'student', _full_name, _phone, 'Asia/Kolkata')
  on conflict (id) do update set full_name = excluded.full_name, phone = excluded.phone;

  update public.students set user_id = _uid where phone = _phone and user_id is null returning id into _linked;

  return json_build_object('user_id', _uid, 'email', _email, 'linked_student_id', _linked);
end $$;

grant execute on function public.signup_student(text, text, text) to anon, authenticated;
