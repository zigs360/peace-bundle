import api from './api';

export type VirtualAccountSummary =
  | {
      hasVirtualAccount: false;
      message?: string;
    }
  | {
      hasVirtualAccount: true;
      bankName: string;
      accountName: string;
      accountNumberMasked: string;
      last4: string;
    };

export type VirtualAccountFetchErrorType = 'network' | 'unauthorized' | 'invalid_response' | 'server';

export type VirtualAccountFetchResult =
  | { ok: true; data: VirtualAccountSummary }
  | { ok: false; errorType: VirtualAccountFetchErrorType; message: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

export const parseVirtualAccountSummary = (payload: unknown): VirtualAccountFetchResult => {
  if (!isRecord(payload)) {
    return { ok: false, errorType: 'invalid_response', message: 'Invalid response from server.' };
  }

  const hasVirtualAccount = payload.hasVirtualAccount;
  if (hasVirtualAccount === true) {
    const bankName = payload.bankName;
    const accountName = payload.accountName;
    const accountNumberMasked = payload.accountNumberMasked;
    const last4 = payload.last4;

    if (!isNonEmptyString(bankName) || !isNonEmptyString(accountName) || !isNonEmptyString(accountNumberMasked) || !isNonEmptyString(last4)) {
      return { ok: false, errorType: 'invalid_response', message: 'Invalid virtual account details returned.' };
    }

    if (last4.replace(/\D/g, '').length !== 4) {
      return { ok: false, errorType: 'invalid_response', message: 'Invalid virtual account details returned.' };
    }

    return {
      ok: true,
      data: {
        hasVirtualAccount: true,
        bankName,
        accountName,
        accountNumberMasked,
        last4,
      },
    };
  }

  if (hasVirtualAccount === false) {
    const message = payload.message;
    return {
      ok: true,
      data: {
        hasVirtualAccount: false,
        message: isNonEmptyString(message) ? message : undefined,
      },
    };
  }

  return { ok: false, errorType: 'invalid_response', message: 'Invalid response from server.' };
};

export const fetchVirtualAccountSummary = async (): Promise<VirtualAccountFetchResult> => {
  try {
    const res = await api.get('/users/virtual-account');
    return parseVirtualAccountSummary(res.data);
  } catch (err: any) {
    const status = err?.response?.status;
    const messageFromServer = err?.response?.data?.message;

    if (status === 401) {
      return { ok: false, errorType: 'unauthorized', message: 'Session expired. Please login again.' };
    }

    if (isNonEmptyString(messageFromServer)) {
      return { ok: false, errorType: 'server', message: messageFromServer };
    }

    const message = isNonEmptyString(err?.message) ? err.message : 'Unable to load virtual account details.';
    const errorType: VirtualAccountFetchErrorType = err?.response ? 'server' : 'network';
    return { ok: false, errorType, message };
  }
};

export const revealVirtualAccountNumber = async (): Promise<{ ok: true; accountNumber: string } | { ok: false; message: string }> => {
  try {
    const res = await api.post('/users/virtual-account/reveal', {});
    const accountNumber = res?.data?.accountNumber;
    if (!isNonEmptyString(accountNumber)) {
      return { ok: false, message: 'Invalid response from server.' };
    }
    return { ok: true, accountNumber };
  } catch (err: any) {
    const messageFromServer = err?.response?.data?.message;
    return { ok: false, message: isNonEmptyString(messageFromServer) ? messageFromServer : 'Unable to reveal account number.' };
  }
};

export const auditVirtualAccountAccess = async (action: 'view_masked' | 'reveal_full' | 'copy_full'): Promise<void> => {
  try {
    await api.post('/users/virtual-account/audit', { action });
  } catch (_) {}
};

export const requestVirtualAccount = async (): Promise<{ ok: true } | { ok: false; message: string }> => {
  try {
    await api.post('/users/virtual-account/request', {});
    return { ok: true };
  } catch (err: any) {
    const messageFromServer = err?.response?.data?.message;
    const message = isNonEmptyString(messageFromServer) ? messageFromServer : 'Failed to request a virtual account.';
    return { ok: false, message };
  }
};

