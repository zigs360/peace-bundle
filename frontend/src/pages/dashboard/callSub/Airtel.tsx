import { useEffect, useMemo, useState } from 'react';
import api from '../../../services/api';
import { useNotifications } from '../../../context/NotificationContext';
import { getStoredUser } from '../../../utils/storage';
import { PhoneCall, Wallet, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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
  bundleCategory?: string;
  recipientPhoneNumber: string;
  amountCharged: number | string;
  minutes: number;
  validityDays: number;
  expiresAt?: string | null;
  providerReference?: string | null;
  createdAt: string;
};

const formatPhone = (value: string) => value.replace(/[^0-9+]/g, '');

const isValidNgPhone = (value: string) => {
  const clean = formatPhone(value);
  const normalized = clean.startsWith('+234') ? `0${clean.slice(4)}` : clean.startsWith('234') ? `0${clean.slice(3)}` : clean;
  const withZero = normalized.length === 10 && !normalized.startsWith('0') ? `0${normalized}` : normalized;
  return /^0\d{10}$/.test(withZero);
};

export default function Airtel() {
  const { t } = useTranslation();
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
    const [bundleRes, historyRes, statsRes] = await Promise.all([
      api.get('/callplans/call-sub/airtel/bundles'),
      api.get('/callplans/call-sub/airtel/history', { params: { limit: 20, page: 1 } }),
      api.get(`/transactions/stats/${encodeURIComponent(uid)}`),
    ]);
    setBundles(bundleRes.data?.data || []);
    setHistory(historyRes.data?.rows || []);
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

  const priceFor = (bundle: Bundle) => {
    const value = bundle.effective_price !== undefined ? bundle.effective_price : bundle.price;
    const amount = Number(value);
    return Number.isFinite(amount) ? amount : 0;
  };

  const submit = async () => {
    if (!selected) return;
    if (!isValidNgPhone(phone)) {
      alert(t('airtelCallPage.invalidPhoneAlert'));
      return;
    }
    const amount = priceFor(selected);
    if (amount > displayBalance) {
      alert(t('airtelCallPage.insufficientBalanceAlert'));
      return;
    }
    const confirmText = [
      t('airtelCallPage.confirmTitle'),
      '',
      `${t('airtelCallPage.bundleLabel')}: ${selected.name}`,
      `${t('airtelCallPage.amountLabel')}: ₦${amount.toLocaleString()}`,
      `${t('airtelCallPage.phoneLabel')}: ${phone}`,
    ].join('\n');
    if (!window.confirm(confirmText)) return;

    setPurchasing(true);
    try {
      const res = await api.post(`/callplans/call-sub/airtel/${selected.id}/purchase`, { recipientPhoneNumber: phone });
      setConfirmation(res.data?.data || null);
      setSelected(null);
      setPhone('');
      if (userId) await refresh(userId);
    } catch (error: any) {
      alert(error.response?.data?.message || t('airtelCallPage.purchaseFailed'));
      if (userId) await refresh(userId);
    } finally {
      setPurchasing(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-full">{t('airtelCallPage.loading')}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 flex items-center">
            <PhoneCall className="w-6 h-6 mr-2 text-primary-600" />
            Airtel
          </h2>
          <p className="text-sm text-gray-500 mt-1">{t('airtelCallPage.subtitle')}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm">
          <Wallet className="w-5 h-5 text-primary-600" />
          <div>
            <div className="text-[10px] uppercase tracking-widest text-gray-400 font-black">{t('airtelCallPage.walletBalance')}</div>
            <div className="text-lg font-black text-gray-900">₦{Number(displayBalance || 0).toLocaleString()}</div>
          </div>
          {userId && (
            <button
              onClick={() => void refresh(userId)}
              className="ml-2 p-2 rounded-lg hover:bg-gray-50 border border-gray-100"
              title={t('airtelCallPage.refresh')}
            >
              <RefreshCw className="w-4 h-4 text-gray-500" />
            </button>
          )}
        </div>
      </div>

      {confirmation && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-5">
          <div className="text-sm font-black text-green-800">{t('airtelCallPage.activationConfirmed')}</div>
          <div className="text-xs text-green-700 mt-1">
            {t('airtelCallPage.reference')}: <span className="font-mono">{confirmation.reference}</span>
            {confirmation.providerReference ? (
              <>
                {' '}
                | {t('airtelCallPage.providerRef')}: <span className="font-mono">{confirmation.providerReference}</span>
              </>
            ) : null}
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div className="text-sm font-black text-gray-800 mb-3">{t('airtelCallPage.targetPhoneNumber')}</div>
        <input
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder={t('airtelCallPage.phonePlaceholder')}
          className="w-full md:max-w-md border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200"
        />
        {!phone || isValidNgPhone(phone) ? null : <div className="text-xs text-red-600 mt-2 font-bold">{t('airtelCallPage.invalidPhone')}</div>}
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div className="text-sm font-black text-gray-800 mb-4">{t('airtelCallPage.availableBundles')}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {bundles.map((bundle) => {
            const amount = priceFor(bundle);
            const active = selected?.id === bundle.id;
            return (
              <button
                key={bundle.id}
                onClick={() => setSelected(bundle)}
                className={`text-left p-4 rounded-2xl border transition-all ${
                  active ? 'border-primary-400 bg-primary-50' : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <div className="text-sm font-black text-gray-900">{bundle.minutes} mins</div>
                <div className="text-xs text-gray-500 mt-1">{t('airtelCallPage.daysValidity', { count: bundle.validityDays })}</div>
                <div className="text-lg font-black text-primary-700 mt-2">₦{amount.toLocaleString()}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="text-sm font-black text-gray-800">{t('airtelCallPage.selectedBundle')}</div>
          <div className="text-sm text-gray-600 mt-1">{selected ? selected.name : t('airtelCallPage.noneSelected')}</div>
        </div>
        <button
          onClick={() => void submit()}
          disabled={!selected || purchasing}
          className={`px-6 py-3 rounded-xl text-sm font-black transition-all ${
            !selected || purchasing ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-primary-600 text-white hover:bg-primary-700'
          }`}
        >
          {purchasing ? t('airtelCallPage.processing') : t('airtelCallPage.buyBundle')}
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div className="text-sm font-black text-gray-800 mb-3">{t('airtelCallPage.purchaseHistory')}</div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-2 pr-4">{t('airtelCallPage.date')}</th>
                <th className="py-2 pr-4">{t('airtelCallPage.phone')}</th>
                <th className="py-2 pr-4">{t('airtelCallPage.bundleLabel')}</th>
                <th className="py-2 pr-4">{t('airtelCallPage.amount')}</th>
                <th className="py-2 pr-4">{t('airtelCallPage.expires')}</th>
                <th className="py-2 pr-4">{t('airtelCallPage.status')}</th>
                <th className="py-2 pr-4">{t('airtelCallPage.ref')}</th>
              </tr>
            </thead>
            <tbody>
              {history.map((item) => (
                <tr key={item.reference} className="border-t border-gray-100">
                  <td className="py-2 pr-4">{new Date(item.createdAt).toLocaleString()}</td>
                  <td className="py-2 pr-4 font-mono">{item.recipientPhoneNumber}</td>
                  <td className="py-2 pr-4">{item.minutes} mins</td>
                  <td className="py-2 pr-4 font-black">₦{Number(item.amountCharged || 0).toLocaleString()}</td>
                  <td className="py-2 pr-4">{item.expiresAt ? new Date(item.expiresAt).toLocaleDateString() : '-'}</td>
                  <td className="py-2 pr-4">
                    <span className={`font-black ${item.status === 'completed' ? 'text-green-700' : item.status === 'failed' ? 'text-red-700' : 'text-gray-600'}`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs">{item.reference}</td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td className="py-6 text-gray-400" colSpan={7}>
                    {t('airtelCallPage.noPurchases')}
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
