import { useState } from 'react';
import api from '../../services/api';
import { Tv, Zap, Smartphone, Banknote, CreditCard, CheckCircle } from 'lucide-react';

const CABLE_PROVIDERS = ['DSTV', 'GOTV', 'STARTIMES'];
const POWER_PROVIDERS = ['IKEDC', 'EKEDC', 'AEDC', 'IBEDC', 'EEDC'];
const METER_TYPES = ['Prepaid', 'Postpaid'];

export default function PayBills() {
  const [billType, setBillType] = useState<'cable' | 'power'>('cable');
  const [provider, setProvider] = useState('');
  const [smartCardNumber, setSmartCardNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [phone, setPhone] = useState('');
  const [meterType, setMeterType] = useState('Prepaid');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleBillTypeChange = (type: 'cable' | 'power') => {
    setBillType(type);
    setProvider(''); // Reset provider when switching types
    setMessage(null);
  };

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const userStr = localStorage.getItem('user');
      if (!userStr) throw new Error('User not found');
      const user = JSON.parse(userStr);

      await api.post('/transactions/bill', {
        userId: user.id,
        billType,
        provider,
        smartCardNumber, // acts as meter number for power
        amount: parseFloat(amount),
        phone,
        meterType: billType === 'power' ? meterType : undefined
      });

      setMessage({ type: 'success', text: 'Bill payment successful!' });
      setAmount('');
      setSmartCardNumber('');
      setPhone('');
      setProvider('');
    } catch (err: any) {
      setMessage({ 
        type: 'error', 
        text: err.response?.data?.message || 'Payment failed. Please try again.' 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center mb-8">
        <div className={`p-3 rounded-full mr-4 ${billType === 'cable' ? 'bg-purple-100' : 'bg-yellow-100'}`}>
          {billType === 'cable' ? <Tv className="w-8 h-8 text-purple-600" /> : <Zap className="w-8 h-8 text-yellow-600" />}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Pay Bills</h1>
          <p className="text-gray-600">Pay for Cable TV and Electricity instantly</p>
        </div>
      </div>

      <div className="bg-white p-8 rounded-lg shadow-md border border-gray-100">
        <div className="flex mb-8 bg-gray-100 p-1 rounded-xl">
          <button
            className={`flex-1 py-3 rounded-lg font-medium transition-all duration-200 flex items-center justify-center space-x-2 ${
              billType === 'cable' ? 'bg-white shadow-md text-purple-700' : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => handleBillTypeChange('cable')}
          >
            <Tv className="w-4 h-4" />
            <span>Cable TV</span>
          </button>
          <button
            className={`flex-1 py-3 rounded-lg font-medium transition-all duration-200 flex items-center justify-center space-x-2 ${
              billType === 'power' ? 'bg-white shadow-md text-yellow-700' : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => handleBillTypeChange('power')}
          >
            <Zap className="w-4 h-4" />
            <span>Electricity</span>
          </button>
        </div>

        {message && (
          <div className={`p-4 mb-6 rounded-md ${
            message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {message.text}
          </div>
        )}

        <form onSubmit={handlePay}>
          <div className="mb-6">
            <label className="block text-gray-700 font-bold mb-2">Select Provider</label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {(billType === 'cable' ? CABLE_PROVIDERS : POWER_PROVIDERS).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setProvider(p)}
                  className={`py-3 px-2 rounded-xl border-2 transition-all flex flex-col items-center justify-center relative overflow-hidden ${
                    provider === p
                      ? `border-${billType === 'cable' ? 'purple' : 'yellow'}-500 bg-${billType === 'cable' ? 'purple' : 'yellow'}-50 text-${billType === 'cable' ? 'purple' : 'yellow'}-700 font-bold`
                      : 'border-gray-200 hover:border-gray-300 text-gray-600'
                  }`}
                >
                  <span className="text-sm">{p}</span>
                  {provider === p && (
                    <div className="absolute top-1 right-1">
                      <CheckCircle className={`w-3 h-3 text-${billType === 'cable' ? 'purple' : 'yellow'}-600`} />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {billType === 'power' && (
            <div className="mb-6">
              <label className="block text-gray-700 font-bold mb-2">Meter Type</label>
              <div className="flex space-x-4">
                {METER_TYPES.map((type) => (
                  <label key={type} className={`flex items-center space-x-2 cursor-pointer p-3 rounded-lg border transition-all ${
                    meterType === type ? 'border-yellow-500 bg-yellow-50' : 'border-gray-200'
                  }`}>
                    <input
                      type="radio"
                      name="meterType"
                      value={type}
                      checked={meterType === type}
                      onChange={(e) => setMeterType(e.target.value)}
                      className="form-radio text-yellow-600 focus:ring-yellow-500"
                    />
                    <span className={meterType === type ? 'font-medium text-gray-900' : 'text-gray-600'}>{type}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="mb-6">
            <label className="block text-gray-700 font-bold mb-2">
              {billType === 'cable' ? 'Smart Card / IUC Number' : 'Meter Number'}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <CreditCard className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                value={smartCardNumber}
                onChange={(e) => setSmartCardNumber(e.target.value)}
                className={`w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-${billType === 'cable' ? 'purple' : 'yellow'}-500`}
                placeholder="Enter number"
                required
              />
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
                className={`w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-${billType === 'cable' ? 'purple' : 'yellow'}-500`}
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
                className={`w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-${billType === 'cable' ? 'purple' : 'yellow'}-500`}
                placeholder="Enter amount"
                required
                min="100"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !provider || !smartCardNumber || !phone || !amount}
            className={`w-full py-4 px-4 font-bold rounded-xl shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5 ${
              (loading || !provider || !smartCardNumber || !phone || !amount) 
                ? 'opacity-70 cursor-not-allowed transform-none shadow-none bg-gray-300 text-gray-500' 
                : billType === 'cable' 
                  ? 'bg-purple-600 text-white hover:bg-purple-700' 
                  : 'bg-yellow-500 text-white hover:bg-yellow-600'
            }`}
          >
            {loading ? 'Processing...' : `Pay ${billType === 'cable' ? 'Cable TV' : 'Electricity'} Bill`}
          </button>
        </form>
      </div>
    </div>
  );
}
