-- Проверки RLS для Supabase SQL Editor.
-- Перед запуском замените UUID ниже на существующие ID тестовых аккаунтов и записей:
-- athlete A: спортсмен с активной связью с coach; athlete B: спортсмен без связи;
-- coach: тренер; admin: администратор; pending link: заявка coach -> athlete B;
-- foreign menu: меню athlete B.
-- Скрипт завершает всё ROLLBACK, поэтому записи не сохраняются.

begin;
set local role authenticated;

-- Спортсмен видит собственную строку профиля, но не профиль другого спортсмена.
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$ declare n integer;
begin
  select count(*) into n from public.profiles where id='11111111-1111-4111-8111-111111111111';
  if n <> 1 then raise exception 'FAIL: athlete must see own profile'; end if;
  select count(*) into n from public.profiles where id='22222222-2222-4222-8222-222222222222';
  if n <> 0 then raise exception 'FAIL: athlete can see another athlete profile'; end if;
  select count(*) into n from public.menus where id='55555555-5555-4555-8555-555555555555';
  if n <> 0 then raise exception 'FAIL: athlete can see a foreign menu'; end if;
end $$;

-- Смена собственной роли должна завершиться ошибкой защитного триггера.
do $$ begin
  begin
    update public.profiles set role='admin' where id='11111111-1111-4111-8111-111111111111';
    raise exception 'FAIL: role update unexpectedly succeeded';
  exception when others then
    if sqlerrm='FAIL: role update unexpectedly succeeded' then raise; end if;
    if position('Only an administrator' in sqlerrm)=0 then raise; end if;
  end;
end $$;

-- Спортсмен не может менять справочник продуктов.
do $$ begin
  begin
    insert into public.products(name,kcal_100,protein_100,fat_100,carbs_100)
    values ('RLS test product '||gen_random_uuid(),1,1,1,1);
    raise exception 'FAIL: athlete product insert unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Тренер читает активного спортсмена, не читает неподтверждённого и может создать только pending-заявку.
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
do $$ declare n integer;
begin
  select count(*) into n from public.athlete_profiles where user_id='11111111-1111-4111-8111-111111111111';
  if n <> 1 then raise exception 'FAIL: coach cannot read the actively linked athlete'; end if;
  select count(*) into n from public.athlete_profiles where user_id='22222222-2222-4222-8222-222222222222';
  if n <> 0 then raise exception 'FAIL: pending/unlinked athlete became visible'; end if;
  begin
    insert into public.coach_athletes(coach_id,athlete_id,status)
    values ('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222','active');
    raise exception 'FAIL: coach self-attachment unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  insert into public.coach_athletes(coach_id,athlete_id,status)
  values ('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222','pending')
  on conflict (coach_id,athlete_id) do nothing;
end $$;

-- Только спортсмен, которому адресована заявка, может принять её.
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$ declare n integer;
begin
  update public.coach_athletes set status='active'
  where id='44444444-4444-4444-8444-444444444444'
    and athlete_id='22222222-2222-4222-8222-222222222222' and status='pending';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: athlete could not accept the prepared pending link'; end if;
end $$;

-- Администратор видит чужой профиль и имеет доступ к справочникам.
select set_config('request.jwt.claim.sub','66666666-6666-4666-8666-666666666666',true);
do $$ declare n integer;
begin
  select count(*) into n from public.profiles where id='22222222-2222-4222-8222-222222222222';
  if n <> 1 then raise exception 'FAIL: admin cannot read another profile'; end if;
  insert into public.products(name,kcal_100,protein_100,fat_100,carbs_100)
  values ('RLS admin test '||gen_random_uuid(),1,1,1,1);
end $$;

reset role;
rollback;

-- Ожидаемые результаты: все блоки завершаются без FAIL; неавторизованные операции
-- отсекаются RLS/trigger, а запросы к чужим строкам возвращают 0 строк.
