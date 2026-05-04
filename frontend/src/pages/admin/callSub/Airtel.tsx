import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import api from '../../../services/api';

type ManagedPlan = {
  id: string;
  name: string;
  customerPrice: number;
  dealerCommission: number;
  validityDays: number;
  shortCode: string;
  internalSequenceNumber: number;
  stockLimit: number | null;
  stockRemaining: number | null;
  stockUsed: number | null;
  status: string;
  portfolio: string;
  bundleClass: string;
  ussdMapping?: string | null;
};

function money(value: number | null | undefined) {
  return `N${Number(value || 0).toLocaleString()}`;
}

export default function Airtel() {
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [monitoring, setMonitoring] = useState<any>(null);
  const [plans, setPlans] = useState<ManagedPlan[]>([]);
  const [stock, setStock] = useState<any[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Partial<ManagedPlan>>>({});
  const [commissionInput, setCommissionInput] = useState({
    planId: '',
    activationDate: new Date().toISOString().slice(0, 10),
  });
  const [commissionResult, setCommissionResult] = useState<any>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [analyticsRes, monitoringRes, plansRes, stockRes] = await Promise.all([
        api.get('/callplans/admin/call-sub/airtel/analytics'),
        api.get('/callplans/admin/call-sub/airtel/monitoring'),
        api.get('/callplans/admin/call-sub/airtel/plans', { params: { portfolio: 'talkmore' } }),
        api.get('/callplans/admin/call-sub/airtel/stock'),
      ]);
      setAnalytics(analyticsRes.data);
      setMonitoring(monitoringRes.data?.data || null);
      setPlans(plansRes.data?.items || []);
      setStock(stockRes.data?.items || []);
      setCommissionInput((prev) => ({
        ...prev,
        planId: prev.planId || plansRes.data?.items?.[0]?.id || '',
      }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const stockMap = useMemo(
    () => new Map(stock.map((item: any) => [String(item.id), item])),
    [stock],
  );

  const updateDraft = (planId: string, field: keyof ManagedPlan, value: string | number | boolean | null) => {
    setDrafts((prev) => ({
      ...prev,
      [planId]: {
        ...(prev[planId] || {}),
        [field]: value,
      },
    }));
  };

  const getPlanValue = (plan: ManagedPlan, field: keyof ManagedPlan) => {
    return drafts[plan.id]?.[field] ?? plan[field];
  };

  const savePlan = async (plan: ManagedPlan) => {
    const draft = drafts[plan.id];
    if (!draft) {
      toast.error('No changes to save');
      return;
    }

    const payload = {
      customerPrice: Number(draft.customerPrice ?? plan.customerPrice),
      dealerCommission: Number(draft.dealerCommission ?? plan.dealerCommission),
      validityDays: Number(draft.validityDays ?? plan.validityDays),
      shortCode: String(draft.shortCode ?? plan.shortCode),
      internalSequenceNumber: Number(draft.internalSequenceNumber ?? plan.internalSequenceNumber),
      stockLimit:
        draft.stockLimit === '' || draft.stockLimit === null
          ? null
          : Number(draft.stockLimit ?? plan.stockLimit),
      stockRemaining:
        draft.stockRemaining === '' || draft.stockRemaining === null
          ? null
          : Number(draft.stockRemaining ?? plan.stockRemaining),
      status: draft.status ?? plan.status,
      bundleClass: plan.bundleClass,
      portfolio: plan.portfolio,
      name: draft.name ?? plan.name,
    };

    setSavingId(plan.id);
    try {
      await api.put(`/callplans/${plan.id}`, payload);
      toast.success('TalkMore plan updated');
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[plan.id];
        return next;
      });
      await loadData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to update TalkMore plan');
    } finally {
      setSavingId(null);
    }
  };

  const runCommissionCheck = async () => {
    try {
      const res = await api.post('/callplans/admin/call-sub/airtel/commission/calculate', commissionInput);
      setCommissionResult(res.data?.data || null);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to calculate commission');
    }
  };

  if (loading) return <div className="flex items-center justify-center h-full">Loading...</div>;
  if (!analytics?.success) return <div className="p-6">Failed to load analytics</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Airtel TalkMore</h2>
        <p className="text-sm text-gray-500 mt-1">Manage gifting bundles, stock limits, commissions, and real-time performance from one dashboard.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <MetricCard label="Total Purchases" value={analytics.totals?.count || 0} />
        <MetricCard label="Completed" value={analytics.totals?.completed || 0} accent="text-green-700" />
        <MetricCard label="Failed" value={analytics.totals?.failed || 0} accent="text-red-700" />
        <MetricCard label="Revenue" value={`N${Number(analytics.totals?.amount || 0).toLocaleString()}`} />
        <MetricCard label="Commission" value={`N${Number(analytics.totals?.commission || 0).toLocaleString()}`} accent="text-primary-700" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard label="Legacy Active" value={monitoring?.activeLegacyPurchaseCount || 0} accent="text-amber-700" />
        <MetricCard label="Unmigrated Legacy" value={monitoring?.unmigratedActiveLegacyCount || 0} accent="text-red-700" />
        <MetricCard label="Migrated Credits" value={monitoring?.migratedCreditCount || 0} accent="text-primary-700" />
        <MetricCard label="Expiry Mismatches" value={monitoring?.invalidPublicExpiryCount || 0} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm font-black text-gray-800">TalkMore Gifting Catalog</div>
              <div className="text-xs text-gray-500">Exact Airtel portfolio with editable price, commission, short-code, validity, and stock.</div>
            </div>
          </div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="py-2 pr-4">Bundle</th>
                  <th className="py-2 pr-4">Short Code</th>
                  <th className="py-2 pr-4">Price</th>
                  <th className="py-2 pr-4">Commission</th>
                  <th className="py-2 pr-4">Validity</th>
                  <th className="py-2 pr-4">Stock</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Action</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => {
                  const liveStock = stockMap.get(plan.id);
                  return (
                    <tr key={plan.id} className="border-t border-gray-100 align-top">
                      <td className="py-3 pr-4">
                        <input
                          value={String(getPlanValue(plan, 'name') ?? '')}
                          onChange={(e) => updateDraft(plan.id, 'name', e.target.value)}
                          className="w-full min-w-[200px] rounded-lg border border-gray-300 px-3 py-2"
                        />
                        <div className="text-xs text-gray-500 mt-1">
                          Seq #{plan.internalSequenceNumber} · {plan.ussdMapping || `*312*${plan.shortCode}#`}
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <input
                          value={String(getPlanValue(plan, 'shortCode') ?? '')}
                          onChange={(e) => updateDraft(plan.id, 'shortCode', e.target.value)}
                          className="w-24 rounded-lg border border-gray-300 px-3 py-2"
                        />
                      </td>
                      <td className="py-3 pr-4">
                        <input
                          type="number"
                          value={String(getPlanValue(plan, 'customerPrice') ?? '')}
                          onChange={(e) => updateDraft(plan.id, 'customerPrice', Number(e.target.value))}
                          className="w-24 rounded-lg border border-gray-300 px-3 py-2"
                        />
                      </td>
                      <td className="py-3 pr-4">
                        <input
                          type="number"
                          value={String(getPlanValue(plan, 'dealerCommission') ?? '')}
                          onChange={(e) => updateDraft(plan.id, 'dealerCommission', Number(e.target.value))}
                          className="w-24 rounded-lg border border-gray-300 px-3 py-2"
                        />
                      </td>
                      <td className="py-3 pr-4">
                        <input
                          type="number"
                          value={String(getPlanValue(plan, 'validityDays') ?? '')}
                          onChange={(e) => updateDraft(plan.id, 'validityDays', Number(e.target.value))}
                          className="w-20 rounded-lg border border-gray-300 px-3 py-2"
                        />
                        <div className="text-[11px] text-gray-400 mt-1">Locked to 30 days for TalkMore gifting</div>
                      </td>
                      <td className="py-3 pr-4">
                        <input
                          type="number"
                          value={String(getPlanValue(plan, 'stockLimit') ?? '')}
                          onChange={(e) => updateDraft(plan.id, 'stockLimit', e.target.value === '' ? null : Number(e.target.value))}
                          placeholder="Unlimited"
                          className="w-24 rounded-lg border border-gray-300 px-3 py-2"
                        />
                        <input
                          type="number"
                          value={String(getPlanValue(plan, 'stockRemaining') ?? '')}
                          onChange={(e) => updateDraft(plan.id, 'stockRemaining', e.target.value === '' ? null : Number(e.target.value))}
                          placeholder="Remaining"
                          className="w-24 rounded-lg border border-gray-300 px-3 py-2 mt-2"
                        />
                        <div className="text-[11px] text-gray-500 mt-1">
                          Used: {liveStock?.stockUsed ?? plan.stockUsed ?? 0}
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <button
                          onClick={() => updateDraft(plan.id, 'status', getPlanValue(plan, 'status') === 'active' ? 'inactive' : 'active')}
                          className={`px-3 py-1 rounded-full text-xs ${
                            String(getPlanValue(plan, 'status')) === 'active'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {String(getPlanValue(plan, 'status'))}
                        </button>
                      </td>
                      <td className="py-3 pr-4">
                        <button
                          onClick={() => void savePlan(plan)}
                          disabled={savingId === plan.id}
                          className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-60"
                        >
                          {savingId === plan.id ? 'Saving...' : 'Save'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="text-sm font-black text-gray-800 mb-3">Commission Calculator</div>
            <div className="space-y-3">
              <select
                value={commissionInput.planId}
                onChange={(e) => setCommissionInput((prev) => ({ ...prev, planId: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              >
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} ({money(plan.customerPrice)})
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={commissionInput.activationDate}
                onChange={(e) => setCommissionInput((prev) => ({ ...prev, activationDate: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
              <button
                onClick={() => void runCommissionCheck()}
                className="w-full px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700"
              >
                Calculate Prorated Commission
              </button>
              {commissionResult && (
                <div className="rounded-lg border border-primary-200 bg-primary-50 p-4 text-sm text-gray-700 space-y-1">
                  <div>Commission: {money(commissionResult.dealerCommission)}</div>
                  <div>Remaining days: {commissionResult.remainingDays}</div>
                  <div>Cycle days: {commissionResult.cycleDays}</div>
                  <div>Prorated: {money(commissionResult.proratedCommission)}</div>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="text-sm font-black text-gray-800 mb-3">Top Bundles</div>
            <div className="space-y-3">
              {(analytics.bundles || []).slice(0, 6).map((bundle: any) => (
                <div key={bundle.key} className="rounded-lg border border-gray-100 p-3">
                  <div className="font-semibold text-gray-900">{bundle.name || bundle.shortCode || bundle.key}</div>
                  <div className="text-xs text-gray-500 mt-1">Short code: {bundle.shortCode || '-'}</div>
                  <div className="text-sm text-gray-700 mt-2">
                    {bundle.count} purchases · {money(bundle.amount)} revenue · {money(bundle.commission)} commission
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="text-sm font-black text-gray-800 mb-3">Legacy Reference Watchlist</div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-2 pr-4">Ref</th>
                <th className="py-2 pr-4">Bundle</th>
                <th className="py-2 pr-4">Category</th>
                <th className="py-2 pr-4">Expires</th>
                <th className="py-2 pr-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {(monitoring?.legacyReferences || []).map((item: any) => (
                <tr key={item.reference} className="border-t border-gray-100">
                  <td className="py-2 pr-4 font-mono text-xs">{item.reference}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{item.apiPlanId || '-'}</td>
                  <td className="py-2 pr-4">{item.bundleCategory}</td>
                  <td className="py-2 pr-4">{item.expiresAt ? new Date(item.expiresAt).toLocaleDateString() : '-'}</td>
                  <td className="py-2 pr-4">{item.status}</td>
                </tr>
              ))}
              {(!monitoring?.legacyReferences || monitoring.legacyReferences.length === 0) && (
                <tr>
                  <td className="py-6 text-gray-400" colSpan={5}>
                    No residual legacy validity references detected.
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

function MetricCard({ label, value, accent = 'text-gray-900' }: { label: string; value: number | string; accent?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="text-[10px] uppercase tracking-widest text-gray-400 font-black">{label}</div>
      <div className={`text-2xl font-black mt-2 ${accent}`}>{value}</div>
    </div>
  );
}
