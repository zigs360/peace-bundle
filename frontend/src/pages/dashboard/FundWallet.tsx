import { useState } from 'react';
import api from '../../services/api';
import { Wallet, CreditCard, Building2 } from 'lucide-react';

export default function FundWallet() {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'card' | 'transfer'>('card');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleFund = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const userStr = localStorage.getItem('user');
      if (!userStr) throw new Error('User not found');
      const user = JSON.parse(userStr);

      await api.post('/transactions/fund', {
        userId: user.id,
        amount: parseFloat(amount),
        method // In a real app, this would trigger different flows
      });

      setMessage({ type: 'success', text: 'Wallet funded successfully!' });
      setAmount('');
    } catch (err: any) {
      setMessage({ 
        type: 'error', 
        text: err.response?.data?.message || 'Funding failed. Please try again.' 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center mb-8">
        <div className="p-3 bg-primary-100 rounded-full mr-4">
          <Wallet className="w-8 h-8 text-primary-600" />
        </div>
        <div>
            <h1 className="text-2xl font-bold text-gray-800">Fund Wallet</h1>
            <p className="text-gray-600">Add money to your wallet to purchase services</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Method Selection */}
        <div 
            className={`p-6 rounded-xl border-2 cursor-pointer transition-all ${
                method === 'card' 
                ? 'border-primary-500 bg-primary-50' 
                : 'border-gray-200 hover:border-primary-200'
            }`}
            onClick={() => setMethod('card')}
        >
            <div className="flex items-center mb-4">
                <div className={`p-2 rounded-lg ${method === 'card' ? 'bg-primary-200' : 'bg-gray-100'}`}>
                    <CreditCard className={`w-6 h-6 ${method === 'card' ? 'text-primary-700' : 'text-gray-600'}`} />
                </div>
                <h3 className="ml-3 font-bold text-gray-800">Pay with Card</h3>
            </div>
            <p className="text-sm text-gray-600">Instant funding via Paystack/Flutterwave. 1.5% fee applies.</p>
        </div>

        <div 
            className={`p-6 rounded-xl border-2 cursor-pointer transition-all ${
                method === 'transfer' 
                ? 'border-primary-500 bg-primary-50' 
                : 'border-gray-200 hover:border-primary-200'
            }`}
            onClick={() => setMethod('transfer')}
        >
            <div className="flex items-center mb-4">
                <div className={`p-2 rounded-lg ${method === 'transfer' ? 'bg-primary-200' : 'bg-gray-100'}`}>
                    <Building2 className={`w-6 h-6 ${method === 'transfer' ? 'text-primary-700' : 'text-gray-600'}`} />
                </div>
                <h3 className="ml-3 font-bold text-gray-800">Bank Transfer</h3>
            </div>
            <p className="text-sm text-gray-600">Manual funding. Send to our account and we'll credit you.</p>
        </div>
      </div>

      {method === 'transfer' ? (
          <div className="bg-white p-8 rounded-lg shadow-md border border-gray-100">
              <h3 className="text-lg font-bold text-gray-800 mb-4">Bank Account Details</h3>
              <div className="space-y-4 bg-gray-50 p-6 rounded-lg">
                  <div className="flex justify-between border-b border-gray-200 pb-2">
                      <span className="text-gray-600">Bank Name</span>
                      <span className="font-bold text-gray-800">Moniepoint</span>
                  </div>
                  <div className="flex justify-between border-b border-gray-200 pb-2">
                      <span className="text-gray-600">Account Name</span>
                      <span className="font-bold text-gray-800">Peace Bundle Ltd</span>
                  </div>
                  <div className="flex justify-between pb-2">
                      <span className="text-gray-600">Account Number</span>
                      <div className="flex items-center">
                          <span className="font-bold text-primary-700 text-xl mr-2">1234567890</span>
                          <button className="text-xs bg-primary-100 text-primary-700 px-2 py-1 rounded" onClick={() => navigator.clipboard.writeText('1234567890')}>Copy</button>
                      </div>
                  </div>
              </div>
              <p className="mt-4 text-sm text-gray-500 text-center">
                  After transfer, please send receipt to admin on WhatsApp for confirmation.
              </p>
          </div>
      ) : (
        <div className="bg-white p-8 rounded-lg shadow-md border border-gray-100">
            {message && (
                <div className={`p-4 mb-6 rounded-md ${
                message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                }`}>
                {message.text}
                </div>
            )}

            <form onSubmit={handleFund}>
                <div className="mb-6">
                <label className="block text-gray-700 font-bold mb-2">Amount (₦)</label>
                <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="Enter amount (e.g. 5000)"
                    required
                    min="100"
                />
                </div>

                <button
                type="submit"
                disabled={loading}
                className={`w-full py-3 px-4 bg-primary-600 text-white font-bold rounded-lg hover:bg-primary-700 transition duration-200 ${
                    loading ? 'opacity-70 cursor-not-allowed' : ''
                }`}
                >
                {loading ? 'Processing...' : 'Proceed to Payment'}
                </button>
            </form>
        </div>
      )}
    </div>
  );
}
