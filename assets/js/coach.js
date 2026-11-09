import { protectPage, formatNumber, toast } from './common.js?v=20261106b';
import { supabase } from './supabase-client.js';
import { resolvePhoto } from './image-library.js?v=20261101b';
import { translateSupabaseError } from './mock-data.js';

const $ = (selector, root = document) => root.querySelector(selector);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const AVATARS = ['avatar-1.jpg', 'avatar-2.jpg', 'avatar-3.jpg', 'avatar-4.jpg', 'avatar-5.jpg'];
let session;
let athletes = [];
let sort = { key: 'name', direction: 1 };
let activeAthlete = null;

function initials(name = '') { return String(name).trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toLocaleUpperCase('ru-RU') || 'СП'; }
function relativeActivity(value) {
  if (!value) return 'Нет активности';
  const date = new Date(value);
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.floor((start - new Date(date.getFullYear(), date.getMonth(), date.getDate())) / 86400000);
  const time = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(date);
  if (days === 0) return `Сегодня, ${time}`;
  if (days === 1) return `Вчера, ${time}`;
  if (days < 7) return `${days} ${days === 2 || days === 3 || days === 4 ? 'дня' : 'дней'} назад`;
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(date);
}
function buildPage() {
  $('#main-content').innerHTML = `
    <div class="coach-page-heading"><div><h1 class="page-heading">Мои спортсмены</h1><p class="page-caption">Управляйте списком закреплённых спортсменов.</p></div><button class="button button-primary" type="button" data-open-request><span aria-hidden="true">＋</span> Добавить</button></div>
    <p class="coach-invite-status" data-pending-invites role="status">Проверяем ожидающие приглашения…</p>
    <div class="coach-toolbar"><label class="coach-search"><span aria-hidden="true">⌕</span><input type="search" placeholder="Поиск спортсмена…" aria-label="Поиск спортсмена" data-athlete-search></label><span class="coach-count" data-athlete-count></span></div>
    <section class="card coach-table-card" aria-busy="true"><div class="coach-table-scroll"><table class="coach-table"><thead><tr><th><button type="button" data-sort="name">Имя <span aria-hidden="true">↕</span></button></th><th><button type="button" data-sort="sport">Вид спорта <span aria-hidden="true">↕</span></button></th><th><button type="button" data-sort="activity">Последняя активность <span aria-hidden="true">↕</span></button></th><th><button type="button" data-sort="status">Статус <span aria-hidden="true">↕</span></button></th><th><span class="visually-hidden">Действия</span></th></tr></thead><tbody data-athlete-rows></tbody></table></div>
      <div class="coach-loading" data-coach-loading><span></span><span></span><span></span><span></span></div>
      <div class="coach-empty" data-coach-empty hidden><span class="coach-empty-icon" aria-hidden="true">♧</span><h2>Пока нет закреплённых спортсменов</h2><p>Добавьте спортсмена по email, чтобы отправить ему запрос на закрепление.</p><button class="button button-primary" type="button" data-open-request>Добавить спортсмена</button></div>
      <div class="coach-no-results" data-coach-no-results hidden>По вашему запросу ничего не найдено.</div>
      <div class="coach-error" data-coach-error hidden><strong>Не удалось загрузить список спортсменов</strong><p>Попробуйте обновить данные.</p><button class="button button-secondary" type="button" data-retry-coach>Повторить</button></div>
    </section>
    <dialog class="coach-dialog" data-request-dialog aria-labelledby="request-title"><form data-request-form><button class="dialog-close" type="button" data-close-dialog aria-label="Закрыть окно">×</button><div class="dialog-icon" aria-hidden="true">＋</div><h2 id="request-title">Добавить спортсмена</h2><p>Письмо не отправляется. Если этот email принадлежит зарегистрированному спортсмену, запрос появится у него в разделе «Запросы» и он сможет его подтвердить.</p><label for="athlete-email">Email спортсмена</label><input id="athlete-email" name="email" type="email" placeholder="name@example.com" autocomplete="email" required><p class="form-error" data-request-error hidden></p><div class="dialog-actions"><button class="button button-secondary" type="button" data-close-dialog>Отмена</button><button class="button button-primary" type="submit" data-send-request>Создать запрос</button></div></form></dialog>
    <dialog class="coach-dialog coach-detail-dialog" data-detail-dialog aria-labelledby="athlete-detail-name"><button class="dialog-close" type="button" data-close-detail aria-label="Закрыть окно">×</button><div data-athlete-detail></div></dialog>
    <div class="coach-action-menu" data-row-menu hidden role="menu"></div>`;
}

async function loadAthletes() {
  const card = $('.coach-table-card');
  card.setAttribute('aria-busy', 'true');
  $('[data-coach-loading]').hidden = false;
  $('[data-coach-empty]').hidden = true;
  $('[data-coach-error]').hidden = true;
  $('[data-athlete-rows]').innerHTML = '';
  try {
    const { data: links, error: linksError } = await supabase.from('coach_athletes').select('athlete_id').eq('coach_id', session.user.id).eq('status', 'active');
    if (linksError) throw linksError;
    const athleteIds = [...new Set((links || []).map((link) => link.athlete_id).filter(Boolean))];
    if (!athleteIds.length) {
      athletes = [];
      $('[data-coach-loading]').hidden = true;
      $('[data-coach-empty]').hidden = false;
      $('[data-athlete-count]').textContent = '0 спортсменов';
      card.setAttribute('aria-busy', 'false');
      renderRows();
      return;
    }
    // Запрашиваем только тех спортсменов, чьи идентификаторы есть в coach_athletes.
    const [profilesResult, athleteProfilesResult, activityResult] = await Promise.all([
      supabase.from('profiles').select('id, full_name, avatar_url').in('id', athleteIds),
      supabase.from('athlete_profiles').select('user_id, sport_id').in('user_id', athleteIds),
      supabase.from('training_sessions').select('athlete_id, starts_at').in('athlete_id', athleteIds).order('starts_at', { ascending: false }),
    ]);
    if (profilesResult.error) throw profilesResult.error;
    if (athleteProfilesResult.error) throw athleteProfilesResult.error;
    if (activityResult.error) throw activityResult.error;
    const profileById = new Map((athleteProfilesResult.data || []).map((row) => [row.user_id, row]));
    const sportIds = [...new Set([...profileById.values()].map((item) => item.sport_id).filter(Boolean))];
    let sportById = new Map();
    if (sportIds.length) {
      const { data: sports, error: sportsError } = await supabase.from('sports').select('id, name').in('id', sportIds);
      if (sportsError) throw sportsError;
      sportById = new Map((sports || []).map((sport) => [sport.id, sport.name]));
    }
    const lastActivity = new Map();
    for (const row of activityResult.data || []) if (!lastActivity.has(row.athlete_id)) lastActivity.set(row.athlete_id, row.starts_at);
    athletes = (profilesResult.data || []).map((profile, index) => ({
      id: profile.id,
      name: profile.full_name || 'Спортсмен',
      sport: sportById.get(profileById.get(profile.id)?.sport_id) || 'Не указан',
      activity: lastActivity.get(profile.id) || null,
      status: 'Активен',
      avatar: profile.avatar_url || AVATARS[index % AVATARS.length],
    }));
    $('[data-coach-loading]').hidden = true;
    card.setAttribute('aria-busy', 'false');
    $('[data-athlete-count]').textContent = `${formatNumber(athletes.length)} ${athletes.length === 1 ? 'спортсмен' : athletes.length >= 2 && athletes.length <= 4 ? 'спортсмена' : 'спортсменов'}`;
    renderRows();
  } catch (error) {
    console.error('Не удалось загрузить закреплённых спортсменов', error);
    $('[data-coach-loading]').hidden = true;
    $('[data-coach-error]').hidden = false;
    card.setAttribute('aria-busy', 'false');
  }
}

function renderRows() {
  const query = $('[data-athlete-search]').value.trim().toLocaleLowerCase('ru-RU');
  const filtered = athletes.filter((athlete) => `${athlete.name} ${athlete.sport}`.toLocaleLowerCase('ru-RU').includes(query));
  filtered.sort((a, b) => {
    const left = a[sort.key] || '';
    const right = b[sort.key] || '';
    return (typeof left === 'string' ? left.localeCompare(right, 'ru') : new Date(left) - new Date(right)) * sort.direction;
  });
  $('[data-coach-no-results]').hidden = !athletes.length || filtered.length > 0;
  $('[data-athlete-rows]').innerHTML = filtered.map((athlete) => `<tr class="coach-athlete-row" data-athlete-id="${escapeHtml(athlete.id)}" tabindex="0" aria-label="Открыть профиль ${escapeHtml(athlete.name)}"><td><div class="coach-athlete-name"><span class="coach-avatar"><img src="${resolvePhoto(athlete.avatar)}" alt="Фото спортсмена ${escapeHtml(athlete.name)}" data-image-fallback="avatar" data-image-name="${escapeHtml(athlete.name)}" loading="lazy"><span data-image-fallback-content hidden></span></span><strong>${escapeHtml(athlete.name)}</strong></div></td><td>${escapeHtml(athlete.sport)}</td><td>${escapeHtml(relativeActivity(athlete.activity))}</td><td><span class="coach-status">${escapeHtml(athlete.status)}</span></td><td><button class="icon-button coach-more" type="button" data-athlete-actions="${escapeHtml(athlete.id)}" aria-label="Действия: ${escapeHtml(athlete.name)}" aria-haspopup="menu">⋮</button></td></tr>`).join('');
  $('[data-sort="name"]').setAttribute('aria-sort', sort.key === 'name' ? (sort.direction === 1 ? 'ascending' : 'descending') : 'none');
}

function openDetail(athlete) {
  activeAthlete = athlete;
  const dialog = $('[data-detail-dialog]');
  $('[data-athlete-detail]').innerHTML = `<div class="coach-detail-head"><span class="coach-avatar coach-avatar-large"><img src="${resolvePhoto(athlete.avatar)}" alt="Фото спортсмена ${escapeHtml(athlete.name)}" data-image-fallback="avatar" data-image-name="${escapeHtml(athlete.name)}" loading="lazy"><span data-image-fallback-content hidden></span></span><div><h2 id="athlete-detail-name">${escapeHtml(athlete.name)}</h2><p>${escapeHtml(athlete.sport)}</p><span class="coach-status">${escapeHtml(athlete.status)}</span></div></div><p class="coach-detail-activity">Последняя активность: ${escapeHtml(relativeActivity(athlete.activity))}</p><div class="coach-detail-actions"><a class="button button-primary" href="menu.html?athlete_id=${encodeURIComponent(athlete.id)}&amp;rev=20261021a">Открыть меню</a><a class="button button-secondary" href="training.html?athlete_id=${encodeURIComponent(athlete.id)}&amp;rev=20261021a">Тренировки</a></div>`;
  dialog.showModal();
}

function showActionMenu(button, athlete) {
  const menu = $('[data-row-menu]');
  const rect = button.getBoundingClientRect();
  menu.innerHTML = `<button type="button" role="menuitem" data-action="menu">Открыть меню</button><button type="button" role="menuitem" data-action="training">Тренировки</button><button type="button" role="menuitem" data-action="unlink" class="is-danger">Открепить</button>`;
  menu.style.top = `${Math.min(rect.bottom + 4, innerHeight - 150)}px`;
  menu.style.left = `${Math.max(12, rect.right - 190)}px`;
  menu.hidden = false;
  menu.querySelectorAll('[data-action]').forEach((item) => item.addEventListener('click', async () => {
    const action = item.dataset.action;
    menu.hidden = true;
    if (action === 'menu') location.href = `menu.html?athlete_id=${encodeURIComponent(athlete.id)}&rev=20261021a`;
    if (action === 'training') location.href = `training.html?athlete_id=${encodeURIComponent(athlete.id)}&rev=20261021a`;
    if (action === 'unlink') await unlinkAthlete(athlete);
  }));
}

async function unlinkAthlete(athlete) {
  const confirmed = window.confirm(`Открепить ${athlete.name} от вашего списка?`);
  if (!confirmed) return;
  const { error } = await supabase.from('coach_athletes').update({ status: 'revoked' }).eq('coach_id', session.user.id).eq('athlete_id', athlete.id).eq('status', 'active');
  if (error) { toast('Не удалось открепить спортсмена.', 'error'); return; }
  toast('Спортсмен откреплён.', 'success');
  await loadAthletes();
}

function bindEvents() {
  $('[data-athlete-search]').addEventListener('input', renderRows);
  document.querySelectorAll('[data-sort]').forEach((button) => button.addEventListener('click', () => {
    const key = button.dataset.sort;
    sort = { key, direction: sort.key === key ? -sort.direction : 1 };
    document.querySelectorAll('[data-sort]').forEach((item) => item.setAttribute('aria-sort', sort.key === item.dataset.sort ? (sort.direction === 1 ? 'ascending' : 'descending') : 'none'));
    renderRows();
  }));
  document.querySelectorAll('[data-open-request]').forEach((button) => button.addEventListener('click', () => $('[data-request-dialog]').showModal()));
  document.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => $('[data-request-dialog]').close()));
  $('[data-close-detail]').addEventListener('click', () => $('[data-detail-dialog]').close());
  $('[data-retry-coach]').addEventListener('click', loadAthletes);
  $('[data-athlete-rows]').addEventListener('click', (event) => {
    const action = event.target.closest('[data-athlete-actions]');
    const row = event.target.closest('[data-athlete-id]');
    if (!row) return;
    const athlete = athletes.find((item) => item.id === row.dataset.athleteId);
    if (!athlete) return;
    if (action) { event.stopPropagation(); showActionMenu(action, athlete); }
    else openDetail(athlete);
  });
  $('[data-athlete-rows]').addEventListener('keydown', (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-athlete-id]')) { event.preventDefault(); const athlete = athletes.find((item) => item.id === event.target.dataset.athleteId); if (athlete) openDetail(athlete); }
  });
  document.addEventListener('click', (event) => { if (!event.target.closest('[data-row-menu], [data-athlete-actions]')) $('[data-row-menu]').hidden = true; });
  $('[data-request-form]').addEventListener('submit', sendRequest);
}

async function refreshPendingInvites() {
  const status = $('[data-pending-invites]');
  if (!status || !session?.user?.id) return 0;
  try {
    const { count, error } = await supabase.from('coach_athletes')
      .select('id', { count: 'exact', head: true })
      .eq('coach_id', session.user.id)
      .eq('status', 'pending');
    if (error) throw error;
    const pending = Number(count || 0);
    status.textContent = pending
      ? `Ожидают ответа спортсмена: ${pending}. Приглашение появляется у него в разделе «Запросы»; письмо на почту не отправляется.`
      : 'Ожидающих подтверждения нет. Запрос попадёт в раздел «Запросы» только если указан email зарегистрированного спортсмена.';
    return pending;
  } catch (error) {
    console.error('Не удалось проверить отправленные приглашения:', error);
    status.textContent = 'Не удалось проверить статус приглашений. Обновите страницу и проверьте подключение к базе.';
    return null;
  }
}

async function sendRequest(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $('[data-send-request]');
  const errorNode = $('[data-request-error]');
  const email = new FormData(form).get('email').toString().trim().toLocaleLowerCase('en-US');
  errorNode.hidden = true;
  button.disabled = true;
  try {
    // Email lookup must be performed server-side; never query auth.users or create an active link here.
    const { error } = await supabase.rpc('request_coach_athlete_link', { athlete_email: email });
    if (error) throw error;
    await refreshPendingInvites();
    $('[data-request-dialog]').close();
    form.reset();
    toast('Запрос обработан. Если email принадлежит зарегистрированному спортсмену, он увидит его в разделе «Запросы». Письмо не отправляется.', 'success');
  } catch (error) {
    console.error('Не удалось отправить запрос тренера', error);
    errorNode.textContent = `${translateSupabaseError(error)} Проверьте, что email введён без ошибки и аккаунт уже зарегистрирован в AthleteMenu.`;
    errorNode.hidden = false;
  } finally { button.disabled = false; }
}

async function init() {
  session = await protectPage();
  if (!session || session.role !== 'coach') return;
  buildPage();
  bindEvents();
  await loadAthletes();
  await refreshPendingInvites();
}

init();
