import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import api from '../../../services/api';

type ManagedPlan = {
  id: string;
  name: string;
  price: number;
  customerPrice: number;
  dealerCommission: number;
  validityDays: number;
  shortCode: string;
  internalSequenceNumber?: number;
  stockLimit?: number | null;
  stockRemaining?: number | null;
  stockUsed?: number | null;
  status: string;
  portfolio?: string;
  bundleClass?: string;
};

function money(value: number | null | undefined) {
  return `₦${Number(value || 0).toLocaleString()}`;
}

export default function Mtn() {
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [plans, setPlans] = useState<ManagedPlan[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Partial<ManagedPlan>>>({});

  const loadData = async () => {
    setLoading(true);
    try {
      const [analyticsRes, plansRes] = await Promise.all([
        api.get('/callplans/admin/call-sub/mtn/analytics').catch(() => ({ data: null })),
        api.get('/callplans/admin/call-sub/mtn/plans').catch(() => ({ data: { items: [] } })),
      ]);
      setAnalytics(analyticsRes.data);
      
      let fetchedPlans = plansRes.data?.items || [];
      if (!fetchedPlans.length) {
        // Fallback fetch from general callplans
        const generalRes = await api.get('/callplans').catch(() => ({ data: { plans: [] } }));
        const allPlans = generalRes.data?.plans || generalRes.data || [];
        fetchedPlans = allPlans.filter((p: any) => 
          (p.network || p.provider || '').toLowerCase().includes('mtn')
        ).map((p: any) => ({
          id: String(p.id),
          name: p.name || p.plan_name || 'MTN Voice Plan',
          price: Number(p.price || 0),
          customerPrice: Number(p.your_price || p.customerPrice || p.price || 0),
          dealerCommission: Number(p.dealerCommission || 0),
          validityDays: Number(p.validityDays || 30),
          shortCode: p.shortCode || p.plan_id || '123',
          status: p.is_active !== false ? 'active' : 'inactive',
        }));
      }
      setPlans(fetchedPlans);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const updateDraft = (planId: string, field: keyof ManagedPlan, value: any) => {
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
      price: Number(draft.price ?? plan.price),
      customerPrice: Number(draft.customerPrice ?? plan.customerPrice),
      dealerCommission: Number(draft.dealerCommission ?? plan.dealerCommission),
      validityDays: Number(draft.validityDays ?? plan.validityDays),
      shortCode: String(draft.shortCode ?? plan.shortCode),
      status: draft.status ?? plan.status,
      name: draft.name ?? plan.name,
      provider: 'mtn',
    };

    setSavingId(plan.id);
    try {
      await api.put(`/callplans/${plan.id}`, payload);
      toast.success('MTN Call Sub plan updated successfully');
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[plan.id];
        return next;
      });
      await loadData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to update MTN plan');
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Loading MTN Call Sub management dashboard...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header & Analytics Cards */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">MTN ExtraTime & Voice Subscriptions</h2>
          <p className="text-sm text-gray-500 mt-1">
            Modify customer pricing, telecom cost, commissions, validity, and active status for MTN call plans.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl">
          <div className="text-xs font-semibold text-amber-800 uppercase">Provider</div>
          <div className="text-2xl font-black text-amber-900 mt-1">MTN Nigeria</div>
          <div className="text-xs text-amber-700 mt-1">Voice & ExtraTime Call Bundles</div>
        </div>

        <div className="bg-white border border-gray-200 p-4 rounded-xl shadow-sm">
          <div className="text-xs font-semibold text-gray-500 uppercase">Active Voice Plans</div>
          <div className="text-2xl font-black text-gray-900 mt-1">{plans.length} Plans</div>
          <div className="text-xs text-gray-400 mt-1">Configured for users</div>
        </div>

        <div className="bg-white border border-gray-200 p-4 rounded-xl shadow-sm">
          <div className="text-xs font-semibold text-gray-500 uppercase">Total Volume</div>
          <div className="text-2xl font-black text-green-600 mt-1">
            {money(analytics?.totalVolume || analytics?.totals?.amount || 0)}
          </div>
          <div className="text-xs text-gray-400 mt-1">Successful purchases</div>
        </div>
      </div>

      {/* Editable Plans Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-sm font-black text-gray-800">MTN Voice Subscriptions Catalog</div>
            <div className="text-xs text-gray-500">Edit price, customer price, short code, and validity directly below.</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[900px]">
            <thead>
              <tr className="text-gray-500 border-b border-gray-200">
                <th className="py-3 pr-4">Bundle Name</th>
                <th className="py-3 pr-4">Short Code</th>
                <th className="py-3 pr-4">Cost Price (₦)</th>
                <th className="py-3 pr-4 font-bold text-green-700">Your / Customer Price (₦)</th>
                <th className="py-3 pr-4">Dealer Commission (₦)</th>
                <th className="py-3 pr-4">Validity (Days)</th>
                <th className="py-3 pr-4">Status</th>
                <th className="py-3 pr-4">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {plans.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-gray-500">
                    No MTN call plans found. Click to add a new plan or sync catalog.
                  </td>
                </tr>
              ) : (
                plans.map((plan) => (
                  <tr key={plan.id} className="hover:bg-gray-50 align-middle">
                    <td className="py-3 pr-4">
                      <input
                        value={String(getPlanValue(plan, 'name') ?? '')}
                        onChange={(e) => updateDraft(plan.id, 'name', e.target.value)}
                        className="w-full min-w-[180px] rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold"
                      />
                    </td>
                    <td className="py-3 pr-4">
                      <input
                        value={String(getPlanValue(plan, 'shortCode') ?? '')}
                        onChange={(e) => updateDraft(plan.id, 'shortCode', e.target.value)}
                        className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                    </td>
                    <td className="py-3 pr-4">
                      <input
                        type="number"
                        value={String(getPlanValue(plan, 'price') ?? '')}
                        onChange={(e) => updateDraft(plan.id, 'price', Number(e.target.value))}
                        className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium"
                      />
                    </td>
                    <td className="py-3 pr-4">
                      <input
                        type="number"
                        value={String(getPlanValue(plan, 'customerPrice') ?? '')}
                        onChange={(e) => updateDraft(plan.id, 'customerPrice', Number(e.target.value))}
                        className="w-28 rounded-lg border-2 border-green-500 bg-green-50/50 px-3 py-2 text-sm font-bold text-green-900 focus:outline-none focus:ring-2 focus:ring-green-600"
                      />
                    </td>
                    <td className="py-3 pr-4">
                      <input
                        type="number"
                        value={String(getPlanValue(plan, 'dealerCommission') ?? '')}
                        onChange={(e) => updateDraft(plan.id, 'dealerCommission', Number(e.target.value))}
                        className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                    </td>
                    <td className="py-3 pr-4">
                      <input
                        type="number"
                        value={String(getPlanValue(plan, 'validityDays') ?? '')}
                        onChange={(e) => updateDraft(plan.id, 'validityDays', Number(e.target.value))}
                        className="w-20 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                    </td>
                    <td className="py-3 pr-4">
                      <button
                        onClick={() =>
                          updateDraft(plan.id, 'status', getPlanValue(plan, 'status') === 'active' ? 'inactive' : 'active')
                        }
                        className={`px-3 py-1 rounded-full text-xs font-bold ${
                          String(getPlanValue(plan, 'status')) === 'active'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {String(getPlanValue(plan, 'status')).toUpperCase()}
                      </button>
                    </td>
                    <td className="py-3 pr-4">
                      <button
                        onClick={() => void savePlan(plan)}
                        disabled={savingId === plan.id}
                        className="px-4 py-2 rounded-lg bg-amber-600 text-white font-semibold hover:bg-amber-700 disabled:opacity-60 transition-colors"
                      >
                        {savingId === plan.id ? 'Saving...' : 'Save'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
