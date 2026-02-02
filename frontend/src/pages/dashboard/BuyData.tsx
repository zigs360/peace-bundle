import { useState, useEffect } from 'react';
import api from '../../services/api';
import { Wifi, Smartphone, CheckCircle } from 'lucide-react';

const NETWORKS = ['MTN', 'AIRTEL', 'GLO', '9MOBILE'];

interface DataPlan {
  id: string;
  name: string;
  price: number;
  data: number;
  validity: string;
}

export default function BuyData() {
  const [network, setNetwork] = useState(NETWORKS[0]);
  const [plans, setPlans] = useState<DataPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [plansLoading, setPlansLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    fetchPlans(network);
  }, [network]);

  const fetchPlans = async (net: string) => {
    setPlansLoading(true);
    try {
      const res = await api.get(`/plans?provider=${net}`);
      const data = (res.data as any[]).map((p: any) => ({
        ...p,
        id: p.id,
        name: p.name,
        price: p.admin_price,
        data: p.size_mb,
        validity: p.validity
      }));
      setPlans(data);
      if (data.length > 0) {
        setSelectedPlanId(data[0].id);
      }
    } catch (err) {
      console.error('Failed to fetch plans', err);
      setPlans([]);
    } finally {
      setPlansLoading(false);
    }
  };

  const handleBuy = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const userStr = localStorage.getItem('user');
      if (!userStr) throw new Error('User not found');
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const user = JSON.parse(userStr); 

      // Find selected plan details
      const selectedPlan = plans.find(p => p.id === selectedPlanId);

      await api.post('/transactions/data', {
        userId: user.id,
        network,
        planId: selectedPlanId,
        planName: selectedPlan?.name,
        phone,
        amount: selectedPlan?.price
      });

      setMessage({ type: 'success', text: 'Data bundle purchased successfully!' });
      setPhone('');
    } catch (err: any) {
      setMessage({ 
        type: 'error', 
        text: err.response?.data?.message || 'Purchase failed. Please try again.' 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center mb-8">
        <div className="p-3 bg-primary-100 rounded-full mr-4">
          <Wifi className="w-8 h-8 text-primary-600" />
        </div>
        <div>
            <h1 className="text-2xl font-bold text-gray-800">Buy Data Bundle</h1>
            <p className="text-gray-600">Purchase data plans for all networks instantly</p>
        </div>
      </div>

      <div className="bg-white p-8 rounded-lg shadow-md border border-gray-100">
        {message && (
            <div className={`p-4 mb-6 rounded-md ${
            message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}>
            {message.text}
            </div>
        )}

        <form onSubmit={handleBuy}>
            <div className="mb-6">
            <label className="block text-gray-700 font-bold mb-3">Select Network</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {NETWORKS.map((net) => (
                <button
                    key={net}
                    type="button"
                    onClick={() => setNetwork(net)}
                    className={`py-3 px-2 rounded-xl border-2 transition-all flex flex-col items-center justify-center ${
                    network === net
                        ? 'border-primary-500 bg-primary-50 text-primary-700 font-bold'
                        : 'border-gray-200 hover:border-gray-300 text-gray-600'
                    }`}
                >
                    <span className="text-sm">{net}</span>
                </button>
                ))}
            </div>
            </div>

            <div className="mb-6">
            <label className="block text-gray-700 font-bold mb-3">Select Plan</label>
            {plansLoading ? (
                <div className="text-center py-4 text-gray-500">Loading plans...</div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                    {plans.map((plan) => (
                        <div 
                            key={plan.id}
                            onClick={() => setSelectedPlanId(plan.id)}
                            className={`p-3 rounded-lg border cursor-pointer transition-all flex justify-between items-center ${
                                selectedPlanId === plan.id 
                                ? 'border-primary-500 bg-primary-50' 
                                : 'border-gray-200 hover:border-primary-200'
                            }`}
                        >
                            <div>
                                <div className="font-bold text-gray-800">{plan.name}</div>
                                <div className="text-xs text-gray-500">{plan.validity}</div>
                            </div>
                            <div className="flex items-center">
                                <span className="font-bold text-primary-600 mr-2">₦{plan.price}</span>
                                {selectedPlanId === plan.id && <CheckCircle className="w-4 h-4 text-primary-600" />}
                            </div>
                        </div>
                    ))}
                </div>
            )}
            </div>

            <div className="mb-8">
            <label className="block text-gray-700 font-bold mb-2">Phone Number</label>
            <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Smartphone className="h-5 w-5 text-gray-400" />
                </div>
                <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="08012345678"
                    required
                />
            </div>
            </div>

            <button
            type="submit"
            disabled={loading || plansLoading || !selectedPlanId}
            className={`w-full py-3 px-4 bg-primary-600 text-white font-bold rounded-lg hover:bg-primary-700 transition duration-200 ${
                (loading || plansLoading || !selectedPlanId) ? 'opacity-70 cursor-not-allowed' : ''
            }`}
            >
            {loading ? 'Processing...' : 'Purchase Data Bundle'}
            </button>
        </form>
      </div>
    </div>
  );
}
