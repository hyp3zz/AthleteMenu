// Историческое имя сохранено ради совместимости. Все реализации здесь работают с Supabase.
import { supabase } from './supabase-client.js';
import { calculateNutritionTotals } from './nutrition.js';

export function translateSupabaseError(error) {
  const code = error?.code || error?.status || error?.name;
  const message = String(error?.message || '').toLowerCase();
  const byCode = {
    '23505': 'Запись с таким названием уже существует.',
    '23503': 'Нельзя сохранить запись: связанные данные не найдены.',
    '23514': 'Проверьте введённые значения: они не соответствуют ограничениям.',
    '42501': 'Недостаточно прав для этого действия.',
    PGRST116: 'Запись не найдена или недоступна.',
    PGRST204: 'Поле отсутствует в схеме базы данных. Проверьте применение schema.sql.',
    PGRST205: 'Таблица не найдена. Проверьте применение schema.sql.',
  };
  if (byCode[code]) return byCode[code];
  if (/duplicate key|already exists|unique constraint/.test(message)) return byCode['23505'];
  if (/row-level security|permission denied|not allowed/.test(message)) return byCode['42501'];
  if (/invalid login credentials/.test(message)) return 'Неверная почта или пароль.';
  if (/email not confirmed/.test(message)) return 'Подтвердите электронную почту по ссылке из письма.';
  if (/user already registered/.test(message)) return 'Аккаунт с такой почтой уже существует.';
  if (/rate limit/.test(message)) return 'Слишком много запросов. Подождите и попробуйте снова.';
  if (/failed to fetch|networkerror|fetch failed/.test(message)) return 'Нет соединения с Supabase. Проверьте сеть и URL проекта.';
  return error?.message || 'Не удалось выполнить запрос. Попробуйте ещё раз.';
}

function client() {
  if (!supabase) throw new Error('Supabase не настроен. Заполните assets/js/config.js по примеру config.example.js.');
  return supabase;
}

function throwIfError(result) {
  if (result.error) {
    const error = new Error(translateSupabaseError(result.error));
    error.cause = result.error;
    throw error;
  }
  return result.data;
}

export async function getProducts({ search = '', limit = 1000 } = {}) {
  let query = client().from('products').select('*, product_groups(id,name)').order('name').limit(limit);
  if (search.trim()) query = query.ilike('name', `%${search.trim()}%`);
  return (throwIfError(await query) || []).map((p) => ({ ...p,
    image: p.image_url || p.image_path || null,
    calories_kcal_per_100g: Number(p.kcal_100 ?? p.calories_kcal_per_100g ?? 0),
    protein_g_per_100g: Number(p.protein_100 ?? p.protein_g_per_100g ?? 0),
    fat_g_per_100g: Number(p.fat_100 ?? p.fat_g_per_100g ?? 0),
    carbs_g_per_100g: Number(p.carbs_100 ?? p.carbs_g_per_100g ?? 0),
  }));
}

export async function getProductGroups() {
  return throwIfError(await client().from('product_groups').select('*').order('name')) || [];
}

export async function getProfile(userId) {
  const db = client();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError) throw new Error(translateSupabaseError(authError));
  const id = userId || user?.id;
  if (!id) throw new Error('Сессия завершена. Войдите в аккаунт снова.');
  const [profileRes, athleteRes, weightRes] = await Promise.all([
    db.from('profiles').select('id,full_name,role,avatar_url').eq('id', id).single(),
    db.from('athlete_profiles').select('*').eq('user_id', id).maybeSingle(),
    db.from('weight_log').select('logged_on,weight_kg').eq('athlete_id', id).order('logged_on'),
  ]);
  return { profile: throwIfError(profileRes), athleteProfile: throwIfError(athleteRes), weightHistory: throwIfError(weightRes) || [] };
}

export async function saveProfile({ userId, fullName, athleteProfile, weightKg }) {
  const db = client();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError) throw new Error(translateSupabaseError(authError));
  const id = userId || user?.id;
  if (!id) throw new Error('Сессия завершена. Войдите в аккаунт снова.');
  if (fullName != null) throwIfError(await db.from('profiles').update({ full_name: fullName }).eq('id', id));
  const data = { ...athleteProfile, user_id: id };
  delete data.sex;
  throwIfError(await db.from('athlete_profiles').upsert(data, { onConflict: 'user_id' }));
  const value = Number(weightKg ?? athleteProfile?.weight_kg);
  if (Number.isFinite(value) && value >= 30 && value <= 300) {
    throwIfError(await db.from('weight_log').upsert({ athlete_id: id, logged_on: new Date().toISOString().slice(0, 10), weight_kg: value }, { onConflict: 'athlete_id,logged_on' }));
  }
  return getProfile(id);
}

const MENU_TREE = 'menu_days(id,day_date,menu_date,target_kcal,target_protein,target_fat,target_carbs,target_protein_g,target_fat_g,target_carbs_g,meals(id,name,meal_type,meal_time,planned_time,sort_order,menu_items(id,product_id,product_name,product_name_snapshot,grams,quantity_g,kcal_100,protein_100,fat_100,carbs_100,calories_kcal_per_100g,protein_g_per_100g,fat_g_per_100g,carbs_g_per_100g,sort_order)))';

export async function getMenus(ownerId) {
  const db = client();
  let query = db.from('menus').select(`id,owner_id,author_id,title,type,start_date,end_date,period_start,period_end,status,updated_at,${MENU_TREE}`).order('updated_at', { ascending: false });
  if (ownerId) query = query.eq('owner_id', ownerId);
  return throwIfError(await query) || [];
}

export async function getMenuDay(ownerId, dayDate) {
  const menus = await getMenus(ownerId);
  for (const menu of menus) {
    const day = (menu.menu_days || []).find((item) => (item.day_date || item.menu_date) === dayDate);
    if (day) return { ...day, menu };
  }
  return null;
}

function mealCode(meal) {
  const map = { 'Завтрак': 'breakfast', 'Второй завтрак': 'second_breakfast', 'Обед': 'lunch', 'Перекус': 'snack', 'Полдник': 'snack', 'Ужин': 'dinner' };
  return meal.meal_type || map[meal.name] || 'snack';
}

/** Последовательная запись меню. При сбое удаляет созданный menu (каскад удалит вложенные строки). */
export async function saveMenu({ ownerId, authorId, title = 'Меню', type = 'day', startDate, endDate, days, targets = {} }) {
  const db = client();
  let menuId = null;
  try {
    const menu = throwIfError(await db.from('menus').insert({ owner_id: ownerId, author_id: authorId, title, type, start_date: startDate, end_date: endDate, period_start: startDate, period_end: endDate, status: 'active' }).select('id').single());
    menuId = menu.id;
    const nutritionRows = [];
    for (const day of days) {
      const dayRow = throwIfError(await db.from('menu_days').insert({ menu_id: menuId, day_date: day.date, menu_date: day.date, target_kcal: day.targets?.target_kcal ?? targets.target_kcal ?? null, target_protein: day.targets?.target_protein_g ?? targets.target_protein_g ?? null, target_fat: day.targets?.target_fat_g ?? targets.target_fat_g ?? null, target_carbs: day.targets?.target_carbs_g ?? targets.target_carbs_g ?? null }).select('id').single());
      for (let index = 0; index < (day.meals || []).length; index += 1) {
        const meal = day.meals[index];
        const mealRow = throwIfError(await db.from('meals').insert({ menu_day_id: dayRow.id, meal_type: mealCode(meal), name: meal.name || 'Приём пищи', meal_time: meal.time || null, planned_time: meal.time || null, sort_order: index }).select('id').single());
        const items = (meal.items || []).map((item, order) => {
          const product = item.product || item;
          const grams = Number(item.grams ?? item.quantity_g);
          if (!Number.isFinite(grams) || grams <= 0 || grams > 2000) throw new Error('Масса порции должна быть больше 0 и не превышать 2 000 г.');
          return { meal_id: mealRow.id, product_id: product.id || null,
            product_name: product.name, product_name_snapshot: product.name, grams, quantity_g: grams,
            kcal_100: product.kcal_100 ?? product.calories_kcal_per_100g ?? 0,
            protein_100: product.protein_100 ?? product.protein_g_per_100g ?? 0,
            fat_100: product.fat_100 ?? product.fat_g_per_100g ?? 0,
            carbs_100: product.carbs_100 ?? product.carbs_g_per_100g ?? 0, sort_order: order };
        });
        if (items.length) throwIfError(await db.from('menu_items').insert(items));
      }
      const allItems = (day.meals || []).flatMap((m) => m.items || []).map((item) => {
        const p = item.product || item;
        return { quantity_g: item.grams ?? item.quantity_g, calories_kcal_per_100g: p.kcal_100 ?? p.calories_kcal_per_100g, protein_g_per_100g: p.protein_100 ?? p.protein_g_per_100g, fat_g_per_100g: p.fat_100 ?? p.fat_g_per_100g, carbs_g_per_100g: p.carbs_100 ?? p.carbs_g_per_100g };
      });
      const totals = calculateNutritionTotals(allItems);
      nutritionRows.push({ athlete_id: ownerId, user_id: ownerId, result_date: day.date,
        target_kcal: day.targets?.target_kcal ?? targets.target_kcal ?? null,
        target_protein: day.targets?.target_protein_g ?? targets.target_protein_g ?? null,
        target_fat: day.targets?.target_fat_g ?? targets.target_fat_g ?? null,
        target_carbs: day.targets?.target_carbs_g ?? targets.target_carbs_g ?? null,
        actual_kcal: totals.calories, actual_protein: totals.protein, actual_fat: totals.fat, actual_carbs: totals.carbs,
      });
    }
    if (nutritionRows.length) throwIfError(await db.from('nutrition_results').upsert(nutritionRows, { onConflict: 'athlete_id,result_date' }));
    return menuId;
  } catch (error) {
    if (menuId) {
      const cleanup = await db.from('menus').delete().eq('id', menuId);
      if (cleanup.error) console.error('Не удалось откатить незавершённое меню:', cleanup.error);
    }
    throw error;
  }
}

export async function getTrainingSessions(athleteId, { from, to } = {}) {
  let query = client().from('training_sessions').select('*,sports(id,name)').eq('athlete_id', athleteId).order('starts_at');
  if (from) query = query.gte('starts_at', from);
  if (to) query = query.lt('starts_at', to);
  return throwIfError(await query) || [];
}

export async function saveTraining(payload, id = null) {
  const db = client();
  const query = id ? db.from('training_sessions').update(payload).eq('id', id).select().single()
    : db.from('training_sessions').insert(payload).select().single();
  return throwIfError(await query);
}

export async function getReport(athleteId, from, to) {
  const db = client();
  const [nutrition, weights, training] = await Promise.all([
    db.from('nutrition_results').select('*').eq('athlete_id', athleteId).gte('result_date', from).lte('result_date', to).order('result_date'),
    db.from('weight_log').select('logged_on,weight_kg').eq('athlete_id', athleteId).gte('logged_on', from).lte('logged_on', to).order('logged_on'),
    db.from('training_sessions').select('starts_at,duration_min,duration_minutes,status').eq('athlete_id', athleteId).gte('starts_at', `${from}T00:00:00`).lte('starts_at', `${to}T23:59:59`).order('starts_at'),
  ]);
  return { nutrition: throwIfError(nutrition) || [], weights: throwIfError(weights) || [], training: throwIfError(training) || [] };
}

export async function getCoachAthletes(coachId) {
  return throwIfError(await client().from('coach_athletes')
    .select('id,coach_id,athlete_id,status,created_at,athlete:profiles!coach_athletes_athlete_id_fkey(id,full_name,avatar_url,athlete_profiles(sport_id,sports(id,name)))')
    .eq('coach_id', coachId).eq('status', 'active').order('created_at', { ascending: false })) || [];
}

export async function requestCoachAthlete(email) {
  return throwIfError(await client().rpc('request_coach_athlete_link', { athlete_email: email }));
}

export async function respondToCoachRequest(requestId, accept) {
  return throwIfError(await client().rpc('respond_to_coach_request', { request_id: requestId, accept_request: accept }));
}

export async function getPendingCoachRequests(athleteId) {
  return throwIfError(await client().from('coach_athletes').select('id,coach_id,created_at,coach:profiles!coach_athletes_coach_id_fkey(id,full_name,avatar_url)').eq('athlete_id', athleteId).eq('status', 'pending').order('created_at', { ascending: false })) || [];
}

export async function adminCreate(table, row) { return throwIfError(await client().from(table).insert(row).select().single()); }
export async function adminUpdate(table, id, row) { return throwIfError(await client().from(table).update(row).eq('id', id).select().single()); }
export async function adminDelete(table, id) { return throwIfError(await client().from(table).delete().eq('id', id)); }
