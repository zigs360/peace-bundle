import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { Banknote, Building2, User, Hash, ArrowLeft, Loader2, CheckCircle, Search, CreditCard } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { FadeIn, SlideUp } from '../../components/animations/MotionComponents';

interface Bank {
  bank_code: string;
  bank_name: string;
}

export default function Transfer() {
  const navigate = useNavigate();
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loadingBanks, setLoadingBanks] = useState(true);
  const [selectedBank, setSelectedBank] = useState<Bank | null>(null);
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [resolving, setResolving] = useState(false);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successData, setSuccessData] = useState<any>(null);

  useEffect(() => {
    fetchBanks();
  }, []);

  const fetchBanks = async () => {
    try {
      const res = await api.get('/transfer/banks');
      if (res.data.success) {
        setBanks(res.data.data);
      }
    } catch (err: any) {
      toast.error('Failed to fetch bank list');
    } finally {
      setLoadingBanks(false);
    }
  };

  useEffect(() => {
    if (accountNumber.length === 10 && selectedBank) {
      handleResolve();
    } else {
      setAccountName('');
    }
  }, [accountNumber, selectedBank]);

  const handleResolve = async () => {
    if (!selectedBank) return;
    setResolving(true);
    setAccountName('');
    try {
      const res = await api.post('/transfer/resolve', {
        bank_code: selectedBank.bank_code,
        account_number: accountNumber
      });
      if (res.data.success) {
        setAccountName(res.data.data.account_name);
        toast.success('Account resolved successfully');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Could not resolve account');
    } finally {
      setResolving(false);
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBank || !accountNumber || !amount || !accountName) {
      toast.error('Please fill all required fields');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/transfer/send', {
        bank_code: selectedBank.bank_code,
        bank_name: selectedBank.bank_name,
        account_number: accountNumber,
        account_name: accountName,
        amount: parseFloat(amount),
        description
      });

      if (res.data.success) {
        setSuccessData(res.data.transaction);
        toast.success('Transfer initiated successfully!');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Transfer failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (successData) {
    return (
      <div className="max-w-md mx-auto text-center py-12">
        <motion.div 
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6"
        >
          <CheckCircle className="w-12 h-12 text-green-600" />
        </motion.div>
        <h2 className="text-3xl font-bold text-gray-900 mb-2">Transfer Successful</h2>
        <p className="text-gray-500 mb-8">Your ₦{successData.amount} transfer to {successData.metadata.account_name} is being processed.</p>
        
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 text-left mb-8 space-y-3">
          <div className="flex justify-between">
            <span className="text-gray-400">Reference:</span>
            <span className="font-mono font-bold">{successData.metadata.customerReference}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Bank:</span>
            <span className="font-bold">{successData.metadata.bank_name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Account:</span>
            <span className="font-bold">{successData.metadata.account_number}</span>
          </div>
        </div>

        <button 
          onClick={() => navigate('/dashboard')}
          className="w-full py-4 bg-primary-600 text-white rounded-xl font-bold hover:bg-primary-700 transition"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center mb-8">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-full mr-4 transition-colors">
          <ArrowLeft className="w-6 h-6 text-gray-600" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Bank Transfer</h1>
          <p className="text-gray-600">Send money instantly to any Nigerian bank</p>
        </div>
      </div>

      <SlideUp className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100">
        <form onSubmit={handleTransfer} className="space-y-6">
          {/* Bank Selection */}
          <div>
            <label className="block text-gray-700 font-bold mb-2">Select Bank</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Building2 className="h-5 w-5 text-gray-400" />
              </div>
              {loadingBanks ? (
                <div className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 bg-gray-50 flex items-center text-gray-400 italic">
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading banks...
                </div>
              ) : (
                <select
                  required
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all bg-white"
                  onChange={(e) => {
                    const bank = banks.find(b => b.bank_code === e.target.value);
                    setSelectedBank(bank || null);
                  }}
                  value={selectedBank?.bank_code || ''}
                >
                  <option value="">Choose a bank...</option>
                  {banks.map((bank) => (
                    <option key={bank.bank_code} value={bank.bank_code}>
                      {bank.bank_name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Account Number */}
          <div>
            <label className="block text-gray-700 font-bold mb-2">Account Number</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Hash className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                maxLength={10}
                required
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all"
                placeholder="10-digit account number"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
              />
              {resolving && (
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                  <Loader2 className="h-5 w-5 text-primary-500 animate-spin" />
                </div>
              )}
            </div>
          </div>

          {/* Resolved Name Display */}
          <AnimatePresence>
            {accountName && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="p-4 bg-green-50 rounded-xl border border-green-100 flex items-center gap-3"
              >
                <div className="p-2 bg-green-100 rounded-full">
                  <User className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <p className="text-[10px] text-green-600 font-bold uppercase tracking-wider">Account Holder</p>
                  <p className="text-sm font-bold text-green-800">{accountName}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Amount */}
          <div>
            <label className="block text-gray-700 font-bold mb-2">Amount (₦)</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Banknote className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="number"
                required
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all"
                placeholder="Enter amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <p className="text-[10px] text-gray-400 mt-2 italic px-1">Note: A fixed fee of ₦50.00 will be added to this transfer.</p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-gray-700 font-bold mb-2">Description (Optional)</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all"
                placeholder="What's this for?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || !accountName || !amount}
            className="w-full bg-primary-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-primary-700 transition-all shadow-lg shadow-primary-500/30 disabled:opacity-50 flex items-center justify-center"
          >
            {submitting ? (
              <>
                <Loader2 className="w-6 h-6 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              `Send ₦${amount ? (parseFloat(amount) + 50).toFixed(2) : '0.00'}`
            )}
          </button>
        </form>
      </SlideUp>

      {/* Info Card */}
      <FadeIn className="mt-8 p-6 bg-primary-50 rounded-3xl border border-primary-100 flex items-start gap-4">
        <div className="p-3 bg-white rounded-2xl shadow-sm">
          <CreditCard className="w-6 h-6 text-primary-600" />
        </div>
        <div>
          <h4 className="font-bold text-primary-900">Safe & Secure</h4>
          <p className="text-sm text-primary-700">All transfers are processed instantly and secured by SMEPlug. Please verify the account holder's name before sending.</p>
        </div>
      </FadeIn>
    </div>
  );
}
