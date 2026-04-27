import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';

type HistoryRow = {
  id: string;
  field_name: string;
  old_price: number | null;
  new_price: number | null;
  old_value: string | null;
  new_value: string | null;
  changed_by: string;
  changed_at: string;
  reason: string | null;
  plan?: {
    id: number;
    name: string;
    provider: string;
    source: string;
    plan_id: string;
    data_size: string;
  };
};

function money(value: number | null, fallback?: string | null) {
  if (value !== null && value !== undefined && Number.isFinite(Number(value))) {
    return `₦${Number(value).toLocaleString()}`;
  }
  return fallback || '—';
}

export default function PriceHistory() {
  const { t } = useTranslation();
  const [items, setItems] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminUser, setAdminUser] = useState('');
  const [planId, setPlanId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/audit/price-history', {
        params: {
          adminUser: adminUser || undefined,
          planId: planId || undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          limit: 200,
        },
      });
      setItems((res.data?.items || []) as HistoryRow[]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchHistory();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('admin.priceHistory')}</h1>
        <p className="text-sm text-gray-600">{t('priceHistoryPage.description')}</p>
      </div>

      <div className="bg-white rounded-lg shadow border border-gray-100 p-5">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <input value={adminUser} onChange={(e) => setAdminUser(e.target.value)} placeholder={t('priceHistoryPage.adminUserPlaceholder')} className="rounded-lg border border-gray-300 px-3 py-2" />
          <input value={planId} onChange={(e) => setPlanId(e.target.value)} placeholder={t('priceHistoryPage.planIdPlaceholder')} className="rounded-lg border border-gray-300 px-3 py-2" />
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2" />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2" />
        </div>
        <div className="flex gap-3 mt-4">
          <button onClick={() => void fetchHistory()} className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">{t('priceHistoryPage.applyFilters')}</button>
          <button
            onClick={() => {
              setAdminUser('');
              setPlanId('');
              setDateFrom('');
              setDateTo('');
              void fetchHistory();
            }}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden border border-gray-100">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {[
                  t('admin.plans'),
                  t('priceHistoryPage.fieldColumn'),
                  t('priceHistoryPage.oldValueColumn'),
                  t('priceHistoryPage.newValueColumn'),
                  t('priceHistoryPage.changedByColumn'),
                  t('priceHistoryPage.changedAtColumn'),
                  t('priceHistoryPage.reasonColumn'),
                ].map((header) => (
                  <th key={header} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan={7} className="px-6 py-10 text-center text-sm text-gray-500">{t('supportPage.loading')}</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-10 text-center text-sm text-gray-500">{t('priceHistoryPage.noRecords')}</td></tr>
              ) : items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-4 text-sm text-gray-700">
                    <div className="font-medium text-gray-900">{item.plan?.name || t('priceHistoryPage.planRemoved')}</div>
                    <div className="text-xs text-gray-500">
                      {String(item.plan?.provider || '').toUpperCase()} • {String(item.plan?.source || '').toUpperCase()} • {item.plan?.plan_id || ''}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-700">{item.field_name}</td>
                  <td className="px-4 py-4 text-sm text-gray-700">{money(item.old_price, item.old_value)}</td>
                  <td className="px-4 py-4 text-sm text-gray-700">{money(item.new_price, item.new_value)}</td>
                  <td className="px-4 py-4 text-sm text-gray-700">{item.changed_by}</td>
                  <td className="px-4 py-4 text-sm text-gray-700">{new Date(item.changed_at).toLocaleString()}</td>
                  <td className="px-4 py-4 text-sm text-gray-700">{item.reason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
