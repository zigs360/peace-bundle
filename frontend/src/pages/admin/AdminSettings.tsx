import { useState, useEffect } from 'react';
import api from '../../services/api';
import { Save, Settings as SettingsIcon } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function AdminSettings() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await api.get('/admin/settings');
      setSettings(res.data);
    } catch (err) {
      console.error('Failed to fetch settings', err);
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (key: string, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.put('/admin/settings', settings);
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
            <h2 className="text-lg font-medium text-gray-900 mb-4">Contact Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Support Email</label>
                <input
                  type="email"
                  className="mt-1 block w-full border rounded-md px-3 py-2"
                  value={settings['support_email'] || ''}
                  onChange={(e) => handleChange('support_email', e.target.value)}
                  placeholder="support@example.com"
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
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Monnify API Key</label>
                <input
                  type="password"
                  className="mt-1 block w-full border rounded-md px-3 py-2"
                  value={settings['monnify_api_key'] || ''}
                  onChange={(e) => handleChange('monnify_api_key', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">SmePlug API Key</label>
                <input
                  type="password"
                  className="mt-1 block w-full border rounded-md px-3 py-2"
                  value={settings['smeplug_api_key'] || ''}
                  onChange={(e) => handleChange('smeplug_api_key', e.target.value)}
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