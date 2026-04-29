import { useState } from 'react';
import { Loader2, Shield } from 'lucide-react';
import api from '../../services/api';
import { storeTransactionPinSession, type TransactionPinSession } from '../../utils/transactionPin';

interface TransactionPinPromptProps {
  open: boolean;
  onClose: () => void;
  onVerified: (session: TransactionPinSession) => void;
  scope?: string;
  amountLabel?: string;
  actionLabel?: string;
}

export default function TransactionPinPrompt({
  open,
  onClose,
  onVerified,
  scope = 'financial',
  amountLabel,
  actionLabel = 'Confirm transaction',
}: TransactionPinPromptProps) {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!/^\d{4}$/.test(pin)) {
      setError('Enter your 4-digit transaction PIN');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/auth/transaction-pin/session', { pin, scope });
      const session = res.data?.data as TransactionPinSession;
      storeTransactionPinSession({ ...session, scope }, scope);
      setPin('');
      onVerified({ ...session, scope });
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Transaction PIN verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
          <div className="rounded-2xl bg-primary-50 p-3">
            <Shield className="h-6 w-6 text-primary-600" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">{actionLabel}</h3>
            <p className="text-sm text-gray-500">
              {amountLabel ? `Authorize ${amountLabel} with your 4-digit PIN.` : 'Authorize this transaction with your 4-digit PIN.'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">Transaction PIN</label>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-center text-2xl tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="0000"
            />
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-2xl border border-gray-300 px-4 py-3 font-semibold text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-2xl bg-primary-600 px-4 py-3 font-semibold text-white hover:bg-primary-700 disabled:opacity-70"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Verifying...
                </span>
              ) : 'Verify PIN'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
