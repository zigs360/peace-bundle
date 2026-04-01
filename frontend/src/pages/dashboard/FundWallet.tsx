import { useState, useEffect } from 'react';
import api from '../../services/api';
import { Wallet, CreditCard, Building2, Copy, RefreshCw, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';
import { FadeIn, StaggerContainer, StaggerItem } from '../../components/animations/MotionComponents';
import { AnimatePresence, motion } from 'framer-motion';
import { User } from '../../types';
import toast from 'react-hot-toast';
import { useVirtualAccount } from '../../hooks/useVirtualAccount';
import VirtualAccountWidget from '../../components/VirtualAccountWidget';

export default function FundWallet() {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'card' | 'transfer' | 'virtual'>('card');
  const [loading, setLoading] = useState(false);
  const [fetchingUser, setFetchingUser] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const { state: va, hasVirtualAccount, refresh: refreshVa, reveal: revealVa, auditCopy, request: requestVa } = useVirtualAccount();

  useEffect(() => {
    fetchUserProfile();
  }, []);

  useEffect(() => {
    if (hasVirtualAccount) {
      setMethod('virtual');
    }
  }, [hasVirtualAccount]);

  const fetchUserProfile = async () => {
    setFetchingUser(true);
    try {
      const res = await api.get('/auth/me');
      const userData = res.data;
      setUser(userData);
      const userForStorage = { ...userData };
      delete userForStorage.virtual_account_number;
      delete userForStorage.virtual_account_bank;
      delete userForStorage.virtual_account_name;
      localStorage.setItem('user', JSON.stringify(userForStorage));
    } catch (err) {
      console.error('Failed to fetch user profile', err);
      toast.error('Failed to load account details');
    } finally {
      setFetchingUser(false);
    }
  };

  const handleCopy = (text: string, field: string) => {
    if (!text) return;
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
      const reference = `MNFY-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;

      await api.post('/transactions/fund', {
        userId: user?.id,
        amount: parseFloat(amount),
        method,
        reference
      });

      toast.success('Wallet funding initiated successfully!');
      setAmount('');
      // Optionally redirect or refresh balance
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Funding failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (fetchingUser) {
    return (
      <div className="flex flex-col items-center justify-center h-[400px]">
        <RefreshCw className="w-10 h-10 text-primary-600 animate-spin mb-4" />
        <p className="text-gray-500 font-medium animate-pulse">Setting up your secure funding options...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 md:py-10">
      <FadeIn className="flex items-center mb-10">
        <div className="p-4 bg-primary-100 rounded-2xl mr-5 shadow-sm">
          <Wallet className="w-10 h-10 text-primary-600" />
        </div>
        <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Fund Wallet</h1>
            <p className="text-gray-500 text-lg">Instant and secure ways to top up your balance</p>
        </div>
      </FadeIn>

      <StaggerContainer className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        {/* Dedicated Virtual Account */}
        <StaggerItem>
            <div
                className={`p-6 rounded-3xl border-2 h-full flex flex-col cursor-pointer transition-all duration-300 relative overflow-hidden ${
                    method === 'virtual' 
                    ? 'border-primary-600 bg-white shadow-xl shadow-primary-100 ring-1 ring-primary-600' 
                    : 'border-transparent bg-white shadow-md hover:border-primary-200'
                }`}
                onClick={() => setMethod('virtual')}
            >
                {method === 'virtual' && <div className="absolute top-0 left-0 w-full h-1.5 bg-primary-600" />}
                <div className="flex items-center mb-4">
                    <div className={`p-3 rounded-xl ${method === 'virtual' ? 'bg-primary-600 text-white' : 'bg-primary-50 text-primary-600'}`}>
                        <Building2 className="w-6 h-6" />
                    </div>
                    <div className="ml-3">
                        <h3 className="font-bold text-gray-900">Virtual Account</h3>
                        <span className="text-[10px] uppercase tracking-wider font-bold text-primary-600">Recommended</span>
                    </div>
                </div>
                <p className="text-sm text-gray-600 flex-grow leading-relaxed">Instant automated funding. Your dedicated bank account for 24/7 wallet top-ups.</p>
                {method === 'virtual' && <CheckCircle2 className="w-5 h-5 text-primary-600 absolute top-4 right-4" />}
            </div>
        </StaggerItem>

        {/* Card Payment */}
        <StaggerItem>
            <div
                className={`p-6 rounded-3xl border-2 h-full flex flex-col cursor-pointer transition-all duration-300 relative overflow-hidden ${
                    method === 'card' 
                    ? 'border-primary-600 bg-white shadow-xl shadow-primary-100 ring-1 ring-primary-600' 
                    : 'border-transparent bg-white shadow-md hover:border-primary-200'
                }`}
                onClick={() => setMethod('card')}
            >
                {method === 'card' && <div className="absolute top-0 left-0 w-full h-1.5 bg-primary-600" />}
                <div className="flex items-center mb-4">
                    <div className={`p-3 rounded-xl ${method === 'card' ? 'bg-primary-600 text-white' : 'bg-primary-50 text-primary-600'}`}>
                        <CreditCard className="w-6 h-6" />
                    </div>
                    <div className="ml-3">
                        <h3 className="font-bold text-gray-900">Pay Online</h3>
                        <span className="text-[10px] uppercase tracking-wider font-bold text-primary-600">Instant</span>
                    </div>
                </div>
                <p className="text-sm text-gray-600 flex-grow leading-relaxed">Fund with Cards, USSD or Bank App via Monnify. Standard 1.5% gateway fee.</p>
                {method === 'card' && <CheckCircle2 className="w-5 h-5 text-primary-600 absolute top-4 right-4" />}
            </div>
        </StaggerItem>

        {/* Manual Transfer */}
        <StaggerItem>
            <div
                className={`p-6 rounded-3xl border-2 h-full flex flex-col cursor-pointer transition-all duration-300 relative overflow-hidden ${
                    method === 'transfer' 
                    ? 'border-primary-600 bg-white shadow-xl shadow-primary-100 ring-1 ring-primary-600' 
                    : 'border-transparent bg-white shadow-md hover:border-primary-200'
                }`}
                onClick={() => setMethod('transfer')}
            >
                {method === 'transfer' && <div className="absolute top-0 left-0 w-full h-1.5 bg-gray-600" />}
                <div className="flex items-center mb-4">
                    <div className={`p-3 rounded-xl ${method === 'transfer' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600'}`}>
                        <Building2 className="w-6 h-6" />
                    </div>
                    <div className="ml-3">
                        <h3 className="font-bold text-gray-900">Direct Transfer</h3>
                        <span className="text-[10px] uppercase tracking-wider font-bold text-gray-500">Manual</span>
                    </div>
                </div>
                <p className="text-sm text-gray-600 flex-grow leading-relaxed">Transfer to our business account and upload receipt for manual confirmation.</p>
                {method === 'transfer' && <CheckCircle2 className="w-5 h-5 text-gray-800 absolute top-4 right-4" />}
            </div>
        </StaggerItem>
      </StaggerContainer>

      <AnimatePresence mode="wait">
        {method === 'virtual' ? (
          <motion.div 
            key="virtual" 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="bg-white p-8 rounded-[2rem] shadow-2xl border border-gray-100 overflow-hidden relative"
          >
            <div className="flex justify-between items-start mb-8">
                <div>
                    <h3 className="text-2xl font-black text-gray-900 mb-1">Dedicated Virtual Account</h3>
                    <p className="text-gray-500">Payments sent here reflect in your wallet automatically.</p>
                </div>
                <button 
                    onClick={async () => {
                        await fetchUserProfile();
                        await refreshVa();
                    }}
                    className="p-3 bg-gray-50 hover:bg-gray-100 rounded-2xl transition-all text-gray-500 hover:text-primary-600 active:scale-95"
                    title="Refresh Account"
                >
                    <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            <VirtualAccountWidget state={va} onReveal={revealVa} onCopy={auditCopy} onRetry={refreshVa} onRequest={requestVa} variant="fund" />

            {va.status === 'ready' && (
              <div className="mt-6 p-6 bg-amber-50 rounded-3xl border border-amber-100 flex items-start">
                <AlertCircle className="w-6 h-6 text-amber-600 mt-0.5 mr-4 shrink-0" />
                <div>
                  <p className="text-sm text-amber-900 font-bold mb-1">Important Note</p>
                  <p className="text-xs text-amber-800 leading-relaxed opacity-80">
                    Standard processing fee of <span className="font-black">₦50</span> applies per transaction by our banking partners. Deposits below ₦100 may not be processed.
                  </p>
                </div>
              </div>
            )}
          </motion.div>
        ) : method === 'transfer' ? (
          <motion.div 
            key="transfer"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="bg-white p-8 rounded-[2rem] shadow-2xl border border-gray-100 overflow-hidden relative"
          >
              <h3 className="text-2xl font-black text-gray-900 mb-2">Our Business Account</h3>
              <p className="text-gray-500 mb-10">Use these details for manual funding via bank transfer.</p>
              
              <div className="space-y-4 mb-10">
                  <div className="flex justify-between items-center p-5 bg-gray-50 rounded-2xl border border-gray-100">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Bank Name</span>
                      <span className="font-black text-gray-900">Moniepoint</span>
                  </div>
                  <div className="flex justify-between items-center p-5 bg-gray-50 rounded-2xl border border-gray-100">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Account Name</span>
                      <span className="font-black text-gray-900">Peace Bundlle Ltd</span>
                  </div>
                  <div className="flex justify-between items-center p-8 bg-primary-50 rounded-[2rem] border border-primary-100 relative group">
                      <span className="text-[10px] font-black text-primary-400 uppercase tracking-[0.2em]">Account Number</span>
                      <div className="flex items-center gap-4">
                          <span className="font-mono text-3xl font-black text-primary-700">1234567890</span>
                          <button onClick={() => handleCopy('1234567890', 'Manual Account')} className="p-3 bg-primary-600 text-white rounded-2xl hover:bg-primary-700 transition-all shadow-lg active:scale-95">
                              <Copy className="w-5 h-5" />
                          </button>
                          {copiedField === 'Manual Account' && <span className="absolute -top-4 right-10 text-[10px] font-black text-green-600 bg-white px-2 py-1 rounded-lg border border-green-100 shadow-sm animate-bounce">COPIED!</span>}
                      </div>
                  </div>
              </div>

              <div className="text-center p-10 bg-gray-900 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden">
                  <div className="absolute right-0 top-0 w-32 h-32 bg-primary-600/20 rounded-full blur-3xl" />
                  <p className="text-lg font-bold mb-8 relative z-10 leading-relaxed">After transfer, please send your proof of payment to our support team for instant confirmation.</p>
                  <a 
                    href={`https://wa.me/2348035446865?text=${encodeURIComponent('I just made a manual transfer for wallet funding. Here is my receipt.')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-10 py-5 bg-primary-600 text-white font-black rounded-[1.5rem] hover:bg-primary-700 transition-all shadow-xl shadow-primary-900/20 active:scale-95 relative z-10"
                  >
                    Send Receipt to WhatsApp
                    <ExternalLink className="w-5 h-5 ml-3" />
                  </a>
              </div>
          </motion.div>
        ) : (
          <motion.div 
            key="card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="bg-white p-8 rounded-[2rem] shadow-2xl border border-gray-100 overflow-hidden relative"
          >
            <h3 className="text-2xl font-black text-gray-900 mb-2">Secure Online Payment</h3>
            <p className="text-gray-500 mb-10">Pay securely using your debit card or bank app via Monnify gateway.</p>

            <form onSubmit={handleFund}>
                <div className="mb-10">
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Amount to Fund (₦)</label>
                    <div className="relative">
                        <span className="absolute left-6 top-1/2 -translate-y-1/2 text-3xl font-black text-gray-400">₦</span>
                        <input
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="w-full pl-16 pr-8 py-6 rounded-3xl bg-gray-50 border-2 border-gray-100 focus:border-primary-500 focus:bg-white focus:outline-none transition-all text-3xl font-black text-gray-900 shadow-inner"
                            placeholder="0.00"
                            required
                            min="100"
                        />
                    </div>
                    {amount && parseFloat(amount) > 0 && (
                        <div className="mt-5 p-4 bg-primary-50 rounded-2xl border border-primary-100 flex justify-between items-center">
                            <span className="text-sm font-bold text-primary-600">Gateway Processing Fee (1.5%):</span>
                            <span className="text-lg font-black text-primary-700">₦{(parseFloat(amount) * 0.015).toFixed(2)}</span>
                        </div>
                    )}
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className={`w-full py-6 px-8 bg-primary-600 text-white text-xl font-black rounded-3xl hover:bg-primary-700 hover:shadow-2xl hover:shadow-primary-200 transition-all duration-300 flex items-center justify-center group ${
                        loading ? 'opacity-70 cursor-not-allowed' : 'active:scale-[0.98]'
                    }`}
                >
                    {loading ? (
                        <>
                            <RefreshCw className="w-7 h-7 mr-3 animate-spin" />
                            Connecting to Secure Gateway...
                        </>
                    ) : (
                        <>
                            Pay Securely Now
                            <CheckCircle2 className="w-6 h-6 ml-3 opacity-50 group-hover:opacity-100 transition-opacity" />
                        </>
                    )}
                </button>
                
                <div className="mt-8 flex items-center justify-center gap-6 opacity-40 grayscale hover:grayscale-0 transition-all duration-500">
                    <img src="https://monnify.com/assets/images/monnify-logo.png" alt="Monnify" className="h-6" />
                    <div className="w-px h-5 bg-gray-300" />
                    <div className="flex flex-col items-center">
                        <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest">Secured by</span>
                        <span className="text-[10px] font-black text-gray-900 uppercase tracking-widest">PCI DSS</span>
                    </div>
                </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-12 text-center">
          <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">
              Need help? <a href="/dashboard/support" className="text-primary-600 hover:underline">Contact our support team</a>
          </p>
      </div>
    </div>
  );
}
