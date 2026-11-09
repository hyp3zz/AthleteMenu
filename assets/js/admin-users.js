import { requireSession, renderShell, toast } from './common.js?v=20261106b';
import { supabase } from './supabase-client.js';
import { translateSupabaseError } from './mock-data.js';

const $ = (selector, root = document) => root.querySelector(selector);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const ROLE_LABELS = { athlete: 'Спортсмен', coach: 'Тренер', admin: 'Администратор' };
let session;
let users = [];
let query = '';
let busy = false;

function roleErrorMessage(error) {
  const message = String(error?.message || '').toLowerCase();
  if (message.includes('cannot remove the last administrator')) return 'В системе должен оставаться хотя бы один администратор.';
  if (message.includes('cannot remove your own administrator role')) return 'Нельзя снять роль администратора с собственной учётной записи.';
  if (message.includes('no account found')) return 'Аккаунт с этой электронной почтой не найден.';
  if (message.includes('user profile was not found')) return 'Профиль пользователя не найден.';
  if (message.includes('only an administrator')) return 'Недостаточно прав для изменения ролей.';
  if (message.includes('unsupported role')) return 'Выберите допустимую роль.';
  return translateSupabaseError(error);
}

function buildPage() {
  $('#main-content').innerHTML = `
    <div class="admin-heading"><div><h1 class="page-heading">Пользователи и роли</h1><p class="page-caption">Назначайте роли тренера и администратора зарегистрированным пользователям.</p></div></div>
    <section class="card admin-users-card" aria-busy="true">
      <div class="admin-users-toolbar"><label class="admin-search"><span aria-hidden="true">⌕</span><input type="search" placeholder="Имя или электронная почта" aria-label="Поиск пользователя" data-user-search></label><button class="button button-secondary" type="button" data-users-reload>Обновить список</button></div>
      <p class="admin-users-note">Новая регистрация автоматически получает роль «Спортсмен». Назначение тренером или администратором вступает в силу сразу после сохранения.</p>
      <div class="admin-users-status" data-users-status role="status" hidden></div>
      <div class="admin-table-wrap" data-users-table-wrap hidden><table class="admin-table admin-users-table"><thead><tr><th>Пользователь</th><th>Текущая роль</th><th>Новая роль</th><th>Действие</th></tr></thead><tbody data-users-rows></tbody></table></div>
    </section>`;
}

function filteredUsers() {
  const term = query.trim().toLocaleLowerCase('ru-RU');
  return users.filter((user) => `${user.full_name} ${user.email}`.toLocaleLowerCase('ru-RU').includes(term));
}

function renderUsers() {
  const wrap = $('[data-users-table-wrap]');
  const status = $('[data-users-status]');
  const rows = filteredUsers();
  wrap.hidden = rows.length === 0;
  status.hidden = rows.length !== 0;
  status.textContent = users.length === 0
    ? 'Пользователей пока нет.'
    : 'По вашему запросу ничего не найдено.';
  $('[data-users-rows]').innerHTML = rows.map((user) => {
    const self = user.id === session.user.id;
    const choices = Object.entries(ROLE_LABELS).map(([value, label]) => `<option value="${value}"${user.role === value ? ' selected' : ''}>${label}</option>`).join('');
    return `<tr data-user-row="${escapeHtml(user.id)}"><td><strong class="admin-reference-name">${escapeHtml(user.full_name || 'Имя не указано')}</strong><small class="admin-user-email">${escapeHtml(user.email || 'Почта не указана')}</small></td><td>${escapeHtml(ROLE_LABELS[user.role] || 'Спортсмен')}</td><td><select class="admin-user-role" aria-label="Новая роль для ${escapeHtml(user.email)}" data-role-select data-current-role="${escapeHtml(user.role)}"${self ? ' disabled title="Нельзя изменить собственную роль"' : ''}>${choices}</select></td><td><button class="button button-primary admin-user-save" type="button" data-save-role="${escapeHtml(user.id)}"${self || busy ? ' disabled' : ''}>Сохранить</button></td></tr>`;
  }).join('');
  $('[data-users-rows]').querySelectorAll('[data-role-select]').forEach((select) => select.addEventListener('change', () => {
    const button = select.closest('tr').querySelector('[data-save-role]');
    button.disabled = busy || select.value === select.dataset.currentRole || select.closest('tr').dataset.userRow === session.user.id;
  }));
  $('[data-users-rows]').querySelectorAll('[data-save-role]').forEach((button) => button.addEventListener('click', () => saveRole(button.dataset.saveRole)));
}

async function loadUsers() {
  if (busy) return;
  busy = true;
  $('.admin-users-card').setAttribute('aria-busy', 'true');
  $('[data-users-reload]').disabled = true;
  try {
    const { data, error } = await supabase.rpc('admin_list_users');
    if (error) throw error;
    users = data || [];
    renderUsers();
  } catch (error) {
    console.error('Не удалось загрузить список пользователей:', error);
    const status = $('[data-users-status]');
    $('[data-users-table-wrap]').hidden = true;
    status.hidden = false;
    status.textContent = /admin_list_users|PGRST202|42883/i.test(`${error?.message || ''} ${error?.code || ''}`)
      ? 'Чтобы включить управление ролями, один раз выполните supabase/roles.sql в Supabase → SQL Editor.'
      : translateSupabaseError(error);
  } finally {
    busy = false;
    $('.admin-users-card').setAttribute('aria-busy', 'false');
    $('[data-users-reload]').disabled = false;
    $('[data-users-rows]').querySelectorAll('[data-save-role]').forEach((button) => {
      const select = button.closest('tr').querySelector('[data-role-select]');
      button.disabled = select.disabled || select.value === select.dataset.currentRole;
    });
  }
}

async function saveRole(userId) {
  const user = users.find((item) => item.id === userId);
  const row = $(`[data-user-row="${CSS.escape(userId)}"]`);
  const select = row?.querySelector('[data-role-select]');
  const button = row?.querySelector('[data-save-role]');
  if (!user || !select || !button || user.id === session.user.id || select.value === user.role) return;
  const nextRole = select.value;
  if (!window.confirm(`Назначить пользователю ${user.email} роль «${ROLE_LABELS[nextRole]}»?`)) return;

  busy = true;
  button.disabled = true;
  select.disabled = true;
  $('[data-users-reload]').disabled = true;
  try {
    const { error } = await supabase.rpc('admin_set_user_role', { p_email: user.email, p_role: nextRole });
    if (error) throw error;
    toast(`Роль пользователя изменена: ${ROLE_LABELS[nextRole]}.`, 'success');
    busy = false;
    await loadUsers();
  } catch (error) {
    console.error('Не удалось изменить роль пользователя:', error);
    toast(roleErrorMessage(error), 'error');
    button.disabled = false;
    select.disabled = false;
    busy = false;
    $('[data-users-reload]').disabled = false;
  }
}

async function init() {
  session = await requireSession({ allowedRoles: ['admin'] });
  if (!session) return;
  renderShell({ ...session, currentFile: 'admin-users.html' });
  buildPage();
  $('[data-user-search]').addEventListener('input', (event) => { query = event.target.value; renderUsers(); });
  $('[data-users-reload]').addEventListener('click', loadUsers);
  await loadUsers();
}

init();
