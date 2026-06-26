const STORAGE_KEY = 'retail360_current_user';

export function getCurrentUser() {
  try {
    return localStorage.getItem(STORAGE_KEY)?.trim() || '';
  } catch {
    return '';
  }
}

export function setCurrentUser(name) {
  try {
    const trimmed = (name || '').trim();
    if (trimmed) localStorage.setItem(STORAGE_KEY, trimmed);
  } catch {
    /* ignore */
  }
}

/** Returns a non-empty user name, prompting once if needed. */
export function ensureCurrentUser() {
  const existing = getCurrentUser();
  if (existing) return existing;
  const entered = window.prompt('Enter your name — it will be recorded as the PR creator:')?.trim();
  if (entered) setCurrentUser(entered);
  return entered || '';
}
