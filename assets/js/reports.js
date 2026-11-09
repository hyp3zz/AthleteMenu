import { protectPage, formatNumber, toast } from './common.js?v=20261106b';
import { supabase } from './supabase-client.js';
import { calculateNutritionTotals } from './nutrition.js';
import { getMenus, getTrainingSessions, translateSupabaseError } from './mock-data.js';

const $ = (selector, root = document) => root.querySelector(selector);
const DAY_MS = 86400000;
const COLORS = { protein: '#1fa463', fat: '#f5a524', carbs: '#2f80ed', green: '#0e7a4f' };
const MACROS = [
  { key: 'protein', label: 'Белки', target: 'target_protein_g', color: COLORS.protein },
  { key: 'fat', label: 'Жиры', target: 'target_fat_g', color: COLORS.fat },
  { key: 'carbs', label: 'Углеводы', target: 'target_carbs_g', color: COLORS.carbs },
];

let session;
let charts = [];
let reportRows = [];
let selectedType = 'all';

function localISO(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function startOfWeek(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}
function rangeDates(from, to) {
  const dates = [];
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  for (let date = start; date <= end && dates.length < 367; date = new Date(date.getTime() + DAY_MS)) dates.push(localISO(date));
  return dates;
}
function showDate(date) {
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit' }).format(new Date(`${date}T00:00:00`));
}
function emptyTotals() { return { calories: 0, protein: 0, fat: 0, carbs: 0 }; }
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
function dateOfResult(row) {
  for (const key of ['result_date', 'nutrition_date', 'menu_date', 'date', 'created_at', 'calculated_at']) {
    if (row[key]) return String(row[key]).slice(0, 10);
  }
  return null;
}
function numFrom(row, names) {
  for (const key of names) if (row[key] != null && Number.isFinite(Number(row[key]))) return Number(row[key]);
  return null;
}
function normalizeResult(row) {
  return {
    calories: numFrom(row, ['actual_kcal', 'calories_kcal', 'total_kcal', 'calories', 'calories_consumed']),
    protein: numFrom(row, ['actual_protein_g', 'protein_g', 'total_protein_g', 'protein']),
    fat: numFrom(row, ['actual_fat_g', 'fat_g', 'total_fat_g', 'fat']),
    carbs: numFrom(row, ['actual_carbs_g', 'carbs_g', 'total_carbs_g', 'carbs']),
    targets: {
      calories: numFrom(row, ['target_kcal', 'goal_kcal', 'calories_target']),
      protein: numFrom(row, ['target_protein_g', 'protein_target_g']),
      fat: numFrom(row, ['target_fat_g', 'fat_target_g']),
      carbs: numFrom(row, ['target_carbs_g', 'carbs_target_g']),
    },
  };
}

async function queryNutrition(from, to) {
  const userId = session.user.id;
  const [{ data: results, error }, menus] = await Promise.all([
    supabase.from('nutrition_results').select('*').eq('athlete_id', userId).gte('result_date', from).lte('result_date', to).order('result_date'),
    getMenus(userId),
  ]);
  if (error) throw error;
  const byDate = new Map();
  for (const menu of menus) {
    for (const day of menu.menu_days || []) {
      const date = day.day_date || day.menu_date;
      if (!date || date < from || date > to) continue;
      const current = byDate.get(date);
      if (current && current.status === 'active') continue;
      const items = (day.meals || []).flatMap((meal) => meal.menu_items || []);
      const totals = calculateNutritionTotals(items.map((item) => ({
        quantity_g: item.grams ?? item.quantity_g,
        calories_kcal_per_100g: item.kcal_100 ?? item.calories_kcal_per_100g,
        protein_g_per_100g: item.protein_100 ?? item.protein_g_per_100g,
        fat_g_per_100g: item.fat_100 ?? item.fat_g_per_100g,
        carbs_g_per_100g: item.carbs_100 ?? item.carbs_g_per_100g,
      })));
      byDate.set(date, { date, totals, targets: { calories: day.target_kcal, protein: day.target_protein ?? day.target_protein_g, fat: day.target_fat ?? day.target_fat_g, carbs: day.target_carbs ?? day.target_carbs_g }, status: menu.status });
    }
  }
  for (const row of results || []) {
    const date = row.result_date;
    const normalized = normalizeResult(row);
    const current = byDate.get(date) || { date, totals: emptyTotals(), targets: {} };
    for (const key of Object.keys(current.totals)) if (normalized[key] != null) current.totals[key] = normalized[key];
    for (const key of ['calories','protein','fat','carbs']) if (normalized.targets[key] != null) current.targets[key] = normalized.targets[key];
    byDate.set(date, current);
  }
  return [...byDate.values()].filter((row) => Object.values(row.totals).some((value) => Number(value) > 0));
}

async function queryTraining(from, to) {
  const fromDate = new Date(`${from}T00:00:00`).toISOString();
  const toDate = new Date(new Date(`${to}T00:00:00`).getTime() + DAY_MS).toISOString();
  const rows = await getTrainingSessions(session.user.id, { from: fromDate, to: toDate });
  return rows.map((row) => ({ date: String(row.starts_at).slice(0, 10), title: row.title || row.sports?.name || 'Тренировка', duration: Number(row.duration_min ?? row.duration_minutes) || 0 }));
}

async function getWeightData(from, to) {
  const { data, error } = await supabase.from('weight_log').select('logged_on,weight_kg').eq('athlete_id', session.user.id).gte('logged_on', from).lte('logged_on', to).order('logged_on');
  if (error) throw error;
  return (data || []).map((point) => ({ date: point.logged_on, weight: Number(point.weight_kg) }));
}

function average(rows, key) {
  if (!rows.length) return 0;
  return rows.reduce((sum, row) => sum + (Number(row.totals[key]) || 0), 0) / rows.length;
}
function averageTarget(rows, key, fallback) {
  const values = rows.map((row) => Number(row.targets?.[key])).filter((value) => value > 0);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : fallback;
}
function progressRow({ label, value, target, color, unit = 'г' }) {
  const percent = target > 0 ? Math.round(value / target * 100) : 0;
  return `<div class="report-macro-row"><div class="report-macro-heading"><span><i style="--macro-color:${color}"></i>${label}</span><strong>${formatNumber(value, 0)} ${unit}</strong><small class="${percent > 100 ? 'is-over' : ''}">${percent}%</small></div><div class="report-progress"><span style="--macro-color:${color};--progress:${Math.min(percent, 100)}%"></span></div></div>`;
}

function destroyCharts() { charts.forEach((chart) => chart.destroy()); charts = []; }
function renderWeightFallback(canvas, points) {
  const box = canvas.parentElement;
  const width = 680; const height = 220; const pad = 32;
  if (!points.length) { box.innerHTML = '<div class="report-chart-empty">Нет измерений веса за выбранный период</div>'; return; }
  const values = points.map((point) => point.weight);
  const min = Math.min(...values) - 1; const max = Math.max(...values) + 1 || min + 2;
  const coords = points.map((point, i) => `${pad + (points.length === 1 ? (width - 2 * pad) / 2 : i * (width - 2 * pad) / (points.length - 1))},${height - pad - ((point.weight - min) / (max - min)) * (height - 2 * pad)}`);
  box.innerHTML = `<svg class="report-fallback-line" viewBox="0 0 ${width} ${height}" role="img" aria-label="Динамика веса по датам"><line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}"/><line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}"/><polyline points="${coords.join(' ')}"/>${coords.map((coord, i) => `<circle cx="${coord.split(',')[0]}" cy="${coord.split(',')[1]}" r="4"><title>${showDate(points[i].date)}: ${points[i].weight} кг</title></circle>`).join('')}<text x="${pad}" y="${height - 5}">${escapeHtml(showDate(points[0].date))}</text><text x="${width - pad}" y="${height - 5}" text-anchor="end">${escapeHtml(showDate(points.at(-1).date))}</text></svg>`;
}

function render(data) {
  destroyCharts();
  const nutritionWrap = $('.report-doughnut-wrap');
  const weightWrap = $('.report-line-wrap');
  nutritionWrap.innerHTML = '<canvas id="nutrition-chart" aria-label="Среднее потребление калорий относительно цели" role="img"></canvas><div class="report-doughnut-center"><strong data-calorie-total>— ккал</strong><span data-calorie-caption>Среднее за период</span></div>';
  weightWrap.innerHTML = '<canvas id="weight-chart" aria-label="График динамики веса" role="img"></canvas>';
  const nutritionRows = data.nutrition;
  const from = $('#report-from').value; const to = $('#report-to').value;
  reportRows = rangeDates(from, to).map((date) => {
    const nutrition = nutritionRows.find((row) => row.date === date);
    const training = data.training.filter((row) => row.date === date);
    const weight = data.weight.find((row) => row.date === date);
    return { date, ...(nutrition ? { ...nutrition.totals, targets: nutrition.targets } : emptyTotals()), workouts: training.length, training_minutes: training.reduce((sum, row) => sum + row.duration, 0), weight: weight?.weight ?? '' };
  });
  const daysWithNutrition = nutritionRows;
  const kcal = average(daysWithNutrition, 'calories');
  const kcalGoal = averageTarget(daysWithNutrition, 'calories', 2500);
  const protein = average(daysWithNutrition, 'protein');
  const fat = average(daysWithNutrition, 'fat');
  const carbs = average(daysWithNutrition, 'carbs');
  const goals = {
    protein: averageTarget(daysWithNutrition, 'protein', 160),
    fat: averageTarget(daysWithNutrition, 'fat', 70),
    carbs: averageTarget(daysWithNutrition, 'carbs', 320),
  };
  const caloriePercent = kcalGoal ? Math.floor(kcal / kcalGoal * 100) : 0;
  $('[data-calorie-total]').textContent = `${formatNumber(kcal, 0)} ккал`;
  $('[data-calorie-caption]').textContent = `Среднее за период, ${caloriePercent}% от цели`;
  $('[data-nutrition-days]').textContent = daysWithNutrition.length ? `${daysWithNutrition.length} ${daysWithNutrition.length === 1 ? 'день' : 'дней'} с данными` : '';
  $('[data-macro-rows]').innerHTML = [
    progressRow({ label: 'Белки', value: protein, target: goals.protein, color: COLORS.protein }),
    progressRow({ label: 'Жиры', value: fat, target: goals.fat, color: COLORS.fat }),
    progressRow({ label: 'Углеводы', value: carbs, target: goals.carbs, color: COLORS.carbs }),
  ].join('');

  const empty = !daysWithNutrition.length && !data.training.length && !data.weight.length;
  $('[data-reports-empty]').hidden = !empty;
  $('[data-reports-content]').hidden = empty;
  if (empty) return;
  const nutritionCard = $('[data-section="nutrition"]');
  const weightCard = $('[data-section="weight"]');
  const activityCard = $('[data-section="activity"]');
  nutritionCard.hidden = selectedType !== 'all' && selectedType !== 'nutrition';
  weightCard.hidden = selectedType !== 'all' && selectedType !== 'weight';
  activityCard.hidden = selectedType !== 'all' && selectedType !== 'training';
  const chartCanvas = $('#nutrition-chart');
  if (daysWithNutrition.length && window.Chart) {
    const chart = new Chart(chartCanvas, { type: 'doughnut', data: { labels: ['Фактические калории', 'До цели'], datasets: [{ data: [Math.min(kcal, kcalGoal), Math.max(0, kcalGoal - kcal)], backgroundColor: [COLORS.green, '#e8efec'], borderWidth: 0, hoverOffset: 3 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '78%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => `${formatNumber(context.raw)} ккал` } } } } });
    charts.push(chart);
  } else if (daysWithNutrition.length) {
    chartCanvas.parentElement.classList.add('report-ring-fallback');
    chartCanvas.parentElement.style.setProperty('--ring-progress', `${Math.min(caloriePercent, 100)}%`);
    chartCanvas.hidden = true;
  } else {
    chartCanvas.parentElement.innerHTML = '<div class="report-chart-empty">Нет данных о питании за период</div>';
  }
  const weightCanvas = $('#weight-chart');
  if (data.weight.length && window.Chart) {
    const chart = new Chart(weightCanvas, { type: 'line', data: { labels: data.weight.map((point) => showDate(point.date)), datasets: [{ label: 'Вес, кг', data: data.weight.map((point) => point.weight), borderColor: COLORS.green, backgroundColor: 'rgba(14,122,79,.12)', fill: true, tension: .35, pointRadius: 3, pointBackgroundColor: COLORS.green }] }, options: { responsive: true, maintainAspectRatio: false, interaction: { intersect: false, mode: 'index' }, plugins: { legend: { display: false } }, scales: { x: { title: { display: true, text: 'Дата' }, grid: { display: false } }, y: { title: { display: true, text: 'Вес, кг' }, beginAtZero: false, ticks: { callback: (value) => `${value} кг` } } } } });
    charts.push(chart);
  } else if (data.weight.length) renderWeightFallback(weightCanvas, data.weight);
  else weightCanvas.parentElement.innerHTML = '<div class="report-chart-empty">Нет измерений веса за выбранный период</div>';
  const minutes = data.training.reduce((sum, item) => sum + item.duration, 0);
  $('[data-workout-count]').textContent = formatNumber(data.training.length);
  $('[data-training-time]').textContent = `${Math.floor(minutes / 60)} ч ${String(minutes % 60).padStart(2, '0')} мин`;
  $('[data-training-days]').textContent = data.training.length ? `${new Set(data.training.map((item) => item.date)).size} активных ${new Set(data.training.map((item) => item.date)).size === 1 ? 'день' : 'дня'}` : 'Нет тренировок за период';
}

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+@\-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
function exportCsv() {
  const headings = ['Дата', 'Калории, ккал', 'Белки, г', 'Жиры, г', 'Углеводы, г', 'Тренировок', 'Время тренировок, мин', 'Вес, кг'];
  const csv = '\ufeff' + [headings, ...reportRows.map((row) => [row.date, Math.round(row.calories), Math.round(row.protein), Math.round(row.fat), Math.round(row.carbs), row.workouts, row.training_minutes, row.weight])].map((line) => line.map(csvCell).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: `athletemenu-report-${$('#report-from').value}-${$('#report-to').value}.csv` });
  link.click(); URL.revokeObjectURL(url);
  toast('Отчёт экспортирован в CSV.', 'success');
}

async function loadReports() {
  const from = $('#report-from').value; const to = $('#report-to').value;
  if (!from || !to || from > to) { toast('Проверьте даты периода.', 'error'); return; }
  $('[data-reports-loading]').hidden = false;
  $('[data-reports-content]').hidden = true;
  $('[data-reports-empty]').hidden = true;
  $('[data-reports-error]').hidden = true;
  try {
    const [nutrition, training] = await Promise.all([queryNutrition(from, to), queryTraining(from, to)]);
    const weight = await getWeightData(from, to);
    $('[data-reports-loading]').hidden = true;
    render({ nutrition, training, weight });
  } catch (error) {
    console.error('Не удалось загрузить отчёты', error);
    $('[data-reports-loading]').hidden = true;
    $('[data-reports-error]').hidden = false;
    $('[data-reports-error] p').textContent = translateSupabaseError(error);
  }
}

async function init() {
  session = await protectPage();
  if (!session) return;
  $('#main-content').innerHTML = `
    <div class="reports-heading-row"><div><h1 class="page-heading">Отчёты</h1><p class="page-caption">Следите за питанием, активностью и изменением веса.</p></div><button class="button button-secondary report-export" type="button" data-export-csv><span aria-hidden="true">⇩</span> Экспорт в CSV</button></div>
    <form class="report-filters card" id="report-filter-form"><label>Период с<input type="date" id="report-from" required></label><span class="report-date-separator" aria-hidden="true">—</span><label>по<input type="date" id="report-to" required></label><label class="report-type-filter">Показать<select id="report-type"><option value="all">Все отчёты</option><option value="nutrition">Питание</option><option value="training">Тренировки</option><option value="weight">Вес</option></select></label><button class="button button-primary" type="submit">Показать</button></form>
    <div class="report-loading" data-reports-loading aria-live="polite"><div class="report-skeleton card"></div><div class="report-skeleton card"></div></div>
    <div class="report-error card" data-reports-error hidden><span class="report-error-icon" aria-hidden="true">!</span><div><strong>Не удалось загрузить отчёты</strong><p>Проверьте подключение и попробуйте ещё раз.</p><button class="button button-secondary" type="button" data-retry-reports>Повторить</button></div></div>
    <section class="report-empty card" data-reports-empty hidden><span class="report-empty-icon" aria-hidden="true">▤</span><h2>За этот период пока нет данных</h2><p>Выберите другой период или добавьте меню, тренировку и замеры веса.</p></section>
    <div class="reports-content" data-reports-content hidden>
      <section class="card report-nutrition-card" data-section="nutrition"><div class="report-section-title"><div><h2>Питание</h2><p>Средние значения за дни с данными</p></div><span class="report-days-label" data-nutrition-days></span></div><div class="report-nutrition-layout"><div class="report-doughnut-wrap"><canvas id="nutrition-chart" aria-label="Среднее потребление калорий относительно цели" role="img"></canvas><div class="report-doughnut-center"><strong data-calorie-total>— ккал</strong><span data-calorie-caption>Среднее за период</span></div></div><div class="report-macros" data-macro-rows></div></div></section>
      <div class="report-lower-grid"><section class="card report-weight-card" data-section="weight"><div class="report-section-title"><div><h2>Динамика веса</h2><p>Изменение веса по датам</p></div><span class="report-small-icon" aria-hidden="true">↗</span></div><div class="report-line-wrap"><canvas id="weight-chart" aria-label="График динамики веса" role="img"></canvas></div></section><section class="card report-activity-card" data-section="activity"><div class="report-section-title"><div><h2>Активность</h2><p>Тренировки за период</p></div><span class="report-activity-icon" aria-hidden="true">✦</span></div><div class="activity-stat"><span class="activity-icon" aria-hidden="true">♧</span><div><strong>Тренировок</strong><span data-workout-count>0</span></div></div><div class="activity-stat"><span class="activity-icon" aria-hidden="true">◷</span><div><strong>Общее время</strong><span data-training-time>0 ч 00 мин</span></div></div><p class="activity-footnote" data-training-days></p></section></div>
    </div>`;
  const week = startOfWeek(new Date());
  const end = new Date(week.getTime() + 6 * DAY_MS);
  $('#report-from').value = localISO(week);
  $('#report-to').value = localISO(end);
  $('#report-filter-form').addEventListener('submit', (event) => { event.preventDefault(); loadReports(); });
  $('#report-type').addEventListener('change', (event) => { selectedType = event.target.value; loadReports(); });
  $('[data-export-csv]').addEventListener('click', exportCsv);
  $('[data-retry-reports]').addEventListener('click', loadReports);
  await loadReports();
}

init();
