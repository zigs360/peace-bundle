import { useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import { useNotifications } from '../../context/NotificationContext';
import { getStoredUser } from '../../utils/storage';
import { PhoneCall, Wallet, RefreshCw } from 'lucide-react';

type Bundle = {
  id: string;
  name: string;
  provider: string;
  price: number | string;
  minutes: number;
  validityDays: number;
  api_plan_id?: string | null;
  effective_price?: number;
};

type Purchase = {
  reference: string;
  status: string;
  recipientPhoneNumber: string;
  amountCharged: number | string;
  minutes: number;
  validityDays: number;
  providerReference?: string | null;
  createdAt: string;
};

const formatPhone = (v: string) => v.replace(/[^0-9+]/g, '');

const isValidNgPhone = (v: string) => {
  const clean = formatPhone(v);
  const normalized = clean.startsWith('+234') ? `0${clean.slice(4)}` : clean.startsWith('234') ? `0${clean.slice(3)}` : clean;
  const withZero = normalized.length === 10 && !normalized.startsWith('0') ? `0${normalized}` : normalized;
  return /^0\d{10}$/.test(withZero);
};

export default function AirtelTalkMore() {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [history, setHistory] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [phone, setPhone] = useState('');
  const [selected, setSelected] = useState<Bundle | null>(null);
  const [confirmation, setConfirmation] = useState<any>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [statsBalance, setStatsBalance] = useState<number>(0);
  const { walletBalance, walletBalanceUpdatedAt } = useNotifications();

  const displayBalance = useMemo(() => {
    if (walletBalance !== null && walletBalanceUpdatedAt) return walletBalance;
    return statsBalance;
  }, [walletBalance, walletBalanceUpdatedAt, statsBalance]);

  const refresh = async (uid: string) => {
    const [bundleRes, histRes, statsRes] = await Promise.all([
      api.get('/callplans/airtel-talk-more/bundles'),
      api.get('/callplans/airtel-talk-more/history', { params: { limit: 20, page: 1 } }),
      api.get(`/transactions/stats/${encodeURIComponent(uid)}`),
    ]);
    setBundles(bundleRes.data?.data || []);
    setHistory(histRes.data?.rows || []);
    setStatsBalance(Number(statsRes.data?.balance || 0));
  };

  useEffect(() => {
    const init = async () => {
      try {
        const me = await api.get('/auth/me');
        setUserId(String(me.data.id));
        await refresh(String(me.data.id));
      } catch (e) {
        const fallback = getStoredUser<any>();
        if (fallback?.id) {
          setUserId(String(fallback.id));
          await refresh(String(fallback.id));
        }
      } finally {
        setLoading(false);
      }
    };
    void init();
  }, []);

  const grouped = useMemo(() => {
    const minuteBundles = bundles.filter((b) => Number(b.minutes || 0) > 0);
    const validityBundles = bundles.filter((b) => Number(b.minutes || 0) === 0);
    return { minuteBundles, validityBundles };
  }, [bundles]);

  const priceFor = (b: Bundle) => {
    const v = b.effective_price !== undefined ? b.effective_price : b.price;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const submit = async () => {
    if (!selected) return;
    if (!isValidNgPhone(phone)) {
      alert('Enter a valid Nigerian phone number');
      return;
    }
    const amt = priceFor(selected);
    if (amt > displayBalance) {
      alert('Insufficient wallet balance. Please fund your wallet.');
      return;
    }
    const confirmText = `Confirm Airtel Talk More purchase\n\nBundle: ${selected.name}\nAmount: ₦${amt.toLocaleString()}\nPhone: ${phone}`;
    if (!window.confirm(confirmText)) return;

    setPurchasing(true);
    try {
      const res = await api.post(`/callplans/airtel-talk-more/${selected.id}/purchase`, { recipientPhoneNumber: phone });
      setConfirmation(res.data?.data || null);
      setSelected(null);
      setPhone('');
      if (userId) await refresh(userId);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Purchase failed');
      if (userId) await refresh(userId);
    } finally {
      setPurchasing(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-full">Loading...</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center">
            <PhoneCall className="w-6 h-6 mr-2 text-primary-600" />
            Airtel Talk More
          </h1>
          <p className="text-sm text-gray-500 mt-1">Buy Airtel voice bundles directly from your wallet balance.</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm">
          <Wallet className="w-5 h-5 text-primary-600" />
          <div>
            <div className="text-[10px] uppercase tracking-widest text-gray-400 font-black">Wallet Balance</div>
            <div className="text-lg font-black text-gray-900">₦{Number(displayBalance || 0).toLocaleString()}</div>
          </div>
          {userId && (
            <button
              onClick={() => void refresh(userId)}
              className="ml-2 p-2 rounded-lg hover:bg-gray-50 border border-gray-100"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4 text-gray-500" />
            </button>
          )}
        </div>
      </div>

      {confirmation && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-5">
          <div className="text-sm font-black text-green-800">Activation confirmed</div>
          <div className="text-xs text-green-700 mt-1">
            Reference: <span className="font-mono">{confirmation.reference}</span>
            {confirmation.providerReference ? (
              <>
                {' '}
                | Provider Ref: <span className="font-mono">{confirmation.providerReference}</span>
              </>
            ) : null}
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div className="text-sm font-black text-gray-800 mb-3">Target Phone Number</div>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="e.g. 08081234567"
          className="w-full md:max-w-md border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200"
        />
        {!phone || isValidNgPhone(phone) ? null : <div className="text-xs text-red-600 mt-2 font-bold">Invalid phone number</div>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="text-sm font-black text-gray-800 mb-4">Minute Bundles</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {grouped.minuteBundles.map((b) => {
              const amt = priceFor(b);
              const active = selected?.id === b.id;
              return (
                <button
                  key={b.id}
                  onClick={() => setSelected(b)}
                  className={`text-left p-4 rounded-2xl border transition-all ${
                    active ? 'border-primary-400 bg-primary-50' : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="text-sm font-black text-gray-900">{b.minutes} mins</div>
                  <div className="text-xs text-gray-500 mt-1">{b.validityDays} days validity</div>
                  <div className="text-lg font-black text-primary-700 mt-2">₦{amt.toLocaleString()}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="text-sm font-black text-gray-800 mb-4">Validity Bundles</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {grouped.validityBundles.map((b) => {
              const amt = priceFor(b);
              const active = selected?.id === b.id;
              return (
                <button
                  key={b.id}
                  onClick={() => setSelected(b)}
                  className={`text-left p-4 rounded-2xl border transition-all ${
                    active ? 'border-primary-400 bg-primary-50' : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="text-sm font-black text-gray-900">{b.validityDays} days</div>
                  <div className="text-xs text-gray-500 mt-1">Talk More validity package</div>
                  <div className="text-lg font-black text-primary-700 mt-2">₦{amt.toLocaleString()}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="text-sm font-black text-gray-800">Selected Bundle</div>
          <div className="text-sm text-gray-600 mt-1">{selected ? selected.name : 'None selected'}</div>
        </div>
        <button
          onClick={() => void submit()}
          disabled={!selected || purchasing}
          className={`px-6 py-3 rounded-xl text-sm font-black transition-all ${
            !selected || purchasing ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-primary-600 text-white hover:bg-primary-700'
          }`}
        >
          {purchasing ? 'Processing...' : 'Buy Bundle'}
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div className="text-sm font-black text-gray-800 mb-3">Purchase History</div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Phone</th>
                <th className="py-2 pr-4">Bundle</th>
                <th className="py-2 pr-4">Amount</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Ref</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.reference} className="border-t border-gray-100">
                  <td className="py-2 pr-4">{new Date(h.createdAt).toLocaleString()}</td>
                  <td className="py-2 pr-4 font-mono">{h.recipientPhoneNumber}</td>
                  <td className="py-2 pr-4">{h.minutes > 0 ? `${h.minutes} mins` : `${h.validityDays} days`}</td>
                  <td className="py-2 pr-4 font-black">₦{Number(h.amountCharged || 0).toLocaleString()}</td>
                  <td className="py-2 pr-4">
                    <span className={`font-black ${h.status === 'completed' ? 'text-green-700' : h.status === 'failed' ? 'text-red-700' : 'text-gray-600'}`}>
                      {h.status}
                    </span>
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs">{h.reference}</td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td className="py-6 text-gray-400" colSpan={6}>
                    No purchases yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

