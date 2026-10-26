-- Run this script in Supabase SQL Editor, including when updating an existing project.

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

alter table public.level_scores add column if not exists best_score integer;
update public.level_scores set best_score = score where best_score is null;
alter table public.level_scores alter column best_score set default 0;
alter table public.level_scores alter column best_score set not null;

create table if not exists public.score_attempts (
  attempt_id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade
);
alter table public.score_attempts enable row level security;

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

drop function if exists public.submit_level_score(integer, integer, integer, integer, integer);
create or replace function public.submit_level_score(
  p_island_id integer,
  p_level_num integer,
  p_score integer,
  p_enemies_killed integer,
  p_chests_collected integer,
  p_attempt_id uuid default null
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
  if p_island_id is null or p_level_num is null or p_score is null
     or p_enemies_killed is null or p_chests_collected is null
     or p_island_id not between 0 and 2 or p_level_num not between 1 and 10
     or p_score < 0 or p_enemies_killed < 0 or p_chests_collected not between 0 and 6
     or p_score::bigint <> p_enemies_killed::bigint * 10 + p_chests_collected::bigint * 25 then
    raise exception 'Invalid level score';
  end if;

  if p_attempt_id is not null then
    insert into public.score_attempts (attempt_id, user_id)
    values (p_attempt_id, auth.uid())
    on conflict (attempt_id) do nothing;
    if not found then return; end if;
  end if;

  insert into public.level_scores as current_score (
    user_id, island_id, level_num, score, enemies_killed, chests_collected, best_score
  ) values (
    auth.uid(), p_island_id, p_level_num, p_score, p_enemies_killed, p_chests_collected, p_score
  )
  on conflict (user_id, island_id, level_num) do update
  set score = current_score.score + excluded.score,
      best_score = greatest(current_score.best_score, excluded.best_score),
      enemies_killed = case when excluded.best_score > current_score.best_score
        then excluded.enemies_killed else current_score.enemies_killed end,
      chests_collected = case when excluded.best_score > current_score.best_score
        then excluded.chests_collected else current_score.chests_collected end,
      updated_at = now();
end;
$$;

create or replace view public.leaderboard as
select
  p.username,
  coalesce(sum(s.score), 0)::bigint as total_score,
  count(s.id)::integer as levels_completed,
  coalesce(max(s.best_score), 0)::integer as best_level_score,
  coalesce(max(s.island_id * 10 + s.level_num), 0)::integer as max_level
from public.profiles p
left join public.level_scores s on s.user_id = p.id
group by p.id, p.username;

grant select on public.profiles to anon, authenticated;
grant select on public.level_scores to authenticated;
grant select on public.level_scores to anon;
grant select on public.leaderboard to anon, authenticated;
revoke all on function public.submit_level_score(integer, integer, integer, integer, integer, uuid) from public, anon;
grant execute on function public.submit_level_score(integer, integer, integer, integer, integer, uuid) to authenticated;

create table if not exists public.player_wallets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  coins bigint not null default 0 check (coins between 0 and 9007199254740991)
);

create table if not exists public.coin_transactions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  operation_id uuid not null,
  amount integer not null,
  applied boolean not null,
  primary key (user_id, operation_id)
);

alter table public.player_wallets enable row level security;
alter table public.coin_transactions enable row level security;

drop policy if exists "Users can read their wallet" on public.player_wallets;
create policy "Users can read their wallet"
on public.player_wallets for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their coin transactions" on public.coin_transactions;
create policy "Users can read their coin transactions"
on public.coin_transactions for select to authenticated
using ((select auth.uid()) = user_id);

drop function if exists public.apply_coin_transaction(integer, uuid);
create or replace function public.apply_coin_transaction(
  p_amount integer default 0,
  p_operation_id uuid default null,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  wallet_balance bigint;
  transaction_applied boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_user_id is not null and p_user_id <> auth.uid() then
    raise exception 'Wallet account changed';
  end if;
  if p_amount is null or (p_amount <> 0 and p_operation_id is null) then
    raise exception 'Invalid coin transaction';
  end if;

  insert into public.player_wallets (user_id) values (auth.uid())
  on conflict (user_id) do nothing;

  select coins into wallet_balance from public.player_wallets
  where user_id = auth.uid() for update;

  if p_amount = 0 and p_operation_id is null then
    return jsonb_build_object('balance', wallet_balance, 'applied', true);
  end if;

  select applied into transaction_applied from public.coin_transactions
  where user_id = auth.uid() and operation_id = p_operation_id;
  if found then
    return jsonb_build_object('balance', wallet_balance, 'applied', transaction_applied);
  end if;

  transaction_applied := wallet_balance + p_amount between 0 and 9007199254740991;
  if transaction_applied then
    wallet_balance := wallet_balance + p_amount;
    update public.player_wallets set coins = wallet_balance where user_id = auth.uid();
  end if;

  insert into public.coin_transactions (user_id, operation_id, amount, applied)
  values (auth.uid(), p_operation_id, p_amount, transaction_applied);

  return jsonb_build_object('balance', wallet_balance, 'applied', transaction_applied);
end;
$$;

grant select on public.player_wallets, public.coin_transactions to authenticated;
revoke all on function public.apply_coin_transaction(integer, uuid, uuid) from public, anon;
grant execute on function public.apply_coin_transaction(integer, uuid, uuid) to authenticated;
