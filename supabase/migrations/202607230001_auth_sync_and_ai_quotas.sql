create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ai_daily_limit integer not null default 10 check (ai_daily_limit between 0 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.planner_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{"tasks":[],"backlog":[]}'::jsonb,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  constraint planner_state_shape check (
    jsonb_typeof(state) = 'object'
    and jsonb_typeof(state -> 'tasks') = 'array'
    and jsonb_typeof(state -> 'backlog') = 'array'
  )
);

create table if not exists public.ai_daily_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_day date not null,
  used_actions integer not null default 0 check (used_actions >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_day)
);

alter table public.profiles enable row level security;
alter table public.planner_states enable row level security;
alter table public.ai_daily_usage enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "planner_states_select_own"
  on public.planner_states for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "planner_states_insert_own"
  on public.planner_states for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "planner_states_update_own"
  on public.planner_states for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "ai_daily_usage_select_own"
  on public.ai_daily_usage for select
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists create_profile_after_auth_user on auth.users;
create trigger create_profile_after_auth_user
  after insert on auth.users
  for each row execute function public.create_profile_for_auth_user();

insert into public.profiles (user_id)
select id from auth.users
on conflict (user_id) do nothing;

create or replace function public.save_planner_state(
  p_expected_revision bigint,
  p_state jsonb
)
returns table (
  saved boolean,
  revision bigint,
  state jsonb,
  updated_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if jsonb_typeof(p_state) <> 'object'
    or jsonb_typeof(p_state -> 'tasks') <> 'array'
    or jsonb_typeof(p_state -> 'backlog') <> 'array' then
    raise exception 'invalid planner state' using errcode = '22023';
  end if;

  if p_expected_revision = 0 then
    insert into public.planner_states (user_id, state, revision)
    values (v_user_id, p_state, 1)
    on conflict (user_id) do nothing;
    if found then
      return query
      select true, ps.revision, ps.state, ps.updated_at
      from public.planner_states ps where ps.user_id = v_user_id;
      return;
    end if;
  else
    update public.planner_states ps
      set state = p_state,
          revision = ps.revision + 1,
          updated_at = now()
      where ps.user_id = v_user_id
        and ps.revision = p_expected_revision;
    if found then
      return query
      select true, ps.revision, ps.state, ps.updated_at
      from public.planner_states ps where ps.user_id = v_user_id;
      return;
    end if;
  end if;

  return query
  select false, ps.revision, ps.state, ps.updated_at
  from public.planner_states ps where ps.user_id = v_user_id;
end;
$$;

grant execute on function public.save_planner_state(bigint, jsonb) to authenticated;
revoke all on function public.save_planner_state(bigint, jsonb) from public, anon;

create or replace function public.get_ai_usage(p_user_id uuid)
returns table (
  usage_day date,
  daily_limit integer,
  used_actions integer,
  reset_at timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  with current_day as (
    select (now() at time zone 'Europe/Warsaw')::date as day
  )
  select
    current_day.day,
    p.ai_daily_limit,
    coalesce(u.used_actions, 0),
    ((current_day.day + 1)::timestamp at time zone 'Europe/Warsaw')
  from current_day
  join public.profiles p on p.user_id = p_user_id
  left join public.ai_daily_usage u
    on u.user_id = p_user_id and u.usage_day = current_day.day;
$$;

create or replace function public.reserve_ai_action(p_user_id uuid)
returns table (
  allowed boolean,
  usage_day date,
  daily_limit integer,
  used_actions integer,
  reset_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'Europe/Warsaw')::date;
  v_limit integer;
  v_used integer;
begin
  select p.ai_daily_limit into v_limit
  from public.profiles p
  where p.user_id = p_user_id
  for update;

  if v_limit is null then
    raise exception 'profile not found';
  end if;

  if v_limit <= 0 then
    return query select false, v_day, v_limit, 0,
      ((v_day + 1)::timestamp at time zone 'Europe/Warsaw');
    return;
  end if;

  insert into public.ai_daily_usage (user_id, usage_day, used_actions)
  values (p_user_id, v_day, 1)
  on conflict on constraint ai_daily_usage_pkey do update
    set used_actions = public.ai_daily_usage.used_actions + 1,
        updated_at = now()
    where public.ai_daily_usage.used_actions < v_limit
  returning public.ai_daily_usage.used_actions into v_used;

  if v_used is null then
    select coalesce(u.used_actions, 0) into v_used
    from public.ai_daily_usage u
    where u.user_id = p_user_id and u.usage_day = v_day;
    return query select false, v_day, v_limit, coalesce(v_used, 0),
      ((v_day + 1)::timestamp at time zone 'Europe/Warsaw');
  else
    return query select true, v_day, v_limit, v_used,
      ((v_day + 1)::timestamp at time zone 'Europe/Warsaw');
  end if;
end;
$$;

create or replace function public.release_ai_action(p_user_id uuid, p_usage_day date)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.ai_daily_usage
    set used_actions = greatest(used_actions - 1, 0),
        updated_at = now()
  where user_id = p_user_id and usage_day = p_usage_day;
$$;

revoke all on function public.get_ai_usage(uuid) from public, anon, authenticated;
revoke all on function public.reserve_ai_action(uuid) from public, anon, authenticated;
revoke all on function public.release_ai_action(uuid, date) from public, anon, authenticated;
grant execute on function public.get_ai_usage(uuid) to service_role;
grant execute on function public.reserve_ai_action(uuid) to service_role;
grant execute on function public.release_ai_action(uuid, date) to service_role;

revoke all on public.profiles from public, anon, authenticated;
revoke all on public.planner_states from public, anon, authenticated;
revoke all on public.ai_daily_usage from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant select on public.ai_daily_usage to authenticated;
grant select, insert, update on public.planner_states to authenticated;
