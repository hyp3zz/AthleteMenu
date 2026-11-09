import { protectPage, toast } from './common.js?v=20261106b';
import { getPendingCoachRequests, respondToCoachRequest, translateSupabaseError } from './mock-data.js';

let session;
let page;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function renderPage() {
  page.innerHTML = `
    <div class="requests-page">
      <div class="requests-page-heading"><div><p class="profile-kicker">СВЯЗЬ С ТРЕНЕРОМ</p><h1 class="page-heading">Запросы</h1><p class="page-caption">Подтвердите тренера, чтобы он мог работать с вашим меню и тренировками.</p></div></div>
      <section class="card requests-card" aria-busy="true" aria-live="polite">
        <div class="requests-loading" data-requests-loading><span class="skeleton"></span></div>
        <div class="requests-empty" data-requests-empty hidden><div class="requests-empty-icon" aria-hidden="true">✉</div><h2>Пока нет запросов от тренеров</h2><p>Когда тренер отправит запрос на email, указанный при вашей регистрации, он появится здесь. Письмо на почту не отправляется.</p></div>
        <div class="requests-list" data-requests-list></div>
        <div class="requests-error" data-requests-error hidden><strong>Не удалось загрузить запросы</strong><p data-requests-error-message></p><button class="button button-secondary" type="button" data-retry-requests>Повторить</button></div>
      </section>
    </div>`;

  page.querySelector('[data-retry-requests]').addEventListener('click', loadRequests);
  page.querySelector('[data-requests-list]').addEventListener('click', handleRequestAction);
  loadRequests();
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium' }).format(date);
}

async function loadRequests() {
  const card = page.querySelector('.requests-card');
  const loading = page.querySelector('[data-requests-loading]');
  const empty = page.querySelector('[data-requests-empty]');
  const list = page.querySelector('[data-requests-list]');
  const error = page.querySelector('[data-requests-error]');
  card.setAttribute('aria-busy', 'true');
  loading.hidden = false;
  empty.hidden = true;
  error.hidden = true;
  list.replaceChildren();

  try {
    const requests = await getPendingCoachRequests(session.user.id);
    loading.hidden = true;
    if (!requests.length) {
      empty.hidden = false;
    } else {
      list.innerHTML = requests.map((request) => `
        <article class="coach-request-item">
          <div class="coach-request-info"><span class="coach-request-icon" aria-hidden="true">♧</span><div><h2>${escapeHtml(request.coach?.full_name || 'Тренер')}</h2><p>Просит доступ к вашему меню и тренировкам${request.created_at ? ` · ${escapeHtml(formatDate(request.created_at))}` : ''}</p></div></div>
          <div class="coach-request-actions"><button class="button button-primary" type="button" data-request-action="accept" data-request-id="${escapeHtml(request.id)}">Подтвердить</button><button class="button button-secondary" type="button" data-request-action="reject" data-request-id="${escapeHtml(request.id)}">Отклонить</button></div>
        </article>`).join('');
    }
  } catch (requestError) {
    loading.hidden = true;
    page.querySelector('[data-requests-error-message]').textContent = translateSupabaseError(requestError);
    error.hidden = false;
  } finally {
    card.setAttribute('aria-busy', 'false');
  }
}

async function handleRequestAction(event) {
  const button = event.target.closest('[data-request-action]');
  if (!button) return;
  const accept = button.dataset.requestAction === 'accept';
  button.disabled = true;
  try {
    await respondToCoachRequest(button.dataset.requestId, accept);
    toast(accept ? 'Тренер подтверждён.' : 'Запрос отклонён.', 'success');
    await loadRequests();
  } catch (error) {
    toast(translateSupabaseError(error), 'error');
    button.disabled = false;
  }
}

async function init() {
  session = await protectPage();
  if (!session) return;
  if (session.role !== 'athlete') {
    location.replace('dashboard.html?rev=20261021a');
    return;
  }
  page = document.querySelector('#main-content');
  renderPage();
}

init();
