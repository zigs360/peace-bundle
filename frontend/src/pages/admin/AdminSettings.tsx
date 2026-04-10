import { useState, useEffect } from 'react';
import api from '../../services/api';
import { Save, Settings as SettingsIcon } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function AdminSettings() {
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [maskedKeys, setMaskedKeys] = useState<Record<string, true>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await api.get('/admin/settings');
      const grouped = res?.data?.settings;
      const next: Record<string, any> = {};
      const nextMasked: Record<string, true> = {};

      if (grouped && typeof grouped === 'object') {
        for (const groupKey of Object.keys(grouped)) {
          const list = grouped[groupKey];
          if (!Array.isArray(list)) continue;
          for (const item of list) {
            const key = item?.key;
            if (typeof key !== 'string' || !key) continue;
            const value = item?.value;
            if (value === '********') {
              next[key] = '';
              nextMasked[key] = true;
            } else {
              next[key] = value;
            }
          }
        }
      }

      setSettings(next);
      setMaskedKeys(nextMasked);
    } catch (err) {
      console.error('Failed to fetch settings', err);
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (key: string, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: Record<string, any> = {};
      for (const key of Object.keys(settings)) {
        const value = settings[key];
        if (maskedKeys[key] && (value === '' || value === undefined || value === null)) {
          continue;
        }
        payload[key] = value;
      }
      await api.put('/admin/settings', { settings: payload });
      toast.success('Settings updated successfully');
    } catch (err) {
      console.error('Failed to update settings', err);
      toast.error('Failed to update settings');
    }
  };

  if (loading) return <div className="p-6">Loading...</div>;

  return (
    <div className="p-6">
      <div className="flex items-center mb-6">
        <SettingsIcon className="w-6 h-6 text-gray-700 mr-2" />
        <h1 className="text-2xl font-bold text-gray-800">System Settings</h1>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          
          <div className="border-b pb-4">
            <h2 className="text-lg font-medium text-gray-900 mb-4">General Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Site Name</label>
                <input
                  type="text"
                  className="mt-1 block w-full border rounded-md px-3 py-2"
                  value={settings['site_name'] || ''}
                  onChange={(e) => handleChange('site_name', e.target.value)}
                  placeholder="Peace Bundlle"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Currency Symbol</label>
                <input
                  type="text"
                  className="mt-1 block w-full border rounded-md px-3 py-2"
                  value={settings['currency_symbol'] || ''}
                  onChange={(e) => handleChange('currency_symbol', e.target.value)}
                  placeholder="₦"
                />
              </div>
            </div>
          </div>

          <div className="border-b pb-4">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Virtual Account</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Virtual Account Provider</label>
                <select
                  className="mt-1 block w-full border rounded-md px-3 py-2 bg-white"
                  value={settings['virtual_account_provider'] || 'billstack'}
                  onChange={(e) => handleChange('virtual_account_provider', e.target.value)}
                >
                  <option value="billstack">BillStack (No BVN required)</option>
                  <option value="payvessel">PayVessel (May require BVN)</option>
                </select>
              </div>
              <div className="flex items-center gap-3 mt-6">
                <input
                  id="virtual_account_generation_enabled"
                  type="checkbox"
                  className="h-4 w-4"
                  checked={Boolean(settings['virtual_account_generation_enabled'] ?? true)}
                  onChange={(e) => handleChange('virtual_account_generation_enabled', e.target.checked)}
                />
                <label htmlFor="virtual_account_generation_enabled" className="text-sm font-medium text-gray-700">
                  Enable virtual account generation
                </label>
              </div>
            </div>
          </div>

          <div className="border-b pb-4">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Contact Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Support Email</label>
                <input
                  type="email"
                  className="mt-1 block w-full border rounded-md px-3 py-2"
                  value={settings['support_email'] || ''}
                  onChange={(e) => handleChange('support_email', e.target.value)}
                  placeholder="support@peacebundlle.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Support Phone</label>
                <input
                  type="text"
                  className="mt-1 block w-full border rounded-md px-3 py-2"
                  value={settings['support_phone'] || ''}
                  onChange={(e) => handleChange('support_phone', e.target.value)}
                  placeholder="+234..."
                />
              </div>
            </div>
          </div>

          <div className="border-b pb-4">
            <h2 className="text-lg font-medium text-gray-900 mb-4">API Configuration (Sensitive)</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Paystack Secret Key</label>
                <input
                  type="password"
                  className="mt-1 block w-full border rounded-md px-3 py-2"
                  value={settings['paystack_secret_key'] || ''}
                  onChange={(e) => handleChange('paystack_secret_key', e.target.value)}
                  placeholder={maskedKeys['paystack_secret_key'] ? '********' : ''}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Monnify API Key</label>
                <input
                  type="password"
                  className="mt-1 block w-full border rounded-md px-3 py-2"
                  value={settings['monnify_api_key'] || ''}
                  onChange={(e) => handleChange('monnify_api_key', e.target.value)}
                  placeholder={maskedKeys['monnify_api_key'] ? '********' : ''}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">SmePlug API Key</label>
                <input
                  type="password"
                  className="mt-1 block w-full border rounded-md px-3 py-2"
                  value={settings['smeplug_api_key'] || ''}
                  onChange={(e) => handleChange('smeplug_api_key', e.target.value)}
                  placeholder={maskedKeys['smeplug_api_key'] ? '********' : ''}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Payvessel API Key</label>
                <input
                  type="password"
                  className="mt-1 block w-full border rounded-md px-3 py-2"
                  value={settings['payvessel_api_key'] || ''}
                  onChange={(e) => handleChange('payvessel_api_key', e.target.value)}
                  placeholder={maskedKeys['payvessel_api_key'] ? '********' : ''}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Payvessel Secret Key</label>
                <input
                  type="password"
                  className="mt-1 block w-full border rounded-md px-3 py-2"
                  value={settings['payvessel_secret_key'] || ''}
                  onChange={(e) => handleChange('payvessel_secret_key', e.target.value)}
                  placeholder={maskedKeys['payvessel_secret_key'] ? '********' : ''}
                />
              </div>
            </div>
          </div>

          <div className="border-b pb-4">
            <h2 className="text-lg font-medium text-gray-900 mb-2">Treasury / Settlement Account</h2>
            <p className="text-sm text-gray-500 mb-4">
              Required for admin revenue cashout. Set these values before using Treasury Withdraw.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Settlement Bank Code</label>
                <input
                  type="text"
                  className="mt-1 block w-full border rounded-md px-3 py-2"
                  value={settings['settlement_bank_code'] || ''}
                  onChange={(e) => handleChange('settlement_bank_code', e.target.value)}
                  placeholder="e.g. PALMPAY"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Settlement Bank Name</label>
                <input
                  type="text"
                  className="mt-1 block w-full border rounded-md px-3 py-2"
                  value={settings['settlement_bank_name'] || ''}
                  onChange={(e) => handleChange('settlement_bank_name', e.target.value)}
                  placeholder="e.g. PalmPay"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Settlement Account Number</label>
                <input
                  type="text"
                  className="mt-1 block w-full border rounded-md px-3 py-2"
                  value={settings['settlement_account_number'] || ''}
                  onChange={(e) => handleChange('settlement_account_number', e.target.value)}
                  placeholder="10-digit account number"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Settlement Account Name</label>
                <input
                  type="text"
                  className="mt-1 block w-full border rounded-md px-3 py-2"
                  value={settings['settlement_account_name'] || ''}
                  onChange={(e) => handleChange('settlement_account_name', e.target.value)}
                  placeholder="Account name"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
            >
              <Save className="w-5 h-5 mr-2" />
              Save Settings
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
