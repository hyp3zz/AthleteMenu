import { SUPABASE_CONFIG } from './config.js';

const url = String(SUPABASE_CONFIG?.url || '').trim();
const anonKey = String(SUPABASE_CONFIG?.anonKey || '').trim();
export const isSupabaseConfigured = /^https:\/\/[\w-]+\.supabase\.co$/i.test(url)
  && anonKey.length > 20
  && !/YOUR_PROJECT|YOUR_SUPABASE_ANON_KEY|service_role/i.test(`${url} ${anonKey}`);

if (!window.supabase?.createClient) {
  throw new Error('Не загружена библиотека Supabase JS. Проверьте CDN в HTML.');
}

if (/service_role/i.test(anonKey)) {
  throw new Error('Нельзя использовать ключ service_role в браузере. Укажите публичный anon key.');
}

export const supabase = isSupabaseConfigured
  ? window.supabase.createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })
  : null;
