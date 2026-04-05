import { useState, useEffect } from 'react';
import { Wifi, CheckCircle2 } from 'lucide-react';
import api from '../services/api';
import { useNotifications } from '../context/NotificationContext';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Plan = any;

const NETWORKS = ['MTN', 'GLO', 'AIRTEL', '9MOBILE'];

export default function Pricing() {
  const [activeNetwork, setActiveNetwork] = useState('MTN');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subPlans, setSubPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [subLoading, setSubLoading] = useState(true);
  const { pricingVersion } = useNotifications();

  useEffect(() => {
    fetchDataPlans();
    fetchSubscriptionPlans();
  }, [activeNetwork, pricingVersion]);

  const fetchDataPlans = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/plans?provider=${activeNetwork}`);
      setPlans((res.data as any[]).map((p: any) => ({
        ...p,
        price: p.effective_price ?? p.admin_price,
        type: p.category
      })));
    } catch (err) {
      console.error('Failed to fetch pricing', err);
      setPlans([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchSubscriptionPlans = async () => {
    setSubLoading(true);
    try {
      const res = await api.get('/plans/subscriptions');
      setSubPlans(res.data as any[]);
    } catch (err) {
      console.error('Failed to fetch subscription plans', err);
      setSubPlans([]);
    } finally {
      setSubLoading(false);
    }
  };

  return (
    <div className="space-y-12 pb-20">
      {/* Subscription Plans Section */}
      <section>
        <div className="text-center mb-10">
          <h2 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
            Choose Your <span className="text-primary-600">Perfect Plan</span>
          </h2>
          <p className="mt-4 text-xl text-gray-500">
            Select a plan that fits your needs and start saving today.
          </p>
        </div>

        {subLoading ? (
          <div className="text-center py-10 text-gray-500">Loading subscription plans...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {subPlans.map((plan) => (
              <div 
                key={plan.id} 
                className={`relative flex flex-col p-8 bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 ${
                  plan.is_popular ? 'ring-2 ring-primary-600' : ''
                }`}
              >
                {plan.is_popular && (
                  <span className="absolute top-0 right-8 -translate-y-1/2 px-3 py-1 bg-primary-600 text-white text-xs font-bold uppercase tracking-wider rounded-full">
                    Most Popular
                  </span>
                )}
                
                <div className="mb-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{plan.description}</p>
                </div>

                <div className="mb-8">
                  <div className="flex items-baseline">
                    <span className="text-4xl font-extrabold text-gray-900">
                      {plan.currency === 'NGN' ? '₦' : plan.currency}{Number(plan.promo_price || plan.price).toLocaleString()}
                    </span>
                    <span className="ml-1 text-gray-500 font-medium">/{plan.billing_cycle === 'monthly' ? 'mo' : plan.billing_cycle}</span>
                  </div>
                  {plan.promo_price && (
                    <p className="mt-1 text-sm text-gray-400 line-through">
                      Was {plan.currency === 'NGN' ? '₦' : plan.currency}{Number(plan.price).toLocaleString()}
                    </p>
                  )}
                </div>

                <ul className="flex-1 space-y-4 mb-8">
                  {(plan.features || []).map((feature: string, idx: number) => (
                    <li key={idx} className="flex items-start text-gray-600">
                      <CheckCircle2 className="w-5 h-5 text-primary-500 shrink-0 mr-3" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>

                <button className={`w-full py-3 px-6 rounded-xl font-bold transition-all duration-200 ${
                  plan.is_popular 
                    ? 'bg-primary-600 text-white hover:bg-primary-700 shadow-lg shadow-primary-500/20' 
                    : 'bg-gray-50 text-gray-900 hover:bg-gray-100'
                }`}>
                  Select {plan.name}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Data Plans Section */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-8 py-6 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
          <div className="flex items-center">
            <Wifi className="w-6 h-6 text-primary-600 mr-3" />
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Data & Airtime Pricing</h2>
          </div>
          <p className="text-sm text-gray-500 font-medium hidden sm:block">Real-time updates across all networks</p>
        </div>

        <div className="p-8">
          {/* Network Selection */}
          <div className="flex space-x-3 mb-8 overflow-x-auto pb-4 scrollbar-hide">
            {NETWORKS.map((net) => (
              <button
                key={net}
                onClick={() => setActiveNetwork(net)}
                className={`px-6 py-2.5 rounded-full font-bold text-sm transition-all duration-200 whitespace-nowrap border-2 ${
                  activeNetwork === net
                    ? 'bg-primary-600 text-white border-primary-600 shadow-md'
                    : 'bg-white text-gray-600 border-gray-100 hover:border-primary-200 hover:bg-primary-50'
                }`}
              >
                {net}
              </button>
            ))}
          </div>

          {/* Plans Table */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mb-4"></div>
              <span className="font-medium">Loading data plans...</span>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-100">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-widest">Plan Name</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-widest">Type</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-widest">Validity</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-widest">Price</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {plans.length > 0 ? (
                    plans.map((plan) => (
                      <tr key={plan.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-5 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center mr-3">
                              <Wifi className="w-4 h-4 text-primary-600" />
                            </div>
                            <span className="text-sm font-semibold text-gray-900">{plan.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-5 whitespace-nowrap text-sm text-gray-500 font-medium">
                          <span className="px-2.5 py-1 bg-gray-100 rounded-md uppercase text-[10px] tracking-wider">{plan.type}</span>
                        </td>
                        <td className="px-6 py-5 whitespace-nowrap text-sm text-gray-500 font-medium">
                          {plan.validity}
                        </td>
                        <td className="px-6 py-5 whitespace-nowrap text-sm font-bold text-primary-700">
                          ₦{plan.price.toLocaleString()}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-6 py-20 text-center text-gray-400 font-medium">
                        No plans available for {activeNetwork} at the moment.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
