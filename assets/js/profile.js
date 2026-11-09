import { protectPage, formatNumber, toast, updateShellAvatar, installImageFallbacks } from './common.js?v=20261106b';
import { supabase } from './supabase-client.js';
import { calculateNutritionPlan, validateAthleteProfile } from './nutrition.js';
import { PHOTOS } from './image-library.js?v=20261101b';
import { getProfile as getProfileApi, saveProfile as saveProfileApi, translateSupabaseError } from './mock-data.js';

const ROLE_LABELS = Object.freeze({ athlete: 'Спортсмен', coach: 'Тренер', admin: 'Администратор' });

const FIELDS = [
  { key: 'birth_date', label: 'Дата рождения', group: 'basic', type: 'date' },
  { key: 'gender', label: 'Пол', group: 'basic', type: 'select', options: [['', 'Не указано'], ['male', 'Мужской'], ['female', 'Женский']] },
  { key: 'height_cm', label: 'Рост', unit: 'см', group: 'basic', type: 'number', min: 100, max: 250, step: 0.5 },
  { key: 'weight_kg', label: 'Вес', unit: 'кг', group: 'basic', type: 'number', min: 30, max: 300, step: 0.1 },
  { key: 'activity_level', label: 'Уровень активности', group: 'goals', type: 'select', options: [['', 'Не указано'], ['low', 'Низкий'], ['medium', 'Средний'], ['high', 'Высокий'], ['very_high', 'Очень высокий']] },
  { key: 'goal', label: 'Цель', group: 'goals', type: 'select', options: [['', 'Не указано'], ['gain', 'Набор мышечной массы'], ['lose', 'Снижение веса'], ['maintain', 'Поддержание']] },
  { key: 'sport_id', label: 'Вид спорта', group: 'goals', type: 'select', options: [['', 'Не указано']] },
];

let page;
let session;
let athleteProfile = {};
let sports = [];
let weightChart;
let weightHistory = [];
let activeTab = 'basic';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function initials(name) {
  return String(name || 'Спортсмен').trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toLocaleUpperCase('ru-RU');
}

function localToday() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

function fieldMarkup(field) {
  const options = field.key === 'sport_id' ? field.options : field.options;
  const control = field.type === 'select'
    ? `<select id="profile-${field.key}" name="${field.key}" data-profile-field="${field.key}">${options.map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join('')}</select>`
    : `<input id="profile-${field.key}" name="${field.key}" data-profile-field="${field.key}" type="${field.type}"${field.min != null ? ` min="${field.min}" max="${field.max}" step="${field.step}"` : ''}${field.type === 'date' ? ` max="${localToday()}"` : ''} autocomplete="off">`;
  const unit = field.unit ? ` <span>${field.unit}</span>` : '';
  return `<div class="profile-field" data-field-card="${field.key}" data-group="${field.group}">
    <span class="profile-field-label">${field.label}</span>
    <span class="profile-field-value" data-profile-value="${field.key}"><span class="skeleton profile-value-skeleton"></span></span>
    <div class="profile-field-control">${control}${unit}</div>
    <span class="profile-field-error" data-field-error="${field.key}" hidden></span>
  </div>`;
}

function renderPage() {
  const name = session.profile.full_name || session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'Спортсмен';
  page.innerHTML = `
    <div class="profile-page-heading"><div><p class="profile-kicker">ВАШИ ДАННЫЕ</p><h1 class="page-heading">Профиль</h1><p class="profile-page-caption">Личная информация, прогресс и ориентиры для ваших целей.</p></div><span class="profile-heading-mark" aria-hidden="true">✦</span></div>
    <div class="profile-tabs" role="tablist" aria-label="Разделы профиля">
      <button class="profile-tab is-active" id="profile-tab-basic" type="button" role="tab" aria-selected="true" aria-controls="profile-form" data-tab="basic">Основная информация</button>
      <button class="profile-tab" id="profile-tab-goals" type="button" role="tab" aria-selected="false" aria-controls="profile-form" data-tab="goals">Цели и параметры</button>
    </div>
    <div class="profile-layout">
      <section class="card profile-card" data-profile-card aria-busy="true">
        <header class="profile-identity">
          <span class="profile-avatar-wrap"><img class="profile-avatar" src="${escapeHtml(session.profile.avatar_url || PHOTOS.avatar1)}" alt="Фото профиля ${escapeHtml(name)}" data-image-fallback="avatar" data-image-name="${escapeHtml(name)}" loading="lazy"><button class="profile-avatar-edit" type="button" data-choose-avatar aria-label="Изменить фото профиля" title="Изменить фото профиля"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h3l1.5-2h7L17 7h3v12H4z"/><circle cx="12" cy="13" r="3.5"/></svg></button></span>
          <input class="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" data-avatar-input aria-label="Выберите фото профиля">
          <div class="profile-identity-text">
            <h2 class="profile-name-display" data-profile-name>${escapeHtml(name)}</h2>
            <label class="profile-name-edit"><span>Имя</span><input type="text" data-profile-name-input value="${escapeHtml(name)}" minlength="2" maxlength="100" autocomplete="name" aria-describedby="profile-name-error" required><span class="profile-name-error" id="profile-name-error" data-profile-name-error hidden></span></label>
            <p>${ROLE_LABELS[session.role] || 'Пользователь'}</p>
            <button class="profile-edit-link" type="button" data-edit-profile>Редактировать</button>
          </div>
          <span class="profile-save-state" data-profile-state aria-live="polite"></span>
        </header>
        <section class="profile-completion" aria-label="Заполненность профиля">
          <div class="profile-completion-top"><div><span class="profile-completion-kicker">ВАШ СТАРТ</span><strong data-profile-completion-title>Собираем вашу сводку</strong></div><span class="profile-completion-count" data-profile-completion-count>0 из ${FIELDS.length}</span></div>
          <div class="profile-completion-bar" data-profile-completion-bar role="progressbar" aria-label="Заполненность профиля" aria-valuemin="0" aria-valuemax="${FIELDS.length}" aria-valuenow="0"><span></span></div>
          <div class="profile-completion-bottom"><p data-profile-completion-hint>Добавьте основные показатели, чтобы расчёты стали точнее.</p><button type="button" data-complete-profile>Заполнить профиль <span aria-hidden="true">→</span></button></div>
        </section>
        <form id="profile-form" class="profile-form" data-editing="false" novalidate>
          <div class="profile-fields" data-profile-fields>${FIELDS.map(fieldMarkup).join('')}</div>
          <div class="profile-actions" hidden><button class="button" type="submit" data-save-profile><span data-save-label>Сохранить</span><span class="button-spinner" aria-hidden="true"></span></button><button class="button button-secondary" type="button" data-cancel-edit>Отмена</button></div>
        </form>
        <p class="profile-error" data-profile-error role="alert" hidden></p>
      </section>

      <aside class="profile-metrics-column">
        <section class="card current-metrics-card" aria-labelledby="metrics-title" aria-busy="true">
          <div class="profile-section-heading"><div><p class="profile-kicker">РАСЧЁТНЫЕ ЗНАЧЕНИЯ</p><h2 id="metrics-title">Текущие показатели</h2></div><span class="metrics-badge" aria-hidden="true">✦</span></div>
          <div class="metric-list">
            <div class="metric-row"><span>ИМТ</span><strong data-metric="bmi"><span class="skeleton metric-value-skeleton"></span></strong><span class="metric-status" data-bmi-status>—</span></div>
            <div class="metric-row"><span>Калории</span><strong data-metric="calories"><span class="skeleton metric-value-skeleton"></span></strong></div>
            <div class="metric-row"><span>Белки</span><strong data-metric="protein"><span class="skeleton metric-value-skeleton"></span></strong></div>
            <div class="metric-row"><span>Жиры</span><strong data-metric="fat"><span class="skeleton metric-value-skeleton"></span></strong></div>
            <div class="metric-row"><span>Углеводы</span><strong data-metric="carbs"><span class="skeleton metric-value-skeleton"></span></strong></div>
          </div>
          <p class="metric-energy-note" data-energy-note>Показатели появятся после заполнения параметров профиля.</p>
          <div class="weight-progress-heading"><div><h3>История веса</h3><small data-weight-last>Динамика замеров</small></div><span class="weight-change-badge" data-weight-change>— кг</span></div>
          <div class="weight-chart-wrap"><canvas id="weight-chart" role="img" aria-label="График изменения веса"></canvas><div class="chart-empty" data-chart-empty>Сохраняйте замеры веса, чтобы увидеть динамику.</div></div>
          <button class="weight-add-button" type="button" data-add-weight>＋ Добавить замер веса</button>
        </section>
        <p class="profile-disclaimer">Формула Миффлина–Сан-Жеора: BMR с учётом возраста, пола, роста и веса; TDEE = BMR × коэффициент активности (1,2 / 1,375 / 1,55 / 1,725). Поправка цели: −15% для снижения веса, 0% для поддержания, +10% для набора; нормы белков и жиров ориентировочно рассчитаны на массу тела. Расчёты информационные и не заменяют консультацию врача или диетолога.</p>
      </aside>
    </div>`;

  installImageFallbacks(page);
  page.querySelector('[data-choose-avatar]').addEventListener('click', () => page.querySelector('[data-avatar-input]').click());
  page.querySelector('[data-avatar-input]').addEventListener('change', handleAvatarUpload);
  page.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => setActiveTab(button.dataset.tab));
    button.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const tabs = [...page.querySelectorAll('[data-tab]')];
      const current = tabs.indexOf(button);
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
        : (current + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
      tabs[index].focus();
      setActiveTab(tabs[index].dataset.tab);
    });
  });
  page.querySelector('[data-edit-profile]').addEventListener('click', startEditing);
  page.querySelector('[data-complete-profile]').addEventListener('click', () => {
    startEditing();
    const firstMissing = FIELDS.find((field) => athleteProfile[field.key] == null || athleteProfile[field.key] === '');
    setActiveTab(firstMissing?.group || 'basic');
    const target = page.querySelector(`[data-profile-field="${firstMissing?.key || 'weight_kg'}"]`);
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target?.focus({ preventScroll: true });
  });
  page.querySelector('[data-add-weight]').addEventListener('click', () => {
    startEditing();
    setActiveTab('basic');
    const target = page.querySelector('[data-profile-field="weight_kg"]');
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target?.focus({ preventScroll: true });
  });
  page.querySelector('[data-cancel-edit]').addEventListener('click', cancelEditing);
  page.querySelector('[data-profile-name-input]').addEventListener('input', clearNameValidation);
  page.querySelector('#profile-form').addEventListener('submit', saveProfile);
  page.querySelector('#profile-form').addEventListener('input', updatePreviewMetrics);
  page.querySelector('#profile-form').addEventListener('change', updatePreviewMetrics);
  page.querySelector('.profile-error').addEventListener('click', (event) => {
    if (event.target.closest('[data-retry-profile]')) loadProfile();
  });
}

function setActiveTab(tab) {
  activeTab = tab === 'goals' ? 'goals' : 'basic';
  page.querySelectorAll('[data-tab]').forEach((button) => {
    const isActive = button.dataset.tab === activeTab;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-selected', String(isActive));
    button.tabIndex = isActive ? 0 : -1;
  });
  page.querySelectorAll('[data-field-card]').forEach((field) => {
    field.hidden = field.dataset.group !== activeTab;
  });
}

function fieldDisplayValue(field, value) {
  if (value == null || value === '') return 'Не указано';
  if (field.key === 'birth_date') {
    const [year, month, day] = String(value).split('-').map(Number);
    return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(year, month - 1, day));
  }
  if (field.key === 'gender') return value === 'male' ? 'Мужской' : value === 'female' ? 'Женский' : 'Не указано';
  if (field.key === 'height_cm') return `${formatNumber(value, 1)} см`;
  if (field.key === 'weight_kg') return `${formatNumber(value, 1)} кг`;
  if (field.key === 'activity_level') return ({ low: 'Низкий', medium: 'Средний', high: 'Высокий', very_high: 'Очень высокий' })[value] || 'Не указано';
  if (field.key === 'goal') return ({ gain: 'Набор мышечной массы', lose: 'Снижение веса', maintain: 'Поддержание' })[value] || 'Не указано';
  if (field.key === 'sport_id') return sports.find((sport) => sport.id === value)?.name || 'Не указано';
  return String(value).replace(/^./, (character) => character.toLocaleUpperCase('ru-RU'));
}

function updateFieldViews() {
  for (const field of FIELDS) {
    const input = page.querySelector(`[data-profile-field="${field.key}"]`);
    const display = page.querySelector(`[data-profile-value="${field.key}"]`);
    display.textContent = fieldDisplayValue(field, athleteProfile[field.key]);
    if (field.key === 'sport_id') {
      input.innerHTML = '<option value="">Не указано</option>' + sports.map((sport) => `<option value="${escapeHtml(sport.id)}">${escapeHtml(sport.name)}</option>`).join('');
    }
    input.value = athleteProfile[field.key] ?? '';
  }
}

function startEditing() {
  const form = page.querySelector('#profile-form');
  page.querySelector('[data-profile-name-input]').value = session.profile.full_name || session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || '';
  form.dataset.editing = 'true';
  page.querySelector('[data-profile-card]').dataset.editing = 'true';
  page.querySelector('.profile-actions').hidden = false;
  page.querySelector('[data-edit-profile]').hidden = true;
  page.querySelector('[data-profile-state]').textContent = '';
}

function cancelEditing() {
  const form = page.querySelector('#profile-form');
  page.querySelector('[data-profile-name-input]').value = session.profile.full_name || session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || '';
  form.dataset.editing = 'false';
  page.querySelector('[data-profile-card]').dataset.editing = 'false';
  page.querySelector('.profile-actions').hidden = true;
  page.querySelector('[data-edit-profile]').hidden = false;
  clearValidation();
  clearNameValidation();
  updateFieldViews();
  updateMetrics(athleteProfile);
}

function resizeAvatar(file) {
  return new Promise(async (resolve, reject) => {
    let bitmap;
    try { bitmap = await createImageBitmap(file); } catch { reject(new Error('Не удалось открыть изображение. Выберите JPG, PNG или WebP.')); return; }
    const scale = Math.min(1, 600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Не удалось обработать изображение.')), 'image/jpeg', 0.84);
  });
}

async function handleAvatarUpload(event) {
  const input = event.currentTarget;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    toast('Выберите изображение в формате JPG, PNG или WebP.', 'error');
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    toast('Размер фото должен быть не больше 8 МБ.', 'error');
    return;
  }
  const button = page.querySelector('[data-choose-avatar]');
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  try {
    const imageBlob = await resizeAvatar(file);
    const objectPath = `${session.user.id}/profile.jpg`;
    const { error: uploadError } = await supabase.storage.from('athletemenu-avatars').upload(objectPath, imageBlob, {
      contentType: 'image/jpeg', upsert: true, cacheControl: '0',
    });
    if (uploadError) throw uploadError;
    const publicUrl = supabase.storage.from('athletemenu-avatars').getPublicUrl(objectPath).data.publicUrl;
    const { error: profileError } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', session.user.id);
    if (profileError) throw profileError;
    session.profile.avatar_url = publicUrl;
    const image = page.querySelector('.profile-avatar');
    image.hidden = false;
    image.dataset.fallbackShown = '';
    image.src = `${publicUrl}${publicUrl.includes('?') ? '&' : '?'}v=${Date.now()}`;
    updateShellAvatar(publicUrl, page.querySelector('[data-profile-name]').textContent);
    toast('Фото профиля обновлено.', 'success');
  } catch (error) {
    console.error('Не удалось обновить фото профиля:', error);
    toast(translateSupabaseError(error), 'error');
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
}

function readForm() {
  const values = Object.fromEntries(new FormData(page.querySelector('#profile-form')));
  return {
    birth_date: values.birth_date || null,
    gender: values.gender || null,
    height_cm: values.height_cm === '' ? null : Number(values.height_cm),
    weight_kg: values.weight_kg === '' ? null : Number(values.weight_kg),
    activity_level: values.activity_level || null,
    goal: values.goal || null,
    sport_id: values.sport_id || null,
  };
}

function clearValidation() {
  page.querySelectorAll('[data-field-error]').forEach((element) => {
    element.textContent = '';
    element.hidden = true;
  });
  page.querySelectorAll('[aria-invalid="true"]').forEach((element) => element.removeAttribute('aria-invalid'));
}

function clearNameValidation() {
  const input = page.querySelector('[data-profile-name-input]');
  const error = page.querySelector('[data-profile-name-error]');
  input.removeAttribute('aria-invalid');
  error.textContent = '';
  error.hidden = true;
}

function showNameValidation(message) {
  const input = page.querySelector('[data-profile-name-input]');
  const error = page.querySelector('[data-profile-name-error]');
  input.setAttribute('aria-invalid', 'true');
  error.textContent = message;
  error.hidden = false;
  input.focus();
}

function showValidation(errors) {
  clearValidation();
  const firstError = Object.keys(errors)[0];
  for (const [key, text] of Object.entries(errors)) {
    const field = page.querySelector(`[data-profile-field="${key}"]`);
    const error = page.querySelector(`[data-field-error="${key}"]`);
    if (field) field.setAttribute('aria-invalid', 'true');
    if (error) { error.textContent = text; error.hidden = false; }
  }
  if (firstError) {
    const group = FIELDS.find((field) => field.key === firstError)?.group;
    if (group) setActiveTab(group);
    page.querySelector(`[data-profile-field="${firstError}"]`)?.focus();
  }
}

function updatePreviewMetrics() {
  if (page.querySelector('#profile-form')?.dataset.editing !== 'true') return;
  updateMetrics(readForm());
}

function updateMetrics(profile) {
  const plan = calculateNutritionPlan(profile);
  const bmi = page.querySelector('[data-metric="bmi"]');
  const bmiStatus = page.querySelector('[data-bmi-status]');
  const format = (value, unit) => value == null ? '—' : `${formatNumber(value, 0)} ${unit}`;
  bmi.textContent = plan.bmi == null ? '—' : formatNumber(plan.bmi, 1).replace(',', ',');
  bmiStatus.textContent = plan.bmiLabel || '—';
  bmiStatus.className = `metric-status${plan.bmiLabel === 'Норма' ? ' is-normal' : plan.bmiLabel ? ' is-not-normal' : ''}`;
  page.querySelector('[data-metric="calories"]').textContent = format(plan.calories, 'ккал');
  page.querySelector('[data-metric="protein"]').textContent = format(plan.protein, 'г');
  page.querySelector('[data-metric="fat"]').textContent = format(plan.fat, 'г');
  page.querySelector('[data-metric="carbs"]').textContent = format(plan.carbs, 'г');
  page.querySelector('.current-metrics-card').setAttribute('aria-busy', 'false');
  page.querySelector('[data-energy-note]').textContent = plan.bmr == null || plan.tdee == null
    ? 'Заполните дату рождения, пол, рост, вес и активность для расчёта BMR и суточной потребности.'
    : `BMR ${formatNumber(plan.bmr)} ккал · поддержание ${formatNumber(plan.tdee)} ккал до поправки на цель.`;
}

function renderWeightChart() {
  const points = weightHistory.slice(-12).map((point) => ({ date: point.logged_on, weight: Number(point.weight_kg) }));
  const currentWeight = athleteProfile.weight_kg == null ? null : Number(athleteProfile.weight_kg);
  const chartPoints = points.length ? points : currentWeight == null ? [] : [{ date: localToday(), weight: currentWeight }];
  const badge = page.querySelector('[data-weight-change]');
  if (points.length > 1) {
    const delta = points.at(-1).weight - points[0].weight;
    badge.textContent = `${delta > 0 ? '+' : ''}${formatNumber(delta, 1)} кг`;
    badge.classList.toggle('is-negative', delta < 0);
  } else {
    badge.textContent = '— кг';
  }
  page.querySelector('[data-weight-last]').textContent = points.length
    ? `Последний замер: ${new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(new Date(`${points.at(-1).date}T00:00:00`))}`
    : 'Добавьте первый замер';

  const empty = page.querySelector('[data-chart-empty]');
  empty.hidden = chartPoints.length > 1;
  empty.textContent = chartPoints.length
    ? 'Добавьте ещё один замер, чтобы увидеть динамику.'
    : 'Замеров пока нет — начните с текущего веса.';
  if (!window.Chart) {
    empty.hidden = false;
    empty.textContent = 'График станет доступен при подключении Chart.js.';
    return;
  }
  if (weightChart) weightChart.destroy();
  const canvas = page.querySelector('#weight-chart');
  const context = canvas.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, 0, 180);
  gradient.addColorStop(0, 'rgba(14, 122, 79, .20)');
  gradient.addColorStop(1, 'rgba(14, 122, 79, 0)');
  weightChart = new Chart(context, {
    type: 'line',
    data: {
      labels: chartPoints.map((point) => new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit' }).format(new Date(`${point.date}T00:00:00`))),
      datasets: [{ data: chartPoints.map((point) => Number(point.weight)), borderColor: '#0E7A4F', backgroundColor: gradient, fill: true, tension: .38, borderWidth: 2.5, pointRadius: chartPoints.length === 1 ? 4 : 2.5, pointHoverRadius: 5, pointBackgroundColor: '#fff', pointBorderColor: '#0E7A4F', pointBorderWidth: 2 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (item) => `${formatNumber(item.raw, 1)} кг` } } },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { color: '#87958f', font: { size: 10 }, maxTicksLimit: 6 } },
        y: { border: { display: false, dash: [3, 3] }, grid: { color: 'rgba(227,235,232,.7)' }, ticks: { color: '#87958f', font: { size: 10 }, maxTicksLimit: 4 } },
      },
    },
  });
}

function renderProfileData() {
  updateFieldViews();
  updateMetrics(athleteProfile);
  renderWeightChart();
  const completedFields = FIELDS.filter((field) => athleteProfile[field.key] != null && athleteProfile[field.key] !== '').length;
  const completionBar = page.querySelector('[data-profile-completion-bar]');
  completionBar.setAttribute('aria-valuenow', String(completedFields));
  completionBar.querySelector('span').style.width = `${Math.round(completedFields / FIELDS.length * 100)}%`;
  page.querySelector('[data-profile-completion-count]').textContent = `${completedFields} из ${FIELDS.length}`;
  page.querySelector('[data-profile-completion-title]').textContent = completedFields === FIELDS.length ? 'Профиль заполнен' : 'Настройте профиль под себя';
  page.querySelector('[data-profile-completion-hint]').textContent = completedFields === FIELDS.length
    ? 'Показатели обновляются вместе с вашими данными.'
    : `Осталось заполнить: ${FIELDS.filter((field) => athleteProfile[field.key] == null || athleteProfile[field.key] === '').map((field) => field.label.toLocaleLowerCase('ru-RU')).slice(0, 3).join(', ')}${FIELDS.filter((field) => athleteProfile[field.key] == null || athleteProfile[field.key] === '').length > 3 ? ' и другие данные' : ''}.`;
  page.querySelector('[data-complete-profile]').hidden = completedFields === FIELDS.length;
  page.querySelector('[data-profile-card]').setAttribute('aria-busy', 'false');
  page.querySelector('[data-profile-error]').hidden = true;
  setActiveTab(activeTab);
}

async function loadProfile() {
  const card = page.querySelector('[data-profile-card]');
  card.setAttribute('aria-busy', 'true');
  try {
    const [profileResult, sportsResult] = await Promise.all([
      getProfileApi(session.user.id),
      supabase.from('sports').select('id,name').eq('is_active', true).order('name', { ascending: true }),
    ]);
    if (sportsResult.error) throw sportsResult.error;
    athleteProfile = profileResult.athleteProfile || {};
    weightHistory = profileResult.weightHistory || [];
    sports = sportsResult.data || [];
    renderProfileData();
    if (!profileResult.athleteProfile) {
      page.querySelector('[data-profile-state]').textContent = 'Заполните сведения о себе';
      startEditing();
    }
  } catch (error) {
    card.setAttribute('aria-busy', 'false');
    const box = page.querySelector('[data-profile-error]');
    box.textContent = `Не удалось загрузить профиль. ${translateSupabaseError(error)}`;
    box.hidden = false;
  }
}

async function saveProfile(event) {
  event.preventDefault();
  const fullName = page.querySelector('[data-profile-name-input]').value.trim().replace(/\s+/g, ' ');
  if (fullName.length < 2) {
    showNameValidation('Введите имя длиной не менее двух символов.');
    return;
  }
  clearNameValidation();
  const next = readForm();
  const errors = validateAthleteProfile(next);
  if (Object.keys(errors).length) { showValidation(errors); return; }
  clearValidation();

  const button = page.querySelector('[data-save-profile]');
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  page.querySelector('[data-save-label]').textContent = 'Сохраняем…';
  try {
    const saved = await saveProfileApi({ userId: session.user.id, fullName, athleteProfile: next, weightKg: next.weight_kg });
    athleteProfile = saved.athleteProfile || { user_id: session.user.id, ...next };
    weightHistory = saved.weightHistory || weightHistory;
    session.profile = saved.profile || { ...session.profile, full_name: fullName };
    page.querySelector('[data-profile-name]').textContent = session.profile.full_name;
    page.querySelector('[data-profile-name-input]').value = session.profile.full_name;
    page.querySelector('.profile-avatar').alt = `Фото профиля ${session.profile.full_name}`;
    page.querySelector('.profile-avatar').dataset.imageName = session.profile.full_name;
    updateShellAvatar(session.profile.avatar_url, session.profile.full_name);
    renderProfileData();
    cancelEditing();
    toast('Профиль сохранён', 'success');
  } catch (error) {
    page.querySelector('[data-profile-state]').textContent = '';
    toast(translateSupabaseError(error), 'error');
  } finally {
    button.disabled = false;
    button.setAttribute('aria-busy', 'false');
    page.querySelector('[data-save-label]').textContent = 'Сохранить';
  }
}

session = await protectPage();
page = document.querySelector('#main-content');
if (session && page) {
  renderPage();
  loadProfile();
}
