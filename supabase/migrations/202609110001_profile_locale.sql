alter table public.profiles
  add column if not exists locale text not null default 'en';

alter table public.profiles
  drop constraint if exists profiles_locale_supported;

alter table public.profiles
  add constraint profiles_locale_supported check (locale in ('en', 'pl'));

create or replace function public.set_profile_locale(p_locale text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_locale text := lower(trim(coalesce(p_locale, '')));
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if v_locale not in ('en', 'pl') then
    raise exception 'unsupported locale' using errcode = '22023';
  end if;

  update public.profiles
    set locale = v_locale,
        updated_at = now()
    where user_id = v_user_id;

  if not found then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;
  return v_locale;
end;
$$;

revoke all on function public.set_profile_locale(text) from public, anon;
grant execute on function public.set_profile_locale(text) to authenticated;
