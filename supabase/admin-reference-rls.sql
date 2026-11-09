-- Политики доступа для справочников AthleteMenu.
-- Выполнить в Supabase SQL Editor после создания profiles, products,
-- product_groups и sports. Чтение разрешено авторизованным пользователям,
-- добавление, изменение и удаление — только профилю с ролью admin.

create or replace function public.athletemenu_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

revoke all on function public.athletemenu_is_admin() from public;
grant execute on function public.athletemenu_is_admin() to authenticated;

alter table public.products enable row level security;
alter table public.product_groups enable row level security;
alter table public.sports enable row level security;

-- Удаляем возможные ранее созданные политики записи, иначе permissive RLS
-- политики объединятся через OR и более широкое правило может дать запись.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('products', 'product_groups', 'sports')
      and cmd <> 'SELECT'
  loop
    execute format('drop policy if exists %I on %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);
  end loop;
end;
$$;

drop policy if exists "Authenticated users can read products" on public.products;
drop policy if exists "Admins can manage products" on public.products;
create policy "Authenticated users can read products"
  on public.products for select to authenticated using (true);
create policy "Admins can manage products"
  on public.products for all to authenticated
  using (public.athletemenu_is_admin())
  with check (public.athletemenu_is_admin());

drop policy if exists "Authenticated users can read product groups" on public.product_groups;
drop policy if exists "Admins can manage product groups" on public.product_groups;
create policy "Authenticated users can read product groups"
  on public.product_groups for select to authenticated using (true);
create policy "Admins can manage product groups"
  on public.product_groups for all to authenticated
  using (public.athletemenu_is_admin())
  with check (public.athletemenu_is_admin());

drop policy if exists "Authenticated users can read sports" on public.sports;
drop policy if exists "Admins can manage sports" on public.sports;
create policy "Authenticated users can read sports"
  on public.sports for select to authenticated using (true);
create policy "Admins can manage sports"
  on public.sports for all to authenticated
  using (public.athletemenu_is_admin())
  with check (public.athletemenu_is_admin());
