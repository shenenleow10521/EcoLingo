-- =====================================================================
-- EcoLingo backend (Supabase / Postgres)
-- 用法：Supabase Dashboard → SQL Editor → New query → 整份贴进去 → Run
-- 可以重复执行（会先删掉旧的 policy / function 再建）
-- =====================================================================

-- 1) 每个用户一行：昵称 + 整份学习进度（lessons / quiz / checkins / log / badges …）
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  nick        text not null default 'EcoRookie'
              check (char_length(nick) between 1 and 16),
  state       jsonb not null default '{}'::jsonb
              check (pg_column_size(state) < 200000),      -- 防止有人塞超大数据
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- updated_at 自动更新
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
for each row execute function public.touch_updated_at();

-- 2) 权限 + Row Level Security：每个人只能读 / 写 / 删自己那一行
--    （建项目时就算关掉 "Automatically expose new tables" 也能用）
revoke all on public.profiles from anon;
grant select, insert, update, delete on public.profiles to authenticated;
alter table public.profiles enable row level security;

drop policy if exists "profiles: read own"   on public.profiles;
drop policy if exists "profiles: insert own" on public.profiles;
drop policy if exists "profiles: update own" on public.profiles;
drop policy if exists "profiles: delete own" on public.profiles;

create policy "profiles: read own"   on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy "profiles: insert own" on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);
create policy "profiles: update own" on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "profiles: delete own" on public.profiles for delete to authenticated
  using ((select auth.uid()) = id);

-- 3) 排行榜：别人的 state 不能直接读，所以用 security definer 函数
--    只把「昵称 + 分数 + 是不是我」交出去
drop function if exists public.get_leaderboard(text, int);
create function public.get_leaderboard(mode text default 'week', max_rows int default 50)
returns table (nick text, pts int, is_me boolean)
language sql stable security definer set search_path = '' as $$
  with wk as (
    -- 星期一开始的一周，按马来西亚时间
    select to_char(date_trunc('week', now() at time zone 'Asia/Kuala_Lumpur'), 'YYYY-MM-DD') as start,
           to_char(now() at time zone 'Asia/Kuala_Lumpur' + interval '1 day', 'YYYY-MM-DD') as stop
  ),
  scored as (
    select p.id, p.nick,
           coalesce((
             select sum((e->>'n')::int)
             from jsonb_array_elements(
                    case when jsonb_typeof(p.state->'log') = 'array'
                         then p.state->'log' else '[]'::jsonb end) e
             where (e->>'n') ~ '^[0-9]{1,6}$'
               and (mode <> 'week' or ((e->>'d') >= (select start from wk)
                                    and (e->>'d') <= (select stop from wk)))
           ), 0)::int as pts
    from public.profiles p
  )
  select s.nick, s.pts, coalesce(s.id = auth.uid(), false) as is_me
  from scored s
  where s.pts > 0 or s.id = auth.uid()
  order by s.pts desc, s.nick
  limit greatest(1, least(coalesce(max_rows, 50), 100));
$$;

-- 4) 「全体用户本周 check-in 数」→ Challenges 页的社区目标进度条
drop function if exists public.community_week_checkins();
create function public.community_week_checkins()
returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int
  from public.profiles p,
       jsonb_array_elements(
         case when jsonb_typeof(p.state->'checkins') = 'array'
              then p.state->'checkins' else '[]'::jsonb end) e
  where (e->>'d') >= to_char(date_trunc('week', now() at time zone 'Asia/Kuala_Lumpur'), 'YYYY-MM-DD');
$$;

-- 只有登录了的用户（包括游客）才能调用；只交出昵称和分数，看不到别人的 state
revoke all on function public.get_leaderboard(text, int)    from public, anon;
revoke all on function public.community_week_checkins()     from public, anon;
grant execute on function public.get_leaderboard(text, int) to authenticated;
grant execute on function public.community_week_checkins()  to authenticated;
