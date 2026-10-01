import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Plus, Trash2, Save, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import api from '../../../services/api';

type ManagedPlan = {
  id: string;
  name: string;
  price: number;
  customerPrice: number;
  dealerCommission: number;
  minutes?: number;
  validityDays: number;
  shortCode: string;
  status: string;
};

interface Props {
  network: string;
  label: string;
}

export default function NetworkVoicePlans({ network, label }: Props) {
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [plans, setPlans] = useState<ManagedPlan[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Partial<ManagedPlan>>>({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newPlan, setNewPlan] = useState({
    name: '',
    minutes: '15',
    price: '',
    customerPrice: '',
    validityDays: '30',
    shortCode: '',
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const plansRes = await api.get(`/callplans/admin/call-sub/${network}/plans`).catch(() => ({ data: { items: [] } }));
      let fetchedPlans = plansRes.data?.items || [];
      if (!fetchedPlans.length) {
        const generalRes = await api.get('/callplans').catch(() => ({ data: { plans: [] } }));
        const allPlans = generalRes.data?.plans || generalRes.data || [];
        fetchedPlans = allPlans
          .filter((p: any) => (p.network || p.provider || '').toLowerCase().includes(network.toLowerCase()))
          .map((p: any) => ({
            id: String(p.id),
            name: p.name || p.plan_name || `${label} Voice Plan`,
            price: Number(p.price || 0),
            customerPrice: Number(p.your_price || p.customerPrice || p.price || 0),
            dealerCommission: Number(p.dealerCommission || 0),
            minutes: Number(p.minutes || 0),
            validityDays: Number(p.validityDays || 30),
            shortCode: p.shortCode || p.plan_id || '',
            status: p.is_active !== false && p.status !== 'inactive' ? 'active' : 'inactive',
          }));
      }
      setPlans(fetchedPlans);
    } catch {
      toast.error(`Failed to load ${label} plans`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [network]);

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

    setSavingId(plan.id);
    try {
      const payload = {
        name: draft.name ?? plan.name,
        price: Number(draft.price ?? plan.price),
        customerPrice: Number(draft.customerPrice ?? plan.customerPrice),
        dealerCommission: Number(draft.dealerCommission ?? plan.dealerCommission),
        minutes: Number(draft.minutes ?? plan.minutes ?? 15),
        validityDays: Number(draft.validityDays ?? plan.validityDays),
        shortCode: String(draft.shortCode ?? plan.shortCode),
        status: draft.status ?? plan.status,
        provider: network,
      };

      await api.put(`/callplans/${plan.id}`, payload);
      toast.success(`${label} plan updated successfully`);
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[plan.id];
        return next;
      });
      await loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update plan');
    } finally {
      setSavingId(null);
    }
  };

  const deletePlan = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete ${name}?`)) return;
    try {
      await api.delete(`/callplans/${id}`);
      toast.success('Plan deleted successfully');
      await loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete plan');
    }
  };

  const createPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlan.name || !newPlan.customerPrice) {
      toast.error('Name and selling price are required');
      return;
    }

    try {
      const selling = Number(newPlan.customerPrice);
      const cost = Number(newPlan.price || selling);
      await api.post('/callplans', {
        name: newPlan.name,
        provider: network,
        price: cost,
        customerPrice: selling,
        minutes: Number(newPlan.minutes || 15),
        validityDays: Number(newPlan.validityDays || 30),
        shortCode: newPlan.shortCode || null,
        status: 'active',
        type: 'voice',
        portfolio: 'standard',
        bundleClass: 'generic_voice',
      });
      toast.success(`${label} plan created successfully`);
      setIsModalOpen(false);
      setNewPlan({
        name: '',
        minutes: '15',
        price: '',
        customerPrice: '',
        validityDays: '30',
        shortCode: '',
      });
      await loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to create plan');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200">
        <div>
          <h2 className="text-lg font-bold text-gray-900">{label} Voice Bundles</h2>
          <p className="text-xs text-gray-500">Configure prices, validity, and short codes for {label}.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => loadData()}
            className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-semibold"
          >
            <Plus className="w-4 h-4" /> Add {label} Plan
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading {label} plans...</div>
      ) : plans.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-8 text-center">
          <p className="text-gray-500 mb-4">No voice plans found for {label}.</p>
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-bold"
          >
            Create First Plan
          </button>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 text-xs uppercase tracking-wider">
                  <th className="p-3">Plan Name</th>
                  <th className="p-3">Minutes</th>
                  <th className="p-3">Cost Price (₦)</th>
                  <th className="p-3">Selling Price (₦)</th>
                  <th className="p-3">Validity (Days)</th>
                  <th className="p-3">USSD / Code</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {plans.map((plan) => {
                  const hasDraft = Boolean(drafts[plan.id]);
                  return (
                    <tr key={plan.id} className="hover:bg-gray-50/50">
                      <td className="p-3">
                        <input
                          type="text"
                          value={getPlanValue(plan, 'name') as string}
                          onChange={(e) => updateDraft(plan.id, 'name', e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm font-medium"
                        />
                      </td>
                      <td className="p-3">
                        <input
                          type="number"
                          value={getPlanValue(plan, 'minutes') as number}
                          onChange={(e) => updateDraft(plan.id, 'minutes', Number(e.target.value))}
                          className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                      </td>
                      <td className="p-3">
                        <input
                          type="number"
                          value={getPlanValue(plan, 'price') as number}
                          onChange={(e) => updateDraft(plan.id, 'price', Number(e.target.value))}
                          className="w-24 px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                      </td>
                      <td className="p-3">
                        <input
                          type="number"
                          value={getPlanValue(plan, 'customerPrice') as number}
                          onChange={(e) => updateDraft(plan.id, 'customerPrice', Number(e.target.value))}
                          className="w-24 px-2 py-1 border border-gray-300 rounded text-sm font-bold text-green-700"
                        />
                      </td>
                      <td className="p-3">
                        <input
                          type="number"
                          value={getPlanValue(plan, 'validityDays') as number}
                          onChange={(e) => updateDraft(plan.id, 'validityDays', Number(e.target.value))}
                          className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                      </td>
                      <td className="p-3">
                        <input
                          type="text"
                          value={getPlanValue(plan, 'shortCode') as string}
                          onChange={(e) => updateDraft(plan.id, 'shortCode', e.target.value)}
                          className="w-28 px-2 py-1 border border-gray-300 rounded text-sm font-mono"
                        />
                      </td>
                      <td className="p-3">
                        <button
                          onClick={() => {
                            const cur = getPlanValue(plan, 'status');
                            updateDraft(plan.id, 'status', cur === 'active' ? 'inactive' : 'active');
                          }}
                          className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                            getPlanValue(plan, 'status') === 'active'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {getPlanValue(plan, 'status') === 'active' ? (
                            <CheckCircle className="w-3 h-3" />
                          ) : (
                            <XCircle className="w-3 h-3" />
                          )}
                          {getPlanValue(plan, 'status') === 'active' ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex justify-end gap-2">
                          {hasDraft && (
                            <button
                              disabled={savingId === plan.id}
                              onClick={() => savePlan(plan)}
                              className="flex items-center gap-1 px-2.5 py-1 bg-green-600 text-white rounded text-xs font-bold hover:bg-green-700"
                            >
                              <Save className="w-3 h-3" /> Save
                            </button>
                          )}
                          <button
                            onClick={() => deletePlan(plan.id, plan.name)}
                            className="p-1 text-red-600 hover:bg-red-50 rounded"
                            title="Delete Plan"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Plan Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-gray-900">Create New {label} Call Plan</h3>
            <form onSubmit={createPlan} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Plan Name</label>
                <input
                  type="text"
                  required
                  placeholder={`e.g. ${label} Voice 30 Mins`}
                  value={newPlan.name}
                  onChange={(e) => setNewPlan({ ...newPlan, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Voice Minutes</label>
                  <input
                    type="number"
                    required
                    value={newPlan.minutes}
                    onChange={(e) => setNewPlan({ ...newPlan, minutes: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Validity (Days)</label>
                  <input
                    type="number"
                    required
                    value={newPlan.validityDays}
                    onChange={(e) => setNewPlan({ ...newPlan, validityDays: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Cost Price (₦)</label>
                  <input
                    type="number"
                    placeholder="Telecom cost"
                    value={newPlan.price}
                    onChange={(e) => setNewPlan({ ...newPlan, price: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Selling Price (₦)</label>
                  <input
                    type="number"
                    required
                    placeholder="Customer price"
                    value={newPlan.customerPrice}
                    onChange={(e) => setNewPlan({ ...newPlan, customerPrice: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-bold text-green-700"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">USSD / Short Code (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. 50093 or *312*50093#"
                  value={newPlan.shortCode}
                  onChange={(e) => setNewPlan({ ...newPlan, shortCode: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-bold hover:bg-primary-700"
                >
                  Create Plan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
