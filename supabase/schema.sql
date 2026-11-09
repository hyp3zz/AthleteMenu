-- AthleteMenu: базовая схема PostgreSQL для Supabase.
-- Выполнить целиком в Supabase Dashboard → SQL Editor → New query.
-- Скрипт создаёт таблицы, индексы, триггеры, RPC и политики RLS.

create extension if not exists pgcrypto;

-- Пользовательская учётная запись и роль. Пароль хранится только в Supabase Auth.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'athlete' check (role in ('athlete', 'coach', 'admin')),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sports (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.athlete_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  birth_date date,
  gender text check (gender is null or gender in ('male', 'female')),
  -- Legacy alias retained for the current browser client; synchronized by trigger.
  sex text check (sex is null or sex in ('Мужской', 'Женский')),
  height_cm numeric(5,2) check (height_cm is null or height_cm between 100 and 250),
  weight_kg numeric(6,2) check (weight_kg is null or weight_kg between 30 and 300),
  goal text check (goal is null or goal in ('набор мышечной массы', 'снижение веса', 'поддержание')),
  activity_level text check (activity_level is null or activity_level in ('низкий', 'средний', 'высокий', 'очень высокий')),
  sport_id uuid references public.sports(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Активная связь появляется только после подтверждения спортсменом.
create table if not exists public.coach_athletes (
  id uuid not null default gen_random_uuid() unique,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'active', 'revoked')),
  created_at timestamptz not null default now(),
  primary key (coach_id, athlete_id),
  check (coach_id <> athlete_id)
);

create table if not exists public.coach_link_requests (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (coach_id <> athlete_id)
);
create unique index if not exists coach_link_requests_one_pending_idx
  on public.coach_link_requests (coach_id, athlete_id) where status = 'pending';

create table if not exists public.product_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.product_groups(id) on delete set null,
  name text not null unique,
  calories_kcal_per_100g numeric(10,2) not null default 0 check (calories_kcal_per_100g >= 0),
  protein_g_per_100g numeric(10,2) not null default 0 check (protein_g_per_100g >= 0),
  fat_g_per_100g numeric(10,2) not null default 0 check (fat_g_per_100g >= 0),
  carbs_g_per_100g numeric(10,2) not null default 0 check (carbs_g_per_100g >= 0),
  image_path text,
  kcal_100 numeric(10,2) not null default 0 check (kcal_100 >= 0),
  protein_100 numeric(10,2) not null default 0 check (protein_100 >= 0),
  fat_100 numeric(10,2) not null default 0 check (fat_100 >= 0),
  carbs_100 numeric(10,2) not null default 0 check (carbs_100 >= 0),
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  sport_id uuid references public.sports(id) on delete set null,
  title text not null default 'Тренировка',
  starts_at timestamptz not null,
  duration_min integer not null default 60 check (duration_min > 0),
  duration_minutes integer not null check (duration_minutes between 1 and 600),
  intensity text check (intensity is null or intensity in ('low', 'medium', 'high', 'низкая', 'средняя', 'высокая')),
  status text not null default 'planned' check (status in ('planned', 'done', 'skipped')),
  created_by uuid references public.profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.menus (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  title text not null default 'Меню',
  type text not null default 'day' check (type in ('day', 'week')),
  start_date date,
  end_date date,
  period_start date not null,
  period_end date not null,
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create table if not exists public.menu_days (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid not null references public.menus(id) on delete cascade,
  menu_date date not null,
  day_date date,
  target_kcal numeric(10,2) check (target_kcal is null or target_kcal >= 0),
  target_protein_g numeric(10,2) check (target_protein_g is null or target_protein_g >= 0),
  target_protein numeric(10,2) check (target_protein is null or target_protein >= 0),
  target_fat_g numeric(10,2) check (target_fat_g is null or target_fat_g >= 0),
  target_fat numeric(10,2) check (target_fat is null or target_fat >= 0),
  target_carbs_g numeric(10,2) check (target_carbs_g is null or target_carbs_g >= 0),
  target_carbs numeric(10,2) check (target_carbs is null or target_carbs >= 0),
  created_at timestamptz not null default now(),
  unique (menu_id, menu_date)
);

create table if not exists public.meals (
  id uuid primary key default gen_random_uuid(),
  menu_day_id uuid not null references public.menu_days(id) on delete cascade,
  name text not null,
  meal_type text check (meal_type is null or meal_type in ('breakfast', 'second_breakfast', 'lunch', 'snack', 'dinner')),
  meal_time time,
  planned_time time,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- Пищевая ценность копируется в строку приёма пищи и не меняется при правках каталога.
create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references public.meals(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name_snapshot text not null,
  product_name text,
  grams numeric(8,2) check (grams is null or (grams > 0 and grams <= 2000)),
  kcal_100 numeric(10,2) check (kcal_100 is null or kcal_100 >= 0),
  protein_100 numeric(10,2) check (protein_100 is null or protein_100 >= 0),
  fat_100 numeric(10,2) check (fat_100 is null or fat_100 >= 0),
  carbs_100 numeric(10,2) check (carbs_100 is null or carbs_100 >= 0),
  quantity_g numeric(8,2) not null check (quantity_g > 0 and quantity_g <= 2000),
  calories_kcal_per_100g numeric(10,2) not null default 0 check (calories_kcal_per_100g >= 0),
  protein_g_per_100g numeric(10,2) not null default 0 check (protein_g_per_100g >= 0),
  fat_g_per_100g numeric(10,2) not null default 0 check (fat_g_per_100g >= 0),
  carbs_g_per_100g numeric(10,2) not null default 0 check (carbs_g_per_100g >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.nutrition_results (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid references public.profiles(id) on delete cascade,
  -- Legacy alias used by older app queries.
  user_id uuid references public.profiles(id) on delete cascade,
  result_date date not null,
  actual_kcal numeric(10,2),
  actual_protein_g numeric(10,2),
  actual_fat_g numeric(10,2),
  actual_carbs_g numeric(10,2),
  actual_protein numeric(10,2),
  actual_fat numeric(10,2),
  actual_carbs numeric(10,2),
  target_kcal numeric(10,2),
  target_protein_g numeric(10,2),
  target_fat_g numeric(10,2),
  target_carbs_g numeric(10,2),
  target_protein numeric(10,2),
  target_fat numeric(10,2),
  target_carbs numeric(10,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (athlete_id, result_date),
  unique (user_id, result_date)
);

create table if not exists public.weight_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  recorded_on date not null default current_date,
  weight_kg numeric(6,2) not null check (weight_kg between 30 and 300),
  created_at timestamptz not null default now(),
  unique (user_id, recorded_on)
);

create table if not exists public.weight_log (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  logged_on date not null default current_date,
  weight_kg numeric(6,2) not null check (weight_kg between 30 and 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (athlete_id, logged_on)
);

-- Миграция существующих инсталляций: добавляет канонические поля, не удаляя
-- данные и старые колонки, которые использует ранняя версия интерфейса.
alter table public.athlete_profiles add column if not exists gender text;
alter table public.athlete_profiles add column if not exists target_weight_kg numeric(6,2);
alter table public.athlete_profiles add column if not exists allergies text[] not null default '{}';
alter table public.athlete_profiles add column if not exists created_at timestamptz not null default now();
alter table public.coach_athletes add column if not exists id uuid;
alter table public.coach_athletes add column if not exists status text;
update public.coach_athletes set id = gen_random_uuid() where id is null;
update public.coach_athletes set status = 'active' where status is null;
alter table public.coach_athletes alter column id set default gen_random_uuid();
alter table public.coach_athletes alter column id set not null;
alter table public.coach_athletes alter column status set default 'pending';
alter table public.coach_athletes alter column status set not null;
create unique index if not exists coach_athletes_id_uidx on public.coach_athletes(id);

alter table public.products add column if not exists kcal_100 numeric(10,2);
alter table public.products add column if not exists protein_100 numeric(10,2);
alter table public.products add column if not exists fat_100 numeric(10,2);
alter table public.products add column if not exists carbs_100 numeric(10,2);
alter table public.products add column if not exists image_url text;
update public.products set kcal_100 = coalesce(kcal_100, calories_kcal_per_100g),
  protein_100 = coalesce(protein_100, protein_g_per_100g), fat_100 = coalesce(fat_100, fat_g_per_100g),
  carbs_100 = coalesce(carbs_100, carbs_g_per_100g), image_url = coalesce(image_url, image_path);
alter table public.products alter column kcal_100 set default 0;
alter table public.products alter column protein_100 set default 0;
alter table public.products alter column fat_100 set default 0;
alter table public.products alter column carbs_100 set default 0;
alter table public.products alter column kcal_100 set not null;
alter table public.products alter column protein_100 set not null;
alter table public.products alter column fat_100 set not null;
alter table public.products alter column carbs_100 set not null;

alter table public.training_sessions add column if not exists title text;
alter table public.training_sessions add column if not exists duration_min integer;
alter table public.training_sessions add column if not exists status text;
alter table public.training_sessions add column if not exists created_by uuid references public.profiles(id) on delete set null;
update public.training_sessions set duration_min = duration_minutes where duration_min is null;
update public.training_sessions set title = coalesce(nullif(notes,''),'Тренировка') where title is null;
update public.training_sessions set status = case when starts_at < now() then 'done' else 'planned' end where status is null;
do $$ declare c record;
begin
  for c in select conname from pg_constraint where conrelid='public.training_sessions'::regclass and contype='c' and (pg_get_constraintdef(oid) ilike '%intensity%' or pg_get_constraintdef(oid) ilike '%status%')
  loop execute format('alter table public.training_sessions drop constraint %I',c.conname); end loop;
  for c in select conname from pg_constraint where conrelid='public.athlete_profiles'::regclass and contype='c' and (pg_get_constraintdef(oid) ilike '%goal%' or pg_get_constraintdef(oid) ilike '%activity_level%')
  loop execute format('alter table public.athlete_profiles drop constraint %I',c.conname); end loop;
  for c in select conname from pg_constraint where conrelid='public.menus'::regclass and contype='c' and pg_get_constraintdef(oid) ilike '%type%'
  loop execute format('alter table public.menus drop constraint %I',c.conname); end loop;
  for c in select conname from pg_constraint where conrelid='public.meals'::regclass and contype='c' and pg_get_constraintdef(oid) ilike '%meal_type%'
  loop execute format('alter table public.meals drop constraint %I',c.conname); end loop;
end $$;
update public.training_sessions set intensity = case lower(intensity) when 'низкая' then 'low' when 'средняя' then 'medium' when 'высокая' then 'high' else intensity end;
update public.training_sessions set status = case lower(status) when 'completed' then 'done' when 'выполнено' then 'done' when 'cancelled' then 'skipped' when 'пропущено' then 'skipped' when 'scheduled' then 'planned' else status end;
update public.training_sessions set created_by = athlete_id where created_by is null;
alter table public.training_sessions alter column title set default 'Тренировка';
alter table public.training_sessions alter column title set not null;
alter table public.training_sessions alter column duration_min set not null;
alter table public.training_sessions alter column status set default 'planned';
alter table public.training_sessions alter column status set not null;

alter table public.menus add column if not exists type text;
alter table public.menus add column if not exists start_date date;
alter table public.menus add column if not exists end_date date;
update public.menus set type='day' where type is null;
update public.menus set type=case lower(type) when 'daily' then 'day' when 'weekly' then 'week' else type end;
update public.menus set start_date=period_start where start_date is null;
update public.menus set end_date=period_end where end_date is null;
alter table public.menus alter column type set default 'day';
alter table public.menus alter column type set not null;
alter table public.menus alter column start_date set not null;
alter table public.menus alter column end_date set not null;

alter table public.menu_days add column if not exists day_date date;
alter table public.menu_days add column if not exists target_protein numeric(10,2);
alter table public.menu_days add column if not exists target_fat numeric(10,2);
alter table public.menu_days add column if not exists target_carbs numeric(10,2);
update public.menu_days set day_date=coalesce(day_date,menu_date), target_protein=coalesce(target_protein,target_protein_g),
  target_fat=coalesce(target_fat,target_fat_g), target_carbs=coalesce(target_carbs,target_carbs_g);
alter table public.menu_days alter column day_date set not null;
create unique index if not exists menu_days_menu_day_date_uidx on public.menu_days(menu_id,day_date);

alter table public.meals add column if not exists meal_type text;
alter table public.meals add column if not exists meal_time time;
update public.meals set meal_type=case lower(name) when 'завтрак' then 'breakfast' when 'обед' then 'lunch'
  when 'ужин' then 'dinner' when 'перекус' then 'snack' when 'полдник' then 'snack'
  when 'breakfast' then 'breakfast' when 'second_breakfast' then 'second_breakfast'
  when 'lunch' then 'lunch' when 'snack' then 'snack' when 'dinner' then 'dinner' else 'snack' end where meal_type is null;
update public.meals set meal_time=planned_time where meal_time is null;
alter table public.meals alter column meal_type set default 'breakfast';
alter table public.meals alter column meal_type set not null;

alter table public.menu_items add column if not exists product_name text;
alter table public.menu_items add column if not exists grams numeric(8,2);
alter table public.menu_items add column if not exists kcal_100 numeric(10,2);
alter table public.menu_items add column if not exists protein_100 numeric(10,2);
alter table public.menu_items add column if not exists fat_100 numeric(10,2);
alter table public.menu_items add column if not exists carbs_100 numeric(10,2);
update public.menu_items set product_name=coalesce(product_name,product_name_snapshot), grams=coalesce(grams,quantity_g),
  kcal_100=coalesce(kcal_100,calories_kcal_per_100g), protein_100=coalesce(protein_100,protein_g_per_100g),
  fat_100=coalesce(fat_100,fat_g_per_100g), carbs_100=coalesce(carbs_100,carbs_g_per_100g);
alter table public.menu_items alter column product_name set not null;
alter table public.menu_items alter column grams set not null;
alter table public.menu_items alter column kcal_100 set not null;
alter table public.menu_items alter column protein_100 set not null;
alter table public.menu_items alter column fat_100 set not null;
alter table public.menu_items alter column carbs_100 set not null;

alter table public.nutrition_results add column if not exists athlete_id uuid;
alter table public.nutrition_results add column if not exists actual_protein numeric(10,2);
alter table public.nutrition_results add column if not exists actual_fat numeric(10,2);
alter table public.nutrition_results add column if not exists actual_carbs numeric(10,2);
alter table public.nutrition_results add column if not exists target_protein numeric(10,2);
alter table public.nutrition_results add column if not exists target_fat numeric(10,2);
alter table public.nutrition_results add column if not exists target_carbs numeric(10,2);
alter table public.nutrition_results add column if not exists updated_at timestamptz not null default now();
do $$ begin
  if exists (select 1 from pg_attribute where attrelid='public.nutrition_results'::regclass and attname='athlete_id' and attgenerated <> '') then
    alter table public.nutrition_results alter column athlete_id drop expression;
  end if;
end $$;
update public.nutrition_results set athlete_id=coalesce(athlete_id,user_id), user_id=coalesce(user_id,athlete_id),
  actual_protein=coalesce(actual_protein,actual_protein_g), actual_fat=coalesce(actual_fat,actual_fat_g), actual_carbs=coalesce(actual_carbs,actual_carbs_g),
  target_protein=coalesce(target_protein,target_protein_g), target_fat=coalesce(target_fat,target_fat_g), target_carbs=coalesce(target_carbs,target_carbs_g);
alter table public.nutrition_results alter column athlete_id set not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.nutrition_results'::regclass and conname='nutrition_results_athlete_id_fkey') then
    alter table public.nutrition_results add constraint nutrition_results_athlete_id_fkey foreign key (athlete_id) references public.profiles(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.nutrition_results'::regclass and conname='nutrition_results_athlete_date_key') then
    alter table public.nutrition_results add constraint nutrition_results_athlete_date_key unique (athlete_id,result_date);
  end if;
end $$;

alter table public.coach_athletes add column if not exists updated_at timestamptz not null default now();
alter table public.menu_days add column if not exists updated_at timestamptz not null default now();
alter table public.meals add column if not exists updated_at timestamptz not null default now();
alter table public.menu_items add column if not exists updated_at timestamptz not null default now();
alter table public.weight_entries add column if not exists updated_at timestamptz not null default now();
alter table public.weight_log add column if not exists updated_at timestamptz not null default now();

update public.athlete_profiles set
  gender=coalesce(gender,case lower(sex) when 'мужской' then 'male' when 'женский' then 'female' else null end),
  goal=case lower(goal) when 'набор мышечной массы' then 'gain' when 'снижение веса' then 'lose' when 'поддержание' then 'maintain' else goal end,
  activity_level=case lower(activity_level) when 'низкий' then 'low' when 'средний' then 'medium' when 'высокий' then 'high' when 'очень высокий' then 'very_high' else activity_level end;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.athlete_profiles'::regclass and conname='athlete_profiles_gender_check') then alter table public.athlete_profiles add constraint athlete_profiles_gender_check check (gender is null or gender in ('male','female')); end if;
  if not exists (select 1 from pg_constraint where conrelid='public.athlete_profiles'::regclass and conname='athlete_profiles_goal_check') then alter table public.athlete_profiles add constraint athlete_profiles_goal_check check (goal is null or goal in ('gain','lose','maintain')); end if;
  if not exists (select 1 from pg_constraint where conrelid='public.athlete_profiles'::regclass and conname='athlete_profiles_activity_check') then alter table public.athlete_profiles add constraint athlete_profiles_activity_check check (activity_level is null or activity_level in ('low','medium','high','very_high')); end if;
  if not exists (select 1 from pg_constraint where conrelid='public.training_sessions'::regclass and conname='training_sessions_intensity_check') then alter table public.training_sessions add constraint training_sessions_intensity_check check (intensity is null or intensity in ('low','medium','high')); end if;
  if not exists (select 1 from pg_constraint where conrelid='public.training_sessions'::regclass and conname='training_sessions_status_check') then alter table public.training_sessions add constraint training_sessions_status_check check (status in ('planned','done','skipped')); end if;
  if not exists (select 1 from pg_constraint where conrelid='public.coach_athletes'::regclass and conname='coach_athletes_status_check') then alter table public.coach_athletes add constraint coach_athletes_status_check check (status in ('pending','active','revoked')); end if;
  if not exists (select 1 from pg_constraint where conrelid='public.menus'::regclass and conname='menus_type_check') then alter table public.menus add constraint menus_type_check check (type in ('day','week')); end if;
  if not exists (select 1 from pg_constraint where conrelid='public.meals'::regclass and conname='meals_type_check') then alter table public.meals add constraint meals_type_check check (meal_type in ('breakfast','second_breakfast','lunch','snack','dinner')); end if;
  if not exists (select 1 from pg_constraint where conrelid='public.menu_items'::regclass and conname='menu_items_grams_check') then alter table public.menu_items add constraint menu_items_grams_check check (grams > 0 and grams <= 2000); end if;
  if not exists (select 1 from pg_constraint where conrelid='public.training_sessions'::regclass and conname='training_sessions_duration_min_check') then alter table public.training_sessions add constraint training_sessions_duration_min_check check (duration_min>0); end if;
  if not exists (select 1 from pg_constraint where conrelid='public.menu_days'::regclass and conname='menu_days_target_protein_check') then alter table public.menu_days add constraint menu_days_target_protein_check check (target_protein is null or target_protein>=0); end if;
  if not exists (select 1 from pg_constraint where conrelid='public.menu_days'::regclass and conname='menu_days_target_fat_check') then alter table public.menu_days add constraint menu_days_target_fat_check check (target_fat is null or target_fat>=0); end if;
  if not exists (select 1 from pg_constraint where conrelid='public.menu_days'::regclass and conname='menu_days_target_carbs_check') then alter table public.menu_days add constraint menu_days_target_carbs_check check (target_carbs is null or target_carbs>=0); end if;
  if not exists (select 1 from pg_constraint where conrelid='public.products'::regclass and conname='products_kcal_100_check') then alter table public.products add constraint products_kcal_100_check check (kcal_100>=0); end if;
  if not exists (select 1 from pg_constraint where conrelid='public.products'::regclass and conname='products_protein_100_check') then alter table public.products add constraint products_protein_100_check check (protein_100>=0); end if;
  if not exists (select 1 from pg_constraint where conrelid='public.products'::regclass and conname='products_fat_100_check') then alter table public.products add constraint products_fat_100_check check (fat_100>=0); end if;
  if not exists (select 1 from pg_constraint where conrelid='public.products'::regclass and conname='products_carbs_100_check') then alter table public.products add constraint products_carbs_100_check check (carbs_100>=0); end if;
  if not exists (select 1 from pg_constraint where conrelid='public.athlete_profiles'::regclass and conname='athlete_profiles_target_weight_check') then alter table public.athlete_profiles add constraint athlete_profiles_target_weight_check check (target_weight_kg is null or target_weight_kg between 30 and 300); end if;
end $$;
create unique index if not exists products_name_lower_uidx on public.products(lower(name));
create index if not exists coach_athletes_athlete_idx on public.coach_athletes(athlete_id);
create index if not exists products_group_idx on public.products(group_id);
create index if not exists training_sessions_sport_idx on public.training_sessions(sport_id);
create index if not exists training_sessions_created_by_idx on public.training_sessions(created_by);
create index if not exists menus_author_idx on public.menus(author_id);
create index if not exists menu_days_day_date_idx on public.menu_days(day_date);
create index if not exists menu_items_product_idx on public.menu_items(product_id);
create index if not exists weight_log_athlete_date_idx on public.weight_log(athlete_id,logged_on desc);

create index if not exists athlete_profiles_sport_idx on public.athlete_profiles (sport_id);
create index if not exists training_sessions_athlete_starts_idx on public.training_sessions (athlete_id, starts_at desc);
create index if not exists menus_owner_period_idx on public.menus (owner_id, period_start desc);
create index if not exists menu_days_menu_date_idx on public.menu_days (menu_id, menu_date);
create index if not exists meals_menu_day_order_idx on public.meals (menu_day_id, sort_order);
create index if not exists menu_items_meal_order_idx on public.menu_items (meal_id, sort_order);
create index if not exists nutrition_results_user_date_idx on public.nutrition_results (user_id, result_date desc);
create index if not exists weight_entries_user_date_idx on public.weight_entries (user_id, recorded_on desc);

create or replace function public.athletemenu_set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.athletemenu_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.athletemenu_is_coach_of(target_athlete uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.coach_athletes
    where coach_id = auth.uid() and athlete_id = target_athlete and status = 'active'
  );
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id=auth.uid() and role='admin');
$$;

create or replace function public.is_coach_of(target_athlete uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.coach_athletes where coach_id=auth.uid() and athlete_id=target_athlete and status='active');
$$;

create or replace function public.can_access_athlete(target_athlete uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select target_athlete=auth.uid() or public.is_admin() or public.is_coach_of(target_athlete);
$$;

create or replace function public.can_manage_athlete(target_athlete uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select target_athlete=auth.uid() or public.is_coach_of(target_athlete);
$$;

create or replace function public.athletemenu_is_athlete(target_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id=target_id and role='athlete');
$$;

create or replace function public.athletemenu_can_manage_athlete(target_athlete uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_access_athlete(target_athlete);
$$;

create or replace function public.athletemenu_can_access_menu(target_menu uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.menus m
    where m.id = target_menu and public.athletemenu_can_manage_athlete(m.owner_id)
  );
$$;

create or replace function public.athletemenu_can_access_menu_day(target_day uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.menu_days d
    join public.menus m on m.id = d.menu_id
    where d.id = target_day and public.athletemenu_can_manage_athlete(m.owner_id)
  );
$$;

create or replace function public.athletemenu_can_access_meal(target_meal uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.meals meal
    join public.menu_days d on d.id = meal.menu_day_id
    join public.menus m on m.id = d.menu_id
    where meal.id = target_meal and public.athletemenu_can_manage_athlete(m.owner_id)
  );
$$;

create or replace function public.athletemenu_create_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(new.email, ''), '@', 1)),
    'athlete'
  ) on conflict (id) do nothing;
  insert into public.athlete_profiles(user_id) values(new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

create or replace function public.athletemenu_protect_profile_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'Only an administrator can change a user role';
  end if;
  return new;
end;
$$;

create or replace function public.athletemenu_snapshot_product()
returns trigger language plpgsql security definer set search_path = public as $$
declare catalog_product public.products%rowtype;
begin
  if new.product_id is not null then
    select * into catalog_product from public.products where id = new.product_id;
    if found and new.product_name is null and new.product_name_snapshot is null then
      new.product_name := catalog_product.name;
      new.kcal_100 := catalog_product.kcal_100;
      new.protein_100 := catalog_product.protein_100;
      new.fat_100 := catalog_product.fat_100;
      new.carbs_100 := catalog_product.carbs_100;
    elsif found and new.product_name is not null then
      new.kcal_100 := coalesce(new.kcal_100,catalog_product.kcal_100);
      new.protein_100 := coalesce(new.protein_100,catalog_product.protein_100);
      new.fat_100 := coalesce(new.fat_100,catalog_product.fat_100);
      new.carbs_100 := coalesce(new.carbs_100,catalog_product.carbs_100);
    end if;
  end if;
  new.product_name := coalesce(new.product_name,new.product_name_snapshot,'Без названия');
  new.grams := coalesce(new.grams,new.quantity_g);
  new.kcal_100 := coalesce(new.kcal_100,new.calories_kcal_per_100g,0);
  new.protein_100 := coalesce(new.protein_100,new.protein_g_per_100g,0);
  new.fat_100 := coalesce(new.fat_100,new.fat_g_per_100g,0);
  new.carbs_100 := coalesce(new.carbs_100,new.carbs_g_per_100g,0);
  new.product_name_snapshot := new.product_name;
  new.quantity_g := new.grams;
  new.calories_kcal_per_100g := new.kcal_100;
  new.protein_g_per_100g := new.protein_100;
  new.fat_g_per_100g := new.fat_100;
  new.carbs_g_per_100g := new.carbs_100;
  return new;
end;
$$;

create or replace function public.athletemenu_sync_athlete_profile()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.gender is null and new.sex is not null then
    new.gender := case lower(new.sex) when 'мужской' then 'male' when 'женский' then 'female' else null end;
  elsif new.gender is not null then
    new.sex := case new.gender when 'male' then 'Мужской' when 'female' then 'Женский' else new.sex end;
  end if;
  if new.goal in ('набор мышечной массы','снижение веса','поддержание') then
    new.goal := case new.goal when 'набор мышечной массы' then 'gain' when 'снижение веса' then 'lose' else 'maintain' end;
  end if;
  if new.activity_level in ('низкий','средний','высокий','очень высокий') then
    new.activity_level := case new.activity_level when 'низкий' then 'low' when 'средний' then 'medium' when 'высокий' then 'high' else 'very_high' end;
  end if;
  return new;
end;
$$;

create or replace function public.athletemenu_sync_product_columns()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op='INSERT' then
    if new.kcal_100 is null or (new.kcal_100=0 and new.calories_kcal_per_100g<>0) then new.kcal_100:=new.calories_kcal_per_100g; else new.calories_kcal_per_100g:=new.kcal_100; end if;
    if new.protein_100 is null or (new.protein_100=0 and new.protein_g_per_100g<>0) then new.protein_100:=new.protein_g_per_100g; else new.protein_g_per_100g:=new.protein_100; end if;
    if new.fat_100 is null or (new.fat_100=0 and new.fat_g_per_100g<>0) then new.fat_100:=new.fat_g_per_100g; else new.fat_g_per_100g:=new.fat_100; end if;
    if new.carbs_100 is null or (new.carbs_100=0 and new.carbs_g_per_100g<>0) then new.carbs_100:=new.carbs_g_per_100g; else new.carbs_g_per_100g:=new.carbs_100; end if;
    new.image_url:=coalesce(new.image_url,new.image_path);
    new.image_path:=coalesce(new.image_path,new.image_url);
  else
    if new.kcal_100 is distinct from old.kcal_100 then new.calories_kcal_per_100g:=new.kcal_100; elsif new.calories_kcal_per_100g is distinct from old.calories_kcal_per_100g then new.kcal_100:=new.calories_kcal_per_100g; end if;
    if new.protein_100 is distinct from old.protein_100 then new.protein_g_per_100g:=new.protein_100; elsif new.protein_g_per_100g is distinct from old.protein_g_per_100g then new.protein_100:=new.protein_g_per_100g; end if;
    if new.fat_100 is distinct from old.fat_100 then new.fat_g_per_100g:=new.fat_100; elsif new.fat_g_per_100g is distinct from old.fat_g_per_100g then new.fat_100:=new.fat_g_per_100g; end if;
    if new.carbs_100 is distinct from old.carbs_100 then new.carbs_g_per_100g:=new.carbs_100; elsif new.carbs_g_per_100g is distinct from old.carbs_g_per_100g then new.carbs_100:=new.carbs_g_per_100g; end if;
    if new.image_url is distinct from old.image_url then new.image_path:=new.image_url; elsif new.image_path is distinct from old.image_path then new.image_url:=new.image_path; end if;
  end if;
  return new;
end;
$$;

create or replace function public.athletemenu_sync_menu_columns()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.start_date is null then new.start_date:=new.period_start; end if;
  if new.end_date is null then new.end_date:=new.period_end; end if;
  if new.period_start is null then new.period_start:=new.start_date; end if;
  if new.period_end is null then new.period_end:=new.end_date; end if;
  if new.start_date is distinct from old.start_date then new.period_start:=new.start_date;
  elsif new.period_start is distinct from old.period_start then new.start_date:=new.period_start; end if;
  if new.end_date is distinct from old.end_date then new.period_end:=new.end_date;
  elsif new.period_end is distinct from old.period_end then new.end_date:=new.period_end; end if;
  if new.type is null or (tg_op='INSERT' and new.type='day' and new.start_date<>new.end_date) then new.type:=case when new.start_date=new.end_date then 'day' else 'week' end; end if;
  return new;
end;
$$;

create or replace function public.athletemenu_sync_menu_day_columns()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.day_date is null then new.day_date:=new.menu_date; end if;
  if new.menu_date is null then new.menu_date:=new.day_date; end if;
  if new.day_date is distinct from old.day_date then new.menu_date:=new.day_date;
  elsif new.menu_date is distinct from old.menu_date then new.day_date:=new.menu_date; end if;
  new.target_protein:=coalesce(new.target_protein,new.target_protein_g); new.target_protein_g:=coalesce(new.target_protein_g,new.target_protein);
  new.target_fat:=coalesce(new.target_fat,new.target_fat_g); new.target_fat_g:=coalesce(new.target_fat_g,new.target_fat);
  new.target_carbs:=coalesce(new.target_carbs,new.target_carbs_g); new.target_carbs_g:=coalesce(new.target_carbs_g,new.target_carbs);
  if new.target_protein is distinct from old.target_protein then new.target_protein_g:=new.target_protein; elsif new.target_protein_g is distinct from old.target_protein_g then new.target_protein:=new.target_protein_g; end if;
  if new.target_fat is distinct from old.target_fat then new.target_fat_g:=new.target_fat; elsif new.target_fat_g is distinct from old.target_fat_g then new.target_fat:=new.target_fat_g; end if;
  if new.target_carbs is distinct from old.target_carbs then new.target_carbs_g:=new.target_carbs; elsif new.target_carbs_g is distinct from old.target_carbs_g then new.target_carbs:=new.target_carbs_g; end if;
  return new;
end;
$$;

create or replace function public.athletemenu_sync_meal_columns()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.meal_type is null then new.meal_type:=case lower(new.name) when 'завтрак' then 'breakfast' when 'обед' then 'lunch' when 'ужин' then 'dinner' when 'second_breakfast' then 'second_breakfast' else 'snack' end; end if;
  if new.name is null then new.name:=case new.meal_type when 'breakfast' then 'Завтрак' when 'second_breakfast' then 'Второй завтрак' when 'lunch' then 'Обед' when 'snack' then 'Перекус' when 'dinner' then 'Ужин' end; end if;
  if new.meal_type is distinct from old.meal_type then new.name:=case new.meal_type when 'breakfast' then 'Завтрак' when 'second_breakfast' then 'Второй завтрак' when 'lunch' then 'Обед' when 'snack' then 'Перекус' when 'dinner' then 'Ужин' end;
  elsif new.name is distinct from old.name then new.meal_type:=case lower(new.name) when 'завтрак' then 'breakfast' when 'второй завтрак' then 'second_breakfast' when 'обед' then 'lunch' when 'ужин' then 'dinner' else 'snack' end; end if;
  if new.meal_time is null then new.meal_time:=new.planned_time; end if;
  if new.planned_time is null then new.planned_time:=new.meal_time; end if;
  if new.meal_time is distinct from old.meal_time then new.planned_time:=new.meal_time; elsif new.planned_time is distinct from old.planned_time then new.meal_time:=new.planned_time; end if;
  return new;
end;
$$;

create or replace function public.athletemenu_sync_training_columns()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op='INSERT' then
    if new.duration_minutes is null then new.duration_minutes:=new.duration_min; elsif new.duration_min is null or (new.duration_min=60 and new.duration_minutes<>60) then new.duration_min:=new.duration_minutes; end if;
  elsif new.duration_min is distinct from old.duration_min then new.duration_minutes:=new.duration_min;
  elsif new.duration_minutes is distinct from old.duration_minutes then new.duration_min:=new.duration_minutes; end if;
  if new.intensity in ('низкая','средняя','высокая') then new.intensity:=case new.intensity when 'низкая' then 'low' when 'средняя' then 'medium' else 'high' end; end if;
  if new.created_by is null then new.created_by:=auth.uid(); end if;
  return new;
end;
$$;

create or replace function public.athletemenu_sync_nutrition_columns()
returns trigger language plpgsql set search_path = public as $$
declare athlete_is_generated boolean;
begin
  select attgenerated<>'' into athlete_is_generated from pg_attribute where attrelid='public.nutrition_results'::regclass and attname='athlete_id';
  if new.athlete_id is null then new.athlete_id:=new.user_id; end if;
  if not athlete_is_generated and new.user_id is null then new.user_id:=new.athlete_id; end if;
  if new.actual_protein is null then new.actual_protein:=new.actual_protein_g; end if;
  if new.actual_fat is null then new.actual_fat:=new.actual_fat_g; end if;
  if new.actual_carbs is null then new.actual_carbs:=new.actual_carbs_g; end if;
  if new.target_protein is null then new.target_protein:=new.target_protein_g; end if;
  if new.target_fat is null then new.target_fat:=new.target_fat_g; end if;
  if new.target_carbs is null then new.target_carbs:=new.target_carbs_g; end if;
  new.actual_protein_g:=new.actual_protein; new.actual_fat_g:=new.actual_fat; new.actual_carbs_g:=new.actual_carbs;
  new.target_protein_g:=new.target_protein; new.target_fat_g:=new.target_fat; new.target_carbs_g:=new.target_carbs;
  return new;
end;
$$;

create or replace function public.athletemenu_guard_coach_link()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op='UPDATE' and not public.is_admin() and (new.id is distinct from old.id or new.coach_id is distinct from old.coach_id or new.athlete_id is distinct from old.athlete_id or new.created_at is distinct from old.created_at) then
    raise exception 'Coach link participants cannot be changed';
  end if;
  return new;
end;
$$;

create or replace function public.request_coach_athlete_link(athlete_email text)
returns void language plpgsql security definer set search_path = public as $$
declare target_id uuid;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'coach'
  ) then
    raise exception 'Only coaches can request an athlete link';
  end if;

  select u.id into target_id
  from auth.users u
  join public.profiles p on p.id = u.id and p.role = 'athlete'
  where lower(u.email) = lower(trim(athlete_email))
    and u.id <> auth.uid()
  limit 1;

  -- Возвращаем одинаковый результат для неизвестного email, чтобы не раскрывать список пользователей.
  if target_id is null or exists (
    select 1 from public.coach_athletes where coach_id = auth.uid() and athlete_id = target_id and status in ('pending','active')
  ) then return; end if;

  insert into public.coach_athletes (coach_id, athlete_id, status)
  values (auth.uid(), target_id, 'pending')
  on conflict (coach_id, athlete_id) do update set status='pending', created_at=now()
  where public.coach_athletes.status='revoked';
end;
$$;

create or replace function public.respond_to_coach_request(request_id uuid, accept_request boolean)
returns void language plpgsql security definer set search_path = public as $$
declare request_row public.coach_athletes%rowtype;
begin
  select * into request_row
  from public.coach_athletes
  where id = request_id and athlete_id = auth.uid() and status = 'pending'
  for update;
  if not found then raise exception 'Request not found or already answered'; end if;

  update public.coach_athletes
  set status = case when accept_request then 'active' else 'revoked' end
  where id = request_row.id;
end;
$$;

drop trigger if exists on_auth_user_created_athletemenu on auth.users;
create trigger on_auth_user_created_athletemenu
  after insert on auth.users
  for each row execute function public.athletemenu_create_profile();

-- Создаём профили и для аккаунтов, зарегистрированных до установки схемы.
insert into public.profiles (id, full_name, role)
select
  u.id,
  coalesce(nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(u.email, ''), '@', 1)),
  'athlete'
from auth.users u
on conflict (id) do nothing;

insert into public.athlete_profiles(user_id)
select id from public.profiles on conflict (user_id) do nothing;

drop trigger if exists protect_profile_role_athletemenu on public.profiles;
create trigger protect_profile_role_athletemenu
  before update on public.profiles
  for each row execute function public.athletemenu_protect_profile_role();

drop trigger if exists snapshot_menu_item_product_athletemenu on public.menu_items;
create trigger snapshot_menu_item_product_athletemenu
  before insert or update on public.menu_items
  for each row execute function public.athletemenu_snapshot_product();

drop trigger if exists sync_athlete_profile_athletemenu on public.athlete_profiles;
create trigger sync_athlete_profile_athletemenu before insert or update on public.athlete_profiles
  for each row execute function public.athletemenu_sync_athlete_profile();
drop trigger if exists sync_product_columns_athletemenu on public.products;
create trigger sync_product_columns_athletemenu before insert or update on public.products
  for each row execute function public.athletemenu_sync_product_columns();
drop trigger if exists sync_menu_columns_athletemenu on public.menus;
create trigger sync_menu_columns_athletemenu before insert or update on public.menus
  for each row execute function public.athletemenu_sync_menu_columns();
drop trigger if exists sync_menu_day_columns_athletemenu on public.menu_days;
create trigger sync_menu_day_columns_athletemenu before insert or update on public.menu_days
  for each row execute function public.athletemenu_sync_menu_day_columns();
drop trigger if exists sync_meal_columns_athletemenu on public.meals;
create trigger sync_meal_columns_athletemenu before insert or update on public.meals
  for each row execute function public.athletemenu_sync_meal_columns();
drop trigger if exists sync_training_columns_athletemenu on public.training_sessions;
create trigger sync_training_columns_athletemenu before insert or update on public.training_sessions
  for each row execute function public.athletemenu_sync_training_columns();
drop trigger if exists sync_nutrition_columns_athletemenu on public.nutrition_results;
create trigger sync_nutrition_columns_athletemenu before insert or update on public.nutrition_results
  for each row execute function public.athletemenu_sync_nutrition_columns();
drop trigger if exists guard_coach_link_athletemenu on public.coach_athletes;
create trigger guard_coach_link_athletemenu before update on public.coach_athletes
  for each row execute function public.athletemenu_guard_coach_link();

do $$
declare table_name text;
begin
  foreach table_name in array array['profiles','sports','athlete_profiles','coach_athletes','product_groups','products','training_sessions','menus','menu_days','meals','menu_items','nutrition_results','weight_log','weight_entries'] loop
    execute format('drop trigger if exists set_updated_at_athletemenu on public.%I', table_name);
    execute format('create trigger set_updated_at_athletemenu before update on public.%I for each row execute function public.athletemenu_set_updated_at()', table_name);
  end loop;
end;
$$;

-- Функции вызываются политиками и RPC; не даём анонимным пользователям прямой вызов.
revoke all on function public.athletemenu_set_updated_at() from public;
revoke all on function public.athletemenu_is_admin() from public;
revoke all on function public.athletemenu_is_coach_of(uuid) from public;
revoke all on function public.athletemenu_can_manage_athlete(uuid) from public;
revoke all on function public.athletemenu_can_access_menu(uuid) from public;
revoke all on function public.athletemenu_can_access_menu_day(uuid) from public;
revoke all on function public.athletemenu_can_access_meal(uuid) from public;
revoke all on function public.athletemenu_create_profile() from public;
revoke all on function public.athletemenu_protect_profile_role() from public;
revoke all on function public.athletemenu_snapshot_product() from public;
revoke all on function public.request_coach_athlete_link(text) from public;
revoke all on function public.respond_to_coach_request(uuid, boolean) from public;
grant execute on function public.athletemenu_is_admin() to authenticated;
grant execute on function public.athletemenu_is_coach_of(uuid) to authenticated;
grant execute on function public.athletemenu_can_manage_athlete(uuid) to authenticated;
grant execute on function public.athletemenu_can_access_menu(uuid) to authenticated;
grant execute on function public.athletemenu_can_access_menu_day(uuid) to authenticated;
grant execute on function public.athletemenu_can_access_meal(uuid) to authenticated;
grant execute on function public.request_coach_athlete_link(text) to authenticated;
grant execute on function public.respond_to_coach_request(uuid, boolean) to authenticated;

-- Включаем RLS везде, где браузер может обращаться к таблицам.
alter table public.profiles enable row level security;
alter table public.sports enable row level security;
alter table public.athlete_profiles enable row level security;
alter table public.coach_athletes enable row level security;
alter table public.coach_link_requests enable row level security;
alter table public.product_groups enable row level security;
alter table public.products enable row level security;
alter table public.training_sessions enable row level security;
alter table public.menus enable row level security;
alter table public.menu_days enable row level security;
alter table public.meals enable row level security;
alter table public.menu_items enable row level security;
alter table public.nutrition_results enable row level security;
alter table public.weight_entries enable row level security;

grant select, insert, update, delete on table
  public.profiles,
  public.sports,
  public.athlete_profiles,
  public.coach_athletes,
  public.coach_link_requests,
  public.product_groups,
  public.products,
  public.training_sessions,
  public.menus,
  public.menu_days,
  public.meals,
  public.menu_items,
  public.nutrition_results,
  public.weight_entries
to authenticated;

drop policy if exists profiles_read_allowed on public.profiles;
create policy profiles_read_allowed on public.profiles for select to authenticated
  using (id = auth.uid() or public.athletemenu_is_admin() or public.athletemenu_is_coach_of(id));
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists profiles_admin_manage on public.profiles;
create policy profiles_admin_manage on public.profiles for all to authenticated
  using (public.athletemenu_is_admin()) with check (public.athletemenu_is_admin());

drop policy if exists sports_read_authenticated on public.sports;
create policy sports_read_authenticated on public.sports for select to authenticated using (true);
drop policy if exists sports_admin_manage on public.sports;
create policy sports_admin_manage on public.sports for all to authenticated
  using (public.athletemenu_is_admin()) with check (public.athletemenu_is_admin());

drop policy if exists athlete_profiles_read_allowed on public.athlete_profiles;
create policy athlete_profiles_read_allowed on public.athlete_profiles for select to authenticated
  using (user_id = auth.uid() or public.athletemenu_is_admin() or public.athletemenu_is_coach_of(user_id));
drop policy if exists athlete_profiles_insert_self on public.athlete_profiles;
create policy athlete_profiles_insert_self on public.athlete_profiles for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists athlete_profiles_update_self on public.athlete_profiles;
create policy athlete_profiles_update_self on public.athlete_profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists athlete_profiles_delete_self on public.athlete_profiles;
create policy athlete_profiles_delete_self on public.athlete_profiles for delete to authenticated using (user_id = auth.uid());

drop policy if exists coach_athletes_read_participants on public.coach_athletes;
create policy coach_athletes_read_participants on public.coach_athletes for select to authenticated
  using (coach_id = auth.uid() or athlete_id = auth.uid() or public.athletemenu_is_admin());
drop policy if exists coach_athletes_coach_unlink on public.coach_athletes;
create policy coach_athletes_coach_unlink on public.coach_athletes for delete to authenticated
  using (coach_id = auth.uid() or public.athletemenu_is_admin());

drop policy if exists coach_link_requests_read_participants on public.coach_link_requests;
create policy coach_link_requests_read_participants on public.coach_link_requests for select to authenticated
  using (coach_id = auth.uid() or athlete_id = auth.uid() or public.athletemenu_is_admin());

drop policy if exists product_groups_read_authenticated on public.product_groups;
create policy product_groups_read_authenticated on public.product_groups for select to authenticated using (true);
drop policy if exists product_groups_admin_manage on public.product_groups;
create policy product_groups_admin_manage on public.product_groups for all to authenticated
  using (public.athletemenu_is_admin()) with check (public.athletemenu_is_admin());

drop policy if exists products_read_authenticated on public.products;
create policy products_read_authenticated on public.products for select to authenticated using (true);
drop policy if exists products_admin_manage on public.products;
create policy products_admin_manage on public.products for all to authenticated
  using (public.athletemenu_is_admin()) with check (public.athletemenu_is_admin());

drop policy if exists training_sessions_read_allowed on public.training_sessions;
create policy training_sessions_read_allowed on public.training_sessions for select to authenticated
  using (public.athletemenu_can_manage_athlete(athlete_id) or public.athletemenu_is_admin());
drop policy if exists training_sessions_insert_allowed on public.training_sessions;
create policy training_sessions_insert_allowed on public.training_sessions for insert to authenticated
  with check (public.athletemenu_can_manage_athlete(athlete_id));
drop policy if exists training_sessions_update_allowed on public.training_sessions;
create policy training_sessions_update_allowed on public.training_sessions for update to authenticated
  using (public.athletemenu_can_manage_athlete(athlete_id) or public.athletemenu_is_admin())
  with check (public.athletemenu_can_manage_athlete(athlete_id) or public.athletemenu_is_admin());
drop policy if exists training_sessions_delete_allowed on public.training_sessions;
create policy training_sessions_delete_allowed on public.training_sessions for delete to authenticated
  using (public.athletemenu_can_manage_athlete(athlete_id) or public.athletemenu_is_admin());

drop policy if exists menus_read_allowed on public.menus;
create policy menus_read_allowed on public.menus for select to authenticated
  using (public.athletemenu_can_manage_athlete(owner_id) or public.athletemenu_is_admin());
drop policy if exists menus_insert_allowed on public.menus;
create policy menus_insert_allowed on public.menus for insert to authenticated
  with check (public.athletemenu_can_manage_athlete(owner_id) and author_id = auth.uid());
drop policy if exists menus_update_allowed on public.menus;
create policy menus_update_allowed on public.menus for update to authenticated
  using (public.athletemenu_can_manage_athlete(owner_id) or public.athletemenu_is_admin())
  with check (public.athletemenu_can_manage_athlete(owner_id) or public.athletemenu_is_admin());
drop policy if exists menus_delete_allowed on public.menus;
create policy menus_delete_allowed on public.menus for delete to authenticated
  using (public.athletemenu_can_manage_athlete(owner_id) or public.athletemenu_is_admin());

drop policy if exists menu_days_manage_allowed on public.menu_days;
create policy menu_days_manage_allowed on public.menu_days for all to authenticated
  using (public.athletemenu_can_access_menu(menu_id) or public.athletemenu_is_admin())
  with check (public.athletemenu_can_access_menu(menu_id) or public.athletemenu_is_admin());
drop policy if exists meals_manage_allowed on public.meals;
create policy meals_manage_allowed on public.meals for all to authenticated
  using (public.athletemenu_can_access_menu_day(menu_day_id) or public.athletemenu_is_admin())
  with check (public.athletemenu_can_access_menu_day(menu_day_id) or public.athletemenu_is_admin());
drop policy if exists menu_items_manage_allowed on public.menu_items;
create policy menu_items_manage_allowed on public.menu_items for all to authenticated
  using (public.athletemenu_can_access_meal(meal_id) or public.athletemenu_is_admin())
  with check (public.athletemenu_can_access_meal(meal_id) or public.athletemenu_is_admin());

drop policy if exists nutrition_results_manage_self on public.nutrition_results;
create policy nutrition_results_manage_self on public.nutrition_results for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists weight_entries_manage_self on public.weight_entries;
create policy weight_entries_manage_self on public.weight_entries for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Публичная раздача аватаров; загружать и заменять файл может только его владелец.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('athletemenu-avatars', 'athletemenu-avatars', true, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists athletemenu_avatar_public_read on storage.objects;
create policy athletemenu_avatar_public_read on storage.objects for select to public
  using (bucket_id = 'athletemenu-avatars');
drop policy if exists athletemenu_avatar_owner_insert on storage.objects;
create policy athletemenu_avatar_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'athletemenu-avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists athletemenu_avatar_owner_update on storage.objects;
create policy athletemenu_avatar_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'athletemenu-avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'athletemenu-avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists athletemenu_avatar_owner_delete on storage.objects;
create policy athletemenu_avatar_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'athletemenu-avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Сохраняем принятые заявки старой версии в новой статусной таблице.
insert into public.coach_athletes (coach_id,athlete_id,status,created_at)
select r.coach_id,r.athlete_id,case when r.status='accepted' then 'active' else 'pending' end,r.created_at
from public.coach_link_requests r where r.status in ('pending','accepted')
on conflict (coach_id,athlete_id) do nothing;

create or replace view public.v_menu_day_totals with (security_invoker=true) as
select d.id as menu_day_id, d.menu_id, d.day_date,
  coalesce(sum(i.grams*i.kcal_100/100),0)::numeric(12,2) as total_kcal,
  coalesce(sum(i.grams*i.protein_100/100),0)::numeric(12,2) as total_protein,
  coalesce(sum(i.grams*i.fat_100/100),0)::numeric(12,2) as total_fat,
  coalesce(sum(i.grams*i.carbs_100/100),0)::numeric(12,2) as total_carbs
from public.menu_days d
left join public.meals m on m.menu_day_id=d.id
left join public.menu_items i on i.meal_id=m.id
group by d.id,d.menu_id,d.day_date;

-- Индексы на каждый FK и основные пользовательские выборки.
create index if not exists athlete_profiles_sport_idx on public.athlete_profiles(sport_id);
create index if not exists coach_athletes_coach_idx on public.coach_athletes(coach_id);
create index if not exists coach_athletes_athlete_idx on public.coach_athletes(athlete_id);
create index if not exists product_groups_name_idx on public.product_groups(name);
create index if not exists products_group_idx on public.products(group_id);
create index if not exists training_sessions_athlete_starts_idx on public.training_sessions(athlete_id,starts_at desc);
create index if not exists training_sessions_sport_idx on public.training_sessions(sport_id);
create index if not exists training_sessions_created_by_idx on public.training_sessions(created_by);
create index if not exists menus_owner_period_idx on public.menus(owner_id,start_date desc);
create index if not exists menus_author_idx on public.menus(author_id);
create index if not exists menu_days_menu_date_idx on public.menu_days(menu_id,day_date);
create index if not exists menu_days_day_date_idx on public.menu_days(day_date);
create index if not exists meals_menu_day_order_idx on public.meals(menu_day_id,sort_order);
create index if not exists menu_items_meal_order_idx on public.menu_items(meal_id,sort_order);
create index if not exists menu_items_product_idx on public.menu_items(product_id);
create index if not exists nutrition_results_athlete_date_idx on public.nutrition_results(athlete_id,result_date desc);
create index if not exists weight_log_athlete_date_idx on public.weight_log(athlete_id,logged_on desc);

-- Удаляем старые правила, чтобы permissive-политика не расширила доступ по OR.
do $$ declare p record;
begin
  for p in select schemaname,tablename,policyname from pg_policies where schemaname='public'
    and tablename=any(array['profiles','sports','athlete_profiles','coach_athletes','coach_link_requests','product_groups','products','training_sessions','menus','menu_days','meals','menu_items','nutrition_results','weight_log','weight_entries'])
  loop execute format('drop policy if exists %I on %I.%I',p.policyname,p.schemaname,p.tablename); end loop;
end $$;

alter table public.profiles enable row level security;
alter table public.sports enable row level security;
alter table public.athlete_profiles enable row level security;
alter table public.coach_athletes enable row level security;
alter table public.coach_link_requests enable row level security;
alter table public.product_groups enable row level security;
alter table public.products enable row level security;
alter table public.training_sessions enable row level security;
alter table public.menus enable row level security;
alter table public.menu_days enable row level security;
alter table public.meals enable row level security;
alter table public.menu_items enable row level security;
alter table public.nutrition_results enable row level security;
alter table public.weight_log enable row level security;
alter table public.weight_entries enable row level security;

revoke all on table public.profiles,public.sports,public.athlete_profiles,public.coach_athletes,public.coach_link_requests,
  public.product_groups,public.products,public.training_sessions,public.menus,public.menu_days,public.meals,
  public.menu_items,public.nutrition_results,public.weight_log,public.weight_entries from public,anon;
grant select,insert,update,delete on table public.profiles,public.sports,public.athlete_profiles,public.coach_athletes,
  public.product_groups,public.products,public.training_sessions,public.menus,public.menu_days,public.meals,
  public.menu_items,public.nutrition_results,public.weight_log,public.weight_entries to authenticated;
revoke all on table public.coach_link_requests from authenticated;
grant select on public.v_menu_day_totals to authenticated;
revoke all on public.v_menu_day_totals from public,anon;

-- profiles
create policy profiles_read on public.profiles for select to authenticated
  using (id=auth.uid() or public.is_admin() or public.is_coach_of(id));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id=auth.uid()) with check (id=auth.uid());
create policy profiles_update_admin on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Справочники: всем вошедшим только чтение, администратору полный CRUD.
create policy sports_read on public.sports for select to authenticated using (true);
create policy sports_admin on public.sports for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy product_groups_read on public.product_groups for select to authenticated using (true);
create policy product_groups_admin on public.product_groups for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy products_read on public.products for select to authenticated using (true);
create policy products_admin on public.products for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Профиль параметров и тренировки доступны владельцу и активному тренеру.
create policy athlete_profiles_read on public.athlete_profiles for select to authenticated using (public.can_access_athlete(user_id));
create policy athlete_profiles_insert on public.athlete_profiles for insert to authenticated with check (public.can_manage_athlete(user_id));
create policy athlete_profiles_update on public.athlete_profiles for update to authenticated using (public.can_manage_athlete(user_id)) with check (public.can_manage_athlete(user_id));
create policy athlete_profiles_delete on public.athlete_profiles for delete to authenticated using (user_id=auth.uid());
create policy training_sessions_read on public.training_sessions for select to authenticated using (public.can_access_athlete(athlete_id));
create policy training_sessions_insert on public.training_sessions for insert to authenticated with check (public.can_manage_athlete(athlete_id));
create policy training_sessions_update on public.training_sessions for update to authenticated using (public.can_manage_athlete(athlete_id)) with check (public.can_manage_athlete(athlete_id));
create policy training_sessions_delete on public.training_sessions for delete to authenticated using (public.can_manage_athlete(athlete_id));

-- Запрос на связь начинает тренер только со статусом pending; решение остаётся спортсмену.
create policy coach_athletes_read_participants on public.coach_athletes for select to authenticated
  using (coach_id=auth.uid() or athlete_id=auth.uid() or public.is_admin());
create policy coach_athletes_request on public.coach_athletes for insert to authenticated
  with check (coach_id=auth.uid() and coach_id<>athlete_id and status='pending'
    and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='coach')
    and public.athletemenu_is_athlete(athlete_id));
create policy coach_athletes_athlete_response on public.coach_athletes for update to authenticated
  using (athlete_id=auth.uid() and status in ('pending','active'))
  with check (athlete_id=auth.uid() and status in ('active','revoked'));
create policy coach_athletes_coach_revoke on public.coach_athletes for update to authenticated
  using (coach_id=auth.uid() and status='active')
  with check (coach_id=auth.uid() and status='revoked');
create policy coach_athletes_admin on public.coach_athletes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy coach_athletes_coach_delete_pending on public.coach_athletes for delete to authenticated using (coach_id=auth.uid() and status='pending');

-- Меню: администратор может читать, запись — владелец или его активный тренер.
create policy menus_read on public.menus for select to authenticated using (public.can_access_athlete(owner_id));
create policy menus_insert on public.menus for insert to authenticated
  with check (public.can_manage_athlete(owner_id) and author_id=auth.uid());
create policy menus_update on public.menus for update to authenticated
  using (public.can_manage_athlete(owner_id)) with check (public.can_manage_athlete(owner_id));
create policy menus_delete on public.menus for delete to authenticated using (public.can_manage_athlete(owner_id));
create policy menu_days_access on public.menu_days for all to authenticated
  using (public.athletemenu_can_access_menu(menu_id)) with check (public.athletemenu_can_access_menu(menu_id));
create policy meals_access on public.meals for all to authenticated
  using (public.athletemenu_can_access_menu_day(menu_day_id)) with check (public.athletemenu_can_access_menu_day(menu_day_id));
create policy menu_items_access on public.menu_items for all to authenticated
  using (public.athletemenu_can_access_meal(meal_id)) with check (public.athletemenu_can_access_meal(meal_id));

-- Результаты питания и вес; администратор видит строки, но не редактирует их.
create policy nutrition_results_read on public.nutrition_results for select to authenticated using (public.can_access_athlete(athlete_id));
create policy nutrition_results_insert on public.nutrition_results for insert to authenticated with check (public.can_manage_athlete(athlete_id));
create policy nutrition_results_update on public.nutrition_results for update to authenticated using (public.can_manage_athlete(athlete_id)) with check (public.can_manage_athlete(athlete_id));
create policy nutrition_results_delete on public.nutrition_results for delete to authenticated using (public.can_manage_athlete(athlete_id));
create policy weight_log_read on public.weight_log for select to authenticated using (public.can_access_athlete(athlete_id));
create policy weight_log_insert on public.weight_log for insert to authenticated with check (public.can_manage_athlete(athlete_id));
create policy weight_log_update on public.weight_log for update to authenticated using (public.can_manage_athlete(athlete_id)) with check (public.can_manage_athlete(athlete_id));
create policy weight_log_delete on public.weight_log for delete to authenticated using (public.can_manage_athlete(athlete_id));
create policy weight_entries_read on public.weight_entries for select to authenticated using (public.can_access_athlete(user_id));
create policy weight_entries_insert on public.weight_entries for insert to authenticated with check (public.can_manage_athlete(user_id));
create policy weight_entries_update on public.weight_entries for update to authenticated using (public.can_manage_athlete(user_id)) with check (public.can_manage_athlete(user_id));
create policy weight_entries_delete on public.weight_entries for delete to authenticated using (public.can_manage_athlete(user_id));

revoke all on function public.is_admin() from public,anon;
revoke all on function public.is_coach_of(uuid) from public,anon;
revoke all on function public.can_access_athlete(uuid) from public,anon;
revoke all on function public.can_manage_athlete(uuid) from public,anon;
revoke all on function public.athletemenu_is_athlete(uuid) from public,anon;
revoke all on function public.athletemenu_sync_athlete_profile() from public,anon;
revoke all on function public.athletemenu_sync_product_columns() from public,anon;
revoke all on function public.athletemenu_sync_menu_columns() from public,anon;
revoke all on function public.athletemenu_sync_menu_day_columns() from public,anon;
revoke all on function public.athletemenu_sync_meal_columns() from public,anon;
revoke all on function public.athletemenu_sync_training_columns() from public,anon;
revoke all on function public.athletemenu_sync_nutrition_columns() from public,anon;
revoke all on function public.athletemenu_guard_coach_link() from public,anon;
grant execute on function public.is_admin(),public.is_coach_of(uuid),public.can_access_athlete(uuid),public.can_manage_athlete(uuid),public.athletemenu_is_athlete(uuid) to authenticated;
revoke all on function public.request_coach_athlete_link(text),public.respond_to_coach_request(uuid,boolean) from public,anon;
grant execute on function public.request_coach_athlete_link(text),public.respond_to_coach_request(uuid,boolean) to authenticated;

-- В схеме нет таблицы паролей и нет service_role ключа на стороне клиента.
