import { useState, useEffect } from 'react';
import api from '../../services/api';
import { Wallet, CreditCard, Building2, Copy, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { FadeIn, SlideUp, StaggerContainer, StaggerItem, HoverCard } from '../../components/animations/MotionComponents';
import { AnimatePresence } from 'framer-motion';
import { User } from '../../types';
import toast from 'react-hot-toast';

export default function FundWallet() {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'card' | 'transfer' | 'virtual'>('card');
  const [loading, setLoading] = useState(false);
  const [fetchingUser, setFetchingUser] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    fetchUserProfile();
  }, []);

  const fetchUserProfile = async () => {
    setFetchingUser(true);
    try {
      const res = await api.get('/auth/me');
      setUser(res.data);
      if (res.data.virtual_account_number) {
        setMethod('virtual');
      }
    } catch (err) {
      console.error('Failed to fetch user profile', err);
      toast.error('Failed to load account details');
    } finally {
      setFetchingUser(false);
    }
  };

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast.success(`${field} copied!`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleFund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) < 100) {
        toast.error('Minimum funding amount is ₦100');
        return;
    }

    setLoading(true);
    try {
      // Simulate payment reference generation (Monnify format)
      const reference = `MNFY-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;

      await api.post('/transactions/fund', {
        userId: user?.id,
        amount: parseFloat(amount),
        method,
        reference
      });

      toast.success('Wallet funding initiated successfully!');
      setAmount('');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Funding failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (fetchingUser) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 text-primary-600 animate-spin mb-4" />
        <p className="text-gray-600 animate-pulse">Loading secure funding options...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <FadeIn className="flex items-center mb-10">
        <div className="p-4 bg-primary-50 rounded-2xl mr-5 shadow-sm">
          <Wallet className="w-10 h-10 text-primary-600" />
        </div>
        <div>
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Fund Your Wallet</h1>
            <p className="text-gray-500 text-lg">Choose a preferred method to top up your balance</p>
        </div>
      </FadeIn>

      <StaggerContainer className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        {/* Dedicated Virtual Account */}
        <StaggerItem>
            <HoverCard
                className={`p-6 rounded-2xl border-2 h-full flex flex-col cursor-pointer transition-all duration-300 shadow-sm ${
                    method === 'virtual' 
                    ? 'border-primary-500 bg-primary-50 ring-4 ring-primary-500/10' 
                    : 'border-white bg-white hover:border-primary-200'
                }`}
                onClick={() => setMethod('virtual')}
            >
                <div className="flex items-center mb-4">
                    <div className={`p-3 rounded-xl ${method === 'virtual' ? 'bg-primary-600 text-white' : 'bg-primary-50 text-primary-600'}`}>
                        <Building2 className="w-6 h-6" />
                    </div>
                    <div className="ml-3">
                        <h3 className="font-bold text-gray-900">Virtual Account</h3>
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-primary-600">Automated</span>
                    </div>
                </div>
                <p className="text-sm text-gray-600 flex-grow leading-relaxed">Your dedicated account for instant automated funding. No receipt needed.</p>
                {method === 'virtual' && <CheckCircle2 className="w-5 h-5 text-primary-600 absolute top-4 right-4" />}
            </HoverCard>
        </StaggerItem>

        {/* Card Payment */}
        <StaggerItem>
            <HoverCard
                className={`p-6 rounded-2xl border-2 h-full flex flex-col cursor-pointer transition-all duration-300 shadow-sm ${
                    method === 'card' 
                    ? 'border-primary-500 bg-primary-50 ring-4 ring-primary-500/10' 
                    : 'border-white bg-white hover:border-primary-200'
                }`}
                onClick={() => setMethod('card')}
            >
                <div className="flex items-center mb-4">
                    <div className={`p-3 rounded-xl ${method === 'card' ? 'bg-primary-600 text-white' : 'bg-primary-50 text-primary-600'}`}>
                        <CreditCard className="w-6 h-6" />
                    </div>
                    <div className="ml-3">
                        <h3 className="font-bold text-gray-900">Pay with Card</h3>
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-primary-600">Instant</span>
                    </div>
                </div>
                <p className="text-sm text-gray-600 flex-grow leading-relaxed">Pay via Monnify gateway. Supports Cards, USSD, and Bank App. 1.5% fee.</p>
                {method === 'card' && <CheckCircle2 className="w-5 h-5 text-primary-600 absolute top-4 right-4" />}
            </HoverCard>
        </StaggerItem>

        {/* Manual Transfer */}
        <StaggerItem>
            <HoverCard
                className={`p-6 rounded-2xl border-2 h-full flex flex-col cursor-pointer transition-all duration-300 shadow-sm ${
                    method === 'transfer' 
                    ? 'border-primary-500 bg-primary-50 ring-4 ring-primary-500/10' 
                    : 'border-white bg-white hover:border-primary-200'
                }`}
                onClick={() => setMethod('transfer')}
            >
                <div className="flex items-center mb-4">
                    <div className={`p-3 rounded-xl ${method === 'transfer' ? 'bg-primary-600 text-white' : 'bg-primary-50 text-primary-600'}`}>
                        <Building2 className="w-6 h-6" />
                    </div>
                    <div className="ml-3">
                        <h3 className="font-bold text-gray-900">Manual Transfer</h3>
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Receipt Required</span>
                    </div>
                </div>
                <p className="text-sm text-gray-600 flex-grow leading-relaxed">Transfer to our business account and send receipt to support on WhatsApp.</p>
                {method === 'transfer' && <CheckCircle2 className="w-5 h-5 text-primary-600 absolute top-4 right-4" />}
            </HoverCard>
        </StaggerItem>
      </StaggerContainer>

      <AnimatePresence mode="wait">
        {method === 'virtual' ? (
          <SlideUp key="virtual" className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100 overflow-hidden relative">
            <div className="absolute top-0 left-0 w-full h-2 bg-primary-600" />
            <div className="flex justify-between items-start mb-8">
                <div>
                    <h3 className="text-xl font-extrabold text-gray-900 mb-1">Your Dedicated Account</h3>
                    <p className="text-sm text-gray-500">Funds sent here are credited to your wallet in seconds.</p>
                </div>
                <button 
                    onClick={fetchUserProfile}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-primary-600"
                    title="Refresh Account Details"
                >
                    <RefreshCw className="w-5 h-5" />
                </button>
            </div>

            {user?.virtual_account_number ? (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100 group">
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest block mb-2">Bank Name</span>
                            <div className="flex justify-between items-center relative">
                                <span className="text-lg font-bold text-gray-800">{user.virtual_account_bank}</span>
                                <button onClick={() => handleCopy(user.virtual_account_bank!, 'Bank Name')} className="text-primary-600 hover:scale-110 transition-transform">
                                    <Copy className="w-4 h-4" />
                                </button>
                                {copiedField === 'Bank Name' && <span className="absolute -top-6 right-0 text-[10px] font-bold text-green-600 animate-fade-in-up">Copied!</span>}
                            </div>
                        </div>
                        <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100 group">
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest block mb-2">Account Name</span>
                            <div className="flex justify-between items-center relative">
                                <span className="text-lg font-bold text-gray-800 truncate pr-2">{user.virtual_account_name}</span>
                                <button onClick={() => handleCopy(user.virtual_account_name!, 'Account Name')} className="text-primary-600 hover:scale-110 transition-transform shrink-0">
                                    <Copy className="w-4 h-4" />
                                </button>
                                {copiedField === 'Account Name' && <span className="absolute -top-6 right-0 text-[10px] font-bold text-green-600 animate-fade-in-up">Copied!</span>}
                            </div>
                        </div>
                    </div>
                    <div className="bg-primary-600 p-8 rounded-3xl text-white shadow-lg shadow-primary-200 flex flex-col items-center text-center relative">
                        <span className="text-xs font-bold text-primary-200 uppercase tracking-widest mb-3">Account Number</span>
                        <div className="flex items-center gap-4 mb-4 relative">
                            <span className="text-4xl sm:text-5xl font-mono font-black tracking-tighter leading-none">{user.virtual_account_number}</span>
                            <button 
                                onClick={() => handleCopy(user.virtual_account_number!, 'Account Number')} 
                                className="p-3 bg-white/20 hover:bg-white/30 rounded-2xl transition-all active:scale-95"
                            >
                                <Copy className="w-6 h-6" />
                            </button>
                            {copiedField === 'Account Number' && <span className="absolute -top-8 right-0 text-xs font-bold text-white bg-green-500 px-2 py-1 rounded-md animate-bounce">Copied!</span>}
                        </div>
                        <div className="inline-flex items-center px-4 py-2 bg-white/10 rounded-full text-xs font-medium backdrop-blur-sm border border-white/10">
                            <CheckCircle2 className="w-4 h-4 mr-2 text-primary-200" />
                            Secure Automated Funding Active
                        </div>
                    </div>
                    
                    <div className="mt-8 p-4 bg-amber-50 rounded-2xl border border-amber-100 flex items-start">
                        <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 mr-3 shrink-0" />
                        <p className="text-sm text-amber-800 leading-relaxed">
                            <span className="font-bold">Important:</span> Standard processing fee of ₦50 applies per transaction by our banking partners. Minimum deposit is ₦100.
                        </p>
                    </div>
                </div>
            ) : (
                <div className="text-center py-12 px-6 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
                    <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Building2 className="w-8 h-8 text-gray-400" />
                    </div>
                    <h4 className="text-lg font-bold text-gray-900 mb-2">No Virtual Account Assigned</h4>
                    <p className="text-gray-500 mb-6 max-w-sm mx-auto">We couldn't find a dedicated virtual account for your profile. This might happen if your KYC is not yet verified or if there was a technical glitch.</p>
                    <button 
                        onClick={fetchUserProfile}
                        className="inline-flex items-center px-6 py-3 bg-primary-600 text-white font-bold rounded-xl hover:bg-primary-700 transition-all active:scale-95"
                    >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Check Again
                    </button>
                </div>
            )}
          </SlideUp>
        ) : method === 'transfer' ? (
          <SlideUp key="transfer" className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100 overflow-hidden relative">
             <div className="absolute top-0 left-0 w-full h-2 bg-gray-400" />
              <h3 className="text-xl font-extrabold text-gray-900 mb-2">Our Business Account</h3>
              <p className="text-sm text-gray-500 mb-8">Use these details for manual funding via bank transfer.</p>
              
              <div className="space-y-4 mb-8">
                  <div className="flex justify-between items-center p-4 bg-gray-50 rounded-2xl border border-gray-100">
                      <span className="text-sm font-bold text-gray-400 uppercase tracking-widest">Bank Name</span>
                      <span className="font-bold text-gray-800">Moniepoint</span>
                  </div>
                  <div className="flex justify-between items-center p-4 bg-gray-50 rounded-2xl border border-gray-100">
                      <span className="text-sm font-bold text-gray-400 uppercase tracking-widest">Account Name</span>
                      <span className="font-bold text-gray-800">Peace Bundlle Ltd</span>
                  </div>
                  <div className="flex justify-between items-center p-6 bg-primary-50 rounded-2xl border border-primary-100 relative">
                      <span className="text-sm font-bold text-primary-400 uppercase tracking-widest">Account Number</span>
                      <div className="flex items-center gap-3">
                          <span className="font-mono text-2xl font-black text-primary-700">1234567890</span>
                          <button onClick={() => handleCopy('1234567890', 'Manual Account')} className="p-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-all">
                              <Copy className="w-4 h-4" />
                          </button>
                          {copiedField === 'Manual Account' && <span className="absolute -top-6 right-6 text-xs font-bold text-green-600">Copied!</span>}
                      </div>
                  </div>
              </div>

              <div className="text-center p-6 bg-primary-600 rounded-3xl text-white shadow-lg">
                  <p className="text-sm font-medium mb-4">After transfer, please send your proof of payment to our support team on WhatsApp for instant confirmation.</p>
                  <a 
                    href={`https://wa.me/2348035446865?text=${encodeURIComponent('I just made a manual transfer for wallet funding. Here is my receipt.')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-8 py-4 bg-white text-primary-600 font-bold rounded-2xl hover:bg-primary-50 transition-all shadow-md active:scale-95"
                  >
                    Send Receipt to WhatsApp
                  </a>
              </div>
          </SlideUp>
        ) : (
          <SlideUp key="card" className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100 overflow-hidden relative">
            <div className="absolute top-0 left-0 w-full h-2 bg-primary-600" />
            <h3 className="text-xl font-extrabold text-gray-900 mb-2">Secure Online Payment</h3>
            <p className="text-sm text-gray-500 mb-8">Pay securely using your debit card or bank app via Monnify.</p>

            <form onSubmit={handleFund}>
                <div className="mb-8">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Amount to Fund (₦)</label>
                    <div className="relative">
                        <span className="absolute left-5 top-1/2 -translate-y-1/2 text-2xl font-bold text-gray-400">₦</span>
                        <input
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="w-full pl-12 pr-6 py-5 rounded-2xl bg-gray-50 border-2 border-gray-100 focus:border-primary-500 focus:bg-white focus:outline-none transition-all text-2xl font-bold text-gray-800"
                            placeholder="Min. 100"
                            required
                            min="100"
                        />
                    </div>
                    {amount && parseFloat(amount) > 0 && (
                        <p className="mt-3 text-sm text-gray-500 flex justify-between">
                            <span>Gateway Fee (1.5%):</span>
                            <span className="font-bold">₦{(parseFloat(amount) * 0.015).toFixed(2)}</span>
                        </p>
                    )}
                </div>

                <HoverCard>
                    <button
                        type="submit"
                        disabled={loading}
                        className={`w-full py-5 px-6 bg-primary-600 text-white text-lg font-black rounded-2xl hover:bg-primary-700 hover:shadow-lg hover:shadow-primary-200 transition-all duration-300 flex items-center justify-center ${
                            loading ? 'opacity-70 cursor-not-allowed' : 'active:scale-[0.98]'
                        }`}
                    >
                        {loading ? (
                            <>
                                <RefreshCw className="w-6 h-6 mr-3 animate-spin" />
                                Connecting to Secure Gateway...
                            </>
                        ) : (
                            'Pay Securely Now'
                        )}
                    </button>
                </HoverCard>
                
                <div className="mt-6 flex items-center justify-center gap-4 opacity-50 grayscale hover:grayscale-0 transition-all">
                    <img src="https://monnify.com/assets/images/monnify-logo.png" alt="Monnify" className="h-6" />
                    <div className="w-px h-4 bg-gray-300" />
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">PCI DSS Compliant</span>
                </div>
            </form>
          </SlideUp>
        )}
      </AnimatePresence>
    </div>
  );
}
