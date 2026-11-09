import { protectPage, formatNumber } from './common.js?v=20261106b';
import { supabase } from './supabase-client.js';
import { calculateMacroProgress, calculateNutritionTotals } from './nutrition.js';
import { PHOTOS } from './image-library.js?v=20261101b';
import { getMenuDay as getMenuDayApi, getTrainingSessions } from './mock-data.js';

const MACROS = [
  { key: 'calories', title: 'Калории', unit: 'ккал', color: 'calories', icon: '<path d="M12 3c-1.1 2.3-.2 3.5 1.2 4.8 1.1 1.1 1.8 2.2 1.8 3.8a3 3 0 0 1-6 0c0-.9.3-1.7.9-2.4C7.3 10.5 6 12.5 6 15a6 6 0 0 0 12 0c0-5.1-3-8.8-6-12Z"/><path d="M12 14c-.8 1-.9 1.5-.9 2.1a.9.9 0 0 0 1.8 0c0-.6-.3-1.2-.9-2.1Z"/>' },
  { key: 'protein', title: 'Белки', unit: 'г', color: 'protein', icon: '<path d="M7 4h10v3H7zM5 8h14v8H5zM7 17h10v3H7z"/><path d="M3 10v4M21 10v4"/>' },
  { key: 'fat', title: 'Жиры', unit: 'г', color: 'fat', icon: '<path d="M12 3s6 6.2 6 11a6 6 0 1 1-12 0c0-4.8 6-11 6-11Z"/><path d="M9 15a3 3 0 0 0 3 3"/>' },
  { key: 'carbs', title: 'Углеводы', unit: 'г', color: 'carbs', icon: '<path d="M4 19h16M6 16l3-5 3 3 5-8 2 2"/><circle cx="9" cy="11" r="1"/><circle cx="12" cy="14" r="1"/><circle cx="17" cy="6" r="1"/>' },
];
const GOAL_LABELS = Object.freeze({ lose: 'Снижение веса', gain: 'Набор мышечной массы', maintain: 'Поддержание формы' });

let page;

const WATER_GLASS_ML = 250;
const DEFAULT_WATER_GOAL_ML = 2000;

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function initHydrationTracker(userId) {
  const card = page.querySelector('[data-hydration-card]');
  const todayKey = localDateKey();
  const entriesKey = `athletemenu:water:${userId}:${todayKey}`;
  const goalKey = `athletemenu:water-goal:${userId}`;
  let consumedMl = 0;
  let goalMl = DEFAULT_WATER_GOAL_ML;
  try {
    const savedEntries = Number(localStorage.getItem(entriesKey));
    const savedGoal = Number(localStorage.getItem(goalKey));
    if (Number.isFinite(savedEntries) && savedEntries >= 0 && savedEntries <= 20000) consumedMl = savedEntries;
    if ([1500, 2000, 2500, 3000, 3500, 4000].includes(savedGoal)) goalMl = savedGoal;
  } catch (error) {
    console.warn('Не удалось прочитать журнал воды из браузера:', error);
  }
  const goalSelect = card.querySelector('[data-water-goal]');
  goalSelect.value = String(goalMl);

  const render = (animate = false) => {
    const progress = Math.min(100, Math.round(consumedMl / goalMl * 100));
    card.querySelector('[data-water-total]').textContent = `${formatNumber(consumedMl)} мл`;
    card.querySelector('[data-water-goal-label]').textContent = `из ${formatNumber(goalMl)} мл`;
    const bar = card.querySelector('[data-water-progress]');
    bar.setAttribute('aria-valuenow', String(progress));
    bar.setAttribute('aria-valuetext', `${formatNumber(consumedMl)} из ${formatNumber(goalMl)} миллилитров`);
    bar.querySelector('span').style.width = `${progress}%`;
    card.querySelector('[data-water-percent]').textContent = `${progress}%`;
    const undo = card.querySelector('[data-water-undo]');
    undo.disabled = consumedMl < WATER_GLASS_ML;
    card.querySelector('[data-water-note]').textContent = consumedMl >= goalMl
      ? 'Цель на сегодня достигнута — отлично!'
      : `До цели осталось ${formatNumber(Math.max(0, goalMl - consumedMl))} мл`;
    if (animate) {
      card.classList.remove('is-updated');
      requestAnimationFrame(() => card.classList.add('is-updated'));
      window.setTimeout(() => card.classList.remove('is-updated'), 650);
    }
  };
  const persist = () => {
    try { localStorage.setItem(entriesKey, String(consumedMl)); }
    catch (error) { console.warn('Не удалось сохранить журнал воды в браузере:', error); }
  };

  goalSelect.addEventListener('change', () => {
    const nextGoal = Number(goalSelect.value);
    if (![1500, 2000, 2500, 3000, 3500, 4000].includes(nextGoal)) return;
    goalMl = nextGoal;
    try { localStorage.setItem(goalKey, String(goalMl)); }
    catch (error) { console.warn('Не удалось сохранить цель воды:', error); }
    render();
  });
  card.querySelector('[data-water-add]').addEventListener('click', () => {
    consumedMl = Math.min(20000, consumedMl + WATER_GLASS_ML);
    persist();
    render(true);
  });
  card.querySelector('[data-water-undo]').addEventListener('click', () => {
    consumedMl = Math.max(0, consumedMl - WATER_GLASS_ML);
    persist();
    render(true);
  });
  render();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function dateAtMidnight(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function todayISO() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function renderLayout() {
  page.innerHTML = `
    <section class="dashboard-hero" aria-labelledby="dashboard-greeting">
      <img class="dashboard-hero-image" src="${PHOTOS.dashboardHero}" alt="Спортсменка выполняет упражнение с канатами в зале" data-image-fallback="banner" loading="lazy">
      <div class="dashboard-hero-content">
        <p class="dashboard-eyebrow" data-today-kicker>ВАШ ПЛАН НА СЕГОДНЯ</p>
        <h1 id="dashboard-greeting"><span data-greeting>Добро пожаловать</span>, <span data-user-name>спортсмен</span>!</h1>
        <p data-dashboard-intro>Ваш рацион и тренировки — в одном месте.</p>
        <span class="dashboard-profile-focus" data-profile-focus hidden></span>
        <a class="dashboard-hero-link" href="menu.html?rev=20261101d">Открыть меню <span aria-hidden="true">→</span></a>
        <span class="dashboard-date-pill" data-dashboard-date></span>
      </div>
      <span class="dashboard-hero-fallback-mark" aria-hidden="true">✦</span>
    </section>
    <nav class="dashboard-quick-actions" aria-label="Быстрые действия">
      <a class="dashboard-quick-action" href="menu-editor.html?rev=20261101c"><span class="quick-action-icon quick-action-menu" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"/></svg></span><span><strong>Записать питание</strong><small>Добавить блюда в меню</small></span><span class="quick-action-arrow" aria-hidden="true">→</span></a>
      <a class="dashboard-quick-action" href="training.html?rev=20261101c"><span class="quick-action-icon quick-action-training" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 8v8M3.5 10v4M18 8v8M20.5 10v4M6 12h12"/></svg></span><span><strong>Запланировать занятие</strong><small>Выбрать вид и время</small></span><span class="quick-action-arrow" aria-hidden="true">→</span></a>
      <a class="dashboard-quick-action" href="profile.html?rev=20261101c"><span class="quick-action-icon quick-action-profile" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5 21a7 7 0 0 1 14 0"/></svg></span><span><strong>Обновить показатели</strong><small>Вес, рост и цель</small></span><span class="quick-action-arrow" aria-hidden="true">→</span></a>
    </nav>
    <div class="dashboard-section-heading"><div><p class="dashboard-eyebrow">ПИТАНИЕ</p><h2>Баланс на сегодня</h2></div><a href="menu.html?rev=20261101d">Дневник питания <span aria-hidden="true">→</span></a></div>
    <section class="dashboard-macros" aria-label="Питание за сегодня">
      ${MACROS.map((macro) => `<article class="macro-card card" data-macro-card="${macro.key}" aria-busy="true"><div class="macro-card-top"><span class="macro-icon macro-icon-${macro.color}" aria-hidden="true"><svg viewBox="0 0 24 24">${macro.icon}</svg></span><span class="macro-percent skeleton" data-macro-percent></span></div><p class="macro-title">${macro.title}</p><p class="macro-value skeleton" data-macro-value></p><div class="macro-progress skeleton" data-macro-progress><span></span></div></article>`).join('')}
    </section>
    <p class="dashboard-menu-hint" data-menu-hint hidden></p>
    <section class="dashboard-hydration card" data-hydration-card aria-labelledby="water-title">
      <div class="hydration-heading"><span class="hydration-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3s6.5 7 6.5 12a6.5 6.5 0 0 1-13 0C5.5 10 12 3 12 3Z"/><path d="M9 16a3 3 0 0 0 3 3"/></svg></span><div><p class="dashboard-eyebrow">НЕБОЛЬШОЙ ШАГ</p><h2 id="water-title">Вода сегодня</h2></div><span class="hydration-percent" data-water-percent>0%</span></div>
      <div class="hydration-progress" data-water-progress role="progressbar" aria-label="Выпито воды относительно дневной цели" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span></span></div>
      <div class="hydration-stats"><strong data-water-total>0 мл</strong><span data-water-goal-label>из 2000 мл</span><span data-water-note>Начните отмечать выпитую воду</span></div>
      <div class="hydration-actions"><label class="hydration-goal"><span>Цель</span><select data-water-goal aria-label="Дневная цель воды"><option value="1500">1 500 мл</option><option value="2000">2 000 мл</option><option value="2500">2 500 мл</option><option value="3000">3 000 мл</option><option value="3500">3 500 мл</option><option value="4000">4 000 мл</option></select></label><button class="button button-secondary hydration-undo" type="button" data-water-undo disabled>− Стакан</button><button class="button hydration-add" type="button" data-water-add>＋ Выпил(а) стакан</button></div>
      <small class="hydration-footnote">Один стакан — 250 мл. Записи сохраняются в этом браузере.</small>
    </section>
    <section class="dashboard-lower" aria-label="Тренировки">
      <article class="dashboard-training-card card" aria-labelledby="today-training-title">
        <div class="dashboard-card-heading"><div><p class="dashboard-eyebrow dashboard-eyebrow-light">АКТИВНОСТЬ</p><h2 id="today-training-title">Сегодняшняя тренировка</h2></div><span class="training-card-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10"/></svg></span></div>
        <div class="training-today-content" data-today-training aria-busy="true"><div class="skeleton training-skeleton-line"></div><div class="skeleton training-skeleton-short"></div></div>
        <a class="button dashboard-action" data-today-training-link href="training.html?rev=20261101b">Подробнее</a>
      </article>
      <article class="dashboard-next-card card" aria-labelledby="next-training-title">
        <div class="dashboard-card-heading"><div><p class="dashboard-eyebrow dashboard-eyebrow-light">ПЛАНИРУЙТЕ РИТМ</p><h2 id="next-training-title">Ближайшая тренировка</h2></div><span class="next-training-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M7.5 3.5v3M16.5 3.5v3M3.5 9.5h17M8 13h3v3H8z"/></svg></span></div>
        <div class="next-training-content" data-next-training aria-busy="true"><div class="skeleton training-skeleton-line"></div><div class="skeleton training-skeleton-short"></div></div>
        <a class="dashboard-text-link" href="training.html?rev=20261101b">Все тренировки <span aria-hidden="true">→</span></a>
      </article>
    </section>
    <div class="dashboard-error" data-dashboard-error role="alert" hidden></div>`;

}

function renderMacroSkeleton() {
  page.querySelectorAll('[data-macro-card]').forEach((card) => {
    card.setAttribute('aria-busy', 'true');
    card.querySelector('[data-macro-percent]').className = 'macro-percent skeleton';
    card.querySelector('[data-macro-value]').className = 'macro-value skeleton';
    card.querySelector('[data-macro-progress]').className = 'macro-progress skeleton';
    card.querySelector('[data-macro-progress]').hidden = false;
  });
}

function renderMacros(totals, menuDay) {
  const progress = calculateMacroProgress(totals, menuDay);
  for (const item of progress) {
    const card = page.querySelector(`[data-macro-card="${item.key}"]`);
    const macro = MACROS.find((entry) => entry.key === item.key);
    const value = card.querySelector('[data-macro-value]');
    const percent = card.querySelector('[data-macro-percent]');
    const bar = card.querySelector('[data-macro-progress]');
    bar.hidden = false;
    const actual = formatNumber(item.actual, item.key === 'calories' ? 0 : 1);
    const target = item.target == null ? '—' : formatNumber(item.target, item.key === 'calories' ? 0 : 1);

    card.setAttribute('aria-busy', 'false');
    value.className = 'macro-value';
    value.textContent = `${actual} / ${target} ${macro.unit}`;
    percent.className = `macro-percent${item.over ? ' is-over' : ''}`;
    percent.textContent = item.percent == null ? 'Нет цели' : `${item.percent}%`;
    bar.className = `macro-progress macro-progress-${macro.color}${item.over ? ' is-over' : ''}`;
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-label', `${macro.title}: ${item.percent == null ? 'цель не задана' : `${item.percent}% от цели`}`);
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', '100');
    bar.setAttribute('aria-valuenow', String(item.barPercent));
    bar.innerHTML = `<span style="width:${item.barPercent}%"></span>`;
  }

  if (!menuDay) {
    const hint = page.querySelector('[data-menu-hint]');
    hint.innerHTML = 'На сегодня пока нет меню. <a href="menu-editor.html?rev=20261021a">Составить рацион</a>';
    hint.hidden = false;
  }
}

function formatDuration(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value <= 0) return '';
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  if (hours && rest) return `${hours} ч ${rest} мин`;
  if (hours) return `${hours} ч`;
  return `${rest} мин`;
}

function formatTrainingTime(value) {
  return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function formatTrainingDate(value) {
  const target = dateAtMidnight(new Date(value));
  const today = dateAtMidnight(new Date());
  const diff = Math.round((target - today) / 86400000);
  const prefix = diff === 1 ? 'Завтра' : diff === 0 ? 'Сегодня' : new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(target);
  return `${prefix}, ${formatTrainingTime(value)}`;
}

function renderTodayTraining(training, sportName) {
  const region = page.querySelector('[data-today-training]');
  const link = page.querySelector('[data-today-training-link]');
  region.setAttribute('aria-busy', 'false');
  region.classList.remove('training-today-content-error');
  if (!training) {
    region.innerHTML = '<span class="training-status-dot training-status-rest" aria-hidden="true"></span><div><strong>Сегодня отдых</strong><span>Восстановление — тоже часть прогресса</span></div>';
    link.textContent = 'Добавить тренировку';
    link.classList.add('button-secondary');
    return;
  }

  region.innerHTML = `<span class="training-status-dot" aria-hidden="true"></span><div><strong>${escapeHtml(training.notes || sportName || 'Тренировка')}</strong><span>${escapeHtml(formatDuration(training.duration_minutes))}</span></div>`;
  link.textContent = 'Подробнее';
  link.classList.remove('button-secondary');
}

function renderNextTraining(training, sportName) {
  const region = page.querySelector('[data-next-training]');
  region.setAttribute('aria-busy', 'false');
  if (!training) {
    region.innerHTML = '<span class="next-training-date">Пока не запланирована</span><strong>Добавьте тренировку на подходящий день</strong>';
    return;
  }
  region.innerHTML = `<span class="next-training-date">${escapeHtml(formatTrainingDate(training.starts_at))}</span><strong>${escapeHtml(training.notes || sportName || 'Тренировка')}</strong><span class="next-training-duration">${escapeHtml(formatDuration(training.duration_minutes))}</span>`;
}

async function getMenuNutrition(userId) {
  const menuDay = await getMenuDayApi(userId, todayISO());
  if (!menuDay) return { menuDay: null, totals: { calories: 0, protein: 0, fat: 0, carbs: 0 } };
  const items = (menuDay.meals || []).flatMap((meal) => meal.menu_items || []);
  return { menuDay, totals: calculateNutritionTotals(items) };
}

async function getAthleteSummary(userId) {
  const { data, error } = await supabase.from('athlete_profiles').select('goal, sport_id')
    .eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

async function getTrainingData(userId) {
  const today = dateAtMidnight(new Date());
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const [todayRows, nextRows] = await Promise.all([
    getTrainingSessions(userId, { from: today.toISOString(), to: tomorrow.toISOString() }),
    getTrainingSessions(userId, { from: tomorrow.toISOString() }),
  ]);
  const todayTraining = todayRows[0] || null;
  const nextTraining = nextRows[0] || null;
  return { todayTraining, nextTraining, todaySport: todayTraining?.sports?.name || '', nextSport: nextTraining?.sports?.name || '' };
}

function renderDataError(regionSelector, message) {
  const region = page.querySelector(regionSelector);
  region.setAttribute('aria-busy', 'false');
  region.hidden = false;
  region.innerHTML = `<div class="dashboard-inline-error">${escapeHtml(message)} <button type="button" data-retry>Повторить</button></div>`;
}

async function loadDashboard(userId) {
  page.querySelector('[data-dashboard-error]').hidden = true;
  renderMacroSkeleton();
  page.querySelector('[data-today-training]').setAttribute('aria-busy', 'true');
  page.querySelector('[data-today-training]').innerHTML = '<div class="skeleton training-skeleton-line"></div><div class="skeleton training-skeleton-short"></div>';
  page.querySelector('[data-next-training]').setAttribute('aria-busy', 'true');
  page.querySelector('[data-next-training]').innerHTML = '<div class="skeleton training-skeleton-line"></div><div class="skeleton training-skeleton-short"></div>';
  const [nutritionResult, trainingResult, athleteResult] = await Promise.allSettled([
    getMenuNutrition(userId),
    getTrainingData(userId),
    getAthleteSummary(userId),
  ]);

  if (athleteResult.status === 'fulfilled' && athleteResult.value?.goal) {
    const focus = page.querySelector('[data-profile-focus]');
    focus.textContent = `Цель: ${GOAL_LABELS[athleteResult.value.goal] || 'Персональная'}`;
    focus.hidden = false;
  }

  if (nutritionResult.status === 'fulfilled') {
    renderMacros(nutritionResult.value.totals, nutritionResult.value.menuDay);
  } else {
    page.querySelectorAll('[data-macro-card]').forEach((card) => {
      card.setAttribute('aria-busy', 'false');
      card.querySelector('[data-macro-value]').className = 'macro-value macro-value-error';
      card.querySelector('[data-macro-value]').textContent = 'Не удалось загрузить';
      card.querySelector('[data-macro-percent]').className = 'macro-percent';
      card.querySelector('[data-macro-percent]').textContent = 'Ошибка';
      card.querySelector('[data-macro-progress]').hidden = true;
    });
    renderDataError('[data-dashboard-error]', 'Не удалось загрузить данные меню. Проверьте подключение к Supabase и настройки доступа.');
  }

  if (trainingResult.status === 'fulfilled') {
    const training = trainingResult.value;
    renderTodayTraining(training.todayTraining, training.todaySport);
    renderNextTraining(training.nextTraining, training.nextSport);
  } else {
    renderDataError('[data-today-training]', 'Не удалось загрузить расписание.');
    renderDataError('[data-next-training]', 'Не удалось загрузить расписание.');
  }
}

const session = await protectPage();
page = document.querySelector('#main-content');
if (session && page) {
  renderLayout();
  const name = session.profile.full_name || session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'спортсмен';
  page.querySelector('[data-user-name]').textContent = name.split(/\s+/)[0];
  const hour = new Date().getHours();
  page.querySelector('[data-greeting]').textContent = hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';
  page.querySelector('[data-dashboard-date]').textContent = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  initHydrationTracker(session.user.id);
  loadDashboard(session.user.id);
  page.addEventListener('click', (event) => {
    if (event.target.closest('[data-retry]')) loadDashboard(session.user.id);
  });
}
