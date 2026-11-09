import { protectPage, formatNumber, toast } from './common.js?v=20261106b';
import { supabase } from './supabase-client.js';
import { getCoachAthletes, getTrainingSessions, saveTraining as saveTrainingApi, translateSupabaseError } from './mock-data.js';

const WEEKDAY_FULL = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
const WEEKDAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
let page;
let session;
let mode = 'week';
let periodOffset = 0;
let sessions = [];
let sports = [];
let selectedDate = new Date();
let coachAthletes = [];
let athleteId;
let loadError = null;
let sessionsRequest = 0;
let weekDayFilter = false;
let bodyWeightAthleteId = null;
let bodyWeightKg = null;

function dateAtMidnight(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
function toLocalIsoDate(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function dateFromIso(value) { const [year, month, day] = String(value).slice(0, 10).split('-').map(Number); return new Date(year, month - 1, day); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]); }
function startOfWeek(date) { const start = dateAtMidnight(date); start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); return start; }
function endOfWeek(date) { const end = startOfWeek(date); end.setDate(end.getDate() + 7); return end; }
function addDays(date, amount) { const result = dateAtMidnight(date); result.setDate(result.getDate() + amount); return result; }
function displayTime(iso) { return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso)); }
function displayDuration(minutes) { const value = Number(minutes); const hours = Math.floor(value / 60); const rest = value % 60; return hours ? `${hours} ч${rest ? ` ${rest} мин` : ''}` : `${rest} мин`; }
function dateLabel(date, options = { day: 'numeric', month: 'long' }) { return date.toLocaleDateString('ru-RU', options); }

const TRAINING_TYPES = [
  { type: 'bodybuilding', matches: /бодибилдинг/, mets: [3.5, 5, 6], icon: '<path d="M6 8v8M3.5 9.5v5M8.5 7v10M15.5 7v10M20.5 9.5v5M18 8v8M8.5 12h7"/>' },
  { type: 'crossfit', matches: /кроссфит/, mets: [5, 6, 7.5], icon: '<path d="M9 8V6a3 3 0 0 1 6 0v2M7 9h10l2 9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zM9 9V8a3 3 0 0 1 6 0v1"/>' },
  { type: 'swimming', matches: /плав/, mets: [5.8, 8, 9.8], icon: '<circle cx="17" cy="6" r="2"/><path d="m13 10 3-1 2 2 3 1M13 10l-3 3 3 2 3-2 2 2M3 17c1.5 0 1.5-1 3-1s1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1M3 20c1.5 0 1.5-1 3-1s1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1"/>' },
  { type: 'running', matches: /бег/, mets: [6.5, 8.5, 10.5], icon: '<circle cx="15.5" cy="4.5" r="2"/><path d="m12 9 3-2 2 3 3 1M12 9l-2.5 4 3 2 2.5-3 2 2M10 13l-3 5M13 15l-1 5M4 9l4-2"/>' },
  { type: 'cycling', matches: /велосипед/, mets: [4, 7, 10], icon: '<circle cx="6" cy="17" r="3.5"/><circle cx="18" cy="17" r="3.5"/><path d="m6 17 4-7h4l4 7M10 10l4 7H6M8 7h3"/>' },
  { type: 'football', matches: /футбол/, mets: [7, 8, 9.5], icon: '<circle cx="12" cy="12" r="9"/><path d="m12 7 3 2-1 4h-4L9 9zM9 9 5 8M14 13l3 3M10 13l-3 4M15 9l3-3M12 7V3"/>' },
  { type: 'boxing', matches: /бокс/, mets: [5.8, 9.3, 12.3], icon: '<path d="M7 5a3 3 0 0 1 3 3v3H6V8a3 3 0 0 1 1-3ZM14 7a3 3 0 0 1 3-3h1v8h-4zM6 11h8v5a4 4 0 0 1-8 0zM14 11h4v5a4 4 0 0 1-4 4"/>' },
  { type: 'martial-arts', matches: /единобор/, mets: [5.3, 10.3, 14.3], icon: '<circle cx="16" cy="5" r="2"/><path d="m13 9 3-2 3 2 2 1M13 9l-3 3 3 2 3-3 2 2M10 12l-4 5M16 11l3 5M7 17l-2 3M18 16l2 4"/>' },
  { type: 'athletics', matches: /атлетик/, mets: [4, 6, 10], icon: '<circle cx="17" cy="5" r="2"/><path d="m14 9 3-2 2 3 2 1M14 9l-3 4 3 2 2-3M12 13l-4 5M16 12l3 4M4 19h16M6 19v-4M10 19v-4M14 19v-4M18 19v-4"/>' },
  { type: 'yoga', matches: /йог/, mets: [2.3, 4, 8], icon: '<circle cx="12" cy="4" r="2"/><path d="m12 7-3 4 3 2 3-2-3-4ZM9 11l-5 2M15 11l5 2M12 13l-5 3 2 4M12 13l5 3-2 4"/>' },
  { type: 'fitness', matches: /фитнес/, mets: [3.5, 5.5, 7.3], icon: '<circle cx="12" cy="4.5" r="2"/><path d="m12 7 0 6M12 9 6 7M12 9l6-2M12 13l-4 6M12 13l4 6M4 14h4M16 14h4"/>' },
  { type: 'other', matches: /.*/, mets: [3, 5, 7], icon: '<path d="m12 3 2.2 5.3L20 10l-4.4 3.6 1.2 5.7-4.8-3-4.8 3 1.2-5.7L4 10l5.8-1.7z"/>' },
];

function trainingActivity(sportName = '', intensity = 'medium') {
  const name = String(sportName).toLocaleLowerCase('ru-RU');
  const activity = TRAINING_TYPES.find((item) => item.matches.test(name)) || TRAINING_TYPES.at(-1);
  const intensityKey = ({ low: 0, низкая: 0, medium: 1, средняя: 1, high: 2, высокая: 2 })[String(intensity).toLocaleLowerCase('ru-RU')] ?? 1;
  return {
    type: activity.type,
    met: activity.mets[intensityKey],
    markup: `<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">${activity.icon}</svg>`,
  };
}

function estimateTrainingCalories(training, sportName) {
  const weight = Number(bodyWeightKg);
  const minutes = Number(training.duration_minutes || training.duration_min);
  if (!Number.isFinite(weight) || weight < 30 || weight > 300 || !Number.isFinite(minutes) || minutes <= 0) return null;
  const activity = trainingActivity(sportName, training.intensity);
  return Math.round(activity.met * weight * (minutes / 60));
}

function isTrainingCompleted(training) {
  if (training.status === 'skipped') return false;
  if (training.status === 'done' || training.status === 'completed') return true;
  if (training.status === 'planned') return false;
  const endTime = new Date(training.starts_at).getTime() + Number(training.duration_minutes || 0) * 60_000;
  return Number.isFinite(endTime) && endTime <= Date.now();
}

async function loadAthleteWeight(targetAthleteId) {
  if (!targetAthleteId || bodyWeightAthleteId === targetAthleteId) return;
  bodyWeightAthleteId = targetAthleteId;
  bodyWeightKg = null;
  try {
    const { data, error } = await supabase.from('athlete_profiles').select('weight_kg').eq('user_id', targetAthleteId).maybeSingle();
    if (error) throw error;
    const weight = Number(data?.weight_kg);
    bodyWeightKg = Number.isFinite(weight) && weight >= 30 && weight <= 300 ? weight : null;
  } catch (error) {
    console.warn('Не удалось получить вес для оценки расхода калорий:', error);
  }
}

function renderLayout() {
  page = document.querySelector('#main-content');
  page.innerHTML = `
    <div class="training-page-heading">
      <div><p class="training-kicker">АКТИВНОСТЬ И ВОССТАНОВЛЕНИЕ</p><h1 class="page-heading">Расписание тренировок</h1><p class="page-caption" data-training-subtitle>Планируйте нагрузку и отслеживайте выполнение</p></div>
      <button class="button training-add-button" type="button" data-add-training><span aria-hidden="true">＋</span> Добавить тренировку</button>
    </div>
    <section class="training-toolbar">
      <div class="training-mode-toggle" role="group" aria-label="Режим календаря"><button type="button" class="training-mode-button is-active" data-mode="week" aria-pressed="true">Неделя</button><button type="button" class="training-mode-button" data-mode="month" aria-pressed="false">Месяц</button></div>
      <div class="training-period-nav"><button type="button" class="period-arrow" data-period-prev aria-label="Предыдущий период">‹</button><strong data-period-label></strong><button type="button" class="period-arrow" data-period-next aria-label="Следующий период">›</button></div>
    </section>
    <div class="training-athlete-select" data-athlete-select-wrap hidden><label><span>Спортсмен</span><select data-athlete-select aria-label="Выбрать спортсмен"></select></label></div>
    <section class="card training-calendar-card" aria-label="Календарь тренировок" aria-busy="true">
      <div class="week-day-strip" data-week-days></div>
      <div class="month-calendar" data-month-calendar hidden></div>
    </section>
    <section class="training-list-section" aria-labelledby="training-list-title">
      <div class="training-list-heading"><div><p class="training-kicker">ВАШ ГРАФИК</p><h2 id="training-list-title">Тренировки</h2></div><div class="training-list-tools"><button class="training-week-reset" type="button" data-show-week hidden>Вся неделя</button><span class="training-count" data-training-count>Загрузка…</span></div></div>
      <p class="training-calorie-summary" data-training-calorie-total aria-live="polite"></p>
      <div class="training-list-loading" data-training-loading><div class="training-skeleton-card"><span class="skeleton training-skeleton-date"></span><span class="skeleton training-skeleton-details"></span></div><div class="training-skeleton-card"><span class="skeleton training-skeleton-date"></span><span class="skeleton training-skeleton-details"></span></div></div>
      <div class="training-session-list" data-training-list hidden></div>
      <div class="empty-state training-empty" data-training-empty hidden><span class="training-empty-icon" aria-hidden="true">✦</span><h3 data-empty-title>Пока нет тренировок на этой неделе</h3><p>Добавьте тренировку, чтобы расписание всегда было под рукой.</p><button class="button" type="button" data-empty-add>＋ Добавить тренировку</button></div>
      <div class="error-state training-error" data-training-error role="alert" hidden></div>
    </section>
    <dialog class="training-dialog" aria-labelledby="training-dialog-title" data-training-dialog>
      <form class="training-form" data-training-form novalidate>
        <header class="training-dialog-header"><div><p class="training-kicker">ПЛАНИРОВАНИЕ</p><h2 id="training-dialog-title" data-dialog-title>Добавить тренировку</h2></div><button class="training-dialog-close" type="button" aria-label="Закрыть окно" data-dialog-close>×</button></header>
        <div class="training-form-grid">
          <label class="training-field"><span>Дата</span><input type="date" name="date" required data-form-date></label>
          <label class="training-field"><span>Время</span><input type="time" name="time" value="10:00" required></label>
          <label class="training-field training-field-wide"><span>Тип тренировки</span><select name="sport_id" required data-sport-select></select></label>
          <label class="training-field"><span>Длительность, мин</span><input type="number" name="duration" min="1" max="600" step="1" value="90" required></label>
          <label class="training-field"><span>Интенсивность</span><select name="intensity"><option value="low">Низкая</option><option value="medium" selected>Средняя</option><option value="high">Высокая</option></select></label>
          <label class="training-field"><span>Статус</span><select name="status"><option value="planned">Запланирована</option><option value="done">Выполнена</option><option value="skipped">Пропущена</option></select></label>
          <label class="training-field training-field-wide"><span>Заметка</span><textarea name="notes" rows="3" maxlength="500" placeholder="Например: грудь + трицепс"></textarea></label>
        </div>
        <p class="training-form-error" role="alert" data-form-error hidden></p>
        <footer class="training-dialog-actions"><button class="button training-delete-button" type="button" data-delete-training hidden>Удалить</button><button class="button button-secondary" type="button" data-dialog-cancel>Отмена</button><button class="button" type="submit" data-form-submit>Сохранить</button></footer>
      </form>
    </dialog>`;

  page.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => {
    if (mode !== button.dataset.mode) { periodOffset = 0; selectedDate = dateAtMidnight(new Date()); weekDayFilter = false; }
    mode = button.dataset.mode;
    page.querySelectorAll('[data-mode]').forEach((entry) => { const active = entry.dataset.mode === mode; entry.classList.toggle('is-active', active); entry.setAttribute('aria-pressed', String(active)); });
    renderCalendar();
    loadSessions();
  }));
  page.querySelector('[data-period-prev]').addEventListener('click', () => { periodOffset -= 1; selectedDate = mode === 'week' ? startOfWeek(currentPeriodAnchor()) : new Date(currentPeriodAnchor().getFullYear(), currentPeriodAnchor().getMonth(), 1); weekDayFilter = false; renderCalendar(); loadSessions(); });
  page.querySelector('[data-period-next]').addEventListener('click', () => { periodOffset += 1; selectedDate = mode === 'week' ? startOfWeek(currentPeriodAnchor()) : new Date(currentPeriodAnchor().getFullYear(), currentPeriodAnchor().getMonth(), 1); weekDayFilter = false; renderCalendar(); loadSessions(); });
  page.querySelector('[data-show-week]').addEventListener('click', () => { weekDayFilter = false; renderSessionList(); });
  page.querySelector('[data-add-training]').addEventListener('click', () => openTrainingDialog());
  page.querySelector('[data-empty-add]').addEventListener('click', () => openTrainingDialog());
  page.querySelector('[data-training-list]').addEventListener('click', (event) => {
    const card = event.target.closest('[data-session-id]');
    if (card) openTrainingDialog(sessions.find((item) => String(item.id) === card.dataset.sessionId));
  });
  page.querySelector('[data-training-form]').addEventListener('submit', saveTraining);
  page.querySelector('[data-dialog-close]').addEventListener('click', closeTrainingDialog);
  page.querySelector('[data-dialog-cancel]').addEventListener('click', closeTrainingDialog);
  page.querySelector('[data-delete-training]').addEventListener('click', deleteTraining);
  page.querySelector('[data-training-dialog]').addEventListener('click', (event) => { if (event.target === event.currentTarget) closeTrainingDialog(); });
  renderCalendar();
}

function currentPeriodAnchor() {
  const anchor = dateAtMidnight(new Date());
  if (mode === 'week') { anchor.setDate(anchor.getDate() + periodOffset * 7); return anchor; }
  anchor.setDate(1);
  anchor.setMonth(anchor.getMonth() + periodOffset);
  return anchor;
}

function currentPeriodRange() {
  const anchor = currentPeriodAnchor();
  if (mode === 'week') {
    const start = startOfWeek(anchor);
    return { start, end: endOfWeek(anchor) };
  }
  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = startOfWeek(monthStart);
  const monthEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  return { start, end: addDays(startOfWeek(monthEnd), 7) };
}

function renderCalendar() {
  if (!page) return;
  const anchor = currentPeriodAnchor();
  const { start, end } = currentPeriodRange();
  page.querySelector('[data-period-label]').textContent = mode === 'week'
    ? `${dateLabel(start, { day: 'numeric' })}–${dateLabel(addDays(end, -1), { day: 'numeric', month: 'long', year: 'numeric' })}`
    : anchor.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  const dayStrip = page.querySelector('[data-week-days]');
  const monthCalendar = page.querySelector('[data-month-calendar]');
  dayStrip.hidden = mode !== 'week';
  monthCalendar.hidden = mode !== 'month';
  if (mode === 'week') {
    dayStrip.innerHTML = Array.from({ length: 7 }, (_, index) => {
      const date = addDays(start, index);
      const iso = toLocalIsoDate(date);
      const today = iso === toLocalIsoDate(new Date());
      const selected = iso === toLocalIsoDate(selectedDate);
      return `<button type="button" class="training-day-tile${today ? ' is-today' : ''}${selected ? ' is-selected' : ''}" data-select-date="${iso}" aria-pressed="${selected}" aria-label="${WEEKDAY_FULL[date.getDay()]}, ${dateLabel(date)}"><span>${WEEKDAY_SHORT[index]}</span><strong>${date.getDate()}</strong><small>${date.toLocaleDateString('ru-RU', { month: 'short' }).replace('.', '')}</small></button>`;
    }).join('');
    dayStrip.querySelectorAll('[data-select-date]').forEach((button) => button.addEventListener('click', () => {
      selectedDate = dateFromIso(button.dataset.selectDate);
      weekDayFilter = true;
      dayStrip.querySelectorAll('[data-select-date]').forEach((item) => item.classList.toggle('is-selected', item.dataset.selectDate === button.dataset.selectDate));
      renderSessionList();
    }));
  } else {
    const firstDay = start;
    const count = Math.round((end - start) / 86400000);
    const month = anchor.getMonth();
    const titles = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    monthCalendar.innerHTML = `<div class="month-weekdays">${titles.map((label) => `<span>${label}</span>`).join('')}</div><div class="month-day-grid">${Array.from({ length: count }, (_, index) => {
      const date = addDays(firstDay, index);
      const iso = toLocalIsoDate(date);
      const inMonth = date.getMonth() === month;
      const today = iso === toLocalIsoDate(new Date());
      const selected = iso === toLocalIsoDate(selectedDate);
      const countForDate = sessions.filter((item) => toLocalIsoDate(new Date(item.starts_at)) === iso).length;
      return `<button type="button" class="month-day${inMonth ? '' : ' is-outside'}${today ? ' is-today' : ''}${selected ? ' is-selected' : ''}" data-select-date="${iso}" aria-label="${WEEKDAY_FULL[date.getDay()]}, ${dateLabel(date)}${countForDate ? `, тренировок: ${countForDate}` : ''}" aria-pressed="${selected}"><span>${date.getDate()}</span>${countForDate ? `<i class="month-training-dots" aria-label="${countForDate} тренировок">${'<b></b>'.repeat(Math.min(countForDate, 3))}</i>` : '<i class="month-training-dots"></i>'}</button>`;
    }).join('')}</div>`;
    monthCalendar.querySelectorAll('[data-select-date]').forEach((button) => button.addEventListener('click', () => {
      selectedDate = dateFromIso(button.dataset.selectDate);
      monthCalendar.querySelectorAll('[data-select-date]').forEach((item) => item.classList.toggle('is-selected', item.dataset.selectDate === button.dataset.selectDate));
      renderSessionList();
    }));
  }
}

async function loadCoachAthletes() {
  if (session.role !== 'coach') return;
  const links = await getCoachAthletes(session.user.id);
  coachAthletes = links.map((link) => ({ id: link.athlete?.id, full_name: link.athlete?.full_name || 'Спортсмен' })).filter((athlete) => athlete.id);
  const requestedAthlete = new URLSearchParams(location.search).get('athlete_id');
  athleteId = requestedAthlete && coachAthletes.some((athlete) => athlete.id === requestedAthlete)
    ? requestedAthlete
    : coachAthletes[0]?.id;
  if (requestedAthlete && !coachAthletes.some((athlete) => athlete.id === requestedAthlete)) {
    toast('У вас нет доступа к этому спортсмену.', 'error');
    location.replace('dashboard.html?rev=20261021a');
    return;
  }
  if (coachAthletes.length > 1) {
    const wrap = page.querySelector('[data-athlete-select-wrap]');
    wrap.hidden = false;
    wrap.querySelector('[data-athlete-select]').innerHTML = coachAthletes.map((athlete) => `<option value="${escapeHtml(athlete.id)}">${escapeHtml(athlete.full_name || 'Спортсмен')}</option>`).join('');
    wrap.querySelector('[data-athlete-select]').value = athleteId;
    wrap.querySelector('[data-athlete-select]').addEventListener('change', (event) => {
      athleteId = event.target.value;
      page.querySelector('[data-training-subtitle]').textContent = `Расписание спортсмена: ${coachAthletes.find((athlete) => athlete.id === athleteId)?.full_name || 'Спортсмен'}`;
      loadSessions();
    });
  }
  page.querySelector('[data-training-subtitle]').textContent = coachAthletes.length
    ? `Расписание спортсмена: ${coachAthletes.find((athlete) => athlete.id === athleteId)?.full_name || 'Спортсмен'}`
    : 'У вас пока нет закреплённых спортсменов';
}

async function loadSports() {
  const { data, error } = await supabase.from('sports').select('id, name').eq('is_active', true).order('name');
  if (error) throw error;
  sports = data || [];
  page.querySelector('[data-sport-select]').innerHTML = `<option value="">Выберите тип тренировки</option>${sports.map((sport) => `<option value="${escapeHtml(sport.id)}">${escapeHtml(sport.name)}</option>`).join('')}`;
}

async function loadSessions() {
  const request = ++sessionsRequest;
  const calendar = page.querySelector('.training-calendar-card');
  calendar.setAttribute('aria-busy', 'true');
  page.querySelector('[data-training-loading]').hidden = false;
  page.querySelector('[data-training-list]').hidden = true;
  page.querySelector('[data-training-empty]').hidden = true;
  page.querySelector('[data-training-error]').hidden = true;
  const { start, end } = currentPeriodRange();
  try {
    if (session.role === 'coach' && !athleteId) {
      sessions = [];
    } else {
      const targetAthlete = session.role === 'coach' ? athleteId : session.user.id;
      await loadAthleteWeight(targetAthlete);
      if (request !== sessionsRequest) return;
      const data = await getTrainingSessions(targetAthlete, { from: start.toISOString(), to: end.toISOString() });
      if (request !== sessionsRequest) return;
      sessions = (data || []).map((item) => ({ ...item, sport: item.sports, title: item.title || item.sports?.name || 'Тренировка' }));
    }
    if (request !== sessionsRequest) return;
    loadError = null;
    page.querySelector('.training-calendar-card').setAttribute('aria-busy', 'false');
    page.querySelector('[data-training-loading]').hidden = true;
    renderCalendar();
    renderSessionList();
  } catch (error) {
    console.error('Не удалось загрузить тренировки:', error);
    if (request !== sessionsRequest) return;
    loadError = error;
    page.querySelector('.training-calendar-card').setAttribute('aria-busy', 'false');
    page.querySelector('[data-training-loading]').hidden = true;
    const errorElement = page.querySelector('[data-training-error]');
    errorElement.innerHTML = 'Не удалось загрузить расписание. <button type="button" data-retry-training>Повторить</button>';
    errorElement.hidden = false;
    errorElement.querySelector('button').addEventListener('click', loadSessions, { once: true });
    page.querySelector('[data-training-count]').textContent = 'Ошибка загрузки';
  }
}

function sessionsForSelectedDate() {
  const key = toLocalIsoDate(selectedDate);
  return sessions.filter((item) => toLocalIsoDate(new Date(item.starts_at)) === key);
}

function renderSessionList() {
  if (!page || loadError) return;
  const list = page.querySelector('[data-training-list]');
  const empty = page.querySelector('[data-training-empty]');
  let visible = sessions;
  if (mode === 'month' || (mode === 'week' && weekDayFilter)) visible = sessionsForSelectedDate();
  const title = page.querySelector('[data-empty-title]');
  title.textContent = mode === 'week' && !weekDayFilter ? 'Пока нет тренировок на этой неделе' : 'На этот день тренировок нет';
  page.querySelector('[data-show-week]').hidden = mode !== 'week' || !weekDayFilter;
  const countWord = visible.length % 10 === 1 && visible.length % 100 !== 11 ? 'тренировка'
    : visible.length % 10 >= 2 && visible.length % 10 <= 4 && (visible.length % 100 < 12 || visible.length % 100 > 14) ? 'тренировки' : 'тренировок';
  const completed = visible.filter(isTrainingCompleted);
  const calorieTotal = completed.reduce((sum, item) => sum + (estimateTrainingCalories(item, item.sport?.name || item.title) || 0), 0);
  page.querySelector('[data-training-count]').textContent = `${visible.length} ${countWord}`;
  const calorieSummary = page.querySelector('[data-training-calorie-total]');
  calorieSummary.textContent = bodyWeightKg
    ? `Расход за выполненные тренировки: ≈ ${formatNumber(calorieTotal)} ккал · оценка по весу, длительности и интенсивности`
    : 'Добавьте вес в профиле, чтобы считать расход калорий';
  if (!visible.length) {
    list.hidden = true;
    empty.hidden = false;
    page.querySelector('[data-training-loading]').hidden = true;
    return;
  }
  empty.hidden = true;
  list.hidden = false;
  page.querySelector('[data-training-loading]').hidden = true;
  const sorted = [...visible].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  list.innerHTML = sorted.map((item) => {
    const date = new Date(item.starts_at);
    const isDone = isTrainingCompleted(item);
    const weekday = WEEKDAY_FULL[date.getDay()];
    const titleText = item.title || item.sport?.name || 'Тренировка';
    const sportName = item.sport?.name || titleText;
    const typeIcon = trainingActivity(sportName, item.intensity);
    const calories = estimateTrainingCalories(item, sportName);
    const subline = item.notes && item.title ? item.notes : '';
    const calorieLine = item.status === 'skipped'
      ? '<small>Тренировка пропущена</small>'
      : calories == null
        ? (bodyWeightKg ? '' : '<small>Укажите вес в профиле для оценки калорий</small>')
        : `<small class="training-calorie-line">${isDone ? '≈' : 'План:'} ${formatNumber(calories)} ккал${isDone ? ' потрачено' : ' ожидается'}</small>`;
    const statusLabel = item.status === 'skipped' ? 'Пропущено' : isDone ? 'Выполнено' : 'Запланировано';
    return `<button class="training-session-row" type="button" data-session-id="${escapeHtml(item.id)}" aria-label="Изменить тренировку ${escapeHtml(titleText)}, ${weekday}, ${displayTime(item.starts_at)}">
      <span class="training-row-date"><strong>${weekday}</strong><small>${dateLabel(date, { day: 'numeric', month: 'short' }).replace('.', '')}</small></span>
      <span class="training-type-icon" data-training-type="${typeIcon.type}" aria-hidden="true">${typeIcon.markup}</span>
      <span class="training-session-info"><strong>${escapeHtml(titleText)}</strong>${subline ? `<small>${escapeHtml(subline)}</small>` : ''}<span>${displayDuration(item.duration_minutes)}</span>${calorieLine}</span>
      <time class="training-session-time">${displayTime(item.starts_at)}</time>
      <span class="training-status${isDone ? ' is-completed' : ' is-planned'}">${statusLabel}</span>
      <span class="training-row-chevron" aria-hidden="true">›</span>
    </button>`;
  }).join('');
}

function openTrainingDialog(training = null) {
  const dialog = page.querySelector('[data-training-dialog]');
  const form = page.querySelector('[data-training-form]');
  form.reset();
  page.querySelector('[data-form-error]').hidden = true;
  page.querySelector('[data-dialog-title]').textContent = training ? 'Редактировать тренировку' : 'Добавить тренировку';
  page.querySelector('[data-delete-training]').hidden = !training;
  form.dataset.sessionId = training?.id || '';
  const startingDate = training ? new Date(training.starts_at) : selectedDate;
  form.elements.date.value = toLocalIsoDate(startingDate);
  form.elements.time.value = training ? displayTime(training.starts_at) : '10:00';
  form.elements.duration.value = training?.duration_minutes || 90;
  form.elements.intensity.value = ({ низкая: 'low', средняя: 'medium', высокая: 'high' })[training?.intensity] || training?.intensity || 'medium';
  form.elements.status.value = training?.status || 'planned';
  form.elements.notes.value = training?.notes || '';
  page.querySelector('[data-sport-select]').value = training?.sport_id || '';
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  page.querySelector('[data-form-date]').focus();
}

function closeTrainingDialog() {
  const dialog = page.querySelector('[data-training-dialog]');
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
}

function modalError(message) {
  const error = page.querySelector('[data-form-error]');
  error.textContent = message;
  error.hidden = false;
}

function trainingPayload(form) {
  const date = form.elements.date.value;
  const time = form.elements.time.value;
  const duration = Number(form.elements.duration.value);
  if (!date || !time) return { error: 'Укажите дату и время тренировки.' };
  if (!Number.isInteger(duration) || duration < 1 || duration > 600) return { error: 'Длительность должна быть от 1 до 600 минут.' };
  if (!form.elements.sport_id.value) return { error: 'Выберите тип тренировки.' };
  const startsAt = new Date(`${date}T${time}:00`);
  if (Number.isNaN(startsAt.getTime())) return { error: 'Проверьте дату и время тренировки.' };
  const sport = sports.find((item) => String(item.id) === String(form.elements.sport_id.value));
  return {
    data: {
      athlete_id: athleteId,
      sport_id: form.elements.sport_id.value,
      starts_at: startsAt.toISOString(),
      duration_minutes: duration,
      intensity: form.elements.intensity.value,
      status: form.elements.status.value,
      notes: form.elements.notes.value.trim() || null,
      title: sport?.name || 'Тренировка',
      sport,
    },
  };
}

async function saveTraining(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const result = trainingPayload(form);
  if (result.error) { modalError(result.error); return; }
  const submit = page.querySelector('[data-form-submit]');
  submit.disabled = true;
  const existingId = form.dataset.sessionId;
  try {
    const { sport, ...payload } = result.data;
    await saveTrainingApi(payload, existingId || null);
    closeTrainingDialog();
    toast(existingId ? 'Тренировка обновлена' : 'Тренировка добавлена', 'success');
    await loadSessions();
  } catch (error) {
    console.error('Не удалось сохранить тренировку:', error);
    modalError(translateSupabaseError(error));
  } finally {
    submit.disabled = false;
  }
}

async function deleteTraining() {
  const form = page.querySelector('[data-training-form]');
  const id = form.dataset.sessionId;
  if (!id) return;
  if (!window.confirm('Удалить эту тренировку?')) return;
  try {
    const { error } = await supabase.from('training_sessions').delete().eq('id', id).eq('athlete_id', athleteId);
    if (error) throw error;
    closeTrainingDialog();
    toast('Тренировка удалена', 'success');
    await loadSessions();
  } catch (error) {
    console.error('Не удалось удалить тренировку:', error);
    modalError(translateSupabaseError(error));
  }
}

async function init() {
  session = await protectPage();
  if (!session) return;
  renderLayout();
  athleteId = session.user.id;
  try {
    await loadCoachAthletes();
    await loadSports();
    if (session.role === 'coach' && !coachAthletes.length) {
      page.querySelector('[data-add-training]').disabled = true;
      page.querySelector('[data-empty-add]').disabled = true;
      page.querySelector('[data-training-subtitle]').textContent = 'Чтобы работать с расписанием, выберите закреплённого спортсмена.';
    }
    await loadSessions();
  } catch (error) {
    console.error('Не удалось настроить расписание тренировок:', error);
    const errorElement = page.querySelector('[data-training-error]');
    errorElement.innerHTML = 'Не удалось загрузить данные расписания. <button type="button" data-retry-training>Повторить</button>';
    errorElement.hidden = false;
    errorElement.querySelector('button').addEventListener('click', init, { once: true });
    page.querySelector('[data-training-loading]').hidden = true;
  }
}

init().catch((error) => {
  console.error('Ошибка страницы тренировок:', error);
  const main = document.querySelector('#main-content');
  const message = 'Не удалось открыть расписание. Обновите страницу или попробуйте позже.';
  if (main) {
    main.innerHTML = `<section class="card error-state"><h1 class="page-heading">Расписание тренировок</h1><p>${message}</p><button class="button" type="button" data-reload-training>Обновить страницу</button></section>`;
  } else {
    const app = document.querySelector('[data-app-shell]');
    if (app) {
      app.innerHTML = `<main class="training-boot-fallback is-error"><span class="training-boot-mark" aria-hidden="true">!</span><h1>Расписание временно недоступно</h1><p>${message}</p><button class="button" type="button" data-reload-training>Обновить страницу</button></main>`;
    }
  }
  document.querySelector('[data-reload-training]')?.addEventListener('click', () => location.reload());
});
