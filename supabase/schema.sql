-- Full schema for the trivia scoreboard (run on a fresh Supabase project).
-- teams jsonb = [{ name, score, members: [{ id, name }] }]

create table if not exists public.trivia_games (
  id text primary key,
  title text not null default 'Trivia Night',
  teams jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.trivia_game_keys (
  game_id text primary key references public.trivia_games(id) on delete cascade,
  admin_key text not null
);
alter table public.trivia_games enable row level security;
alter table public.trivia_game_keys enable row level security; -- no policies: never readable from the browser
drop policy if exists "trivia games readable" on public.trivia_games;
create policy "trivia games readable" on public.trivia_games for select to anon, authenticated using (true);
alter publication supabase_realtime add table public.trivia_games;

-- Atomic score change (admin).
create or replace function public.trivia_add_score(p_id text, p_key text, p_idx integer, p_delta integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from trivia_game_keys where game_id = p_id and admin_key = p_key) then
    raise exception 'unauthorized'; end if;
  update trivia_games
     set teams = jsonb_set(teams, array[p_idx::text,'score'], to_jsonb((teams->p_idx->>'score')::int + p_delta)),
         updated_at = now()
   where id = p_id;
end $$;

-- Create a game with pre-built teams (members already allotted on the streaming PC).
create or replace function public.trivia_create_game_v2(p_title text, p_teams jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare v_id text; v_key text;
begin
  if jsonb_typeof(p_teams) <> 'array' or jsonb_array_length(p_teams) < 1 or jsonb_array_length(p_teams) > 50 then
    raise exception 'bad teams'; end if;
  v_id := substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  v_key := md5(random()::text || clock_timestamp()::text || v_id);
  insert into trivia_games(id, title, teams)
  values (v_id, left(coalesce(nullif(p_title, ''), 'Trivia Night'), 80),
    (select jsonb_agg(jsonb_build_object(
        'name', left(coalesce(nullif(t->>'name', ''), 'Team ' || i), 40),
        'score', 0,
        'members', coalesce((select jsonb_agg(jsonb_build_object(
                      'id', coalesce(m->>'id', substr(md5(random()::text), 1, 8)),
                      'name', left(m->>'name', 40)))
                    from jsonb_array_elements(coalesce(t->'members', '[]'::jsonb)) m), '[]'::jsonb))
      order by i)
     from jsonb_array_elements(p_teams) with ordinality as x(t, i)));
  insert into trivia_game_keys values (v_id, v_key);
  return json_build_object('id', v_id, 'key', v_key);
end $$;

-- Add one player to the smallest team (random among ties). Atomic, so it
-- never clobbers scores. Returns the team index the player landed in.
create or replace function public.trivia_add_member(p_id text, p_key text, p_name text)
returns int language plpgsql security definer set search_path = public as $$
declare v_teams jsonb; v_idx int;
begin
  if not exists (select 1 from trivia_game_keys where game_id = p_id and admin_key = p_key) then
    raise exception 'unauthorized'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'empty name'; end if;
  select teams into v_teams from trivia_games where id = p_id for update;
  select (i - 1)::int into v_idx
    from jsonb_array_elements(v_teams) with ordinality as x(t, i)
   order by jsonb_array_length(coalesce(t->'members', '[]'::jsonb)), random() limit 1;
  update trivia_games
     set teams = jsonb_set(teams, array[v_idx::text, 'members'],
           coalesce(teams->v_idx->'members', '[]'::jsonb)
           || jsonb_build_array(jsonb_build_object('id', substr(md5(random()::text), 1, 8),
                                                   'name', left(trim(p_name), 40)))),
         updated_at = now()
   where id = p_id;
  return v_idx;
end $$;

-- Replace team names + member lists, keeping the scores already on the server.
-- p_roster = [{ name, members: [{ id, name }] }], same length as current teams.
create or replace function public.trivia_update_roster(p_id text, p_key text, p_roster jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_teams jsonb;
begin
  if not exists (select 1 from trivia_game_keys where game_id = p_id and admin_key = p_key) then
    raise exception 'unauthorized'; end if;
  select teams into v_teams from trivia_games where id = p_id for update;
  if jsonb_typeof(p_roster) <> 'array' or jsonb_array_length(p_roster) <> jsonb_array_length(v_teams) then
    raise exception 'roster must match team count'; end if;
  update trivia_games set teams = (
      select jsonb_agg(jsonb_build_object(
          'name', left(coalesce(nullif(r->>'name', ''), 'Team ' || i), 40),
          'score', coalesce((v_teams->(i - 1)::int->>'score')::int, 0),
          'members', coalesce((select jsonb_agg(jsonb_build_object('id', m->>'id', 'name', left(m->>'name', 40)))
                                 from jsonb_array_elements(coalesce(r->'members', '[]'::jsonb)) m
                                where coalesce(trim(m->>'name'), '') <> ''), '[]'::jsonb))
        order by i)
      from jsonb_array_elements(p_roster) with ordinality as x(r, i)),
    updated_at = now()
  where id = p_id;
end $$;

grant execute on function public.trivia_create_game_v2(text, jsonb) to anon, authenticated;
grant execute on function public.trivia_add_member(text, text, text) to anon, authenticated;
grant execute on function public.trivia_update_roster(text, text, jsonb) to anon, authenticated;
grant execute on function public.trivia_add_score(text, text, integer, integer) to anon, authenticated;
