import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, PhoneCall, Loader2, CheckCircle2, ShieldCheck, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import api from '../../services/api';
import PageTransition from '../../components/animations/PageTransition';

interface CallPlan {
  id: string;
  name: string;
  provider: 'mtn' | 'airtel' | 'glo' | '9mobile';
  price: number;
  effective_price?: number;
  minutes: number;
  validityDays: number;
  status: 'active' | 'inactive';
  type: string;
}

const PROVIDERS = [
  { key: 'mtn', label: 'MTN', logoBg: 'bg-yellow-400 text-black', badge: 'MTN' },
  { key: 'airtel', label: 'AIRTEL', logoBg: 'bg-red-600 text-white', badge: 'AIRTEL' },
  { key: 'glo', label: 'GLO', logoBg: 'bg-green-600 text-white', badge: 'GLO' },
  { key: '9mobile', label: '9MOBILE', logoBg: 'bg-emerald-700 text-white', badge: '9M' },
] as const;

type ProviderKey = typeof PROVIDERS[number]['key'];

export default function CallSub() {
  const navigate = useNavigate();
  const [activeProvider, setActiveProvider] = useState<ProviderKey>('mtn');
  const [plans, setPlans] = useState<CallPlan[]>([]);
  const [loading, setLoading] = useState(false);

  // Modal State
  const [selectedPlan, setSelectedPlan] = useState<CallPlan | null>(null);
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [purchasing, setPurchasing] = useState(false);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/callplans', {
        params: { provider: activeProvider, status: 'active' },
      });
      const raw = Array.isArray(res.data) ? res.data : (res.data?.data || []);
      setPlans(raw);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to fetch call plans');
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, [activeProvider]);

  useEffect(() => {
    void fetchPlans();
  }, [fetchPlans]);

  const handlePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan) return;
    if (!phone || phone.length !== 11) {
      toast.error('Please enter a valid 11-digit phone number');
      return;
    }

    setPurchasing(true);
    try {
      const res = await api.post(`/callplans/${selectedPlan.id}/purchase`, {
        recipientPhoneNumber: phone,
        pin,
      });

      if (res.data.success || res.data.status === 'completed' || res.data.status === 'queued') {
        toast.success(res.data.message || 'Call subscription purchase successful!');
        setSelectedPlan(null);
        setPhone('');
        setPin('');
      } else {
        toast.error(res.data.message || 'Purchase failed');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to complete subscription');
    } finally {
      setPurchasing(false);
    }
  };

  const getCardStyle = (provider: ProviderKey) => {
    switch (provider) {
      case 'mtn':
        return {
          gradient: 'from-[#FF9900] via-[#FFB700] to-[#FFC800]',
          priceColor: 'text-[#D97706]',
          iconBg: 'bg-white/25 text-white',
        };
      case 'airtel':
        return {
          gradient: 'from-[#E53935] via-[#EF5350] to-[#E57373]',
          priceColor: 'text-[#DC2626]',
          iconBg: 'bg-white/25 text-white',
        };
      case 'glo':
        return {
          gradient: 'from-[#2E7D32] via-[#43A047] to-[#66BB6A]',
          priceColor: 'text-[#15803D]',
          iconBg: 'bg-white/25 text-white',
        };
      case '9mobile':
        return {
          gradient: 'from-[#00695C] via-[#00897B] to-[#26A69A]',
          priceColor: 'text-[#0F766E]',
          iconBg: 'bg-white/25 text-white',
        };
    }
  };

  return (
    <PageTransition>
      <div className="min-h-screen bg-slate-50 font-sans pb-16">
        {/* Dark Blue App Header */}
        <div className="bg-[#0B192C] text-white pt-6 pb-2 px-4 shadow-md">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <button
              onClick={() => navigate('/dashboard')}
              className="p-2 rounded-full hover:bg-white/10 transition-colors"
            >
              <ArrowLeft className="w-6 h-6 text-white" />
            </button>
            <h1 className="text-xl font-bold tracking-wide">Call Subscriptions</h1>
            <div className="w-8" />
          </div>

          {/* Network Selector Tabs */}
          <div className="max-w-2xl mx-auto mt-6 flex justify-around border-b border-white/10">
            {PROVIDERS.map((net) => {
              const isActive = activeProvider === net.key;
              return (
                <button
                  key={net.key}
                  onClick={() => setActiveProvider(net.key)}
                  className={`flex items-center space-x-2 pb-3 px-3 border-b-2 font-bold text-sm transition-all ${
                    isActive
                      ? 'border-white text-white'
                      : 'border-transparent text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${net.logoBg}`}
                  >
                    {net.badge}
                  </span>
                  <span>{net.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Content Container */}
        <div className="max-w-2xl mx-auto px-4 mt-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-10 h-10 animate-spin text-[#0B192C]" />
              <p className="mt-3 text-sm text-gray-500 font-medium">Loading call subscription plans...</p>
            </div>
          ) : plans.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-gray-200 shadow-sm">
              <PhoneCall className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-gray-800">No Active Plans Found</h3>
              <p className="text-sm text-gray-500 mt-1">
                There are currently no active call plans for {activeProvider.toUpperCase()}.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {plans.map((plan) => {
                const style = getCardStyle(activeProvider);
                const displayPrice = plan.effective_price ?? plan.price;

                return (
                  <div
                    key={plan.id}
                    onClick={() => setSelectedPlan(plan)}
                    className={`relative overflow-hidden bg-gradient-to-r ${style.gradient} rounded-2xl p-5 shadow-lg shadow-orange-500/10 cursor-pointer transform transition-all duration-200 hover:-translate-y-1 hover:shadow-xl`}
                  >
                    <div className="flex items-center justify-between">
                      {/* Left Icon + Details */}
                      <div className="flex items-center space-x-4 pr-4">
                        <div className={`p-3.5 rounded-full ${style.iconBg} shrink-0`}>
                          <PhoneCall className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="text-white font-bold text-base md:text-lg leading-snug">
                            {plan.name}
                          </h3>
                          <p className="text-white/90 text-xs md:text-sm mt-1 font-medium">
                            Validity: {plan.validityDays} Days
                          </p>
                        </div>
                      </div>

                      {/* Right Price Pill Badge */}
                      <div className="bg-white rounded-full px-4 py-2 shadow-md shrink-0">
                        <span className={`font-black text-base md:text-lg ${style.priceColor}`}>
                          ₦{displayPrice.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Purchase Confirmation Modal */}
        {selectedPlan && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
              <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                <h3 className="text-lg font-bold text-gray-900 flex items-center">
                  <ShieldCheck className="w-5 h-5 text-emerald-600 mr-2" />
                  Subscribe to Call Plan
                </h3>
                <button
                  onClick={() => setSelectedPlan(null)}
                  className="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handlePurchase} className="mt-4 space-y-4">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <div className="text-xs text-gray-500 uppercase font-semibold tracking-wider">Plan Name</div>
                  <div className="text-sm font-bold text-gray-800 mt-0.5">{selectedPlan.name}</div>

                  <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-200/60">
                    <div>
                      <div className="text-xs text-gray-500">Validity</div>
                      <div className="text-sm font-semibold text-gray-700">{selectedPlan.validityDays} Days</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-500">Price</div>
                      <div className="text-base font-black text-emerald-600">
                        ₦{(selectedPlan.effective_price ?? selectedPlan.price).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    Recipient Phone Number
                  </label>
                  <input
                    type="tel"
                    maxLength={11}
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. 08035446865"
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-slate-900 focus:border-slate-900 text-sm font-semibold outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    4-Digit Transaction PIN
                  </label>
                  <input
                    type="password"
                    maxLength={4}
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder="••••"
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-slate-900 focus:border-slate-900 text-sm font-semibold outline-none"
                  />
                </div>

                <div className="pt-2 flex space-x-3">
                  <button
                    type="button"
                    onClick={() => setSelectedPlan(null)}
                    className="flex-1 py-3 border border-gray-300 rounded-xl font-bold text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={purchasing}
                    className="flex-1 py-3 bg-[#0B192C] text-white rounded-xl font-bold text-sm hover:bg-slate-800 transition-colors flex items-center justify-center"
                  >
                    {purchasing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        Confirm & Pay
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
