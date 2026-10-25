-- Run this script once in Supabase SQL Editor.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (char_length(username) between 3 and 24),
  created_at timestamptz not null default now()
);

create unique index if not exists profiles_username_lower_unique
  on public.profiles (lower(username));

create table if not exists public.level_scores (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  island_id integer not null check (island_id between 0 and 2),
  level_num integer not null check (level_num between 1 and 10),
  score integer not null default 0 check (score >= 0),
  enemies_killed integer not null default 0 check (enemies_killed >= 0),
  chests_collected integer not null default 0 check (chests_collected between 0 and 6),
  updated_at timestamptz not null default now(),
  constraint level_scores_user_level_unique unique (user_id, island_id, level_num)
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text;
begin
  requested_username := lower(regexp_replace(
    coalesce(new.raw_user_meta_data ->> 'username', ''),
    '[^a-zA-Z0-9_]', '', 'g'
  ));

  if char_length(requested_username) < 3 or char_length(requested_username) > 24 then
    requested_username := 'capitan_' || substr(new.id::text, 1, 8);
  end if;

  begin
    insert into public.profiles (id, username)
    values (new.id, requested_username);
  exception when unique_violation then
    insert into public.profiles (id, username)
    values (new.id, 'capitan_' || substr(new.id::text, 1, 8));
  end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.level_scores enable row level security;

drop policy if exists "Public profiles are readable" on public.profiles;
create policy "Public profiles are readable"
on public.profiles for select
to anon, authenticated
using (true);

drop policy if exists "Public level scores are readable" on public.level_scores;
create policy "Public level scores are readable"
on public.level_scores for select
to anon, authenticated
using (true);

drop policy if exists "Users can insert their own scores" on public.level_scores;
create policy "Users can insert their own scores"
on public.level_scores for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own scores" on public.level_scores;
create policy "Users can update their own scores"
on public.level_scores for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create or replace function public.submit_level_score(
  p_island_id integer,
  p_level_num integer,
  p_score integer,
  p_enemies_killed integer,
  p_chests_collected integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_island_id not between 0 and 2 or p_level_num not between 1 and 10
     or p_score < 0 or p_enemies_killed < 0 or p_chests_collected not between 0 and 6 then
    raise exception 'Invalid level score';
  end if;

  insert into public.level_scores as current_score (
    user_id, island_id, level_num, score, enemies_killed, chests_collected
  ) values (
    auth.uid(), p_island_id, p_level_num, p_score, p_enemies_killed, p_chests_collected
  )
  on conflict (user_id, island_id, level_num) do update
  set score = excluded.score,
      enemies_killed = excluded.enemies_killed,
      chests_collected = excluded.chests_collected,
      updated_at = now()
  where excluded.score > current_score.score;
end;
$$;

create or replace view public.leaderboard as
select
  p.username,
  coalesce(sum(s.score), 0)::bigint as total_score,
  count(s.id)::integer as levels_completed,
  coalesce(max(s.score), 0)::integer as best_level_score
from public.profiles p
left join public.level_scores s on s.user_id = p.id
group by p.id, p.username;

grant select on public.profiles to anon, authenticated;
grant select on public.level_scores to authenticated;
grant select on public.level_scores to anon;
grant select on public.leaderboard to anon, authenticated;
revoke all on function public.submit_level_score(integer, integer, integer, integer, integer) from public, anon;
grant execute on function public.submit_level_score(integer, integer, integer, integer, integer) to authenticated;
