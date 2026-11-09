import { supabase, isSupabaseConfigured } from './supabase-client.js';
import { translateSupabaseError } from './mock-data.js';

function db() {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase не настроен: заполните assets/js/config.js.');
  return supabase;
}

export async function signUp({ email, password, fullName }) {
  const result = await db().auth.signUp({
    email: email.trim().toLowerCase(), password,
    options: { data: { full_name: fullName.trim() } },
  });
  if (result.error) throw new Error(translateSupabaseError(result.error));
  return result.data;
}

export async function signInWithPassword({ email, password }) {
  const result = await db().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (result.error) throw new Error(translateSupabaseError(result.error));
  return result.data;
}

export async function signOut() {
  const result = await db().auth.signOut();
  if (result.error) throw new Error(translateSupabaseError(result.error));
}

export async function resetPasswordForEmail(email, options = {}) {
  const result = await db().auth.resetPasswordForEmail(email.trim().toLowerCase(), options);
  if (result.error) throw new Error(translateSupabaseError(result.error));
  return result.data;
}

export function onAuthStateChange(callback) {
  return db().auth.onAuthStateChange(callback);
}

export async function getRole(userId) {
  const result = await db().from('profiles').select('role').eq('id', userId).single();
  if (result.error) throw new Error(translateSupabaseError(result.error));
  return result.data.role;
}

export async function redirectByRole(userId) {
  const role = await getRole(userId);
  location.replace(role === 'admin' ? 'admin.html' : 'dashboard.html');
}
