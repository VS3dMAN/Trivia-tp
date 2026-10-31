-- v3: simple accounts, saved quizzes, media storage.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.trivia_users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null check (username ~ '^[A-Za-z0-9_.-]{3,30}$'),
  pass_hash text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.trivia_sessions (
  token text primary key,
  user_id uuid not null references public.trivia_users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.trivia_quizzes (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.trivia_users(id) on delete cascade,
  title text not null default 'Untitled trivia',
  data jsonb not null default '{"rounds":[]}',
  updated_at timestamptz not null default now()
);
alter table public.trivia_users enable row level security;
alter table public.trivia_sessions enable row level security;
alter table public.trivia_quizzes enable row level security;
-- (no policies: only reachable through the functions below)

alter table public.trivia_games add column if not exists quiz jsonb;
alter table public.trivia_games add column if not exists owner uuid references public.trivia_users(id) on delete set null;

create or replace function public.trivia_uid(p_token text) returns uuid
language sql stable security definer set search_path = public as $$
  select user_id from trivia_sessions where token = p_token $$;

create or replace function public.trivia_signup(p_username text, p_password text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid; v_tok text;
begin
  if length(coalesce(p_password, '')) < 4 then raise exception 'Password must be at least 4 characters'; end if;
  if exists (select 1 from trivia_users where lower(username) = lower(trim(p_username))) then raise exception 'Username already taken'; end if;
  insert into trivia_users(username, pass_hash) values (trim(p_username), crypt(p_password, gen_salt('bf'))) returning id into v_id;
  v_tok := encode(gen_random_bytes(24), 'hex');
  insert into trivia_sessions values (v_tok, v_id);
  return json_build_object('token', v_tok, 'username', trim(p_username));
end $$;

create or replace function public.trivia_login(p_username text, p_password text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare u trivia_users; v_tok text;
begin
  select * into u from trivia_users where lower(username) = lower(trim(p_username));
  if u.id is null or u.pass_hash <> crypt(p_password, u.pass_hash) then raise exception 'Wrong username or password'; end if;
  v_tok := encode(gen_random_bytes(24), 'hex');
  insert into trivia_sessions values (v_tok, u.id);
  return json_build_object('token', v_tok, 'username', u.username);
end $$;

create or replace function public.trivia_me(p_token text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('username', u.username) from trivia_sessions s join trivia_users u on u.id = s.user_id where s.token = p_token $$;

create or replace function public.trivia_logout(p_token text) returns void
language sql security definer set search_path = public as $$ delete from trivia_sessions where token = p_token $$;

create or replace function public.trivia_list_quizzes(p_token text) returns json
language plpgsql stable security definer set search_path = public as $$
declare v uuid := trivia_uid(p_token);
begin
  if v is null then raise exception 'Not logged in'; end if;
  return coalesce((select json_agg(json_build_object('id', id, 'title', title, 'updated_at', updated_at,
      'rounds', jsonb_array_length(coalesce(data->'rounds', '[]'))) order by updated_at desc)
    from trivia_quizzes where owner = v), '[]');
end $$;

create or replace function public.trivia_get_quiz(p_token text, p_id uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare v uuid := trivia_uid(p_token); r json;
begin
  if v is null then raise exception 'Not logged in'; end if;
  select json_build_object('id', id, 'title', title, 'data', data) into r from trivia_quizzes where id = p_id and owner = v;
  if r is null then raise exception 'Quiz not found'; end if;
  return r;
end $$;

create or replace function public.trivia_save_quiz(p_token text, p_id uuid, p_title text, p_data jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid := trivia_uid(p_token); v_id uuid;
begin
  if v is null then raise exception 'Not logged in'; end if;
  if length(p_data::text) > 500000 then raise exception 'Quiz too large'; end if;
  if p_id is null then
    insert into trivia_quizzes(owner, title, data) values (v, left(coalesce(nullif(trim(p_title), ''), 'Untitled trivia'), 120), p_data) returning id into v_id;
  else
    update trivia_quizzes set title = left(coalesce(nullif(trim(p_title), ''), 'Untitled trivia'), 120), data = p_data, updated_at = now()
     where id = p_id and owner = v returning id into v_id;
    if v_id is null then raise exception 'Quiz not found'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.trivia_delete_quiz(p_token text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from trivia_quizzes where id = p_id and owner = trivia_uid(p_token);
end $$;

-- Create a game (teams + optional quiz snapshot) — requires login now.
create or replace function public.trivia_create_game_v3(p_token text, p_title text, p_teams jsonb, p_quiz_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare v uuid := trivia_uid(p_token); r json; q jsonb;
begin
  if v is null then raise exception 'Not logged in'; end if;
  if p_quiz_id is not null then
    select data into q from trivia_quizzes where id = p_quiz_id and owner = v;
    if q is null then raise exception 'Quiz not found'; end if;
  end if;
  r := trivia_create_game_v2(p_title, p_teams);
  update trivia_games set quiz = q, owner = v where id = r->>'id';
  return r;
end $$;

-- Media: public-read bucket, 5 MB cap enforced by storage itself.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trivia-media', 'trivia-media', true, 5242880,
        array['image/png','image/jpeg','image/gif','image/webp','audio/mpeg','audio/mp3','video/mp4'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "trivia media upload" on storage.objects;
create policy "trivia media upload" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'trivia-media');

grant execute on function public.trivia_signup(text, text), public.trivia_login(text, text), public.trivia_me(text),
  public.trivia_logout(text), public.trivia_list_quizzes(text), public.trivia_get_quiz(text, uuid),
  public.trivia_save_quiz(text, uuid, text, jsonb), public.trivia_delete_quiz(text, uuid),
  public.trivia_create_game_v3(text, text, jsonb, uuid) to anon, authenticated;
revoke execute on function public.trivia_uid(text) from anon, authenticated, public;
