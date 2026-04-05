import { useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import { toast } from 'react-hot-toast';

type Tier = {
  id: string;
  name: string;
  description?: string | null;
  priority: number;
  is_active: boolean;
};

type Rule = {
  id: string;
  tierId: string;
  product_type: 'airtime' | 'data' | 'subscription';
  provider?: 'mtn' | 'airtel' | 'glo' | '9mobile' | null;
  dataPlanId?: string | null;
  subscriptionPlanId?: string | null;
  fixed_price?: number | string | null;
  base_price?: number | string | null;
  markup_percent?: number | string | null;
  discount_percent?: number | string | null;
  min_price?: number | string | null;
  max_price?: number | string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  is_active: boolean;
};

type DataPlan = { id: string; name: string; provider: string; admin_price: number | string };
type SubscriptionPlan = { id: string; name: string; price: number | string };

const NETWORKS = ['mtn', 'airtel', 'glo', '9mobile'] as const;

const toNumberOrNull = (v: string) => {
  const s = v.trim();
  if (!s) return null;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
};

export default function AdminPricing() {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [selectedTierId, setSelectedTierId] = useState<string>('');
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(false);
  const [plans, setPlans] = useState<DataPlan[]>([]);
  const [subPlans, setSubPlans] = useState<SubscriptionPlan[]>([]);
  const [tierMapping, setTierMapping] = useState<{ user: string; reseller: string; admin: string }>({
    user: 'default',
    reseller: 'default',
    admin: 'default',
  });

  const [form, setForm] = useState({
    product_type: 'airtime' as Rule['product_type'],
    provider: '' as '' | Rule['provider'],
    dataPlanId: '',
    subscriptionPlanId: '',
    fixed_price: '',
    base_price: '',
    markup_percent: '',
    discount_percent: '',
    min_price: '',
    max_price: '',
    starts_at: '',
    ends_at: '',
    is_active: true,
  });

  const selectedTier = useMemo(() => tiers.find((t) => t.id === selectedTierId) || null, [tiers, selectedTierId]);

  const loadTiers = async () => {
    const res = await api.get('/admin/pricing/tiers');
    if (!res.data?.success) throw new Error('Failed to load pricing tiers');
    const data = res.data.data as Tier[];
    setTiers(data);
    if (!selectedTierId && data.length) setSelectedTierId(data[0].id);
  };

  const loadRules = async (tierId: string) => {
    if (!tierId) return;
    const res = await api.get('/admin/pricing/rules', { params: { tierId } });
    if (!res.data?.success) throw new Error('Failed to load pricing rules');
    setRules(res.data.data as Rule[]);
  };

  const loadPlanLookups = async () => {
    const [plansRes, subsRes] = await Promise.all([
      api.get('/admin/plans'),
      api.get('/admin/subscription-plans'),
    ]);
    const plansData = (plansRes.data?.data || plansRes.data || []) as DataPlan[];
    const subsData = (subsRes.data?.data || subsRes.data || []) as SubscriptionPlan[];
    setPlans(plansData);
    setSubPlans(subsData);
  };

  const loadTierMapping = async () => {
    const res = await api.get('/admin/settings');
    const grouped = res.data?.settings || {};
    const pricingGroup = grouped.pricing || [];
    const map: Record<string, string> = {};
    for (const s of pricingGroup) {
      map[s.key] = s.value;
    }
    setTierMapping({
      user: map.pricing_tier_user || 'default',
      reseller: map.pricing_tier_reseller || 'default',
      admin: map.pricing_tier_admin || 'default',
    });
  };

  const updateTierMapping = async (key: 'pricing_tier_user' | 'pricing_tier_reseller' | 'pricing_tier_admin', value: string) => {
    await api.put('/admin/settings', { settings: { [key]: value } });
    await loadTierMapping();
    toast.success('Tier mapping updated');
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([loadTiers(), loadPlanLookups(), loadTierMapping()])
      .catch((e) => toast.error(e.message || 'Failed to initialize pricing'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setLoading(true);
    loadRules(selectedTierId)
      .catch((e) => toast.error(e.message || 'Failed to load rules'))
      .finally(() => setLoading(false));
  }, [selectedTierId]);

  const createTier = async () => {
    const name = window.prompt('Tier name (e.g. default, reseller, promo)');
    if (!name) return;
    const res = await api.post('/admin/pricing/tiers', { name });
    if (!res.data?.success) throw new Error('Failed to create tier');
    await loadTiers();
    toast.success('Tier created');
  };

  const submitRule = async () => {
    if (!selectedTierId) {
      toast.error('Select a tier');
      return;
    }

    const payload: any = {
      tierId: selectedTierId,
      product_type: form.product_type,
      provider: form.provider || null,
      fixed_price: toNumberOrNull(form.fixed_price),
      base_price: toNumberOrNull(form.base_price),
      markup_percent: toNumberOrNull(form.markup_percent),
      discount_percent: toNumberOrNull(form.discount_percent),
      min_price: toNumberOrNull(form.min_price),
      max_price: toNumberOrNull(form.max_price),
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      is_active: form.is_active,
    };

    if (form.product_type === 'data') payload.dataPlanId = form.dataPlanId || null;
    if (form.product_type === 'subscription') payload.subscriptionPlanId = form.subscriptionPlanId || null;

    const res = await api.post('/admin/pricing/rules', payload);
    if (!res.data?.success) throw new Error(res.data?.message || 'Failed to create rule');

    setForm({
      product_type: form.product_type,
      provider: form.provider,
      dataPlanId: '',
      subscriptionPlanId: '',
      fixed_price: '',
      base_price: '',
      markup_percent: '',
      discount_percent: '',
      min_price: '',
      max_price: '',
      starts_at: '',
      ends_at: '',
      is_active: true,
    });

    await loadRules(selectedTierId);
    toast.success('Rule created');
  };

  const toggleRule = async (rule: Rule) => {
    const res = await api.put(`/admin/pricing/rules/${rule.id}`, { is_active: !rule.is_active });
    if (!res.data?.success) throw new Error('Failed to update rule');
    await loadRules(selectedTierId);
  };

  const deleteRule = async (rule: Rule) => {
    const ok = window.confirm('Disable this rule?');
    if (!ok) return;
    const res = await api.delete(`/admin/pricing/rules/${rule.id}`);
    if (!res.data?.success) throw new Error('Failed to delete rule');
    await loadRules(selectedTierId);
    toast.success('Rule disabled');
  };

  const rulesForSelectedTier = rules.filter((r) => r.tierId === selectedTierId);

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pricing Management</h1>
          <p className="text-gray-600 text-sm">Configure tiered pricing rules applied across airtime, data, and subscriptions.</p>
        </div>
        <button
          onClick={createTier}
          className="px-4 py-2 rounded-lg bg-primary-600 text-white font-semibold hover:bg-primary-700"
          disabled={loading}
        >
          New Tier
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-gray-900">Tiers</h2>
          </div>
          <div className="mb-4 space-y-3">
            <div>
              <div className="text-xs font-semibold text-gray-600">Default Tier (Users)</div>
              <select
                value={tierMapping.user}
                onChange={(e) => updateTierMapping('pricing_tier_user', e.target.value).catch((err) => toast.error(err.message || 'Failed'))}
                className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg"
              >
                {tiers.map((t) => (
                  <option key={t.id} value={t.name}>{t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-600">Default Tier (Resellers)</div>
              <select
                value={tierMapping.reseller}
                onChange={(e) => updateTierMapping('pricing_tier_reseller', e.target.value).catch((err) => toast.error(err.message || 'Failed'))}
                className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg"
              >
                {tiers.map((t) => (
                  <option key={t.id} value={t.name}>{t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-600">Default Tier (Admins)</div>
              <select
                value={tierMapping.admin}
                onChange={(e) => updateTierMapping('pricing_tier_admin', e.target.value).catch((err) => toast.error(err.message || 'Failed'))}
                className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg"
              >
                {tiers.map((t) => (
                  <option key={t.id} value={t.name}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            {tiers.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedTierId(t.id)}
                className={`w-full text-left px-3 py-2 rounded-lg border ${
                  selectedTierId === t.id ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-900">{t.name}</span>
                  <span className={`text-xs font-bold ${t.is_active ? 'text-green-600' : 'text-gray-400'}`}>
                    {t.is_active ? 'ACTIVE' : 'INACTIVE'}
                  </span>
                </div>
                <div className="text-xs text-gray-500">Priority: {t.priority}</div>
              </button>
            ))}
            {tiers.length === 0 && <div className="text-sm text-gray-400">No tiers yet.</div>}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-bold text-gray-900">Rules</h2>
              <p className="text-xs text-gray-500">Tier: {selectedTier?.name || '—'}</p>
            </div>
            <div className="text-xs text-gray-500">{rulesForSelectedTier.length} rules</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div>
              <label className="text-xs font-semibold text-gray-600">Product</label>
              <select
                value={form.product_type}
                onChange={(e) => setForm((f) => ({ ...f, product_type: e.target.value as any, dataPlanId: '', subscriptionPlanId: '' }))}
                className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg"
              >
                <option value="airtime">Airtime</option>
                <option value="data">Data</option>
                <option value="subscription">Subscription</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-600">Network (optional)</label>
              <select
                value={form.provider || ''}
                onChange={(e) => setForm((f) => ({ ...f, provider: (e.target.value as any) || '' }))}
                className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg"
              >
                <option value="">Any</option>
                {NETWORKS.map((n) => (
                  <option key={n} value={n}>{n.toUpperCase()}</option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                />
                Active
              </label>
            </div>

            {form.product_type === 'data' && (
              <div className="md:col-span-3">
                <label className="text-xs font-semibold text-gray-600">Target Data Plan (optional)</label>
                <select
                  value={form.dataPlanId}
                  onChange={(e) => setForm((f) => ({ ...f, dataPlanId: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg"
                >
                  <option value="">Any plan</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>{p.provider.toUpperCase()} - {p.name} (admin ₦{p.admin_price})</option>
                  ))}
                </select>
              </div>
            )}

            {form.product_type === 'subscription' && (
              <div className="md:col-span-3">
                <label className="text-xs font-semibold text-gray-600">Target Subscription Plan (optional)</label>
                <select
                  value={form.subscriptionPlanId}
                  onChange={(e) => setForm((f) => ({ ...f, subscriptionPlanId: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg"
                >
                  <option value="">Any subscription</option>
                  {subPlans.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} (₦{p.price})</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-gray-600">Fixed Price (₦)</label>
              <input
                value={form.fixed_price}
                onChange={(e) => setForm((f) => ({ ...f, fixed_price: e.target.value }))}
                className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg"
                placeholder="e.g. 99"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600">Markup (%)</label>
              <input
                value={form.markup_percent}
                onChange={(e) => setForm((f) => ({ ...f, markup_percent: e.target.value }))}
                className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg"
                placeholder="e.g. 2.5"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600">Discount (%)</label>
              <input
                value={form.discount_percent}
                onChange={(e) => setForm((f) => ({ ...f, discount_percent: e.target.value }))}
                className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg"
                placeholder="e.g. 1"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600">Min Price (₦)</label>
              <input
                value={form.min_price}
                onChange={(e) => setForm((f) => ({ ...f, min_price: e.target.value }))}
                className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600">Max Price (₦)</label>
              <input
                value={form.max_price}
                onChange={(e) => setForm((f) => ({ ...f, max_price: e.target.value }))}
                className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600">Base Price Override (₦)</label>
              <input
                value={form.base_price}
                onChange={(e) => setForm((f) => ({ ...f, base_price: e.target.value }))}
                className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600">Starts At</label>
              <input
                type="datetime-local"
                value={form.starts_at}
                onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))}
                className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600">Ends At</label>
              <input
                type="datetime-local"
                value={form.ends_at}
                onChange={(e) => setForm((f) => ({ ...f, ends_at: e.target.value }))}
                className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg"
              />
            </div>
          </div>

          <div className="flex justify-end mb-6">
            <button
              onClick={() => submitRule().catch((e) => toast.error(e.message || 'Failed to create rule'))}
              className="px-4 py-2 rounded-lg bg-primary-600 text-white font-semibold hover:bg-primary-700"
              disabled={loading || !selectedTierId}
            >
              Add Rule
            </button>
          </div>

          <div className="overflow-x-auto border border-gray-100 rounded-xl">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Scope</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Pricing</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Window</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {rulesForSelectedTier.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-4 text-sm text-gray-800">
                      <div className="font-semibold">{r.product_type}</div>
                      <div className="text-xs text-gray-500">
                        {r.provider ? r.provider.toUpperCase() : 'Any'}
                        {r.dataPlanId ? ` · plan` : ''}
                        {r.subscriptionPlanId ? ` · subscription` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-800">
                      <div className="text-xs text-gray-600">
                        fixed: {r.fixed_price ?? '—'} · base: {r.base_price ?? '—'}
                      </div>
                      <div className="text-xs text-gray-600">
                        markup: {r.markup_percent ?? '—'}% · discount: {r.discount_percent ?? '—'}%
                      </div>
                      <div className="text-xs text-gray-600">
                        min: {r.min_price ?? '—'} · max: {r.max_price ?? '—'}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-xs text-gray-600">
                      <div>{r.starts_at ? new Date(r.starts_at).toLocaleString() : '—'}</div>
                      <div>{r.ends_at ? new Date(r.ends_at).toLocaleString() : '—'}</div>
                    </td>
                    <td className="px-4 py-4 text-xs font-bold">
                      <span className={r.is_active ? 'text-green-600' : 'text-gray-400'}>
                        {r.is_active ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right space-x-2">
                      <button
                        onClick={() => toggleRule(r).catch((e) => toast.error(e.message || 'Failed'))}
                        className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-semibold hover:bg-gray-50"
                      >
                        {r.is_active ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        onClick={() => deleteRule(r).catch((e) => toast.error(e.message || 'Failed'))}
                        className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-semibold text-red-600 hover:bg-red-50"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
                {rulesForSelectedTier.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-400">
                      No rules for this tier.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
