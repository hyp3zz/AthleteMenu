import { protectPage, formatNumber, toast } from './common.js?v=20261106b';
import { supabase } from './supabase-client.js';
import { getProducts, getProductGroups, adminCreate, adminUpdate, adminDelete, translateSupabaseError } from './mock-data.js';
import { productPhoto, resolvePhoto } from './image-library.js?v=20261101c';

const $ = (selector, root = document) => root.querySelector(selector);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const PAGE_SIZE = 20;
const TABS = [
  { key: 'products', label: 'Продукты', singular: 'продукт' },
  { key: 'product_groups', label: 'Группы продуктов', singular: 'группу' },
  { key: 'sports', label: 'Виды спорта', singular: 'вид спорта' },
];
let session;
let activeTab = 'products';
let rows = [];
let groups = [];
let pageNumber = 0;
let searchValue = '';
let editorId = null;
let loading = false;

function buildPage() {
  $('#main-content').innerHTML = `
    <div class="admin-heading"><div><h1 class="page-heading">Управление справочниками</h1><p class="page-caption">Каталог продуктов, групп и видов спорта.</p></div></div>
    <div class="admin-tabs" role="tablist" aria-label="Справочники">${TABS.map((tab, index) => `<button class="admin-tab${index === 0 ? ' is-active' : ''}" type="button" role="tab" aria-selected="${index === 0}" aria-controls="admin-panel" id="tab-${tab.key}" data-admin-tab="${tab.key}">${tab.label}</button>`).join('')}</div>
    <section id="admin-panel" class="card admin-card" role="tabpanel" aria-labelledby="tab-products" aria-busy="true">
      <div class="admin-toolbar"><label class="admin-search"><span aria-hidden="true">⌕</span><input type="search" placeholder="Поиск продукта…" aria-label="Поиск по справочнику" data-admin-search></label><button class="button button-primary" type="button" data-add-entry><span aria-hidden="true">＋</span> Добавить продукт</button></div>
      <div class="admin-loading" data-admin-loading><span></span><span></span><span></span><span></span><span></span></div>
      <div class="admin-error" data-admin-error hidden><strong>Не удалось загрузить справочник</strong><p>Проверьте подключение и попробуйте ещё раз.</p><button class="button button-secondary" type="button" data-admin-retry>Повторить</button></div>
      <div class="admin-empty" data-admin-empty hidden><span class="admin-empty-icon" aria-hidden="true">▤</span><h2>В справочнике пока нет записей</h2><p>Добавьте первую запись, чтобы использовать её в меню и профилях.</p></div>
      <div class="admin-table-wrap"><table class="admin-table"><thead data-admin-head></thead><tbody data-admin-rows></tbody></table></div>
      <div class="admin-pagination" data-admin-pagination></div>
    </section>
    <dialog class="admin-dialog" data-admin-dialog aria-labelledby="admin-dialog-title"><form data-admin-form><button class="dialog-close" type="button" data-close-admin aria-label="Закрыть окно">×</button><div class="dialog-icon" aria-hidden="true">＋</div><h2 id="admin-dialog-title">Добавить продукт</h2><p class="admin-dialog-caption" data-dialog-caption>Пищевая ценность указывается на 100 г.</p><div class="admin-product-fields" data-product-fields>
      <label>Название<input name="name" type="text" maxlength="120" required placeholder="Например, Куриная грудка"></label>
      <label>Группа<select name="group_id" required data-group-select><option value="">Выберите группу</option></select></label>
      <label>Калорийность, ккал / 100 г<input name="calories_kcal_per_100g" type="number" min="0" step="0.1" required></label>
      <label>Белки, г / 100 г<input name="protein_g_per_100g" type="number" min="0" step="0.1" required></label>
      <label>Жиры, г / 100 г<input name="fat_g_per_100g" type="number" min="0" step="0.1" required></label>
      <label>Углеводы, г / 100 г<input name="carbs_g_per_100g" type="number" min="0" step="0.1" required></label>
      <label class="admin-image-field">Фото (необязательно)<span class="admin-image-input"><input name="image_path" type="text" maxlength="500" placeholder="Ссылка Unsplash или имя файла" aria-describedby="image-help"></span><small id="image-help">Вставьте прямую ссылку Unsplash или укажите файл из assets/images.</small></label>
    </div><div class="admin-simple-fields" data-simple-fields hidden><label>Название<input name="simple_name" type="text" maxlength="120" placeholder="Название" required></label></div><p class="admin-form-error" data-admin-form-error hidden></p><div class="dialog-actions"><button class="button button-secondary" type="button" data-close-admin>Отмена</button><button class="button button-primary" type="submit" data-save-admin>Сохранить</button></div></form></dialog>`;
}

function setTab(tabKey) {
  activeTab = tabKey;
  pageNumber = 0;
  searchValue = '';
  $('[data-admin-search]').value = '';
  document.querySelectorAll('[data-admin-tab]').forEach((button) => {
    const active = button.dataset.adminTab === tabKey;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
  });
  $('#admin-panel').setAttribute('aria-labelledby', `tab-${tabKey}`);
  const productMode = tabKey === 'products';
  $('[data-admin-search]').placeholder = productMode ? 'Поиск продукта…' : tabKey === 'sports' ? 'Поиск вида спорта…' : 'Поиск группы…';
  $('[data-admin-search]').setAttribute('aria-label', productMode ? 'Поиск продукта' : tabKey === 'sports' ? 'Поиск вида спорта' : 'Поиск группы продуктов');
  $('[data-add-entry]').innerHTML = `<span aria-hidden="true">＋</span> Добавить ${productMode ? 'продукт' : tabKey === 'sports' ? 'вид спорта' : 'группу'}`;
  loadCurrentTab();
}

async function loadGroups() {
  groups = await getProductGroups();
}

async function loadCurrentTab() {
  loading = true;
  $('.admin-card').setAttribute('aria-busy', 'true');
  $('[data-admin-loading]').hidden = false;
  $('[data-admin-error]').hidden = true;
  $('[data-admin-empty]').hidden = true;
  $('.admin-table-wrap').hidden = true;
  $('[data-admin-pagination]').hidden = true;
  try {
    if (activeTab === 'products') {
      const [data, productGroups] = await Promise.all([getProducts(), getProductGroups()]);
      groups = productGroups;
      const groupMap = new Map(groups.map((group) => [group.id, group.name]));
      rows = data.map((product) => ({ ...product, group_name: groupMap.get(product.group_id) || 'Без группы', image_path: product.image_path || product.image || '' }));
    } else {
      const { data, error } = await supabase.from(activeTab).select('*').order('name');
      if (error) throw error;
      rows = data || [];
    }
    $('[data-admin-loading]').hidden = true;
    loading = false;
    $('.admin-card').setAttribute('aria-busy', 'false');
    renderTable();
  } catch (error) {
    console.error(`Не удалось загрузить ${activeTab}:`, error);
    $('[data-admin-loading]').hidden = true;
    $('[data-admin-error]').hidden = false;
    loading = false;
    $('.admin-card').setAttribute('aria-busy', 'false');
  }
}

function renderTable() {
  const query = searchValue.trim().toLocaleLowerCase('ru-RU');
  const filtered = rows.filter((row) => {
    const text = activeTab === 'products' ? `${row.name} ${row.group_name}` : `${row.name} ${row.description || ''}`;
    return text.toLocaleLowerCase('ru-RU').includes(query);
  });
  const pageCount = Math.ceil(filtered.length / PAGE_SIZE);
  pageNumber = Math.min(pageNumber, Math.max(0, pageCount - 1));
  const pageRows = filtered.slice(pageNumber * PAGE_SIZE, (pageNumber + 1) * PAGE_SIZE);
  const isProduct = activeTab === 'products';
  $('[data-admin-head]').innerHTML = isProduct
    ? '<tr><th>Название</th><th>Группа</th><th>Калорийность (на 100 г)</th><th>Действия</th></tr>'
    : '<tr><th>Название</th><th>Действия</th></tr>';
  $('[data-admin-rows]').innerHTML = pageRows.map((row) => isProduct
    ? `<tr><td><div class="admin-product-name"><span class="admin-product-thumb"><img src="${escapeHtml(safeImagePath(row.image_path, row.name, row.group_name))}" alt="Продукт: ${escapeHtml(row.name)}" data-image-fallback="food" data-image-icon="${/банан/i.test(row.name) ? 'apple' : /яйц/i.test(row.name) ? 'egg' : 'bowl'}" loading="lazy"><span data-image-fallback-content hidden aria-hidden="true"></span></span><strong>${escapeHtml(row.name)}</strong></div></td><td>${escapeHtml(row.group_name)}</td><td>${formatNumber(row.calories_kcal_per_100g ?? row.calories_per_100g, 1)} ккал</td><td><div class="admin-row-actions"><button class="admin-icon-button" type="button" data-edit-entry="${escapeHtml(row.id)}" aria-label="Редактировать ${escapeHtml(row.name)}" title="Редактировать">✎</button><button class="admin-icon-button is-danger" type="button" data-delete-entry="${escapeHtml(row.id)}" aria-label="Удалить ${escapeHtml(row.name)}" title="Удалить">⌫</button></div></td></tr>`
    : `<tr><td><strong class="admin-reference-name">${escapeHtml(row.name)}</strong></td><td><div class="admin-row-actions"><button class="admin-icon-button" type="button" data-edit-entry="${escapeHtml(row.id)}" aria-label="Редактировать ${escapeHtml(row.name)}" title="Редактировать">✎</button><button class="admin-icon-button is-danger" type="button" data-delete-entry="${escapeHtml(row.id)}" aria-label="Удалить ${escapeHtml(row.name)}" title="Удалить">⌫</button></div></td></tr>`).join('');
  const empty = filtered.length === 0;
  if (empty) {
    $('[data-admin-empty] h2').textContent = rows.length ? 'По вашему запросу ничего не найдено' : 'В справочнике пока нет записей';
    $('[data-admin-empty] p').textContent = rows.length ? 'Попробуйте изменить поисковый запрос.' : 'Добавьте первую запись, чтобы использовать её в меню и профилях.';
    $('[data-admin-empty] .button')?.remove();
    if (!rows.length && !$('[data-admin-empty] .button')) {
      $('[data-admin-empty]').insertAdjacentHTML('beforeend', `<button class="button button-primary" type="button" data-empty-add>Добавить ${activeTab === 'products' ? 'продукт' : activeTab === 'sports' ? 'вид спорта' : 'группу'}</button>`);
      $('[data-empty-add]').addEventListener('click', () => openEditor());
    }
  }
  $('[data-admin-empty]').hidden = !empty;
  $('.admin-table-wrap').hidden = empty;
  $('[data-admin-pagination]').hidden = empty || pageCount <= 1;
  if (!empty && pageCount > 1) $('[data-admin-pagination]').innerHTML = `<span>Показано ${formatNumber(pageNumber * PAGE_SIZE + 1)}–${formatNumber(Math.min((pageNumber + 1) * PAGE_SIZE, filtered.length))} из ${formatNumber(filtered.length)}</span><div><button class="button button-secondary" type="button" data-page="prev" ${pageNumber === 0 ? 'disabled' : ''} aria-label="Предыдущая страница">‹</button><span>Страница ${formatNumber(pageNumber + 1)} из ${formatNumber(pageCount)}</span><button class="button button-secondary" type="button" data-page="next" ${pageNumber >= pageCount - 1 ? 'disabled' : ''} aria-label="Следующая страница">›</button></div>`;
  $('[data-admin-rows]').querySelectorAll('[data-edit-entry]').forEach((button) => button.addEventListener('click', () => openEditor(rows.find((row) => String(row.id) === button.dataset.editEntry))));
  $('[data-admin-rows]').querySelectorAll('[data-delete-entry]').forEach((button) => button.addEventListener('click', () => deleteEntry(rows.find((row) => String(row.id) === button.dataset.deleteEntry))));
  $('[data-admin-pagination]').querySelector('[data-page="prev"]')?.addEventListener('click', () => { pageNumber--; renderTable(); });
  $('[data-admin-pagination]').querySelector('[data-page="next"]')?.addEventListener('click', () => { pageNumber++; renderTable(); });
}

function safeImagePath(path, name, groupName) {
  return path ? resolvePhoto(path) : productPhoto(name, null, groupName);
}

function openEditor(row = null) {
  editorId = row?.id ?? null;
  const form = $('[data-admin-form]');
  form.reset();
  $('[data-admin-form-error]').hidden = true;
  const isProduct = activeTab === 'products';
  $('#admin-dialog-title').textContent = `${row ? 'Редактировать' : 'Добавить'} ${isProduct ? 'продукт' : activeTab === 'sports' ? 'вид спорта' : 'группу продуктов'}`;
  $('[data-dialog-caption]').textContent = isProduct ? 'Пищевая ценность указывается на 100 г.' : 'Название будет доступно в справочнике.';
  $('[data-product-fields]').hidden = !isProduct;
  $('[data-simple-fields]').hidden = isProduct;
  $('[data-product-fields]').querySelectorAll('input, select').forEach((input) => { input.disabled = !isProduct; });
  $('[data-simple-fields]').querySelectorAll('input, textarea').forEach((input) => { input.disabled = isProduct; });
  form.elements.name.required = isProduct;
  form.elements.simple_name.required = !isProduct;
  if (isProduct) {
    $('[data-group-select]').innerHTML = `<option value="">Выберите группу</option>${groups.map((group) => `<option value="${escapeHtml(group.id)}">${escapeHtml(group.name)}</option>`).join('')}`;
    form.elements.name.value = row?.name || '';
    form.elements.group_id.value = row?.group_id || '';
    form.elements.calories_kcal_per_100g.value = row?.calories_kcal_per_100g ?? row?.calories_per_100g ?? '';
    form.elements.protein_g_per_100g.value = row?.protein_g_per_100g ?? row?.protein_per_100g ?? '';
    form.elements.fat_g_per_100g.value = row?.fat_g_per_100g ?? row?.fat_per_100g ?? '';
    form.elements.carbs_g_per_100g.value = row?.carbs_g_per_100g ?? row?.carbs_per_100g ?? '';
    form.elements.image_path.value = row?.image_path || row?.image || '';
  } else {
    form.elements.simple_name.value = row?.name || '';
  }
  $('[data-admin-dialog]').showModal();
}

async function saveEntry(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const errorNode = $('[data-admin-form-error]');
  const button = $('[data-save-admin]');
  errorNode.hidden = true;
  const formData = new FormData(form);
  let payload;
  if (activeTab === 'products') {
    const values = ['calories_kcal_per_100g', 'protein_g_per_100g', 'fat_g_per_100g', 'carbs_g_per_100g'];
    if (values.some((key) => !Number.isFinite(Number(formData.get(key))) || Number(formData.get(key)) < 0)) {
      errorNode.textContent = 'Укажите корректные значения пищевой ценности (не меньше нуля).'; errorNode.hidden = false; return;
    }
    const photo = String(formData.get('image_path') || '').trim();
    if (photo) {
      let parsed;
      try { parsed = new URL(photo); } catch { /* имя локального файла не является URL */ }
      const isUnsplashUrl = parsed?.protocol === 'https:' && parsed.hostname === 'images.unsplash.com';
      const isLocalFile = /^(?:assets\/images\/)?[A-Za-z0-9._-]+\.(?:svg|jpe?g|png|webp)$/i.test(photo);
      if (!isUnsplashUrl && !isLocalFile) { errorNode.textContent = 'Укажите прямую HTTPS-ссылку Unsplash или имя файла из assets/images.'; errorNode.hidden = false; return; }
    }
    payload = {
      name: String(formData.get('name')).trim(),
      group_id: formData.get('group_id'),
      calories_kcal_per_100g: Number(formData.get('calories_kcal_per_100g')),
      protein_g_per_100g: Number(formData.get('protein_g_per_100g')),
      fat_g_per_100g: Number(formData.get('fat_g_per_100g')),
      carbs_g_per_100g: Number(formData.get('carbs_g_per_100g')),
      image_path: photo || null,
    };
  } else {
    payload = { name: String(formData.get('simple_name')).trim() };
  }
  button.disabled = true;
  try {
    if (editorId) await adminUpdate(activeTab, editorId, payload);
    else await adminCreate(activeTab, payload);
    $('[data-admin-dialog]').close();
    toast(editorId ? 'Изменения сохранены.' : 'Запись добавлена.', 'success');
    await loadCurrentTab();
  } catch (error) {
    console.error('Не удалось сохранить запись справочника:', error);
    errorNode.textContent = translateSupabaseError(error);
    errorNode.hidden = false;
  } finally { button.disabled = false; }
}

async function deleteEntry(row) {
  if (!row) return;
  if (!window.confirm(`Удалить «${row.name}»? Это действие нельзя отменить.`)) return;
  try {
    await adminDelete(activeTab, row.id);
    toast('Запись удалена.', 'success');
    await loadCurrentTab();
  } catch (error) {
    console.error('Не удалось удалить запись справочника:', error);
    toast(translateSupabaseError(error), 'error');
  }
}

function bindEvents() {
  document.querySelectorAll('[data-admin-tab]').forEach((button) => button.addEventListener('click', () => setTab(button.dataset.adminTab)));
  $('[data-admin-search]').addEventListener('input', (event) => { searchValue = event.target.value; pageNumber = 0; renderTable(); });
  $('[data-add-entry]').addEventListener('click', () => openEditor());
  $('[data-admin-form]').addEventListener('submit', saveEntry);
  document.querySelectorAll('[data-close-admin]').forEach((button) => button.addEventListener('click', () => $('[data-admin-dialog]').close()));
  $('[data-admin-retry]').addEventListener('click', loadCurrentTab);
}

async function init() {
  session = await protectPage();
  if (!session || session.role !== 'admin') return;
  buildPage();
  bindEvents();
  await loadCurrentTab();
}

init();
