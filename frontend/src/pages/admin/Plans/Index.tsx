import { useEffect, useMemo, useState } from 'react';
import api from '../../../services/api';
import { Download, Eye, Plus, Save, Search, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

type Plan = {
  id: number;
  source: string;
  network: string;
  provider: string;
  network_display_name?: string;
  service_name?: string;
  service_slug?: string;
  category_name?: string;
  category_slug?: string;
  subcategory_name?: string;
  subcategory_slug?: string;
  name: string;
  plan_id: string;
  validity: string;
  data_size: string;
  original_price: number;
  your_price: number;
  wallet_price: number;
  available_sim: boolean;
  available_wallet: boolean;
  is_active: boolean;
  last_updated_by?: string | null;
};

type PlanFilters = {
  source: string;
  network: string;
  service: string;
  category_slug: string;
  subcategory_slug: string;
  status: string;
  search: string;
};

type BulkOperation = 'set_fixed_price' | 'increase_percentage' | 'decrease_percentage' | 'set_wallet_price' | 'toggle_active';

const EMPTY_FILTERS: PlanFilters = {
  source: '',
  network: '',
  service: '',
  category_slug: '',
  subcategory_slug: '',
  status: '',
  search: '',
};

function money(value: number | string | null | undefined) {
  const parsed = Number(value || 0);
  return `₦${parsed.toLocaleString()}`;
}

export default function PlansIndex() {
  const { t } = useTranslation();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingIds, setSavingIds] = useState<number[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Partial<Plan>>>({});
  const [filters, setFilters] = useState<PlanFilters>(EMPTY_FILTERS);
  const [filterOptions, setFilterOptions] = useState<{
    sources: string[];
    networks: string[];
    services: string[];
    category_slugs: string[];
    subcategory_slugs: string[];
  }>({ sources: [], networks: [], services: [], category_slugs: [], subcategory_slugs: [] });
  const [summary, setSummary] = useState<any>(null);
  const [recentUpdates, setRecentUpdates] = useState<any[]>([]);
  const [cheapestPlans, setCheapestPlans] = useState<Record<string, Plan[]>>({});
  const [bulkOperation, setBulkOperation] = useState<BulkOperation>('increase_percentage');
  const [bulkField, setBulkField] = useState<'your_price' | 'wallet_price'>('your_price');
  const [bulkValue, setBulkValue] = useState('');
  const [bulkReason, setBulkReason] = useState('');
  const [bulkStatus, setBulkStatus] = useState<'active' | 'inactive'>('active');
  const [bulkPreview, setBulkPreview] = useState<any[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [modalState, setModalState] = useState<Partial<Plan> & { reason?: string }>({});
  const [showImportModal, setShowImportModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importSource, setImportSource] = useState('');
  const [importNetwork, setImportNetwork] = useState('');
  const [importDryRun, setImportDryRun] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);

  useEffect(() => {
    void Promise.all([fetchPlans(), fetchSidebarData(), fetchFilters()]);
  }, []);

  const fetchPlans = async (nextFilters: PlanFilters = filters) => {
    setLoading(true);
    try {
      const res = await api.get('/admin/plans', { params: { ...nextFilters, limit: 200 } });
      setPlans((res.data?.items || []) as Plan[]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSidebarData = async () => {
    try {
      const [summaryRes, updatesRes, cheapestRes] = await Promise.all([
        api.get('/admin/stats/summary'),
        api.get('/admin/stats/recent-updates'),
        api.get('/admin/stats/cheapest-plans'),
      ]);
      setSummary(summaryRes.data);
      setRecentUpdates(updatesRes.data?.items || []);
      setCheapestPlans(cheapestRes.data?.items || {});
    } catch (err) {
      console.error(err);
    }
  };

  const fetchFilters = async () => {
    try {
      const res = await api.get('/admin/plans/filters');
      setFilterOptions({
        sources: res.data?.sources || [],
        networks: res.data?.networks || [],
        services: res.data?.service_slugs || [],
        category_slugs: res.data?.category_slugs || [],
        subcategory_slugs: res.data?.subcategory_slugs || [],
      });
    } catch (err) {
      console.error(err);
    }
  };

  const visibleSelectedCount = useMemo(() => plans.filter((plan) => selectedIds.includes(plan.id)).length, [plans, selectedIds]);

  const updateDraft = (planId: number, updates: Partial<Plan>) => {
    setDrafts((prev) => ({
      ...prev,
      [planId]: {
        ...(prev[planId] || {}),
        ...updates,
      },
    }));
  };

  const getPlanValue = <K extends keyof Plan>(plan: Plan, key: K) => {
    const draft = drafts[plan.id] as Partial<Plan> | undefined;
    return (draft?.[key] ?? plan[key]) as Plan[K];
  };

  const savePlan = async (plan: Plan, extraUpdates: Partial<Plan> = {}, reason = '') => {
    const payload = {
      ...(drafts[plan.id] || {}),
      ...extraUpdates,
      reason,
    };
    setSavingIds((prev) => [...prev, plan.id]);
    try {
      const res = await api.put(`/admin/plans/${plan.id}`, payload);
      const updated = res.data?.item as Plan;
      setPlans((prev) => prev.map((item) => (item.id === plan.id ? updated : item)));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[plan.id];
        return next;
      });
      setSelectedPlan(null);
      setModalState({});
      await fetchSidebarData();
    } catch (err) {
      console.error(err);
      alert(t('admin.savePlanChangesFailed'));
    } finally {
      setSavingIds((prev) => prev.filter((id) => id !== plan.id));
    }
  };

  const applyFilters = async () => {
    await fetchPlans(filters);
  };

  const exportCsv = async () => {
    try {
      const res = await api.get('/admin/plans/export', {
        params: filters,
        responseType: 'blob',
      });
      const href = URL.createObjectURL(res.data);
      const link = document.createElement('a');
      link.href = href;
      link.download = 'plans-export.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(href);
    } catch (err) {
      console.error(err);
      alert(t('admin.exportCsvFailed'));
    }
  };

  const submitImport = async () => {
    if (!importFile) {
      alert(t('admin.selectImportFile'));
      return;
    }

    const formData = new FormData();
    formData.append('file', importFile);
    if (importSource) formData.append('source', importSource);
    if (importNetwork) formData.append('network', importNetwork);
    formData.append('dryRun', String(importDryRun));

    setImporting(true);
    try {
      const res = await api.post('/admin/plans/import', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      setImportResult(res.data);
      if (!importDryRun) {
        await fetchPlans(filters);
        await fetchSidebarData();
      }
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.message || t('admin.importPlansFailed'));
    } finally {
      setImporting(false);
    }
  };

  const runBulkUpdate = async (previewOnly: boolean) => {
    try {
      const payload: any = {
        ids: selectedIds.length ? selectedIds : undefined,
        filters: selectedIds.length ? undefined : filters,
        operation: bulkOperation,
        field: bulkField,
        value: bulkValue,
        reason: bulkReason,
        preview: previewOnly,
        is_active: bulkStatus === 'active',
      };
      const res = await api.post('/admin/plans/bulk-update', payload);
      if (previewOnly) {
        setBulkPreview(res.data?.items || []);
        return;
      }
      setBulkPreview([]);
      setSelectedIds([]);
      await fetchPlans(filters);
      await fetchSidebarData();
      alert(res.data?.message || t('admin.bulkUpdateApplied'));
    } catch (err) {
      console.error(err);
      alert(t('admin.bulkUpdateFailed'));
    }
  };

  const openModal = (plan: Plan) => {
    setSelectedPlan(plan);
    setModalState({
      ...plan,
      reason: '',
    });
  };

  const allVisibleSelected = plans.length > 0 && plans.every((plan) => selectedIds.includes(plan.id));

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('admin.plansManagementTitle')}</h1>
          <p className="text-sm text-gray-600">{t('admin.plansManagementDescription')}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link to="/admin/audit/price-history" className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">
            {t('admin.priceHistory')}
          </Link>
          <button onClick={() => setShowImportModal(true)} className="flex items-center px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">
            <Upload className="w-4 h-4 mr-2" />
            {t('admin.importCsv')}
          </button>
          <button onClick={exportCsv} className="flex items-center px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">
            <Download className="w-4 h-4 mr-2" />
            {t('admin.exportCsv')}
          </button>
          <Link to="/admin/plans/create" className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
            <Plus className="w-4 h-4 mr-2" />
            {t('admin.addPlan')}
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title={t('admin.totalPlans')} value={summary?.totalPlans || 0} />
        <StatCard title={t('admin.activePlansLabel')} value={summary?.activePlans || 0} />
        <StatCard title={t('admin.zeroPriceInactive')} value={summary?.zeroPricePlans || 0} />
        <StatCard title={t('admin.latestUpdates')} value={recentUpdates.length} />
      </div>

      <div className="bg-white rounded-lg shadow border border-gray-100 p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <label className="space-y-1">
            <span className="text-xs font-medium text-gray-500">{t('admin.filterSource')}</span>
            <select
              value={filters.source}
              onChange={(e) => setFilters((prev) => ({ ...prev, source: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            >
              <option value="">{t('common.all')}</option>
              {filterOptions.sources.map((source) => (
                <option key={source} value={source}>{source.toUpperCase()}</option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-gray-500">{t('admin.filterNetwork')}</span>
            <select
              value={filters.network}
              onChange={(e) => setFilters((prev) => ({ ...prev, network: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            >
              <option value="">{t('common.all')}</option>
              {filterOptions.networks.map((network) => (
                <option key={network} value={network}>{network.toUpperCase()}</option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-gray-500">{t('admin.filterStatus')}</span>
            <select
              value={filters.status}
              onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            >
              <option value="">{t('common.all')}</option>
              <option value="active">{t('common.active')}</option>
              <option value="inactive">{t('common.inactive')}</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-gray-500">{t('admin.filterService')}</span>
            <select
              value={filters.service}
              onChange={(e) => setFilters((prev) => ({ ...prev, service: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            >
              <option value="">{t('common.all')}</option>
              {filterOptions.services.map((service) => (
                <option key={service} value={service}>{service}</option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-gray-500">{t('admin.filterCategory')}</span>
            <select
              value={filters.category_slug}
              onChange={(e) => setFilters((prev) => ({ ...prev, category_slug: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            >
              <option value="">{t('common.all')}</option>
              {filterOptions.category_slugs.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-gray-500">{t('admin.filterSubcategory')}</span>
            <select
              value={filters.subcategory_slug}
              onChange={(e) => setFilters((prev) => ({ ...prev, subcategory_slug: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            >
              <option value="">{t('common.all')}</option>
              {filterOptions.subcategory_slugs.map((subcategory) => (
                <option key={subcategory} value={subcategory}>{subcategory}</option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-gray-500">{t('admin.filterSearch')}</span>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
              <input
                value={filters.search}
                onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                placeholder={t('admin.planSearchPlaceholder')}
                className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2"
              />
            </div>
          </label>
        </div>

        <div className="flex gap-3">
          <button onClick={applyFilters} className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">{t('admin.applyFilters')}</button>
          <button
            onClick={() => {
              setFilters(EMPTY_FILTERS);
              void fetchPlans(EMPTY_FILTERS);
            }}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            {t('common.reset')}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow border border-gray-100 p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{t('admin.bulkUpdateTitle')}</h2>
            <p className="text-sm text-gray-600">{t('admin.bulkUpdateDescription')}</p>
          </div>
          <div className="text-sm text-gray-600">{t('admin.selectedCount', { count: visibleSelectedCount })}</div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <select value={bulkOperation} onChange={(e) => setBulkOperation(e.target.value as BulkOperation)} className="rounded-lg border border-gray-300 px-3 py-2">
            <option value="set_fixed_price">{t('admin.setFixedPrice')}</option>
            <option value="increase_percentage">{t('admin.increaseByPercentage')}</option>
            <option value="decrease_percentage">{t('admin.decreaseByPercentage')}</option>
            <option value="set_wallet_price">{t('admin.setWalletPrice')}</option>
            <option value="toggle_active">{t('admin.toggleActiveStatus')}</option>
          </select>

          <select value={bulkField} onChange={(e) => setBulkField(e.target.value as 'your_price' | 'wallet_price')} className="rounded-lg border border-gray-300 px-3 py-2">
            <option value="your_price">{t('admin.yourPrice')}</option>
            <option value="wallet_price">{t('admin.walletPrice')}</option>
          </select>

          {bulkOperation === 'toggle_active' ? (
            <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value as 'active' | 'inactive')} className="rounded-lg border border-gray-300 px-3 py-2">
              <option value="active">{t('admin.setActive')}</option>
              <option value="inactive">{t('admin.setInactive')}</option>
            </select>
          ) : (
            <input
              value={bulkValue}
              onChange={(e) => setBulkValue(e.target.value)}
              placeholder={bulkOperation.includes('percentage') ? t('admin.percentage') : t('admin.amount')}
              className="rounded-lg border border-gray-300 px-3 py-2"
            />
          )}

          <input
            value={bulkReason}
            onChange={(e) => setBulkReason(e.target.value)}
            placeholder={t('admin.reasonForChange')}
            className="rounded-lg border border-gray-300 px-3 py-2 md:col-span-2"
          />
        </div>

        <div className="flex gap-3">
          <button onClick={() => void runBulkUpdate(true)} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">{t('common.preview')}</button>
          <button onClick={() => void runBulkUpdate(false)} className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">{t('admin.applyChanges')}</button>
        </div>

        {bulkPreview.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <h3 className="font-semibold text-amber-900 mb-2">{t('common.preview')}</h3>
            <div className="space-y-2 text-sm text-amber-900">
              {bulkPreview.slice(0, 8).map((item) => (
                <div key={`${item.id}-${item.field}`}>{item.name}: {String(item.oldValue)} {'->'} {String(item.newValue)}</div>
              ))}
              {bulkPreview.length > 8 && <div>{t('admin.previewMorePlans', { count: bulkPreview.length - 8 })}</div>}
            </div>
          </div>
        )}
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden border border-gray-100">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={(e) =>
                      setSelectedIds(
                        e.target.checked ? plans.map((plan) => plan.id) : [],
                      )
                    }
                  />
                </th>
                {[t('admin.filterSource'), t('admin.filterNetwork'), t('admin.tablePlanName'), t('admin.tableDataSize'), t('admin.tableValidity'), t('admin.yourPrice'), t('admin.walletPrice'), t('admin.tableSim'), t('admin.tableWallet'), t('admin.filterStatus'), t('admin.tableActions')].map((header) => (
                  <th key={header} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan={12} className="px-6 py-10 text-center text-sm text-gray-500">{t('common.loading')}</td></tr>
              ) : plans.length === 0 ? (
                <tr><td colSpan={12} className="px-6 py-10 text-center text-sm text-gray-500">{t('admin.noPlansFound')}</td></tr>
              ) : plans.map((plan) => {
                const isSaving = savingIds.includes(plan.id);
                return (
                  <tr key={plan.id} className="align-top">
                    <td className="px-3 py-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(plan.id)}
                        onChange={(e) => {
                          setSelectedIds((prev) => e.target.checked ? [...new Set([...prev, plan.id])] : prev.filter((id) => id !== plan.id));
                        }}
                      />
                    </td>
                    <td className="px-4 py-4 text-sm font-medium text-gray-900 uppercase">{plan.source}</td>
                    <td className="px-4 py-4 text-sm text-gray-700 uppercase">{plan.network}</td>
                    <td className="px-4 py-4 text-sm text-gray-700">
                      <div className="font-medium text-gray-900">{plan.name}</div>
                      {plan.category_name && <div className="text-xs text-primary-700">{plan.category_name}</div>}
                      {plan.subcategory_name && <div className="text-xs text-gray-500">{plan.subcategory_name}</div>}
                      <div className="text-xs text-gray-500">{t('admin.planIdLabel')}: {plan.plan_id}</div>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-700">{plan.data_size}</td>
                    <td className="px-4 py-4 text-sm text-gray-700">{plan.validity}</td>
                    <td className="px-4 py-4">
                      <input
                        value={String(getPlanValue(plan, 'your_price') ?? '')}
                        onChange={(e) => updateDraft(plan.id, { your_price: Number(e.target.value) })}
                        className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm"
                      />
                    </td>
                    <td className="px-4 py-4">
                      <input
                        value={String(getPlanValue(plan, 'wallet_price') ?? '')}
                        onChange={(e) => updateDraft(plan.id, { wallet_price: Number(e.target.value) })}
                        className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm"
                      />
                    </td>
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={Boolean(getPlanValue(plan, 'available_sim'))}
                        onChange={(e) => updateDraft(plan.id, { available_sim: e.target.checked })}
                      />
                    </td>
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={Boolean(getPlanValue(plan, 'available_wallet'))}
                        onChange={(e) => updateDraft(plan.id, { available_wallet: e.target.checked })}
                      />
                    </td>
                    <td className="px-4 py-4">
                      <button
                        onClick={() => updateDraft(plan.id, { is_active: !Boolean(getPlanValue(plan, 'is_active')) })}
                        className={`px-2 py-1 rounded-full text-xs ${Boolean(getPlanValue(plan, 'is_active')) ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
                      >
                        {Boolean(getPlanValue(plan, 'is_active')) ? t('common.active') : t('common.inactive')}
                      </button>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => void savePlan(plan)}
                          disabled={isSaving}
                          className="inline-flex items-center px-3 py-1.5 rounded-md bg-primary-600 text-white text-xs hover:bg-primary-700 disabled:opacity-60"
                        >
                          <Save className="w-3 h-3 mr-1" />
                          {t('common.save')}
                        </button>
                        <button onClick={() => openModal(plan)} className="inline-flex items-center px-3 py-1.5 rounded-md border border-gray-300 text-xs text-gray-700 hover:bg-gray-50">
                          <Eye className="w-3 h-3 mr-1" />
                          {t('common.edit')}
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

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow border border-gray-100 p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('admin.recentlyUpdatedPrices')}</h2>
          <div className="space-y-3">
            {recentUpdates.slice(0, 6).map((item) => (
              <div key={item.id} className="text-sm text-gray-700 border-b border-gray-100 pb-3">
                <div className="font-medium">{item.plan?.name || t('admin.planFallback')} ({String(item.plan?.provider || '').toUpperCase()})</div>
                  <div>{item.field_name}: {item.old_price ?? item.old_value ?? '—'} {'->'} {item.new_price ?? item.new_value ?? '—'}</div>
                <div className="text-xs text-gray-500">{item.changed_by}</div>
              </div>
            ))}
            {recentUpdates.length === 0 && <div className="text-sm text-gray-500">{t('admin.noRecentUpdates')}</div>}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow border border-gray-100 p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('admin.topCheapestPlans')}</h2>
          <div className="space-y-4">
            {Object.entries(cheapestPlans).map(([network, items]) => (
              <div key={network}>
                <div className="font-medium text-gray-900 uppercase mb-2">{network}</div>
                <div className="space-y-2">
                  {items.slice(0, 3).map((plan) => (
                    <div key={plan.id} className="flex items-center justify-between text-sm text-gray-700">
                      <span>{plan.name}</span>
                      <span className="font-semibold text-primary-700">{money(plan.your_price)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {selectedPlan && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl p-6 space-y-5">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{t('admin.editPlanTitle', { name: selectedPlan.name })}</h2>
              <p className="text-sm text-gray-600">{selectedPlan.network.toUpperCase()} - {selectedPlan.source.toUpperCase()}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ReadOnlyField label={t('admin.planIdLabel')} value={selectedPlan.plan_id} />
              <ReadOnlyField label={t('admin.networkPrice')} value={money(selectedPlan.original_price)} />
              <EditableField label={t('admin.yourPrice')} value={modalState.your_price ?? selectedPlan.your_price} onChange={(value) => setModalState((prev) => ({ ...prev, your_price: Number(value) }))} />
              <EditableField label={t('admin.walletPrice')} value={modalState.wallet_price ?? selectedPlan.wallet_price} onChange={(value) => setModalState((prev) => ({ ...prev, wallet_price: Number(value) }))} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <CheckboxField label={t('admin.availableOnSim')} checked={Boolean(modalState.available_sim ?? selectedPlan.available_sim)} onChange={(checked) => setModalState((prev) => ({ ...prev, available_sim: checked }))} />
              <CheckboxField label={t('admin.availableOnWallet')} checked={Boolean(modalState.available_wallet ?? selectedPlan.available_wallet)} onChange={(checked) => setModalState((prev) => ({ ...prev, available_wallet: checked }))} />
              <CheckboxField label={t('admin.planActive')} checked={Boolean(modalState.is_active ?? selectedPlan.is_active)} onChange={(checked) => setModalState((prev) => ({ ...prev, is_active: checked }))} />
            </div>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">{t('admin.reasonForChangeLabel')}</span>
              <textarea
                value={modalState.reason || ''}
                onChange={(e) => setModalState((prev) => ({ ...prev, reason: e.target.value }))}
                rows={3}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>

            <div className="flex justify-end gap-3">
              <button onClick={() => { setSelectedPlan(null); setModalState({}); }} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">{t('common.cancel')}</button>
              <button
                onClick={() => void savePlan(selectedPlan, modalState, modalState.reason || '')}
                className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700"
              >
                {t('admin.saveChanges')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl p-6 space-y-5">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{t('admin.importPlansTitle')}</h2>
              <p className="text-sm text-gray-600">{t('admin.importPlansDescription')}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-sm font-medium text-gray-700">{t('admin.sourceOverride')}</span>
                <select value={importSource} onChange={(e) => setImportSource(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2">
                  <option value="">{t('admin.inferFromFile')}</option>
                  <option value="ogdams">OGDams</option>
                  <option value="smeplug">SMEPlug</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">{t('admin.networkOverride')}</span>
                <select value={importNetwork} onChange={(e) => setImportNetwork(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2">
                  <option value="">{t('admin.inferFromFile')}</option>
                  <option value="mtn">MTN</option>
                  <option value="airtel">Airtel</option>
                  <option value="glo">Glo</option>
                </select>
              </label>
            </div>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">{t('admin.planFile')}</span>
              <input
                type="file"
                accept=".csv,.json"
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>

            <label className="flex items-center gap-3 rounded-lg border border-gray-200 px-4 py-3">
              <input type="checkbox" checked={importDryRun} onChange={(e) => setImportDryRun(e.target.checked)} />
              <span className="text-sm font-medium text-gray-700">{t('admin.previewOnly')}</span>
            </label>

            {importResult && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                <div className="font-semibold mb-2">{t('admin.importPlansTitle')}</div>
                <div>{t('common.created')}: {importResult.summary?.created || 0}</div>
                <div>{t('common.updated')}: {importResult.summary?.updated || 0}</div>
                <div>{t('common.skipped')}: {importResult.summary?.skipped || 0}</div>
                {(importResult.sample || []).length > 0 && (
                  <div className="mt-3 space-y-1">
                    {importResult.sample.slice(0, 5).map((item: any, index: number) => (
                      <div key={`${item.plan_id || index}`}>{item.name} ({String(item.provider || '').toUpperCase()})</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setImportResult(null);
                  setImportFile(null);
                  setImportDryRun(false);
                  setImportSource('');
                  setImportNetwork('');
                }}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                {t('common.close')}
              </button>
              <button
                onClick={() => void submitImport()}
                disabled={importing}
                className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-60"
              >
                {importing ? t('admin.importing') : importDryRun ? t('admin.previewImport') : t('admin.importPlansAction')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: number | string }) {
  return (
    <div className="bg-white rounded-lg shadow border border-gray-100 p-5">
      <div className="text-sm text-gray-500">{title}</div>
      <div className="text-2xl font-bold text-gray-900 mt-2">{value}</div>
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-sm font-medium text-gray-700">{label}</div>
      <div className="mt-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900">{value}</div>
    </div>
  );
}

function EditableField({ label, value, onChange }: { label: string; value: number; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <input value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
    </label>
  );
}

function CheckboxField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center gap-3 rounded-lg border border-gray-200 px-4 py-3">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="text-sm font-medium text-gray-700">{label}</span>
    </label>
  );
}
