-- EcoLingo Google accounts and leaderboard. Run in the project SQL editor.
-- The legacy profiles table remains available to the earlier app.
begin;

create table if not exists public.ecolingo_google_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nick text not null check (char_length(nick) between 1 and 16),
  state jsonb not null check (jsonb_typeof(state) = 'object' and pg_column_size(state) < 200000),
  revision integer not null default 0,
  epoch integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ecolingo_google_profiles enable row level security;
revoke all on public.ecolingo_google_profiles from public, anon, authenticated;

create or replace function public.ecolingo_google_session()
returns uuid language plpgsql stable set search_path = '' as $$
declare
  claims jsonb := auth.jwt();
  player uuid := auth.uid();
begin
  if player is null
     or coalesce(claims ->> 'is_anonymous', 'false') = 'true'
     or not coalesce(
       claims #>> '{app_metadata,provider}' = 'google'
       or (claims #> '{app_metadata,providers}') ? 'google', false)
     or not coalesce((claims -> 'amr') @> '[{"method":"oauth"}]'::jsonb, false)
  then
    raise exception 'Google sign-in required' using errcode = '42501';
  end if;
  return player;
end;
$$;

create or replace function public.get_ecolingo_profile()
returns table (nick text, state jsonb, revision integer, epoch integer)
language plpgsql security definer set search_path = '' as $$
declare
  player uuid := public.ecolingo_google_session();
  old_nick text;
  old_state jsonb;
begin
  if not exists (select 1 from public.ecolingo_google_profiles p where p.id = player) then
    if to_regclass('public.profiles') is not null then
      select p.nick, p.state into old_nick, old_state
      from public.profiles p
      where p.id = player and p.state ->> 'v' = '1';
    end if;
    insert into public.ecolingo_google_profiles (id, nick, state)
    values (player, coalesce(old_nick, 'Player-' || left(player::text, 8)),
            coalesce(old_state, '{"v":1}'::jsonb) - 'earned')
    on conflict (id) do nothing;
  end if;
  return query select p.nick, p.state, p.revision, p.epoch
  from public.ecolingo_google_profiles p where p.id = player;
end;
$$;

create or replace function public.save_ecolingo_profile(
  p_nick text, p_state jsonb, p_revision integer, p_epoch integer, p_reset boolean default false
)
returns table (revision integer, epoch integer)
language plpgsql security definer set search_path = '' as $$
declare
  player uuid := public.ecolingo_google_session();
begin
  if p_nick is null or char_length(btrim(p_nick)) not between 1 and 16
     or p_state is null or jsonb_typeof(p_state) <> 'object'
     or p_state ->> 'v' is distinct from '1'
     or pg_column_size(p_state) >= 200000
     or p_reset is null
  then
    raise exception 'Invalid EcoLingo profile' using errcode = '22023';
  end if;
  return query
    update public.ecolingo_google_profiles p
    set nick = btrim(p_nick),
        -- Only the original database row can contribute legacy totals.
        state = jsonb_set(p_state - 'log', '{log}', case
          when p_reset then '[]'::jsonb else coalesce(p.state -> 'log', '[]'::jsonb) end),
        revision = p.revision + 1,
        epoch = p.epoch + case when p_reset then 1 else 0 end,
        updated_at = now()
    where p.id = player and p.revision = p_revision and p.epoch = p_epoch
    returning p.revision, p.epoch;
end;
$$;

create or replace function public.ecolingo_awards(snapshot jsonb, earliest text, latest text)
returns table (played_on text, points integer)
language sql immutable set search_path = '' as $$
  select e.value,
    case
      when e.key ~ '^lesson:u[1-4]$' then 20
      when e.key ~ '^question:u[1-4]-([0-9]|1[0-4])$' then 10
      when e.key ~ '^perfect:u[1-4]$' then 10
      when e.key = 'mix:' || e.value then 15
      when e.key = 'checkin:bottle:' || e.value then 20
      when e.key in ('checkin:lights:' || e.value, 'checkin:bus:' || e.value,
                     'checkin:sort:' || e.value, 'checkin:plate:' || e.value) then 15
      else 0
    end
  from jsonb_each_text(case when jsonb_typeof(snapshot -> 'earned') = 'object'
      then snapshot -> 'earned' else '{}'::jsonb end) e
  where e.value ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
    and e.value between earliest and latest

  union all

  select e.value ->> 'd',
         case when (e.value ->> 'n') ~ '^[0-9]{1,6}$' then (e.value ->> 'n')::integer else 0 end
  from jsonb_array_elements(case when jsonb_typeof(snapshot -> 'log') = 'array'
      then snapshot -> 'log' else '[]'::jsonb end) e
  where (e.value ->> 'd') ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
    and e.value ->> 'd' <= latest;
$$;

create or replace function public.get_ecolingo_leaderboard(p_period text, p_limit integer default 50)
returns table (nick text, pts bigint, rank_position bigint, is_me boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  player uuid := public.ecolingo_google_session();
  today text := to_char(now() at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD');
  week_start text := to_char(date_trunc('week', now() at time zone 'Asia/Kuala_Lumpur'), 'YYYY-MM-DD');
begin
  if p_period is null or p_period not in ('week', 'all') then
    raise exception 'Invalid leaderboard period' using errcode = '22023';
  end if;
  return query
  with scored as (
    select p.id, p.nick, sum(a.points) as pts
    from public.ecolingo_google_profiles p
    cross join lateral public.ecolingo_awards(
      p.state, to_char(p.created_at at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD'), today
    ) a
    where p_period = 'all' or a.played_on >= week_start
    group by p.id, p.nick
    having sum(a.points) > 0
  ), ranked as (
    select s.*, row_number() over (order by s.pts desc, lower(s.nick), s.id) as rank_position
    from scored s
  )
  select r.nick, r.pts, r.rank_position, r.id = player
  from ranked r
  where r.rank_position <= greatest(1, least(coalesce(p_limit, 50), 100)) or r.id = player
  order by r.rank_position;
end;
$$;

create or replace function public.get_ecolingo_community()
returns bigint language plpgsql stable security definer set search_path = '' as $$
declare
  player uuid := public.ecolingo_google_session();
  today text := to_char(now() at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD');
  week_start text := to_char(date_trunc('week', now() at time zone 'Asia/Kuala_Lumpur'), 'YYYY-MM-DD');
begin
  return (
    select count(distinct (p.id, e.value ->> 'd', e.value ->> 'c'))
    from public.ecolingo_google_profiles p
    cross join lateral jsonb_array_elements(case when jsonb_typeof(p.state -> 'checkins') = 'array'
        then p.state -> 'checkins' else '[]'::jsonb end) e
    where e.value ->> 'd' between week_start and today
      and e.value ->> 'c' in ('bottle', 'lights', 'bus', 'sort', 'plate')
  );
end;
$$;

revoke execute on function public.ecolingo_google_session() from public, anon, authenticated;
revoke execute on function public.ecolingo_awards(jsonb, text, text) from public, anon, authenticated;
revoke execute on function public.get_ecolingo_profile() from public, anon;
revoke execute on function public.save_ecolingo_profile(text, jsonb, integer, integer, boolean) from public, anon;
revoke execute on function public.get_ecolingo_leaderboard(text, integer) from public, anon;
revoke execute on function public.get_ecolingo_community() from public, anon;
grant execute on function public.get_ecolingo_profile() to authenticated;
grant execute on function public.save_ecolingo_profile(text, jsonb, integer, integer, boolean) to authenticated;
grant execute on function public.get_ecolingo_leaderboard(text, integer) to authenticated;
grant execute on function public.get_ecolingo_community() to authenticated;

commit;
