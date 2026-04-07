export function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function getStoredUser<T = any>(): T | null {
  return safeJsonParse<T>(localStorage.getItem('user'));
}

export function getStoredBoolean(key: string, fallback: boolean): boolean {
  const raw = localStorage.getItem(key);
  const parsed = safeJsonParse<any>(raw);
  if (typeof parsed === 'boolean') return parsed;
  if (parsed === 1) return true;
  if (parsed === 0) return false;
  return fallback;
}

