import { isSupabaseConfigured, supabase } from './supabase-client.js';
import { installImageFallbacks } from './common.js?v=20261106b';
import { redirectByRole } from './auth-service.js';

installImageFallbacks(document);

function renderAccountLink() {
  document.querySelectorAll('[data-auth-links]').forEach((container, index) => {
    container.innerHTML = index === 0
      ? '<a class="button button-primary landing-register-link" href="dashboard.html?rev=20261021a">Личный кабинет <span aria-hidden="true">→</span></a>'
      : '<a class="button button-primary landing-main-cta" href="dashboard.html?rev=20261021a">Перейти в личный кабинет <span aria-hidden="true">→</span></a>';
  });
}

if (isSupabaseConfigured) {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (!error && data.session) {
      renderAccountLink();
      document.querySelectorAll('[data-auth-links] a').forEach((link) => link.addEventListener('click', (event) => {
        event.preventDefault();
        redirectByRole(data.session.user.id).catch((redirectError) => console.error(redirectError));
      }));
    }
  } catch (error) {
    console.warn('Не удалось проверить активную сессию.', error);
  }
}
