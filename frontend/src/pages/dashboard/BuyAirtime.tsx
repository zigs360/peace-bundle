import { useState } from 'react';
import api from '../../services/api';
import { Phone, Smartphone, Banknote } from 'lucide-react';

const NETWORKS = ['MTN', 'AIRTEL', 'GLO', '9MOBILE'];

export default function BuyAirtime() {
  const [network, setNetwork] = useState(NETWORKS[0]);
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleBuy = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const userStr = localStorage.getItem('user');
      if (!userStr) throw new Error('User not found');
      const user = JSON.parse(userStr);

      await api.post('/transactions/airtime', {
        userId: user.id,
        network,
        phone,
        amount: parseFloat(amount)
      });

      setMessage({ type: 'success', text: 'Airtime purchased successfully!' });
      setAmount('');
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
        <div className="p-3 bg-secondary-100 rounded-full mr-4">
          <Phone className="w-8 h-8 text-secondary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Buy Airtime</h1>
          <p className="text-gray-600">Top up airtime for any network instantly</p>
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
            <label className="block text-gray-700 font-bold mb-2">Select Network</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {NETWORKS.map((net) => (
                <button
                  key={net}
                  type="button"
                  onClick={() => setNetwork(net)}
                  className={`py-3 px-2 rounded-xl border-2 transition-all flex flex-col items-center justify-center ${
                    network === net
                      ? 'border-secondary bg-secondary-50 text-secondary-900 font-bold'
                      : 'border-gray-200 hover:border-gray-300 text-gray-600'
                  }`}
                >
                  <span className="text-sm">{net}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-gray-700 font-bold mb-2">Phone Number</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Smartphone className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-secondary"
                placeholder="08012345678"
                required
              />
            </div>
          </div>

          <div className="mb-8">
            <label className="block text-gray-700 font-bold mb-2">Amount (₦)</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Banknote className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-secondary"
                placeholder="Enter amount (min 50)"
                required
                min="50"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !phone || !amount}
            className={`w-full py-4 px-4 bg-secondary text-primary-900 font-bold rounded-xl shadow-lg hover:shadow-xl hover:bg-secondary-600 transition-all transform hover:-translate-y-0.5 ${
              (loading || !phone || !amount) ? 'opacity-70 cursor-not-allowed transform-none shadow-none' : ''
            }`}
          >
            {loading ? 'Processing...' : 'Buy Airtime'}
          </button>
        </form>
      </div>
    </div>
  );
}
