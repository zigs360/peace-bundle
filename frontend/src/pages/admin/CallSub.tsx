import { useEffect, useMemo, useState } from 'react';
import { PhoneCall } from 'lucide-react';
import api from '../../services/api';
import Airtel from './callSub/Airtel';

const providerComponents: Record<string, () => JSX.Element> = {
  airtel: Airtel,
};

export default function CallSub() {
  const [providers, setProviders] = useState<Array<{ key: string; label: string; description?: string }>>([]);
  const [activeProvider, setActiveProvider] = useState('airtel');

  useEffect(() => {
    const loadProviders = async () => {
      try {
        const res = await api.get('/callplans/call-sub/providers');
        const rows = Array.isArray(res.data?.data) && res.data.data.length > 0 ? res.data.data : [{ key: 'airtel', label: 'Airtel', description: 'Airtel call bundle analytics' }];
        setProviders(rows);
        if (!rows.find((provider: any) => provider.key === activeProvider)) {
          setActiveProvider(rows[0].key);
        }
      } catch (error) {
        void error;
        setProviders([{ key: 'airtel', label: 'Airtel', description: 'Airtel call bundle analytics' }]);
      }
    };
    void loadProviders();
  }, [activeProvider]);

  const active = useMemo(
    () => providers.find((provider) => provider.key === activeProvider) || providers[0] || { key: 'airtel', label: 'Airtel', description: 'Airtel call bundle analytics' },
    [activeProvider, providers],
  );
  const ActiveProviderComponent = providerComponents[active.key];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <PhoneCall className="w-6 h-6 mr-2 text-primary-600" />
          Call Sub
        </h1>
        <p className="text-sm text-gray-500 mt-1">Monitor call subscription performance across providers from one shared analytics module.</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
        <div className="flex flex-wrap gap-3">
          {providers.map((provider) => (
            <button
              key={provider.key}
              onClick={() => setActiveProvider(provider.key)}
              className={`px-4 py-3 rounded-xl border text-left min-w-[180px] transition-all ${
                provider.key === activeProvider
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-gray-200 hover:bg-gray-50 text-gray-700'
              }`}
            >
              <div className="text-sm font-black">{provider.label}</div>
              <div className="text-xs text-gray-500 mt-1">{provider.description}</div>
            </button>
          ))}
        </div>
      </div>

      {ActiveProviderComponent ? (
        <ActiveProviderComponent />
      ) : (
        <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-6 text-sm text-gray-500">
          {active.label} analytics will appear here once its call sub component is added.
        </div>
      )}
    </div>
  );
}
