import { useState, useEffect } from 'react';
import { DollarSign, Wifi } from 'lucide-react';
import api from '../services/api';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Plan = any;

const NETWORKS = ['MTN', 'GLO', 'AIRTEL', '9MOBILE'];

export default function Pricing() {
  const [activeNetwork, setActiveNetwork] = useState('MTN');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPlans = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/plans?provider=${activeNetwork}`);
        setPlans((res.data as any[]).map((p: any) => ({
          ...p,
          price: p.admin_price,
          type: p.category
        })));
      } catch (err) {
        console.error('Failed to fetch pricing', err);
        setPlans([]);
      } finally {
        setLoading(false);
      }
    };
    fetchPlans();
  }, [activeNetwork]);

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center">
        <DollarSign className="w-6 h-6 text-primary-600 mr-2" />
        <h2 className="text-xl font-bold text-gray-800">Pricing & Data Plans</h2>
      </div>

      <div className="p-6">
        {/* Network Selection */}
        <div className="flex space-x-2 mb-6 overflow-x-auto pb-2">
          {NETWORKS.map((net) => (
            <button
              key={net}
              onClick={() => setActiveNetwork(net)}
              className={`px-4 py-2 rounded-full font-bold text-sm transition-colors whitespace-nowrap ${
                activeNetwork === net
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {net}
            </button>
          ))}
        </div>

        {/* Plans Table */}
        {loading ? (
          <div className="text-center py-10">Loading plans...</div>
        ) : (
          <div className="overflow-x-auto border rounded-lg">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Plan Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Validity</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Plan ID</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {plans.length > 0 ? (
                  plans.map((plan) => (
                    <tr key={plan.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <Wifi className="w-4 h-4 text-gray-400 mr-2" />
                          <span className="text-sm font-medium text-gray-900">{plan.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {plan.type}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {plan.validity}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                        ₦{plan.price.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500">
                        {plan.id}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-gray-500">
                      No plans available for {activeNetwork}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
