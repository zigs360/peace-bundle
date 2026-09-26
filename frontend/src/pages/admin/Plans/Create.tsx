import { useState, useEffect } from 'react';
import SelectProvider from '../../../components/Forms/SelectProvider';
import api from '../../../services/api';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

interface ProviderOption {
  slug: string;
  name: string;
  is_primary?: boolean;
}

const COMMON_SIZES = [
  { label: '500 MB', size: '500MB', mb: 500 },
  { label: '1 GB', size: '1GB', mb: 1024 },
  { label: '2 GB', size: '2GB', mb: 2048 },
  { label: '3 GB', size: '3GB', mb: 3072 },
  { label: '5 GB', size: '5GB', mb: 5120 },
  { label: '10 GB', size: '10GB', mb: 10240 },
];

function sizeToMb(val: string): number | null {
  const match = val.trim().match(/^(\d+(?:\.\d+)?)\s*(GB|MB|TB)?$/i);
  if (!match) return null;
  const num = parseFloat(match[1]);
  const unit = (match[2] || 'MB').toUpperCase();
  if (unit === 'TB') return Math.round(num * 1024 * 1024);
  if (unit === 'GB') return Math.round(num * 1024);
  return Math.round(num);
}

function mbToSize(mb: number): string {
  if (!mb || mb <= 0) return '';
  if (mb >= 1024 && mb % 1024 === 0) return `${mb / 1024}GB`;
  if (mb >= 1024) return `${Number((mb / 1024).toFixed(2))}GB`;
  return `${mb}MB`;
}

export default function CreatePlan() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [availableProviders, setAvailableProviders] = useState<ProviderOption[]>([
    { slug: 'smeplug', name: 'SMEPlug' },
    { slug: 'ogdams', name: 'OGDams' },
    { slug: 'quicklysim', name: 'QuicklySIM' },
  ]);

  const [formData, setFormData] = useState({
    source: 'smeplug',
    provider: 'mtn',
    category: 'gifting',
    name: '',
    plan_id: '',
    original_price: '',
    your_price: '',
    wallet_price: '',
    data_size: '',
    size_mb: '',
    validity: '30 Days',
    available_sim: true,
    available_wallet: true,
    is_active: true,
  });

  useEffect(() => {
    api.get('/admin/providers')
      .then((res) => {
        if (res.data?.success && Array.isArray(res.data.providers)) {
          const list: ProviderOption[] = res.data.providers.map((p: any) => ({
            slug: p.slug,
            name: p.name,
            is_primary: p.is_primary,
          }));
          if (list.length > 0) {
            setAvailableProviders(list);
            const primary = list.find((p) => p.is_primary);
            if (primary) {
              setFormData((prev) => ({ ...prev, source: primary.slug }));
            }
          }
        }
      })
      .catch((err) => {
        console.warn('Failed to fetch providers for plan creation:', err);
      });
  }, []);

  const handleDataSizeChange = (val: string) => {
    const calculatedMb = sizeToMb(val);
    setFormData((prev) => ({
      ...prev,
      data_size: val,
      size_mb: calculatedMb ? String(calculatedMb) : prev.size_mb,
      name: !prev.name || prev.name.includes('GB') || prev.name.includes('MB')
        ? `${val.toUpperCase()} ${prev.category.replace('_', ' ').toUpperCase()}`
        : prev.name,
    }));
  };

  const handleSizeMbChange = (val: string) => {
    const mbNum = parseInt(val, 10);
    const calculatedSize = mbNum > 0 ? mbToSize(mbNum) : '';
    setFormData((prev) => ({
      ...prev,
      size_mb: val,
      data_size: calculatedSize || prev.data_size,
      name: calculatedSize && (!prev.name || prev.name.includes('GB') || prev.name.includes('MB'))
        ? `${calculatedSize} ${prev.category.replace('_', ' ').toUpperCase()}`
        : prev.name,
    }));
  };

  const applyPresetSize = (preset: { size: string; mb: number }) => {
    setFormData((prev) => ({
      ...prev,
      data_size: preset.size,
      size_mb: String(preset.mb),
      name: !prev.name || prev.name.includes('GB') || prev.name.includes('MB')
        ? `${preset.size} ${prev.category.replace('_', ' ').toUpperCase()}`
        : prev.name,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    const parsedMb = parseInt(formData.size_mb, 10) || (sizeToMb(formData.data_size) ?? 1024);
    const effectiveSize = formData.data_size.trim() || mbToSize(parsedMb) || '1GB';
    const effectiveName = formData.name.trim() || `${effectiveSize} ${formData.category.replace('_', ' ').toUpperCase()}`;

    try {
      await api.post('/admin/plans', {
        ...formData,
        name: effectiveName,
        size: effectiveSize,
        data_size: effectiveSize,
        size_mb: parsedMb,
      });
      navigate('/admin/plans');
    } catch (error: any) {
      console.error('Failed to create plan', error);
      const msg = error.response?.data?.message || 'Failed to create plan';
      setErrorMessage(msg);
      alert(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto bg-white shadow rounded-lg p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-6">Create New Data Plan</h2>

      {errorMessage && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-md">
          {errorMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-700">API Provider / Source</label>
            <span className="text-xs text-primary-600 font-medium">Auto-routes to this provider</span>
          </div>
          <select
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm p-2 border"
            value={formData.source}
            onChange={(e) => setFormData({ ...formData, source: e.target.value })}
          >
            {availableProviders.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name} {p.is_primary ? '★ (Primary Active)' : ''}
              </option>
            ))}
          </select>
        </div>

        <SelectProvider
          value={formData.provider}
          onChange={(val) => setFormData({ ...formData, provider: val })}
        />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Category</label>
            <select
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm p-2 border"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            >
              <option value="sme">SME</option>
              <option value="corporate_gifting">Corporate Gifting</option>
              <option value="awoof">Awoof</option>
              <option value="gifting">Gifting</option>
              <option value="data_share">Data Share</option>
              <option value="data_coupons">Data Coupons</option>
              <option value="social">Social</option>
              <option value="night">Night</option>
              <option value="broadband">Broadband</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Plan ID / API Code</label>
            <input
              type="text"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm p-2 border"
              value={formData.plan_id}
              onChange={(e) => setFormData({ ...formData, plan_id: e.target.value })}
              placeholder="e.g. 20002"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Plan Name</label>
          <input
            type="text"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm p-2 border"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g. 1GB SME Data"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Quick Select Size Preset</label>
          <div className="flex flex-wrap gap-2">
            {COMMON_SIZES.map((preset) => (
              <button
                key={preset.size}
                type="button"
                onClick={() => applyPresetSize(preset)}
                className={`px-3 py-1 text-xs font-medium rounded-md border transition-colors ${
                  formData.data_size === preset.size
                    ? 'bg-primary-50 border-primary-500 text-primary-700'
                    : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Data Size (e.g. 1GB)</label>
            <input
              type="text"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm p-2 border"
              value={formData.data_size}
              onChange={(e) => handleDataSizeChange(e.target.value)}
              placeholder="e.g. 1GB, 500MB"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Size (MB)</label>
            <input
              type="number"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm p-2 border"
              value={formData.size_mb}
              onChange={(e) => handleSizeMbChange(e.target.value)}
              placeholder="e.g. 1024, 2048"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Network Price (₦)</label>
            <input
              type="number"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm p-2 border"
              value={formData.original_price}
              onChange={(e) => setFormData({ ...formData, original_price: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Your Price (₦)</label>
            <input
              type="number"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm p-2 border"
              value={formData.your_price}
              onChange={(e) => setFormData({ ...formData, your_price: e.target.value })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Wallet Price (₦)</label>
            <input
              type="number"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm p-2 border"
              value={formData.wallet_price}
              onChange={(e) => setFormData({ ...formData, wallet_price: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Validity</label>
            <input
              type="text"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm p-2 border"
              value={formData.validity}
              onChange={(e) => setFormData({ ...formData, validity: e.target.value })}
            />
          </div>
        </div>

        <div className="rounded-md bg-gray-50 p-4 border border-gray-200">
          <span className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Availability & Status</span>
          <div className="grid grid-cols-3 gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-700 font-medium">
              <input
                type="checkbox"
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 h-4 w-4"
                checked={formData.available_sim}
                onChange={(e) => setFormData({ ...formData, available_sim: e.target.checked })}
              />
              Available on SIM
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 font-medium">
              <input
                type="checkbox"
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 h-4 w-4"
                checked={formData.available_wallet}
                onChange={(e) => setFormData({ ...formData, available_wallet: e.target.checked })}
              />
              Available on Wallet
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 font-medium">
              <input
                type="checkbox"
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 h-4 w-4"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              />
              Plan Active
            </label>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Create Plan'}
        </button>
      </form>
    </div>
  );
}
