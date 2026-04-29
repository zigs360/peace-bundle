export interface TransactionPinSession {
  token: string;
  expiresAt: number;
  timeoutMs: number;
  scope: string;
}

const STORAGE_KEY_PREFIX = 'transaction_pin_session';

function getStorageKey(scope: string) {
  return `${STORAGE_KEY_PREFIX}:${scope}`;
}

export function getStoredTransactionPinSession(scope = 'financial'): TransactionPinSession | null {
  const raw = sessionStorage.getItem(getStorageKey(scope));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as TransactionPinSession;
    if (!parsed?.token || !parsed?.expiresAt) return null;
    if (Date.now() >= Number(parsed.expiresAt)) {
      sessionStorage.removeItem(getStorageKey(scope));
      return null;
    }
    return parsed;
  } catch {
    sessionStorage.removeItem(getStorageKey(scope));
    return null;
  }
}

export function storeTransactionPinSession(session: TransactionPinSession, scope = 'financial') {
  sessionStorage.setItem(getStorageKey(scope), JSON.stringify({ ...session, scope }));
}

export function clearTransactionPinSession(scope = 'financial') {
  sessionStorage.removeItem(getStorageKey(scope));
}
