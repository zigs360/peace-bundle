import { useState, useEffect } from 'react';
import api from '../../services/api';
import { motion, AnimatePresence } from 'framer-motion';
import { Smartphone, Banknote, Star, CheckCircle, Loader2, Zap, AlertCircle } from 'lucide-react';
import { FadeIn, SlideUp } from '../../components/animations/MotionComponents';
import { detectNetwork, networkServices, recommendations, isValidNigerianNumber } from '../../utils/networkDetection';
import { toast } from 'react-hot-toast';
import SelectProvider from '../../components/Forms/SelectProvider';
import { useNotifications } from '../../context/NotificationContext';
import { useTransactionPinGate } from '../../hooks/useTransactionPinGate';

const SERVICE_LABELS: Record<string, string> = {
  airtime: 'Airtime',
  data: 'Data Bundle',
};

type PurchaseResult = {
  message: string;
  status: string;
  reference: string;
  network: string;
  phone: string;
  amount: number;
  balance: number | null;
  pending: boolean;
  provider: string | null;
};

const toPurchaseResult = (payload: any, fallbackPhone: string, fallbackNetwork: string | null, fallbackAmount: number): PurchaseResult => ({
  message: String(payload?.message || 'Purchase completed'),
  status: String(payload?.transaction?.status || 'processing'),
  reference: String(payload?.transaction?.reference || ''),
  network: String(payload?.transaction?.provider || fallbackNetwork || ''),
  phone: String(payload?.transaction?.recipient_phone || fallbackPhone),
  amount: Number(
    payload?.transaction?.metadata?.vend_amount ??
    payload?.transaction?.amount ??
    fallbackAmount ??
    0,
  ),
  balance: typeof payload?.balance === 'number' ? payload.balance : Number.isFinite(Number(payload?.balance)) ? Number(payload.balance) : null,
  pending: String(payload?.transaction?.status || '').toLowerCase() === 'queued' || /queued/i.test(String(payload?.message || '')),
  provider: payload?.transaction?.metadata?.service_provider || payload?.transaction?.smeplug_response?.provider || null,
});

export default function BuyAirtime() {
  const [phone, setPhone] = useState('');
  const [network, setNetwork] = useState<string | null>(null);
  const [serviceType, setServiceType] = useState<string>('airtime');
  const [amount, setAmount] = useState('');
  const [planId, setPlanId] = useState('');
  const [loading, setLoading] = useState(false);
  const [dataPlans, setDataPlans] = useState<any[]>([]);
  const [isPhoneValid, setIsPhoneValid] = useState(false);
  const [manualOverride, setManualOverride] = useState(false);
  const [purchaseResult, setPurchaseResult] = useState<PurchaseResult | null>(null);
  const { pricingVersion } = useNotifications();
  const { ensureTransactionPin, prompt } = useTransactionPinGate('financial');

  useEffect(() => {
    setIsPhoneValid(isValidNigerianNumber(phone));
    
    if (phone.length === 0) {
      setManualOverride(false);
      setNetwork(null);
      return;
    }

    if (manualOverride) return;

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
  }, [phone, manualOverride]);

  useEffect(() => {
    if (!network) return;
    fetchDataPlans(network);
  }, [network, pricingVersion]);

  const fetchDataPlans = async (provider: string) => {
    try {
      const res = await api.get('/plans', { params: { provider, status: 'active' } });
      const raw = Array.isArray(res.data) ? res.data : (res.data?.data || []);
      const mapped = (raw as any[]).map((p: any) => ({
        ...p,
        price: p.effective_price ?? p.admin_price ?? p.price
      }));
      setDataPlans(mapped);
    } catch (err) {
      console.error('Failed to fetch data plans', err);
    }
  };

  const handlePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPhoneValid) {
      toast.error('Please enter a valid Nigerian phone number');
      return;
    }
    if (!network) {
      toast.error('Could not detect network. Please check the number.');
      return;
    }

    await ensureTransactionPin(async () => {
      setLoading(true);
      setPurchaseResult(null);
      let cleanPhone = phone.replace(/\D/g, '');
      if (cleanPhone.startsWith('234')) {
        cleanPhone = '0' + cleanPhone.substring(3);
      }
      if (cleanPhone.length === 10 && !cleanPhone.startsWith('0')) {
        cleanPhone = '0' + cleanPhone;
      }
      const payload: any = {
        phone: cleanPhone,
        serviceType,
        network,
      };

      try {
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

        const endpoint = serviceType === 'airtime' ? '/transactions/airtime' : '/purchase/unified';
        const res = await api.post(endpoint, payload);

        if (res.data.success) {
          toast.success(res.data.message);
          setPurchaseResult(toPurchaseResult(res.data, cleanPhone, network, Number(payload.amount || 0)));
          setAmount('');
          setPlanId('');
        }
      } catch (err: any) {
        const responseData = err.response?.data;
        const refundedResult = responseData?.transaction ? toPurchaseResult(responseData, cleanPhone, network, Number(payload.amount || 0)) : null;
        if (refundedResult) {
          setPurchaseResult(refundedResult);
          if (refundedResult.balance !== null) {
            const now = Date.now();
            localStorage.setItem('wallet_balance', String(refundedResult.balance));
            localStorage.setItem('wallet_balance_updated_at', String(now));
          }
        }
        toast.error(responseData?.message || 'Purchase failed. Please try again.');
      } finally {
        setLoading(false);
      }
    }, {
      amountLabel: serviceType === 'data' ? 'bundle purchase' : `airtime purchase of NGN ${Number(amount || 0).toLocaleString()}`,
      actionLabel: 'Authorize purchase'
    });
  };

  const getProviderLogo = (provider: string) => {
    switch (provider) {
      case 'mtn': return '/logos/mtn.jpg';
      case 'airtel': return '/logos/airtel.svg';
      case 'glo': return '/logos/glo.png';
      case '9mobile': return '/logos/9mobile.svg';
      default: return '';
    }
  };

  const purchaseStatus = String(purchaseResult?.status || '').toLowerCase();
  const purchaseFailed = purchaseStatus === 'failed' || purchaseStatus === 'refunded';
  const resultCardClass = purchaseResult?.pending
    ? 'border-amber-200 bg-amber-50'
    : purchaseFailed
      ? 'border-red-200 bg-red-50'
      : 'border-green-200 bg-green-50';
  const resultTitleClass = purchaseResult?.pending
    ? 'text-amber-900'
    : purchaseFailed
      ? 'text-red-800'
      : 'text-green-800';
  const resultBodyClass = purchaseResult?.pending
    ? 'text-amber-800'
    : purchaseFailed
      ? 'text-red-700'
      : 'text-green-700';

  return (
    <div className="max-w-2xl mx-auto">
      {prompt}
      <FadeIn className="flex items-center mb-8">
        <div className="p-3 bg-primary-100 rounded-full mr-4">
          <Zap className="w-8 h-8 text-primary-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Buy Airtime</h1>
          <p className="text-gray-600">Airtime purchases are charged from your platform wallet and processed through Ogdams first.</p>
        </div>
      </FadeIn>

      <SlideUp className="bg-white p-8 rounded-2xl shadow-xl border border-gray-100">
        <div className="mb-6 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Airtime requests use the dedicated platform airtime route with server-side validation, transaction logging, and provider verification.
        </div>
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
                className={`w-full pl-10 pr-12 py-3 rounded-xl border transition-all ${
                  isPhoneValid 
                    ? 'border-green-500 focus:ring-green-500' 
                    : phone.length >= 11 
                      ? 'border-red-500 focus:ring-red-500' 
                      : 'border-gray-300 focus:ring-primary-500'
                } focus:outline-none focus:ring-2`}
                placeholder="08012345678 or +234..."
                required
              />
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center gap-2">
                {isPhoneValid && <CheckCircle className="h-5 w-5 text-green-500" />}
                {network && (
                  <motion.img 
                    initial={{ scale: 0 }} 
                    animate={{ scale: 1 }} 
                    src={getProviderLogo(network)} 
                    alt={network} 
                    className="h-8 h-8 object-contain rounded-full border border-gray-100 shadow-sm" 
                  />
                )}
              </div>
            </div>
            <div className="flex justify-between items-center mt-1">
              {phone.length >= 4 && !network ? (
                <p className="text-xs text-red-500 flex items-center">
                  <AlertCircle size={12} className="mr-1" /> Unknown network prefix
                </p>
              ) : phone.length > 0 && phone.length < 11 && !phone.startsWith('+') ? (
                <p className="text-[10px] text-gray-400">Enter 11 digits (e.g. 080...)</p>
              ) : (
                <div />
              )}
              
              {phone.length >= 4 && (
                <button 
                  type="button" 
                  onClick={() => {
                    setNetwork(null);
                    setManualOverride(true);
                  }}
                  className="text-[10px] text-primary-600 hover:underline font-medium"
                >
                  {network ? 'Change Network' : 'Select Manually'}
                </button>
              )}
            </div>
          </div>

          <AnimatePresence>
            {(!network && phone.length >= 4) && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mb-6"
              >
                <SelectProvider 
                  value={network || ''} 
                  onChange={(val) => {
                    setNetwork(val);
                    setManualOverride(true);
                    fetchDataPlans(val);
                  }} 
                />
              </motion.div>
            )}
          </AnimatePresence>

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

              {purchaseResult && (
                <div
                  className={`mt-6 rounded-2xl border-2 p-6 ${resultCardClass}`}
                >
                  <div className="flex items-start gap-3">
                    {purchaseFailed ? (
                      <AlertCircle className="mt-0.5 w-8 h-8 text-red-500" />
                    ) : (
                      <CheckCircle className={`mt-0.5 w-8 h-8 ${purchaseResult.pending ? 'text-amber-500' : 'text-green-500'}`} />
                    )}
                    <div className="flex-1">
                      <h3 className={`text-xl font-bold ${resultTitleClass}`}>
                        {purchaseResult.pending ? 'Purchase Queued' : purchaseFailed ? 'Purchase Reversed' : 'Purchase Successful'}
                      </h3>
                      <p className={`mt-2 text-sm ${resultBodyClass}`}>
                        {purchaseResult.message}
                      </p>
                      <div className="mt-4 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
                        <div className="rounded-xl bg-white/80 px-4 py-3">
                          <div className="text-xs uppercase tracking-wide text-gray-500">Reference</div>
                          <div className="font-mono font-semibold text-gray-900">{purchaseResult.reference || 'Pending assignment'}</div>
                        </div>
                        <div className="rounded-xl bg-white/80 px-4 py-3">
                          <div className="text-xs uppercase tracking-wide text-gray-500">Status</div>
                          <div className="font-semibold text-gray-900 capitalize">{purchaseResult.status}</div>
                        </div>
                        <div className="rounded-xl bg-white/80 px-4 py-3">
                          <div className="text-xs uppercase tracking-wide text-gray-500">Network</div>
                          <div className="font-semibold text-gray-900 uppercase">{purchaseResult.network}</div>
                        </div>
                        <div className="rounded-xl bg-white/80 px-4 py-3">
                          <div className="text-xs uppercase tracking-wide text-gray-500">Amount</div>
                          <div className="font-semibold text-gray-900">₦{Number(purchaseResult.amount || 0).toLocaleString()}</div>
                        </div>
                        <div className="rounded-xl bg-white/80 px-4 py-3">
                          <div className="text-xs uppercase tracking-wide text-gray-500">Phone</div>
                          <div className="font-semibold text-gray-900">{purchaseResult.phone}</div>
                        </div>
                        <div className="rounded-xl bg-white/80 px-4 py-3">
                          <div className="text-xs uppercase tracking-wide text-gray-500">Provider Route</div>
                          <div className="font-semibold text-gray-900 uppercase">{purchaseResult.provider || 'processing'}</div>
                        </div>
                        {purchaseResult.balance !== null && (
                          <div className="rounded-xl bg-white/80 px-4 py-3 md:col-span-2">
                            <div className="text-xs uppercase tracking-wide text-gray-500">Updated Wallet Balance</div>
                            <div className="font-semibold text-gray-900">₦{Number(purchaseResult.balance).toLocaleString()}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </form>
      </SlideUp>
    </div>
  );
}
