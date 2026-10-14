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

  const [togglingKey, setTogglingKey] = useState<string | null>(null);

  const handleInstantToggle = async (serviceType: 'data' | 'airtime', network: string, currentVal: boolean) => {
    const key = `service_${serviceType}_${network}`;
    const nextVal = !currentVal;
    setTogglingKey(key);
    try {
      await api.post('/admin/services/toggle', {
        serviceType,
        network,
        enabled: nextVal,
      });
      setSettings(prev => ({ ...prev, [key]: nextVal }));
      toast.success(`${network.toUpperCase()} ${serviceType.toUpperCase()} turned ${nextVal ? 'ON' : 'OFF'}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to toggle service switch');
    } finally {
      setTogglingKey(null);
    }
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
          
          <div className="border-b pb-6 bg-slate-50 p-5 rounded-xl border border-slate-200">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Master Service Switches</h2>
            <p className="text-xs text-gray-500 mb-4">Global kill-switches to enable or disable services system-wide for regular users.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="flex items-center justify-between p-3.5 bg-white border border-slate-200 rounded-lg shadow-sm">
                <div>
                  <label htmlFor="data_purchase_enabled" className="block text-sm font-semibold text-gray-800 cursor-pointer">
                    Enable Data Purchases (Master)
                  </label>
                  <span className="text-xs text-gray-500">Global master toggle for all data sales</span>
                </div>
                <input
                  id="data_purchase_enabled"
                  type="checkbox"
                  className="h-5 w-5 text-primary-600 rounded focus:ring-primary-500 cursor-pointer"
                  checked={Boolean(settings['data_purchase_enabled'] ?? true)}
                  onChange={(e) => handleChange('data_purchase_enabled', e.target.checked)}
                />
              </div>

              <div className="flex items-center justify-between p-3.5 bg-white border border-slate-200 rounded-lg shadow-sm">
                <div>
                  <label htmlFor="airtime_purchase_enabled" className="block text-sm font-semibold text-gray-800 cursor-pointer">
                    Enable Airtime Purchases (Master)
                  </label>
                  <span className="text-xs text-gray-500">Global master toggle for all airtime sales</span>
                </div>
                <input
                  id="airtime_purchase_enabled"
                  type="checkbox"
                  className="h-5 w-5 text-primary-600 rounded focus:ring-primary-500 cursor-pointer"
                  checked={Boolean(settings['airtime_purchase_enabled'] ?? true)}
                  onChange={(e) => handleChange('airtime_purchase_enabled', e.target.checked)}
                />
              </div>
            </div>

            {/* 4 Data Network Switches */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">Data Network Controls (4 Switches)</h3>
                <span className="text-xs text-slate-500">Click switch to toggle network independently</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { net: 'mtn', label: 'MTN Data', bg: 'bg-yellow-50 border-yellow-200 text-yellow-800' },
                  { net: 'airtel', label: 'Airtel Data', bg: 'bg-red-50 border-red-200 text-red-800' },
                  { net: 'glo', label: 'Glo Data', bg: 'bg-green-50 border-green-200 text-green-800' },
                  { net: '9mobile', label: '9mobile Data', bg: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
                ].map(({ net, label, bg }) => {
                  const key = `service_data_${net}`;
                  const isChecked = Boolean(settings[key] ?? true);
                  const isToggling = togglingKey === key;
                  return (
                    <div key={key} className={`p-3.5 rounded-lg border shadow-sm flex flex-col justify-between bg-white border-slate-200`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${bg}`}>{label}</span>
                        <span className={`text-xs font-semibold ${isChecked ? 'text-green-600' : 'text-red-500'}`}>
                          {isChecked ? 'ACTIVE' : 'OFF'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                        <span className="text-xs text-slate-500">Service Status</span>
                        <button
                          type="button"
                          disabled={isToggling}
                          onClick={() => handleInstantToggle('data', net, isChecked)}
                          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            isChecked ? 'bg-primary-600' : 'bg-slate-300'
                          } ${isToggling ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              isChecked ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 4 Airtime Network Switches */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">Airtime Network Controls (4 Switches)</h3>
                <span className="text-xs text-slate-500">Click switch to toggle network independently</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { net: 'mtn', label: 'MTN Airtime', bg: 'bg-yellow-50 border-yellow-200 text-yellow-800' },
                  { net: 'airtel', label: 'Airtel Airtime', bg: 'bg-red-50 border-red-200 text-red-800' },
                  { net: 'glo', label: 'Glo Airtime', bg: 'bg-green-50 border-green-200 text-green-800' },
                  { net: '9mobile', label: '9mobile Airtime', bg: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
                ].map(({ net, label, bg }) => {
                  const key = `service_airtime_${net}`;
                  const isChecked = Boolean(settings[key] ?? true);
                  const isToggling = togglingKey === key;
                  return (
                    <div key={key} className={`p-3.5 rounded-lg border shadow-sm flex flex-col justify-between bg-white border-slate-200`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${bg}`}>{label}</span>
                        <span className={`text-xs font-semibold ${isChecked ? 'text-green-600' : 'text-red-500'}`}>
                          {isChecked ? 'ACTIVE' : 'OFF'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                        <span className="text-xs text-slate-500">Service Status</span>
                        <button
                          type="button"
                          disabled={isToggling}
                          onClick={() => handleInstantToggle('airtime', net, isChecked)}
                          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            isChecked ? 'bg-primary-600' : 'bg-slate-300'
                          } ${isToggling ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              isChecked ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Referral & Referee Program Settings */}
            <div className="mt-6 pt-5 border-t border-slate-200">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 mb-1">Referral Program Qualification & Rewards</h3>
              <p className="text-xs text-slate-500 mb-4">Bonuses are paid strictly after referee's first deposit meeting the qualifying minimum threshold.</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-3.5 border border-slate-200 rounded-lg shadow-sm">
                  <label htmlFor="referral_qualifying_deposit_min" className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Min Qualifying Deposit (₦)
                  </label>
                  <input
                    id="referral_qualifying_deposit_min"
                    type="number"
                    min="0"
                    step="10"
                    className="w-full border rounded-md px-3 py-1.5 text-sm font-semibold"
                    value={settings['referral_qualifying_deposit_min'] ?? '100'}
                    onChange={(e) => handleChange('referral_qualifying_deposit_min', e.target.value)}
                  />
                  <span className="text-[11px] text-slate-400 mt-1 block">Referee must deposit at least this amount</span>
                </div>
                <div className="bg-white p-3.5 border border-slate-200 rounded-lg shadow-sm">
                  <label htmlFor="referrer_signup_bonus_amount" className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Referrer Reward (₦)
                  </label>
                  <input
                    id="referrer_signup_bonus_amount"
                    type="number"
                    min="0"
                    step="5"
                    className="w-full border rounded-md px-3 py-1.5 text-sm font-semibold"
                    value={settings['referrer_signup_bonus_amount'] ?? '100'}
                    onChange={(e) => handleChange('referrer_signup_bonus_amount', e.target.value)}
                  />
                  <span className="text-[11px] text-slate-400 mt-1 block">Bonus credited to referrer's wallet</span>
                </div>
                <div className="bg-white p-3.5 border border-slate-200 rounded-lg shadow-sm">
                  <label htmlFor="referee_signup_bonus_amount" className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Referee Welcome Bonus (₦)
                  </label>
                  <input
                    id="referee_signup_bonus_amount"
                    type="number"
                    min="0"
                    step="5"
                    className="w-full border rounded-md px-3 py-1.5 text-sm font-semibold"
                    value={settings['referee_signup_bonus_amount'] ?? '50'}
                    onChange={(e) => handleChange('referee_signup_bonus_amount', e.target.value)}
                  />
                  <span className="text-[11px] text-slate-400 mt-1 block">Bonus credited to newly registered user</span>
                </div>
              </div>
            </div>
          </div>

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
                  placeholder="Peace Bundle"
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
                <label className="block text-sm font-medium text-gray-700">SmePlug Secret Key (Required for Devices & Wallet)</label>
                <input
                  type="password"
                  className="mt-1 block w-full border rounded-md px-3 py-2"
                  value={settings['smeplug_secret_key'] || ''}
                  onChange={(e) => handleChange('smeplug_secret_key', e.target.value)}
                  placeholder={maskedKeys['smeplug_secret_key'] ? '********' : 'sk_live_...'}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">SmePlug Private Key</label>
                <input
                  type="password"
                  className="mt-1 block w-full border rounded-md px-3 py-2"
                  value={settings['smeplug_private_key'] || ''}
                  onChange={(e) => handleChange('smeplug_private_key', e.target.value)}
                  placeholder={maskedKeys['smeplug_private_key'] ? '********' : ''}
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
