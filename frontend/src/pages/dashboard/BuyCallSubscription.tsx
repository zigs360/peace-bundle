import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, PhoneCall, CheckCircle, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import api from '../../services/api';
import PageTransition from '../../components/animations/PageTransition';
import { useNotifications } from '../../context/NotificationContext';

interface CallPlan {
  id: string;
  name: string;
  provider: 'mtn' | 'airtel' | 'glo' | '9mobile';
  price: number;
  minutes: number;
  validityDays: number;
  status: 'active' | 'inactive';
  type: 'voice' | 'sms';
}

export default function BuyCallSubscription() {
  const navigate = useNavigate();
  const [callPlans, setCallPlans] = useState<CallPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState<'mtn' | 'airtel' | 'glo' | '9mobile'>('mtn');
  const [recipientPhoneNumber, setRecipientPhoneNumber] = useState('');
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<CallPlan | null>(null);
  const { pricingVersion } = useNotifications();

  useEffect(() => {
    fetchCallPlans();
  }, [selectedProvider, pricingVersion]);

  const fetchCallPlans = async () => {
    setLoading(true);
    try {
      const res = await api.get('/callplans', { params: { provider: selectedProvider, status: 'active' } });
      const raw = Array.isArray(res.data) ? res.data : (res.data?.data || []);
      const mapped = (raw as any[]).map((p: any) => ({
        ...p,
        price: p.effective_price ?? p.price,
      }));
      setCallPlans(mapped);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to fetch call plans');
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async () => {
    if (!selectedPlan) {
      toast.error('Please select a call plan');
      return;
    }
    if (!recipientPhoneNumber) {
      toast.error('Please enter a recipient phone number');
      return;
    }

    setIsPurchasing(true);
    try {
      const res = await api.post(`/callplans/${selectedPlan.id}/purchase`, { recipientPhoneNumber });
      if (res.data.success) {
        toast.success(res.data.message);
        setRecipientPhoneNumber('');
        setSelectedPlan(null);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to purchase call plan');
    } finally {
      setIsPurchasing(false);
    }
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
    <PageTransition>
      <div className="min-h-screen bg-gray-100 pb-16">
        {/* Header */}
        <div className="bg-primary-600 text-white p-4 flex items-center justify-between">
          <button onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-primary-700">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-xl font-semibold">Call Subscription</h1>
          <div className="w-10"></div> {/* Placeholder for balance/icons */}
        </div>

        {/* Provider Selection */}
        <div className="bg-primary-600 p-4 flex justify-center space-x-4">
          {['mtn', 'airtel', 'glo', '9mobile'].map((provider) => (
            <button
              key={provider}
              onClick={() => setSelectedProvider(provider as any)}
              className={`p-2 rounded-full transition-all ${
                selectedProvider === provider ? 'bg-white shadow-md' : 'bg-primary-500 hover:bg-primary-700'
              }`}
            >
              <img src={getProviderLogo(provider)} alt={provider} className="w-8 h-8 object-contain" />
            </button>
          ))}
        </div>

        <div className="max-w-md mx-auto mt-6 px-4">
          {/* Recipient Phone Number Input */}
          <div className="mb-6">
            <label htmlFor="recipientPhone" className="block text-sm font-medium text-gray-700 mb-2">
              Recipient Phone Number
            </label>
            <input
              type="tel"
              id="recipientPhone"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500 transition-all"
              placeholder="e.g., 08012345678"
              value={recipientPhoneNumber}
              onChange={(e) => setRecipientPhoneNumber(e.target.value)}
              disabled={isPurchasing}
            />
          </div>

          {/* Call Plans List */}
          {loading ? (
            <div className="flex justify-center items-center py-10">
              <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
            </div>
          ) : callPlans.length === 0 ? (
            <div className="text-center py-10 text-gray-500">No active call plans found for {selectedProvider}.</div>
          ) : (
            <div className="space-y-4">
              {callPlans.map((plan) => (
                <div
                  key={plan.id}
                  onClick={() => setSelectedPlan(plan)}
                  className={`bg-white rounded-xl shadow-sm p-4 flex items-center justify-between cursor-pointer transition-all border-2 ${
                    selectedPlan?.id === plan.id ? 'border-primary-600' : 'border-transparent hover:border-gray-200'
                  }`}
                >
                  <div className="flex items-center">
                    <div className="bg-red-100 p-3 rounded-full mr-4">
                      <PhoneCall className="w-6 h-6 text-red-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-800">{plan.name}</h3>
                      <p className="text-sm text-gray-500">
                        {plan.minutes} Minutes • Validity: {plan.validityDays} Days
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-bold text-primary-600">₦{plan.price.toFixed(2)}</span>
                    {selectedPlan?.id === plan.id && (
                      <CheckCircle className="w-5 h-5 text-primary-600 ml-2 inline-block" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Purchase Button */}
          <button
            onClick={handlePurchase}
            disabled={!selectedPlan || !recipientPhoneNumber || isPurchasing}
            className="w-full mt-8 py-3 bg-primary-600 text-white rounded-xl font-bold text-lg hover:bg-primary-700 transition-all shadow-lg shadow-primary-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {isPurchasing ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              `Purchase ${selectedPlan ? `(${selectedPlan.name})` : ''}`
            )}
          </button>
        </div>
      </div>
    </PageTransition>
  );
}
