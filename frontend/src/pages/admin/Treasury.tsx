import { useEffect, useState } from 'react';
import api from '../../services/api';
import { useNotifications } from '../../context/NotificationContext';

export default function Treasury() {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('Settlement payout');
  const { treasuryBalance, treasuryBalanceUpdatedAt } = useNotifications();

  const refresh = async () => {
    const res = await api.get('/admin/treasury/balance');
    setBalance(typeof res.data?.balance === 'number' ? res.data.balance : Number(res.data?.balance));
    setLastSyncAt(res.data?.lastSyncAt || null);
  };

  useEffect(() => {
    const run = async () => {
      try {
        await refresh();
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, []);

  useEffect(() => {
    if (treasuryBalance === null) return;
    if (!Number.isFinite(treasuryBalance)) return;
    setBalance(treasuryBalance);
  }, [treasuryBalance, treasuryBalanceUpdatedAt]);

  useEffect(() => {
    let timer: any = null;
    const tick = async () => {
      try {
        await refresh();
      } catch (e) {
        void e;
      }
    };
    timer = setInterval(tick, 10000);
    const onFocus = () => void tick();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void tick();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      if (timer) clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const onSync = async () => {
    setSyncing(true);
    try {
      const res = await api.post('/admin/treasury/sync', {});
      await refresh();
      alert(`Treasury sync completed. Credited: ₦${Number(res.data?.credited || 0).toLocaleString()}`);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Treasury sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const onWithdraw = async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      alert('Enter a valid amount');
      return;
    }
    if (!window.confirm(`Withdraw ₦${amt.toLocaleString()} from treasury to settlement account?`)) return;
    setWithdrawing(true);
    try {
      const idempotencyKey = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
      const res = await api.post('/admin/treasury/withdraw', { amount: amt, description: description || null }, { headers: { 'Idempotency-Key': idempotencyKey } });
      await refresh();
      alert(
        `Withdrawal initiated. Ref: ${res.data?.data?.reference || 'N/A'}${
          res.data?.data?.providerReference ? ` | Provider Ref: ${res.data.data.providerReference}` : ''
        }`
      );
      setAmount('');
    } catch (err: any) {
      alert(err.response?.data?.message || 'Treasury withdrawal failed');
    } finally {
      setWithdrawing(false);
    }
  };

  const balanceDisplay = balance !== null && Number.isFinite(balance) ? `₦${Number(balance).toLocaleString()}` : '—';

  if (loading) return <div className="flex items-center justify-center h-full">Loading...</div>;

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-800 mb-4">Treasury</h1>
      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-sm text-gray-500">Available Balance</div>
            <div className="text-2xl font-bold text-gray-900">{balanceDisplay}</div>
          </div>
          <button
            onClick={onSync}
            disabled={syncing}
            className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${
              syncing ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-secondary text-white hover:opacity-90'
            }`}
          >
            {syncing ? 'Syncing...' : 'Sync Revenue'}
          </button>
        </div>

        <div className="text-xs text-gray-500">
          Last sync: {lastSyncAt ? new Date(lastSyncAt).toLocaleString() : '—'}
        </div>

        <div className="pt-4 border-t border-gray-100 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Withdraw amount"
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30"
            />
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description"
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30 sm:col-span-2"
            />
          </div>
          <button
            onClick={onWithdraw}
            disabled={withdrawing}
            className={`w-full px-4 py-2 rounded-md text-sm font-bold transition-all ${
              withdrawing ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-primary-600 text-white hover:bg-primary-700'
            }`}
          >
            {withdrawing ? 'Withdrawing...' : 'Withdraw to Settlement Account'}
          </button>
          <p className="text-xs text-gray-500">
            Withdrawal deducts the configured transfer fee from treasury and sends the original amount to the settlement bank account.
          </p>
        </div>
      </div>
    </div>
  );
}
