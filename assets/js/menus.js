import { protectPage, formatNumber, toast } from './common.js?v=20261106b';
import { supabase } from './supabase-client.js';
import { calculateNutritionTotals, calculateNutritionPlan } from './nutrition.js';
import { calculatePortion, loadProducts } from './products.js?v=20261021d';
import { productPhoto, resolvePhoto } from './image-library.js?v=20261101c';
import { getMenuDay as getMenuDayApi, saveMenu as saveMenuApi, translateSupabaseError } from './mock-data.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MEAL_IMAGES = ['food-oatmeal.jpg', 'food-curd.jpg', 'food-chicken-quinoa.jpg', 'food-protein-shake.jpg', 'food-salmon-veg.jpg'];
let page;
let session;
let menuOwnerId;
let viewedAthleteName;
let selectedDate;
let weekDates = [];
let summaryChart;
let loadVersion = 0;
let editorProducts = [];
let editorMeals = [];
let editorTargets = { target_kcal: 2500, target_protein_g: 160, target_fat_g: 70, target_carbs_g: 320 };
let selectedMealId = null;
let editorDirty = false;
let editorDayIndex = (new Date().getDay() + 6) % 7;
let editorMenuType = 'daily';
let searchTimer;
const MEAL_COLORS = ['#F5A524', '#D98B3B', '#1FA463', '#2F80ED', '#7856A8', '#0E7A4F'];
const EDITOR_WEEKDAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getWeekDates(date = new Date()) {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => new Date(monday.getTime() + index * DAY_MS));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function renderPage() {
  page = document.querySelector('#main-content');
  weekDates = getWeekDates();
  selectedDate = localDateString(new Date());
  page.innerHTML = `
    <div class="menu-page-heading">
      <div><p class="menu-kicker">ПЛАН ПИТАНИЯ</p><h1 class="page-heading">Меню питания</h1><p class="page-caption">Ваш рацион на каждый день недели</p></div>
      <a class="button menu-create-button" href="menu-editor.html?rev=20261021a"><span aria-hidden="true">＋</span> Создать меню</a>
    </div>
    <section class="menu-week" aria-label="Выберите день" role="tablist" data-week-tabs></section>
    <div class="menu-content-grid">
      <section class="card meals-card" aria-labelledby="meals-title" aria-busy="true">
        <header class="menu-section-heading"><div><p class="menu-kicker">ВАШ РАЦИОН</p><h2 id="meals-title" data-selected-title>Меню на день</h2></div><span class="meal-count" data-meal-count>Загрузка…</span></header>
        <div class="menu-loading" data-meals-loading aria-label="Загрузка меню"><div class="meal-skeleton"><span class="skeleton meal-skeleton-icon"></span><span class="skeleton meal-skeleton-copy"></span></div><div class="meal-skeleton"><span class="skeleton meal-skeleton-icon"></span><span class="skeleton meal-skeleton-copy"></span></div><div class="meal-skeleton"><span class="skeleton meal-skeleton-icon"></span><span class="skeleton meal-skeleton-copy"></span></div></div>
        <div class="meal-list" data-meal-list hidden></div>
        <div class="empty-state menu-empty" data-menu-empty hidden><span class="menu-empty-icon" aria-hidden="true">◷</span><h3>На этот день меню не составлено</h3><p>Добавьте приёмы пищи, чтобы следить за рационом.</p><a class="button" href="menu-editor.html?rev=20261021a">Создать</a></div>
        <div class="error-state menu-error" data-menu-error role="alert" hidden></div>
      </section>
      <aside class="card daily-summary-card" aria-labelledby="daily-summary-title" aria-busy="true">
        <div class="menu-section-heading"><div><p class="menu-kicker">ПИЩЕВАЯ ЦЕННОСТЬ</p><h2 id="daily-summary-title">Итого за день</h2></div><span class="summary-date" data-summary-date></span></div>
        <div class="calorie-chart-wrap"><canvas id="calorie-chart" role="img" aria-label="Калории за день относительно цели"></canvas><div class="calorie-chart-center"><strong data-calories-total><span class="skeleton summary-skeleton"></span></strong><span>ккал</span><small data-calorie-progress>Загрузка…</small></div></div>
        <div class="summary-macros" data-summary-macros><div class="summary-skeleton-row"><span class="skeleton"></span><span class="skeleton"></span></div><div class="summary-skeleton-row"><span class="skeleton"></span><span class="skeleton"></span></div><div class="summary-skeleton-row"><span class="skeleton"></span><span class="skeleton"></span></div></div>
        <p class="summary-note" data-summary-note>Значения основаны на пищевой ценности продуктов и размере порций.</p>
      </aside>
    </div>`;

  renderWeekTabs();
  page.querySelector('[data-week-tabs]').addEventListener('click', (event) => {
    const button = event.target.closest('[data-date]');
    if (!button || button.dataset.date === selectedDate) return;
    selectedDate = button.dataset.date;
    page.querySelectorAll('[data-date]').forEach((tab) => {
      const active = tab.dataset.date === selectedDate;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    loadDay();
  });
}

function renderWeekTabs() {
  const weekday = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  page.querySelector('[data-week-tabs]').innerHTML = weekDates.map((date, index) => {
    const dateKey = localDateString(date);
    const active = dateKey === selectedDate;
    return `<button class="day-tab${active ? ' is-active' : ''}" type="button" role="tab" aria-selected="${active}" aria-label="${weekday[index]}, ${date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}" data-date="${dateKey}"><span>${weekday[index]}</span><strong>${String(date.getDate()).padStart(2, '0')}</strong><small>${date.toLocaleDateString('ru-RU', { month: 'short' }).replace('.', '')}</small></button>`;
  }).join('');
}

function setLoading(loading) {
  page.querySelector('.meals-card').setAttribute('aria-busy', String(loading));
  page.querySelector('.daily-summary-card').setAttribute('aria-busy', String(loading));
  page.querySelector('[data-meals-loading]').hidden = !loading;
  page.querySelector('[data-meal-list]').hidden = loading;
  page.querySelector('[data-menu-empty]').hidden = true;
  page.querySelector('[data-menu-error]').hidden = true;
  page.querySelector('[data-meal-count]').textContent = loading ? 'Загрузка…' : '';
}

async function loadSupabaseDay(date) {
  const day = await getMenuDayApi(menuOwnerId || session.user.id, date);
  if (!day) return null;
  const meals = day.meals || [];
  return {
    targets: day,
    meals: meals.map((meal, index) => {
      const items = meal.menu_items || [];
      const totals = calculateNutritionTotals(items);
      const names = items.map((item) => item.product_name || item.product_name_snapshot).filter(Boolean);
      return {
        name: meal.name || ['Завтрак', 'Перекус', 'Обед', 'Полдник', 'Ужин'][index] || 'Приём пищи',
        time: String(meal.meal_time || meal.planned_time || '').slice(0, 5),
        dish: names.join(', ') || 'Продукты не добавлены',
        image: names.length ? productPhoto(names[0]) : MEAL_IMAGES[index % MEAL_IMAGES.length],
        ...totals,
      };
    }),
  };
}

function aggregateMeals(meals) {
  return meals.reduce((totals, meal) => {
    totals.calories += Number(meal.calories) || 0;
    totals.protein += Number(meal.protein) || 0;
    totals.fat += Number(meal.fat) || 0;
    totals.carbs += Number(meal.carbs) || 0;
    return totals;
  }, { calories: 0, protein: 0, fat: 0, carbs: 0 });
}

function renderMeals(meals) {
  const list = page.querySelector('[data-meal-list]');
  if (!meals.length) {
    list.hidden = true;
    page.querySelector('[data-menu-empty]').hidden = false;
    page.querySelector('[data-meal-count]').textContent = '0 приёмов';
    return;
  }
  page.querySelector('[data-menu-empty]').hidden = true;
  list.hidden = false;
  page.querySelector('[data-meal-count]').textContent = `${meals.length} ${meals.length === 1 ? 'приём' : meals.length < 5 ? 'приёма' : 'приёмов'}`;
  list.innerHTML = meals.map((meal) => `
    <article class="meal-row">
      <div class="meal-time"><strong>${escapeHtml(meal.name)}</strong><span>${escapeHtml(meal.time || '—')}</span></div>
      <span class="meal-image-wrap"><img class="meal-image" src="${resolvePhoto(meal.image)}" alt="Блюдо: ${escapeHtml(meal.dish)}" data-image-fallback="food" data-image-icon="bowl" loading="lazy"><span class="meal-image-fallback" data-image-fallback-content hidden aria-hidden="true"></span></span>
      <div class="meal-details"><h3>${escapeHtml(meal.dish)}</h3><p>${formatNumber(meal.calories, 0)} ккал <span>·</span> Б ${formatNumber(meal.protein, 0)} г <span>·</span> Ж ${formatNumber(meal.fat, 0)} г <span>·</span> У ${formatNumber(meal.carbs, 0)} г</p></div>
      <span class="meal-chevron" aria-hidden="true">›</span>
    </article>`).join('');
}

function renderChart(actual, target) {
  const hasTarget = Number(target) > 0;
  const actualValue = Math.max(0, Number(actual) || 0);
  const targetValue = hasTarget ? Number(target) : actualValue || 1;
  const remaining = Math.max(0, targetValue - actualValue);
  const progress = hasTarget ? Math.round((actualValue / targetValue) * 100) : null;
  const wrap = page.querySelector('.calorie-chart-wrap');
  wrap.dataset.fallback = String(!window.Chart);
  wrap.style.setProperty('--calorie-fill', `${Math.min(progress ?? 0, 100)}%`);
  wrap.style.setProperty('--calorie-color', actualValue > targetValue ? '#F5A524' : '#0E7A4F');
  page.querySelector('[data-calories-total]').textContent = formatNumber(actualValue);
  page.querySelector('[data-calorie-progress]').textContent = progress == null ? 'цель не задана' : `${progress}% от цели`;
  const canvas = page.querySelector('#calorie-chart');
  summaryChart?.destroy();
  if (!window.Chart) return;
  summaryChart = new Chart(canvas, {
    type: 'doughnut',
    data: { datasets: [{ data: [Math.min(actualValue, targetValue), remaining], backgroundColor: [actualValue > targetValue ? '#F5A524' : '#0E7A4F', '#e7efeb'], borderWidth: 0, hoverOffset: 0, borderRadius: 8 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '78%', animation: { duration: 450 }, plugins: { legend: { display: false }, tooltip: { enabled: false } } },
  });
}

function renderSummary(meals, targets) {
  const totals = aggregateMeals(meals);
  renderChart(totals.calories, targets?.target_kcal);
  const rows = [
    { label: 'Белки', key: 'protein', target: targets?.target_protein_g, color: '#1FA463' },
    { label: 'Жиры', key: 'fat', target: targets?.target_fat_g, color: '#F5A524' },
    { label: 'Углеводы', key: 'carbs', target: targets?.target_carbs_g, color: '#2F80ED' },
  ];
  page.querySelector('[data-summary-macros]').innerHTML = rows.map((row) => {
    const value = totals[row.key];
    const percent = Number(row.target) > 0 ? Math.round(value / Number(row.target) * 100) : null;
    return `<div class="summary-macro-row"><span class="summary-macro-label"><i style="--macro-color:${row.color}"></i>${row.label}</span><strong>${formatNumber(value)} г</strong><span class="summary-macro-percent${percent > 100 ? ' is-over' : ''}">${percent == null ? '—' : `${percent}%`}</span></div>`;
  }).join('');
  page.querySelector('[data-summary-note]').textContent = meals.length
    ? 'Пищевая ценность рассчитана по снимкам продуктов в меню и указанному весу порций.'
    : 'Добавьте меню, чтобы увидеть итоговую пищевую ценность за день.';
}

function editorWeekDate(dayIndex) {
  const currentWeek = getWeekDates();
  return currentWeek[dayIndex];
}

function editorMealTotals(meal) {
  return meal.items.reduce((sum, item) => {
    const portion = calculatePortion(item.product, item.quantity_g);
    sum.calories += portion.calories;
    sum.protein += portion.protein;
    sum.fat += portion.fat;
    sum.carbs += portion.carbs;
    return sum;
  }, { calories: 0, protein: 0, fat: 0, carbs: 0 });
}

function editorDayTotals() {
  return editorMeals.reduce((sum, meal) => {
    const totals = editorMealTotals(meal);
    sum.calories += totals.calories;
    sum.protein += totals.protein;
    sum.fat += totals.fat;
    sum.carbs += totals.carbs;
    return sum;
  }, { calories: 0, protein: 0, fat: 0, carbs: 0 });
}

function renderEditor() {
  page = document.querySelector('#main-content');
  selectedMealId = editorMeals[0]?.id || null;
  page.innerHTML = `
    <div class="editor-page-heading">
      <div><p class="menu-kicker">ПЛАНИРОВАНИЕ РАЦИОНА</p><h1 class="page-heading">Конструктор меню</h1><p class="page-caption">Соберите сбалансированный рацион на выбранный день</p></div>
      <button class="button editor-save-button" type="button" data-save-menu><span aria-hidden="true">✓</span> Сохранить меню</button>
    </div>
    <section class="card editor-toolbar" aria-label="Параметры меню">
      <label class="editor-select-field"><span>День</span><select data-editor-day>${EDITOR_WEEKDAYS.map((day, index) => {
        const past = getEditorDate(index) < localDateString(new Date());
        return `<option value="${index}"${index === editorDayIndex ? ' selected' : ''}${past ? ' disabled' : ''}>${day}</option>`;
      }).join('')}</select></label>
      <label class="editor-select-field"><span>Тип меню</span><select data-editor-type><option value="daily">Дневное</option><option value="weekly">Недельное</option></select></label>
      <p class="editor-week-hint" data-week-hint hidden>Меню будет записано на сегодня и будущие дни недели. Прошедшие дни не включаются.</p>
    </section>
    <div class="editor-layout">
      <section class="card products-panel" aria-labelledby="products-title" aria-busy="true">
        <div class="editor-panel-heading"><div><p class="menu-kicker">СПРАВОЧНИК</p><h2 id="products-title">Продукты</h2></div><span class="product-total" data-product-total>Загрузка…</span></div>
        <label class="product-search"><span aria-hidden="true">⌕</span><input type="search" placeholder="Поиск продукта…" aria-label="Поиск продукта" data-product-search autocomplete="off"><button class="search-clear" type="button" aria-label="Очистить поиск" data-clear-search hidden>×</button></label>
        <div class="product-list" data-product-list><div class="product-loading"><span class="skeleton product-skeleton-image"></span><span class="skeleton product-skeleton-copy"></span></div><div class="product-loading"><span class="skeleton product-skeleton-image"></span><span class="skeleton product-skeleton-copy"></span></div><div class="product-loading"><span class="skeleton product-skeleton-image"></span><span class="skeleton product-skeleton-copy"></span></div></div>
        <div class="empty-state products-empty" data-products-empty hidden>Продукты не найдены. Попробуйте изменить запрос.</div>
        <div class="error-state products-error" data-products-error role="alert" hidden></div>
        <p class="editor-tip"><span aria-hidden="true">ⓘ</span> Нажмите на продукт или перетащите его в выбранный приём пищи.</p>
      </section>
      <section class="editor-right-column">
        <section class="card meals-editor-panel" aria-labelledby="meal-editor-title">
          <div class="editor-panel-heading meals-editor-heading"><div><p class="menu-kicker">СОСТАВ РАЦИОНА</p><h2 id="meal-editor-title">Приёмы пищи</h2></div><button class="button button-secondary add-meal-button" type="button" data-add-meal><span aria-hidden="true">＋</span> Добавить приём</button></div>
          <div class="editor-meals" data-editor-meals></div>
          <div class="editor-empty-meals" data-editor-empty hidden><div><strong>Приёмы пищи ещё не добавлены</strong><span>Добавьте продукты в новый приём пищи.</span></div><button type="button" class="button button-secondary" data-add-meal>＋ Добавить приём</button></div>
        </section>
        <section class="card editor-totals-panel" aria-labelledby="editor-totals-title">
          <div class="editor-panel-heading"><div><p class="menu-kicker">ДНЕВНАЯ НОРМА</p><h2 id="editor-totals-title">Итого за день</h2></div><span class="editor-total-calories" data-total-calories>0 ккал</span></div>
          <div class="editor-goal-bars" data-goal-bars></div>
          <p class="editor-target-note">Цели можно настроить в профиле. Здесь показано сравнение с дневной нормой.</p>
        </section>
      </section>
    </div>`;
  page.querySelector('[data-editor-day]').addEventListener('change', (event) => {
    editorDayIndex = Number(event.target.value);
    setDirty(true);
  });
  page.querySelector('[data-editor-type]').addEventListener('change', (event) => {
    editorMenuType = event.target.value;
    page.querySelector('[data-week-hint]').hidden = editorMenuType !== 'weekly';
    setDirty(true);
  });
  page.querySelector('[data-product-search]').addEventListener('input', (event) => {
    page.querySelector('[data-clear-search]').hidden = !event.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => renderProductCards(event.target.value), 250);
  });
  page.querySelector('[data-clear-search]').addEventListener('click', () => {
    const input = page.querySelector('[data-product-search]');
    input.value = '';
    input.focus();
    page.querySelector('[data-clear-search]').hidden = true;
    renderProductCards('');
  });
  page.querySelectorAll('[data-add-meal]').forEach((button) => button.addEventListener('click', addEditorMeal));
  page.querySelector('[data-editor-meals]').addEventListener('click', handleMealClick);
  page.querySelector('[data-editor-meals]').addEventListener('input', handleMealInput);
  page.querySelector('[data-editor-meals]').addEventListener('change', handleMealInput);
  page.querySelector('[data-editor-meals]').addEventListener('dragover', (event) => {
    const meal = event.target.closest('[data-meal-card]');
    if (meal) { event.preventDefault(); meal.classList.add('is-drop-target'); }
  });
  page.querySelector('[data-editor-meals]').addEventListener('dragleave', (event) => event.target.closest('[data-meal-card]')?.classList.remove('is-drop-target'));
  page.querySelector('[data-editor-meals]').addEventListener('drop', (event) => {
    const mealCard = event.target.closest('[data-meal-card]');
    const productId = event.dataTransfer?.getData('text/plain');
    if (!mealCard || !productId) return;
    event.preventDefault();
    mealCard.classList.remove('is-drop-target');
    selectedMealId = mealCard.dataset.mealCard;
    addProduct(productId);
  });
  page.querySelector('[data-save-menu]').addEventListener('click', saveEditorMenu);
  renderProductCards('');
  renderEditorMeals();
  updateEditorTotals();
}

function setDirty(dirty) {
  editorDirty = dirty;
  const button = page?.querySelector('[data-save-menu]');
  if (button) button.dataset.dirty = String(dirty);
}

function renderProductCards(query = '') {
  if (!page) return;
  const normalizedQuery = query.trim().toLocaleLowerCase('ru-RU');
  const filtered = editorProducts.filter((product) => product.name.toLocaleLowerCase('ru-RU').includes(normalizedQuery));
  page.querySelector('[data-product-total]').textContent = `${filtered.length} ${filtered.length === 1 ? 'продукт' : filtered.length < 5 ? 'продукта' : 'продуктов'}`;
  page.querySelector('[data-products-empty]').hidden = filtered.length > 0;
  page.querySelector('[data-product-list]').innerHTML = filtered.map((product) => `
    <button class="product-card" type="button" draggable="true" data-product-id="${escapeHtml(product.id)}" aria-label="Добавить продукт ${escapeHtml(product.name)}">
      <span class="product-image-wrap"><img class="product-image" src="${escapeHtml(productPhoto(product.name, product.image, product.product_groups?.name || product.group_name))}" alt="Продукт: ${escapeHtml(product.name)}" data-image-fallback="food" data-image-icon="${/банан|banana/i.test(product.name) ? 'apple' : /яйц|egg/i.test(product.name) ? 'egg' : 'bowl'}" loading="lazy"><span class="product-image-fallback" data-image-fallback-content hidden aria-hidden="true"></span></span>
      <span class="product-info"><strong>${escapeHtml(product.name)}</strong><small>${formatNumber(product.calories_kcal_per_100g, 0)} ккал · Б ${formatNumber(product.protein_g_per_100g, 1)} г · Ж ${formatNumber(product.fat_g_per_100g, 1)} г · У ${formatNumber(product.carbs_g_per_100g, 1)} г</small></span>
      <span class="product-add-mark" aria-hidden="true">＋</span>
    </button>`).join('');
  page.querySelectorAll('[data-product-id]').forEach((card) => {
    card.addEventListener('click', () => addProduct(card.dataset.productId));
    card.addEventListener('dragstart', (event) => {
      event.dataTransfer?.setData('text/plain', card.dataset.productId);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
    });
  });
}

function productEmoji(name) {
  const text = String(name).toLocaleLowerCase('ru-RU');
  if (text.includes('яйц')) return '🥚';
  if (text.includes('кур')) return '🍗';
  if (text.includes('греч')) return '🌾';
  if (text.includes('овся')) return '🥣';
  if (text.includes('банан')) return '🍌';
  return '🥗';
}

function addProduct(productId) {
  const product = editorProducts.find((entry) => String(entry.id) === String(productId));
  if (!product) return;
  if (!selectedMealId || !editorMeals.some((meal) => meal.id === selectedMealId)) {
    addEditorMeal();
  }
  const meal = editorMeals.find((entry) => entry.id === selectedMealId);
  meal.items.push({ product, quantity_g: 100, key: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` });
  setDirty(true);
  renderEditorMeals();
  updateEditorTotals();
}

function addEditorMeal() {
  const mealNumber = editorMeals.length + 1;
  const meal = { id: `meal-${Date.now()}`, name: `Приём пищи ${mealNumber}`, time: '', items: [] };
  editorMeals.push(meal);
  selectedMealId = meal.id;
  setDirty(true);
  renderEditorMeals();
  updateEditorTotals();
  page.querySelector(`[data-meal-card="${meal.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderEditorMeals() {
  const container = page.querySelector('[data-editor-meals]');
  page.querySelector('[data-editor-empty]').hidden = editorMeals.length > 0;
  container.innerHTML = editorMeals.map((meal, mealIndex) => {
    const totals = editorMealTotals(meal);
    return `<article class="meal-editor-card${selectedMealId === meal.id ? ' is-selected' : ''}" style="--meal-color:${MEAL_COLORS[mealIndex % MEAL_COLORS.length]}" data-meal-card="${escapeHtml(meal.id)}" tabindex="0" aria-label="${escapeHtml(meal.name)}; нажмите, чтобы выбрать">
      <header class="meal-editor-card-head"><span class="meal-color-dot"></span><div class="meal-editor-title"><strong>${escapeHtml(meal.name)}</strong><time>${escapeHtml(meal.time || 'Время не задано')}</time></div><div class="meal-card-actions"><button class="editor-icon-button" type="button" data-edit-meal="${escapeHtml(meal.id)}" aria-label="Переименовать ${escapeHtml(meal.name)}" title="Переименовать">✎</button><button class="editor-icon-button is-danger" type="button" data-remove-meal="${escapeHtml(meal.id)}" aria-label="Удалить ${escapeHtml(meal.name)}" title="Удалить">⌫</button></div></header>
      <div class="meal-editor-items">${meal.items.length ? meal.items.map((item) => `<div class="meal-editor-item" data-item-key="${escapeHtml(item.key)}"><span class="meal-item-name">${escapeHtml(item.product.name)}</span><label class="quantity-control"><span class="visually-hidden">Масса ${escapeHtml(item.product.name)}, граммы</span><input type="number" min="1" max="2000" step="1" value="${escapeHtml(item.quantity_g)}" data-quantity data-meal-id="${escapeHtml(meal.id)}" data-item-key="${escapeHtml(item.key)}" aria-label="Масса ${escapeHtml(item.product.name)} в граммах"><span>г</span></label><strong class="meal-item-calories">${formatNumber(calculatePortion(item.product, item.quantity_g).calories)} ккал</strong><button class="remove-item-button" type="button" data-remove-item="${escapeHtml(item.key)}" data-meal-id="${escapeHtml(meal.id)}" aria-label="Убрать ${escapeHtml(item.product.name)}">×</button></div>`).join('') : '<p class="meal-no-items">Перетащите сюда продукты или выберите приём и нажмите на продукт слева.</p>'}</div>
      <footer class="meal-editor-footer"><span>Итого за приём</span><strong>${formatNumber(totals.calories)} ккал · Б ${formatNumber(totals.protein, 1)} г · Ж ${formatNumber(totals.fat, 1)} г · У ${formatNumber(totals.carbs, 1)} г</strong></footer>
    </article>`;
  }).join('');
  container.querySelectorAll('[data-meal-card]').forEach((card) => card.addEventListener('click', (event) => {
    if (event.target.closest('button, input, label')) return;
    selectedMealId = card.dataset.mealCard;
    container.querySelectorAll('[data-meal-card]').forEach((entry) => entry.classList.toggle('is-selected', entry.dataset.mealCard === selectedMealId));
  }));
}

function handleMealClick(event) {
  const removeItem = event.target.closest('[data-remove-item]');
  if (removeItem) {
    const meal = editorMeals.find((entry) => entry.id === removeItem.dataset.mealId);
    if (meal) meal.items = meal.items.filter((item) => item.key !== removeItem.dataset.removeItem);
    setDirty(true);
    renderEditorMeals();
    updateEditorTotals();
    return;
  }
  const removeMeal = event.target.closest('[data-remove-meal]');
  if (removeMeal) {
    editorMeals = editorMeals.filter((meal) => meal.id !== removeMeal.dataset.removeMeal);
    selectedMealId = editorMeals[0]?.id || null;
    setDirty(true);
    renderEditorMeals();
    updateEditorTotals();
    return;
  }
  const editMeal = event.target.closest('[data-edit-meal]');
  if (editMeal) {
    const meal = editorMeals.find((entry) => entry.id === editMeal.dataset.editMeal);
    const name = window.prompt('Название приёма пищи', meal?.name || 'Приём пищи');
    if (meal && name?.trim()) { meal.name = name.trim(); setDirty(true); renderEditorMeals(); }
    return;
  }
  const card = event.target.closest('[data-meal-card]');
  if (card) {
    selectedMealId = card.dataset.mealCard;
    page.querySelectorAll('[data-meal-card]').forEach((entry) => entry.classList.toggle('is-selected', entry.dataset.mealCard === selectedMealId));
  }
}

function handleMealInput(event) {
  const input = event.target.closest('[data-quantity]');
  if (!input) return;
  const meal = editorMeals.find((entry) => entry.id === input.dataset.mealId);
  const item = meal?.items.find((entry) => entry.key === input.dataset.itemKey);
  if (!item) return;
  item.quantity_g = input.value === '' ? 0 : Number(input.value);
  const valid = Number.isFinite(item.quantity_g) && item.quantity_g > 0 && item.quantity_g <= 2000;
  input.setAttribute('aria-invalid', String(!valid));
  input.closest('.meal-editor-item').classList.toggle('has-error', !valid);
  const portion = calculatePortion(item.product, item.quantity_g || 0);
  input.closest('.meal-editor-item').querySelector('.meal-item-calories').textContent = `${formatNumber(portion.calories)} ккал`;
  const card = input.closest('[data-meal-card]');
  const totals = editorMealTotals(meal);
  card.querySelector('.meal-editor-footer strong').textContent = `${formatNumber(totals.calories)} ккал · Б ${formatNumber(totals.protein, 1)} г · Ж ${formatNumber(totals.fat, 1)} г · У ${formatNumber(totals.carbs, 1)} г`;
  setDirty(true);
  updateEditorTotals();
}

function updateEditorTotals() {
  const totals = editorDayTotals();
  page.querySelector('[data-total-calories]').textContent = `${formatNumber(totals.calories)} ккал`;
  const goals = [
    { label: 'Калории', key: 'calories', target: editorTargets.target_kcal, color: '#0E7A4F', unit: 'ккал' },
    { label: 'Белки', key: 'protein', target: editorTargets.target_protein_g, color: '#1FA463', unit: 'г' },
    { label: 'Жиры', key: 'fat', target: editorTargets.target_fat_g, color: '#F5A524', unit: 'г' },
    { label: 'Углеводы', key: 'carbs', target: editorTargets.target_carbs_g, color: '#2F80ED', unit: 'г' },
  ];
  page.querySelector('[data-goal-bars]').innerHTML = goals.map((goal) => {
    const value = totals[goal.key];
    const percent = goal.target > 0 ? Math.round(value / goal.target * 100) : 0;
    return `<div class="editor-goal-row"><div class="editor-goal-label"><span>${goal.label}</span><strong>${formatNumber(value, goal.key === 'calories' ? 0 : 1)} / ${formatNumber(goal.target)} ${goal.unit}</strong><small class="${percent > 100 ? 'is-over' : ''}">${percent}%</small></div><div class="editor-goal-track"><span style="--goal-color:${goal.color};--goal-width:${Math.min(percent, 100)}%"></span></div></div>`;
  }).join('');
}

function getEditorDate(dayIndex) {
  return localDateString(editorWeekDate(dayIndex));
}

function validateEditor() {
  if (editorMenuType === 'daily' && getEditorDate(editorDayIndex) < localDateString(new Date())) {
    return 'Нельзя запланировать меню на прошедшую дату. Выберите сегодня или будущий день.';
  }
  const invalid = page.querySelector('[data-quantity][aria-invalid="true"]');
  const anyInvalid = editorMeals.some((meal) => meal.items.some((item) => !Number.isFinite(Number(item.quantity_g)) || Number(item.quantity_g) <= 0 || Number(item.quantity_g) > 2000));
  if (anyInvalid) {
    invalid?.focus();
    return 'Масса порции должна быть больше 0 и не превышать 2 000 г.';
  }
  if (!editorMeals.length) return 'Добавьте хотя бы один приём пищи.';
  if (!editorMeals.some((meal) => meal.items.length)) return 'Добавьте хотя бы один продукт в приём пищи.';
  return null;
}

async function loadEditorTargets() {
  const { data, error } = await supabase.from('athlete_profiles').select('birth_date, sex, height_cm, weight_kg, activity_level, goal').eq('user_id', session.user.id).maybeSingle();
  if (error) throw error;
  const plan = calculateNutritionPlan(data || {});
  if (plan.calories) editorTargets = {
    target_kcal: plan.calories,
    target_protein_g: plan.protein,
    target_fat_g: plan.fat,
    target_carbs_g: plan.carbs,
  };
}

async function saveEditorMenu() {
  const validationMessage = validateEditor();
  if (validationMessage) { toast(validationMessage, 'error'); return; }
  const button = page.querySelector('[data-save-menu]');
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  try {
    const today = localDateString(new Date());
    const dates = editorMenuType === 'weekly'
      ? EDITOR_WEEKDAYS.map((_, index) => getEditorDate(index)).filter((date) => date >= today)
      : [getEditorDate(editorDayIndex)];
    if (!dates.length) throw new Error('В этой неделе не осталось дней для планирования.');
    const startDate = dates[0];
    const endDate = dates.at(-1);
    await saveMenuApi({
      ownerId: menuOwnerId || session.user.id,
      authorId: session.user.id,
      title: `Меню ${editorMenuType === 'weekly' ? 'на неделю' : 'на день'}`,
      type: editorMenuType === 'weekly' ? 'week' : 'day', startDate, endDate,
      targets: editorTargets,
      days: dates.map((date) => ({ date, targets: editorTargets, meals: editorMeals })),
    });
    setDirty(false);
    toast('Меню сохранено', 'success');
  } catch (error) {
    console.error('Не удалось сохранить меню:', error);
    toast(translateSupabaseError(error), 'error');
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
}

async function initEditor() {
  page = document.querySelector('#main-content');
  page.innerHTML = '<section class="card editor-loading"><span class="skeleton editor-loading-heading"></span><span class="skeleton editor-loading-panel"></span></section>';
  try {
    editorProducts = await loadProducts();
    await loadEditorTargets();
    editorMeals = [
      { id: 'meal-breakfast', name: 'Завтрак', time: '07:30', items: [] },
      { id: 'meal-lunch', name: 'Обед', time: '13:00', items: [] },
      { id: 'meal-dinner', name: 'Ужин', time: '19:00', items: [] },
    ];
    renderEditor();
    page.querySelector('.products-panel').setAttribute('aria-busy', 'false');
    window.addEventListener('beforeunload', (event) => {
      if (!editorDirty) return;
      event.preventDefault();
      event.returnValue = '';
    });
  } catch (error) {
    console.error('Не удалось загрузить конструктор меню:', error);
    page.innerHTML = '<section class="card error-state editor-load-error">Не удалось загрузить справочник продуктов. <button type="button" data-retry-editor>Повторить</button></section>';
    page.querySelector('[data-retry-editor]').addEventListener('click', initEditor, { once: true });
  }
}

function formatDateHeading(date) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
}

async function loadDay() {
  const version = ++loadVersion;
  setLoading(true);
  page.querySelector('[data-selected-title]').textContent = `Меню на ${formatDateHeading(selectedDate)}`;
  page.querySelector('[data-summary-date]').textContent = new Date(`${selectedDate}T00:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '');
  try {
    const day = await loadSupabaseDay(selectedDate);
    if (version !== loadVersion) return;
    const meals = day?.meals || [];
    renderMeals(meals);
    renderSummary(meals, day?.targets);
    page.querySelector('.meals-card').setAttribute('aria-busy', 'false');
    page.querySelector('.daily-summary-card').setAttribute('aria-busy', 'false');
    page.querySelector('[data-meals-loading]').hidden = true;
  } catch (error) {
    if (version !== loadVersion) return;
    console.error('Не удалось загрузить меню на день:', error);
    page.querySelector('[data-meals-loading]').hidden = true;
    page.querySelector('[data-meal-list]').hidden = true;
    const errorBox = page.querySelector('[data-menu-error]');
    errorBox.innerHTML = 'Не удалось загрузить меню. <button type="button" data-retry-menu>Повторить</button>';
    errorBox.hidden = false;
    page.querySelector('[data-menu-error] [data-retry-menu]').addEventListener('click', loadDay, { once: true });
    renderSummary([], null);
    page.querySelector('[data-meal-count]').textContent = 'Ошибка загрузки';
    page.querySelector('.meals-card').setAttribute('aria-busy', 'false');
    page.querySelector('.daily-summary-card').setAttribute('aria-busy', 'false');
  }
}

try {
  session = await protectPage();
  if (session) {
    const currentFile = location.pathname.split('/').pop();
    const requestedAthlete = new URLSearchParams(location.search).get('athlete_id');
    if (requestedAthlete) {
      if (session.role !== 'coach') {
        location.replace('dashboard.html?rev=20261021a');
      } else {
        const { data: link, error } = await supabase.from('coach_athletes').select('athlete_id').eq('coach_id', session.user.id).eq('athlete_id', requestedAthlete).eq('status', 'active').maybeSingle();
        if (error || !link) {
          toast('У вас нет доступа к меню этого спортсмена.', 'error');
          location.replace('dashboard.html?rev=20261021a');
        } else {
          menuOwnerId = requestedAthlete;
          const { data: athleteProfile } = await supabase.from('profiles').select('full_name').eq('id', requestedAthlete).maybeSingle();
          viewedAthleteName = athleteProfile?.full_name || 'спортсмена';
        }
      }
    }
    if (requestedAthlete && !menuOwnerId) {
      // Неверная роль или незакреплённый athlete_id: переход на главную уже выполнен выше.
    } else if (currentFile === 'menu-editor.html') await initEditor();
    else { renderPage(); if (viewedAthleteName) page.querySelector('.menu-page-heading .page-caption').textContent = `Меню спортсмена: ${viewedAthleteName}`; await loadDay(); }
  }
} catch (error) {
  console.error('Не удалось открыть страницу меню:', error);
  const main = document.querySelector('#main-content');
  if (main) main.innerHTML = '<section class="card error-state">Не удалось открыть страницу меню. Обновите страницу или попробуйте позже.</section>';
}
