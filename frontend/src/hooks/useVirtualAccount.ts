import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  VirtualAccountFetchResult,
  VirtualAccountSummary,
  auditVirtualAccountAccess,
  fetchVirtualAccountSummary,
  revealVirtualAccountNumber,
  requestVirtualAccount,
} from '../services/virtualAccount';

export type VirtualAccountState =
  | { status: 'loading'; summary: null; errorMessage: null }
  | { status: 'ready'; summary: Extract<VirtualAccountSummary, { hasVirtualAccount: true }>; errorMessage: null }
  | { status: 'empty'; summary: Extract<VirtualAccountSummary, { hasVirtualAccount: false }>; errorMessage: null }
  | { status: 'error'; summary: null; errorMessage: string };

export const useVirtualAccount = () => {
  const [state, setState] = useState<VirtualAccountState>({ status: 'loading', summary: null, errorMessage: null });

  const refresh = useCallback(async () => {
    setState({ status: 'loading', summary: null, errorMessage: null });
    const result: VirtualAccountFetchResult = await fetchVirtualAccountSummary();

    if (!result.ok) {
      setState({ status: 'error', summary: null, errorMessage: result.message });
      return;
    }

    if (result.data.hasVirtualAccount) {
      setState({ status: 'ready', summary: result.data, errorMessage: null });
      void auditVirtualAccountAccess('view_masked');
      return;
    }

    setState({ status: 'empty', summary: result.data, errorMessage: null });
    void auditVirtualAccountAccess('view_masked');
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const reveal = useCallback(async () => {
    const res = await revealVirtualAccountNumber();
    if (res.ok) {
      void auditVirtualAccountAccess('reveal_full');
      return res.accountNumber;
    }
    return null;
  }, []);

  const auditCopy = useCallback(async () => {
    await auditVirtualAccountAccess('copy_full');
  }, []);

  const request = useCallback(async () => {
    const res = await requestVirtualAccount();
    if (res.ok) {
      await refresh();
      return { ok: true as const };
    }
    return { ok: false as const, message: res.message };
  }, [refresh]);

  const hasVirtualAccount = useMemo(() => state.status === 'ready', [state.status]);

  return {
    state,
    hasVirtualAccount,
    refresh,
    reveal,
    auditCopy,
    request,
  };
};
