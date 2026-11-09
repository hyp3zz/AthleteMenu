import { isSupabaseConfigured, supabase } from './supabase-client.js';

const ROLE_LABELS = { athlete: 'Спортсмен', coach: 'Тренер', admin: 'Админ' };
const ICONS = {
  home: '<path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9M9 20v-7h6v7"/>',
  profile: '<circle cx="12" cy="8" r="3.5"/><path d="M5 21a7 7 0 0 1 14 0"/>',
  menu: '<path d="M4 5h16v14H4z"/><path d="M8 9h8M8 12h8M8 15h5"/>',
  training: '<path d="M6 9v6M3.5 10.5v3M18 9v6M20.5 10.5v3M6 12h12"/>',
  reports: '<path d="M4 19V5M4 19h17"/><path d="m7 15 4-4 3 2 5-6"/><path d="M16 7h3v3"/>',
  requests: '<path d="M4 5h16v14H4z"/><path d="M8 10h8M8 14h5"/><path d="m8 19 4 3 4-3"/>',
  athletes: '<circle cx="9" cy="8" r="3"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0M16 5.5a3 3 0 0 1 0 5.8M17 15a4.5 4.5 0 0 1 3.5 4.4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.2 1-1.2 2.1-1.5-.5a7.8 7.8 0 0 1-1.6.9l-.3 1.6h-2.4l-.3-1.6a7.8 7.8 0 0 1-1.6-.9l-1.5.5-1.2-2.1 1.2-1a7.4 7.4 0 0 1 0-1.9l-1.2-1 1.2-2.1 1.5.5a7.8 7.8 0 0 1 1.6-.9l.3-1.6h2.4l.3 1.6a7.8 7.8 0 0 1 1.6.9l1.5-.5 1.2 2.1-1.2 1a7.4 7.4 0 0 1 0 1.9Z" transform="translate(-1 -1) scale(.95)"/>',
  logout: '<path d="M10 17 15 12 10 7M15 12H3"/><path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7"/>',
  admin: '<path d="M12 3 20 7v5c0 4.5-3.1 7.5-8 9-4.9-1.5-8-4.5-8-9V7z"/><path d="m9 12 2 2 4-4"/>',
};
const NAV_ITEMS = [
  { label: 'Главная', href: 'dashboard.html?rev=20261021a', icon: 'home' },
  { label: 'Профиль', href: 'profile.html?rev=20261021a', icon: 'profile' },
  { label: 'Меню', href: 'menu.html?rev=20261021a', icon: 'menu' },
  { label: 'Тренировки', href: 'training.html?rev=20261021a', icon: 'training' },
  { label: 'Отчёты', href: 'reports.html?rev=20261021a', icon: 'reports' },
];

function iconSvg(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name] || ICONS.admin}</svg>`;
}

export function formatNumber(value, maximumFractionDigits = 0) {
  const number = Number(value);
  return Number.isFinite(number)
    ? new Intl.NumberFormat('ru-RU', { maximumFractionDigits }).format(number)
    : '—';
}

export function formatGoal(value, goal, unit = 'г', digits = 0) {
  return `${formatNumber(value, digits)} / ${formatNumber(goal, digits)} ${unit}`;
}

export function toast(message, type = 'info', duration = 3500) {
  let region = document.querySelector('.toast-region');
  if (!region) {
    region = document.createElement('div');
    region.className = 'toast-region';
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('aria-atomic', 'false');
    document.body.append(region);
  }
  const item = document.createElement('div');
  item.className = 'toast';
  item.dataset.type = type;
  item.setAttribute('role', type === 'error' ? 'alert' : 'status');
  item.textContent = message;
  region.append(item);
  window.setTimeout(() => item.remove(), duration);
}

function initials(name) {
  return String(name || 'Спортсмен').trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase();
}

export function updateShellAvatar(url, name = 'Спортсмен') {
  const avatar = document.querySelector('.user-avatar');
  if (!avatar) return;
  avatar.replaceChildren();
  if (!url) { avatar.textContent = initials(name); return; }
  const image = document.createElement('img');
  image.alt = '';
  image.dataset.imageFallback = 'avatar';
  image.dataset.imageName = name;
  image.src = `${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`;
  avatar.append(image);
}

const FALLBACK_ICONS = {
  bowl: '<path d="M4 12h16l-2 7H6l-2-7Z"/><path d="M3 12h18M7 9c0-2 1-3 2-4M12 9c0-2 1-3 2-4M17 9c0-2 1-3 2-4"/>',
  apple: '<path d="M12 8c-3-3-8-1-8 4 0 5 4 9 8 7 4 2 8-2 8-7 0-5-5-7-8-4Z"/><path d="M12 8c0-3 2-5 5-5-1 3-3 5-5 5Z"/>',
  egg: '<path d="M12 3c-4 0-7 6-7 11a7 7 0 0 0 14 0c0-5-3-11-7-11Z"/>',
  shake: '<path d="M8 3h8l1 3-1 2 2 12H6L8 8 7 6l1-3Z"/><path d="M8 6h8M8 14h8"/>',
};
const imageFallbackRoots = new WeakSet();

function imageFallback(image) {
  if (!(image instanceof HTMLImageElement) || image.dataset.fallbackShown) return;
  image.dataset.fallbackShown = 'true';
  const type = image.dataset.imageFallback || 'food';
  image.hidden = true;
  if (type === 'banner') {
    const banner = image.parentElement;
    banner?.classList.add('is-placeholder');
    if (banner?.classList.contains('dashboard-hero')) banner.dataset.imageMissing = 'true';
    return;
  }
  let fallback = image.parentElement?.querySelector('[data-image-fallback-content]');
  if (!fallback) {
    fallback = document.createElement('span');
    fallback.dataset.imageFallbackContent = '';
    image.parentElement?.append(fallback);
  }
  fallback.classList.add('image-fallback', `image-fallback-${type}`);
  fallback.hidden = false;
  if (type === 'avatar') {
    fallback.textContent = initials(image.dataset.imageName || 'Спортсмен');
    return;
  }
  const icon = FALLBACK_ICONS[image.dataset.imageIcon] || FALLBACK_ICONS.bowl;
  fallback.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>`;
}

export function installImageFallbacks(root = document) {
  if (imageFallbackRoots.has(root)) return;
  imageFallbackRoots.add(root);
  root.addEventListener('error', (event) => imageFallback(event.target), true);
}

function navLink(item, currentFile) {
  const itemFile = new URL(item.href, location.href).pathname.split('/').pop();
  const active = currentFile === itemFile || (itemFile === 'menu.html' && currentFile === 'menu-editor.html');
  const requestLink = itemFile === 'coach-requests.html';
  return `<a class="nav-link" href="${item.href}"${active ? ' aria-current="page"' : ''}${requestLink ? ' data-coach-requests aria-label="Запросы от тренеров"' : ''}><span class="nav-icon" aria-hidden="true">${iconSvg(item.icon)}</span><span>${item.label}</span>${requestLink ? '<span class="nav-request-count" data-pending-coach-count hidden></span>' : ''}</a>`;
}

async function refreshPendingCoachRequestBadge(userId) {
  const link = document.querySelector('[data-coach-requests]');
  const badge = link?.querySelector('[data-pending-coach-count]');
  if (!badge || !userId || !supabase) return;
  try {
    const { count, error } = await supabase.from('coach_athletes')
      .select('id', { count: 'exact', head: true })
      .eq('athlete_id', userId)
      .eq('status', 'pending');
    if (error) throw error;
    const pending = Number(count || 0);
    badge.textContent = pending > 9 ? '9+' : String(pending);
    badge.hidden = pending === 0;
    link.setAttribute('aria-label', pending ? `Запросы от тренеров: ${pending} ожидают ответа` : 'Запросы от тренеров');
  } catch (error) {
    console.warn('Не удалось обновить счётчик запросов тренера:', error);
  }
}

export function renderShell({ user, role, profile = {}, currentFile = location.pathname.split('/').pop() || 'dashboard.html' }) {
  const app = document.querySelector('[data-app-shell]') || document.body;
  const displayName = profile.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Пользователь';
  const items = [...NAV_ITEMS];
  if (role === 'athlete') items.splice(2, 0, { label: 'Запросы', href: 'coach-requests.html?rev=20261101a', icon: 'requests' });
  if (role === 'coach') items.splice(3, 0, { label: 'Спортсмены', href: 'coach-athletes.html?rev=20261021a', icon: 'athletes' });
  if (role === 'admin') {
    items.push({ label: 'Админ', href: 'admin.html?rev=20261021a', icon: 'admin' });
    items.push({ label: 'Пользователи', href: 'admin-users.html?rev=20261106a', icon: 'settings' });
  }

  app.classList.add('app-shell');
  app.innerHTML = `
    <aside class="sidebar" aria-label="Основная навигация">
      <a class="brand" href="dashboard.html?rev=20261021a"><span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M4 14c5-1 8-4 10-9 3 3 4 6 2 10-2 4-7 6-12 5 2-2 4-3 7-4-3 0-5 0-7-2Z"/><path d="M7 18c2-3 5-5 9-7"/></svg></span><span>AthleteMenu</span></a>
      <div class="sidebar-section-caption">РАБОЧЕЕ ПРОСТРАНСТВО</div>
      <nav class="sidebar-nav">${items.map((item) => navLink(item, currentFile)).join('')}</nav>
      <div class="sidebar-bottom">
        <a href="profile.html?rev=20261021a#settings"><span class="nav-icon" aria-hidden="true">${iconSvg('settings')}</span><span>Настройки</span></a>
        <a href="login.html" data-sign-out><span class="nav-icon" aria-hidden="true">${iconSvg('logout')}</span><span>Выход</span></a>
      </div>
    </aside>
    <button class="sidebar-backdrop" type="button" aria-label="Закрыть меню" data-close-sidebar></button>
    <div class="main-area">
      <header class="topbar">
        <button class="icon-button menu-toggle" type="button" aria-label="Открыть меню" aria-expanded="false" data-toggle-sidebar>☰</button>
        <span aria-hidden="true"></span>
        <div class="user-summary"><span class="user-avatar" aria-hidden="true">${initials(displayName)}</span><div><div class="user-name">${escapeHtml(displayName)}</div><div class="user-role">${ROLE_LABELS[role] || 'Пользователь'}</div></div></div>
      </header>
      <main class="page-content" id="main-content"><h1 class="page-heading">${escapeHtml(document.title || 'AthleteMenu')}</h1></main>
    </div>`;

  installImageFallbacks(app);
  if (role === 'athlete') {
    void refreshPendingCoachRequestBadge(user?.id);
    window.addEventListener('focus', () => void refreshPendingCoachRequestBadge(user?.id));
  }
  updateShellAvatar(profile.avatar_url, displayName);

  const closeMenu = () => { app.dataset.sidebarOpen = 'false'; app.querySelector('[data-toggle-sidebar]')?.setAttribute('aria-expanded', 'false'); };
  app.querySelector('[data-toggle-sidebar]')?.addEventListener('click', () => {
    const open = app.dataset.sidebarOpen !== 'true';
    app.dataset.sidebarOpen = String(open);
    app.querySelector('[data-toggle-sidebar]')?.setAttribute('aria-expanded', String(open));
  });
  app.querySelector('[data-close-sidebar]')?.addEventListener('click', closeMenu);
  app.querySelector('[data-sign-out]')?.addEventListener('click', async (event) => {
    event.preventDefault();
    const { error } = await supabase.auth.signOut();
    if (error) toast('Не удалось выйти. Попробуйте ещё раз.', 'error');
    else location.href = 'index.html';
  });
  return app;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

export async function requireSession({ allowedRoles } = {}) {
  if (!isSupabaseConfigured) {
    location.replace('login.html?setup=supabase');
    return null;
  }
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    location.replace('login.html');
    return null;
  }
  const { data: profile, error } = await supabase.from('profiles').select('id, role, full_name, avatar_url').eq('id', user.id).maybeSingle();
  if (error || !profile?.role) {
    toast('Не удалось загрузить роль пользователя.', 'error');
    return null;
  }
  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    toast('У вас нет доступа к этой странице.', 'error');
    location.replace('dashboard.html?rev=20261021a');
    return null;
  }
  return { user, profile, role: profile.role };
}

export async function protectPage() {
  const restrictedPages = { 'coach-athletes.html': ['coach'], 'admin.html': ['admin'] };
  const page = location.pathname.split('/').pop();
  const session = await requireSession({ allowedRoles: restrictedPages[page] });
  if (session) renderShell({ ...session, currentFile: page });
  return session;
}
