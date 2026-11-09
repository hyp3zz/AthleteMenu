import { installImageFallbacks } from './common.js?v=20261106b';
import { isSupabaseConfigured } from './supabase-client.js';
import { signInWithPassword, signUp, resetPasswordForEmail, onAuthStateChange, redirectByRole } from './auth-service.js';

installImageFallbacks(document);

const form = document.querySelector('[data-auth-form]');
const message = document.querySelector('[data-auth-message]');
const submitButton = form?.querySelector('[type="submit"]');
const submitLabel = form?.querySelector('[data-submit-label]');

function showMessage(text, type = 'info') {
  if (!message) return;
  message.textContent = text;
  message.dataset.type = type;
  message.hidden = false;
}

function hideMessage() {
  if (message) message.hidden = true;
}

function readableError(error) { return error?.message || 'Не получилось выполнить запрос. Попробуйте ещё раз чуть позже.'; }

function setPending(pending, label) {
  if (!submitButton) return;
  submitButton.disabled = pending;
  submitButton.setAttribute('aria-busy', String(pending));
  if (submitLabel) submitLabel.textContent = pending ? 'Подождите…' : label;
}

function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

function validateForm(data) {
  if (!form.reportValidity()) return false;
  if (form.dataset.authForm === 'register') {
    if (data.fullName.trim().length < 2) {
      showMessage('Укажите имя длиной не менее двух символов.', 'error');
      form.elements.fullName.focus();
      return false;
    }
    if (data.password !== data.passwordConfirm) {
      showMessage('Пароли не совпадают. Проверьте оба поля.', 'error');
      form.elements.passwordConfirm.focus();
      return false;
    }
    if (!data.consent) {
      showMessage('Чтобы создать аккаунт, подтвердите согласие.', 'error');
      form.elements.consent.focus();
      return false;
    }
  }
  return true;
}

async function handleLogin(data) {
  const result = await signInWithPassword({ email: normalizeEmail(data.email), password: data.password });
  if (result.user) await redirectByRole(result.user.id);
}

async function handleRegistration(data) {
  const result = await signUp({ email: normalizeEmail(data.email), password: data.password, fullName: data.fullName });

  if (result.session && result.user) {
    await redirectByRole(result.user.id);
    return;
  }

  form.reset();
  showMessage('Аккаунт создан. Проверьте почту и перейдите по ссылке подтверждения, чтобы войти.', 'success');
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideMessage();
  const data = Object.fromEntries(new FormData(form));
  if (!validateForm(data)) return;

  if (!isSupabaseConfigured) {
    showMessage('Подключите проект Supabase: заполните URL и публичный anon key в assets/js/config.js.', 'error');
    return;
  }

  const defaultLabel = form.dataset.authForm === 'register' ? 'Зарегистрироваться' : 'Войти';
  setPending(true, defaultLabel);
  try {
    if (form.dataset.authForm === 'register') await handleRegistration(data);
    else await handleLogin(data);
  } catch (error) {
    showMessage(readableError(error), 'error');
  } finally {
    setPending(false, defaultLabel);
  }
});

document.querySelectorAll('[data-password-toggle]').forEach((button) => {
  button.addEventListener('click', () => {
    const input = button.parentElement.querySelector('input');
    if (!input) return;
    const reveal = input.type === 'password';
    input.type = reveal ? 'text' : 'password';
    button.setAttribute('aria-label', reveal ? 'Скрыть пароль' : 'Показать пароль');
  });
});

document.querySelector('[data-password-reset]')?.addEventListener('click', async () => {
  hideMessage();
  const emailInput = form.elements.email;
  const email = normalizeEmail(emailInput.value || '');
  if (!email) {
    showMessage('Сначала введите электронную почту — на неё придёт ссылка для сброса пароля.', 'info');
    emailInput.focus();
    return;
  }
  if (!emailInput.checkValidity()) {
    showMessage('Проверьте адрес электронной почты.', 'error');
    emailInput.focus();
    return;
  }
  if (!isSupabaseConfigured) {
    showMessage('Сброс пароля станет доступен после подключения Supabase.', 'error');
    return;
  }

  const resetButton = document.querySelector('[data-password-reset]');
  resetButton.disabled = true;
  try {
    await resetPasswordForEmail(email, {
      redirectTo: `${location.origin}${location.pathname}`,
    });
    showMessage('Если аккаунт с таким адресом существует, письмо со ссылкой для сброса уже отправлено.', 'success');
  } catch (error) {
    showMessage(readableError(error), 'error');
  } finally {
    resetButton.disabled = false;
  }
});

if (form && !isSupabaseConfigured) showMessage('Сначала заполните assets/js/config.js данными проекта Supabase.', 'error');

if (form && isSupabaseConfigured) {
  onAuthStateChange((_event, session) => {
    if (session?.user) setTimeout(() => redirectByRole(session.user.id).catch((error) => showMessage(readableError(error), 'error')), 0);
  });
}
