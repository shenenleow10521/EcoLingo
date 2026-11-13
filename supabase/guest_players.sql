-- Apply after google_accounts.sql. Guests use an opaque per-browser key.
begin;

create schema if not exists ecolingo_private;
revoke all on schema ecolingo_private from public, anon, authenticated;

create table if not exists ecolingo_private.guest_profiles (
  id uuid primary key default gen_random_uuid(),
  key_hash bytea unique not null,
  nick text not null check (char_length(nick) between 1 and 16),
  state jsonb not null default '{"v":1}',
  revision integer not null default 0,
  epoch integer not null default 0,
  created_at timestamptz not null default now()
);
alter table ecolingo_private.guest_profiles enable row level security;
revoke all on ecolingo_private.guest_profiles from public, anon, authenticated;

create or replace function ecolingo_private.guest_key_hash(guest_key text)
returns bytea language plpgsql immutable set search_path = '' as $$
begin
  if guest_key is null or guest_key !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid EcoLingo guest key' using errcode = '42501';
  end if;
  return sha256(decode(guest_key, 'hex'));
end;
$$;

create or replace function ecolingo_private.guest_id(guest_key text)
returns uuid language plpgsql stable set search_path = '' as $$
declare
  player uuid;
begin
  select g.id into player from ecolingo_private.guest_profiles g
  where g.key_hash = ecolingo_private.guest_key_hash(guest_key);
  if player is null then
    raise exception 'EcoLingo guest profile required' using errcode = '42501';
  end if;
  return player;
end;
$$;

create or replace function public.get_ecolingo_guest_profile(p_guest_key text, p_nick text default null)
returns table (player_id uuid, nick text, state jsonb, revision integer, epoch integer)
language plpgsql security definer set search_path = '' as $$
declare
  player_key bytea := ecolingo_private.guest_key_hash(p_guest_key);
begin
  if p_nick is not null then
    if char_length(btrim(p_nick)) not between 1 and 16 then
      raise exception 'Invalid EcoLingo nickname' using errcode = '22023';
    end if;
    insert into ecolingo_private.guest_profiles (key_hash, nick)
    values (player_key, btrim(p_nick))
    on conflict (key_hash) do nothing;
  end if;

  return query select g.id, g.nick, g.state, g.revision, g.epoch
  from ecolingo_private.guest_profiles g where g.key_hash = player_key;
  if not found then
    raise exception 'EcoLingo guest profile required' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.save_ecolingo_guest_profile(
  p_guest_key text, p_nick text, p_state jsonb, p_revision integer, p_epoch integer,
  p_reset boolean default false
)
returns table (revision integer, epoch integer)
language plpgsql security definer set search_path = '' as $$
declare
  player uuid := ecolingo_private.guest_id(p_guest_key);
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
    update ecolingo_private.guest_profiles g
    set nick = btrim(p_nick), state = p_state - 'log',
        revision = g.revision + 1,
        epoch = g.epoch + case when p_reset then 1 else 0 end
    where g.id = player and g.revision = p_revision and g.epoch = p_epoch
    returning g.revision, g.epoch;
end;
$$;

create or replace view ecolingo_private.player_profiles as
  select id, nick, state, created_at from public.ecolingo_google_profiles
  union all
  select id, nick, state, created_at from ecolingo_private.guest_profiles;
revoke all on ecolingo_private.player_profiles from public, anon, authenticated;

create or replace function ecolingo_private.leaderboard(player uuid, period text, max_rows integer)
returns table (nick text, pts bigint, rank_position bigint, is_me boolean)
language plpgsql stable set search_path = '' as $$
declare
  today text := to_char(now() at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD');
  week_start text := to_char(date_trunc('week', now() at time zone 'Asia/Kuala_Lumpur'), 'YYYY-MM-DD');
begin
  if period is null or period not in ('week', 'all') then
    raise exception 'Invalid leaderboard period' using errcode = '22023';
  end if;
  return query
  with scored as (
    select p.id, p.nick, sum(a.points) as pts
    from ecolingo_private.player_profiles p
    cross join lateral public.ecolingo_awards(
      p.state, to_char(p.created_at at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD'), today
    ) a
    where period = 'all' or a.played_on >= week_start
    group by p.id, p.nick
    having sum(a.points) > 0
  ), ranked as (
    select s.*, row_number() over (order by s.pts desc, lower(s.nick), s.id) as rank_position
    from scored s
  )
  select r.nick, r.pts, r.rank_position, r.id = player
  from ranked r
  where r.rank_position <= greatest(1, least(coalesce(max_rows, 50), 100)) or r.id = player
  order by r.rank_position;
end;
$$;

create or replace function ecolingo_private.community()
returns bigint language sql stable set search_path = '' as $$
  select count(distinct (p.id, e.value ->> 'd', e.value ->> 'c'))
  from ecolingo_private.player_profiles p
  cross join lateral jsonb_array_elements(case when jsonb_typeof(p.state -> 'checkins') = 'array'
      then p.state -> 'checkins' else '[]'::jsonb end) e
  where e.value ->> 'd' between to_char(date_trunc('week', now() at time zone 'Asia/Kuala_Lumpur'), 'YYYY-MM-DD')
    and to_char(now() at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD')
    and e.value ->> 'c' in ('bottle', 'lights', 'bus', 'sort', 'plate');
$$;

create or replace function public.get_ecolingo_leaderboard(p_period text, p_limit integer default 50)
returns table (nick text, pts bigint, rank_position bigint, is_me boolean)
language sql stable security definer set search_path = '' as $$
  select * from ecolingo_private.leaderboard(public.ecolingo_google_session(), p_period, p_limit);
$$;

create or replace function public.get_ecolingo_guest_leaderboard(
  p_guest_key text, p_period text, p_limit integer default 50
)
returns table (nick text, pts bigint, rank_position bigint, is_me boolean)
language sql stable security definer set search_path = '' as $$
  select * from ecolingo_private.leaderboard(ecolingo_private.guest_id(p_guest_key), p_period, p_limit);
$$;

create or replace function public.get_ecolingo_community()
returns bigint language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.ecolingo_google_session();
  return ecolingo_private.community();
end;
$$;

create or replace function public.get_ecolingo_guest_community(p_guest_key text)
returns bigint language plpgsql stable security definer set search_path = '' as $$
begin
  perform ecolingo_private.guest_id(p_guest_key);
  return ecolingo_private.community();
end;
$$;

revoke execute on all functions in schema ecolingo_private from public, anon, authenticated;
revoke execute on function public.get_ecolingo_guest_profile(text, text) from public;
revoke execute on function public.save_ecolingo_guest_profile(text, text, jsonb, integer, integer, boolean) from public;
revoke execute on function public.get_ecolingo_guest_leaderboard(text, text, integer) from public;
revoke execute on function public.get_ecolingo_guest_community(text) from public;
grant execute on function public.get_ecolingo_guest_profile(text, text) to anon, authenticated;
grant execute on function public.save_ecolingo_guest_profile(text, text, jsonb, integer, integer, boolean) to anon, authenticated;
grant execute on function public.get_ecolingo_guest_leaderboard(text, text, integer) to anon, authenticated;
grant execute on function public.get_ecolingo_guest_community(text) to anon, authenticated;

commit;
