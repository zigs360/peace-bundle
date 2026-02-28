import { useState, useEffect } from 'react';
import api from '../../services/api';
import { Smartphone, Banknote, Star, CheckCircle, Loader2, Zap } from 'lucide-react';
import { FadeIn, SlideUp } from '../../components/animations/MotionComponents';
import { detectNetwork, networkServices, recommendations } from '../../utils/networkDetection';
import { toast } from 'react-hot-toast';

const SERVICE_LABELS: Record<string, string> = {
  airtime: 'Airtime',
  data: 'Data Bundle',
  talkmore: 'TalkMore',
};

export default function BuyAirtime() {
  const [phone, setPhone] = useState('');
  const [network, setNetwork] = useState<string | null>(null);
  const [serviceType, setServiceType] = useState<string>('airtime');
  const [amount, setAmount] = useState('');
  const [planId, setPlanId] = useState('');
  const [loading, setLoading] = useState(false);
  const [dataPlans, setDataPlans] = useState<any[]>([]);
  const [activationCode, setActivationCode] = useState<string | null>(null);

  useEffect(() => {
    const detected = detectNetwork(phone);
    if (detected && detected !== network) {
      setNetwork(detected);
      if (!networkServices[detected][serviceType]) {
        setServiceType('airtime');
      }
      fetchDataPlans(detected);
    } else if (!detected && phone.length < 4) {
      setNetwork(null);
    }
  }, [phone]);

  const fetchDataPlans = async (provider: string) => {
    try {
      const res = await api.get('/plans', { params: { provider, status: 'active' } });
      if (res.data.success) {
        setDataPlans(res.data.data);
      }
    } catch (err) {
      console.error('Failed to fetch data plans', err);
    }
  };

  const handlePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!network) {
      toast.error('Please enter a valid phone number');
      return;
    }

    setLoading(true);
    setActivationCode(null);

    try {
      const payload: any = {
        phone,
        serviceType,
        network,
      };

      if (serviceType === 'data') {
        if (!planId) {
          toast.error('Please select a data plan');
          setLoading(false);
          return;
        }
        payload.planId = planId;
      } else {
        if (!amount || parseFloat(amount) <= 0) {
          toast.error('Please enter a valid amount');
          setLoading(false);
          return;
        }
        payload.amount = parseFloat(amount);
      }

      const res = await api.post('/purchase/unified', payload);

      if (res.data.success) {
        toast.success(res.data.message);
        if (res.data.activationCode) {
          setActivationCode(res.data.activationCode);
        } else {
          setPhone('');
          setAmount('');
          setPlanId('');
        }
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Purchase failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeepLinkDial = (code: string) => {
    const encodedCode = code.replace(/#/g, '%23');
    window.location.href = `tel:${encodedCode}`;
  };

  const getProviderLogo = (provider: string) => {
    switch (provider) {
      case 'mtn': return '/images/mtn-logo.png';
      case 'airtel': return '/images/airtel-logo.png';
      case 'glo': return '/images/glo-logo.png';
      case '9mobile': return '/images/9mobile-logo.png';
      default: return '';
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <FadeIn className="flex items-center mb-8">
        <div className="p-3 bg-primary-100 rounded-full mr-4">
          <Zap className="w-8 h-8 text-primary-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Smart Purchase</h1>
          <p className="text-gray-600">Auto-detect network & best bundles</p>
        </div>
      </FadeIn>

      <SlideUp className="bg-white p-8 rounded-2xl shadow-xl border border-gray-100">
        <form onSubmit={handlePurchase}>
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
                className="w-full pl-10 pr-12 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all"
                placeholder="08012345678"
                required
              />
              {network && (
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                  <img src={getProviderLogo(network)} alt={network} className="h-8 h-8 object-contain" />
                </div>
              )}
            </div>
          </div>

          {network && (
            <div className="space-y-6">
              <div>
                <label className="block text-gray-700 font-bold mb-3">Select Service</label>
                <div className="grid grid-cols-3 gap-3">
                  {Object.entries(networkServices[network]).map(([type, supported]) => (
                    supported && (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setServiceType(type)}
                        className={`py-3 px-2 rounded-xl border-2 transition-all font-semibold text-sm ${
                          serviceType === type 
                            ? 'border-primary-600 bg-primary-50 text-primary-700' 
                            : 'border-gray-100 bg-gray-50 text-gray-500 hover:border-gray-200'
                        }`}
                      >
                        {SERVICE_LABELS[type] || type}
                      </button>
                    )
                  ))}
                </div>
              </div>

              {recommendations[network] && (
                <div className="p-4 bg-yellow-50 rounded-xl border border-yellow-100">
                  <div className="flex items-center mb-2 text-yellow-800 font-bold text-sm">
                    <Star className="w-4 h-4 mr-2 fill-yellow-400" />
                    Best Offer
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                    {recommendations[network].map((rec, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setServiceType(rec.type);
                          if (rec.type === 'data') {
                            // If it's data, we'd need to find the planId
                            // For simplicity in this demo, we'll just set amount
                            setAmount(rec.amount.toString());
                          } else {
                            setAmount(rec.amount.toString());
                          }
                        }}
                        className="whitespace-nowrap text-xs bg-white py-2 px-3 rounded-lg shadow-sm border border-yellow-200 hover:bg-yellow-100 transition-colors flex-shrink-0"
                      >
                        {rec.title} - ₦{rec.amount}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {serviceType === 'data' ? (
                <div>
                  <label className="block text-gray-700 font-bold mb-2">Select Bundle</label>
                  <select
                    value={planId}
                    onChange={(e) => setPlanId(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    required
                  >
                    <option value="">Choose data plan...</option>
                    {dataPlans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.size} - ₦{plan.admin_price} ({plan.validity})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-gray-700 font-bold mb-2">Amount (₦)</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Banknote className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="Min 50"
                      required
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-primary-700 transition-all shadow-lg shadow-primary-500/30 disabled:opacity-50 flex items-center justify-center"
              >
                {loading ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  `Purchase ${SERVICE_LABELS[serviceType] || serviceType}`
                )}
              </button>

              {activationCode && (
                <div className="mt-6 p-6 bg-green-50 rounded-2xl border-2 border-green-200 text-center animate-pulse">
                  <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                  <h3 className="text-xl font-bold text-green-800 mb-2">Purchase Successful!</h3>
                  <p className="text-green-700 mb-6 font-medium">To activate TalkMore, click the button below or dial <span className="font-bold">{activationCode}</span></p>
                  <button
                    type="button"
                    onClick={() => handleDeepLinkDial(activationCode)}
                    className="w-full bg-green-600 text-white py-4 rounded-xl font-bold hover:bg-green-700 transition-all shadow-lg shadow-green-500/30 flex items-center justify-center"
                  >
                    Activate TalkMore (Dialer)
                  </button>
                </div>
              )}
            </div>
          )}
        </form>
      </SlideUp>
    </div>
  );
}
