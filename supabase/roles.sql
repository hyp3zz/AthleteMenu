-- AthleteMenu role management for existing administrators.
-- Run once in Supabase Dashboard -> SQL Editor after the initial admin account exists.

create or replace function public.admin_list_users()
returns table (
  id uuid,
  email text,
  full_name text,
  role text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select u.id,
         coalesce(u.email, ''),
         coalesce(p.full_name, ''),
         coalesce(p.role, 'athlete'),
         u.created_at
  from auth.users as u
  left join public.profiles as p on p.id = u.id
  where auth.uid() is not null
    and public.is_admin()
  order by u.created_at desc;
$function$;

create or replace function public.admin_set_user_role(p_email text, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_id uuid;
  current_role text;
  normalized_email text := lower(trim(coalesce(p_email, '')));
  normalized_role text := lower(trim(coalesce(p_role, '')));
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Only an administrator can change user roles' using errcode = '42501';
  end if;
  if normalized_role not in ('athlete', 'coach', 'admin') then
    raise exception 'Unsupported role';
  end if;
  if normalized_email = '' then
    raise exception 'Email is required';
  end if;

  select u.id into target_id
  from auth.users as u
  where lower(u.email) = normalized_email;
  if target_id is null then
    raise exception 'No account found for this email';
  end if;
  if target_id = auth.uid() and normalized_role <> 'admin' then
    raise exception 'You cannot remove your own administrator role';
  end if;

  -- Serialize administrator demotions so concurrent requests cannot remove
  -- the last administrator at the same time.
  if normalized_role <> 'admin' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('athletemenu-role-demotion'));
  end if;

  select p.role into current_role
  from public.profiles as p
  where p.id = target_id
  for update;
  if current_role is null then
    raise exception 'User profile was not found';
  end if;

  if current_role = 'admin' and normalized_role <> 'admin'
     and (select count(*) from public.profiles as p where p.role = 'admin') <= 1 then
    raise exception 'Cannot remove the last administrator';
  end if;

  update public.profiles as p
  set role = normalized_role
  where p.id = target_id;
end;
$function$;

revoke all on function public.admin_list_users() from public, anon;
revoke all on function public.admin_set_user_role(text, text) from public, anon;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_set_user_role(text, text) to authenticated;

notify pgrst, 'reload schema';
