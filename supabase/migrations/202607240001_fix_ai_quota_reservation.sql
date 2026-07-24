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

revoke all on function public.reserve_ai_action(uuid) from public, anon, authenticated;
grant execute on function public.reserve_ai_action(uuid) to service_role;
