import { useEffect, useState } from 'react';
import { AlertCircle, Building2, Copy, Eye, EyeOff, RefreshCw, ShieldCheck, Wallet } from 'lucide-react';
import type { VirtualAccountState } from '../hooks/useVirtualAccount';

type Props = {
  state: VirtualAccountState;
  onReveal: () => Promise<string | null>;
  onCopy: () => Promise<void>;
  onRetry: () => Promise<void>;
  variant?: 'dashboard' | 'fund';
};

export default function VirtualAccountWidget({ state, onReveal, onCopy, onRetry, variant = 'dashboard' }: Props) {
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [revealedNumber, setRevealedNumber] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (state.status !== 'ready') {
      setRevealed(false);
      setRevealedNumber(null);
      setCopied(false);
      setActionError(null);
    }
  }, [state.status]);

  const handleReveal = async () => {
    setActionError(null);
    if (revealed && revealedNumber) {
      setRevealed(false);
      return;
    }
    const full = await onReveal();
    if (!full) {
      setActionError('Unable to reveal account number right now. Please try again.');
      return;
    }
    setRevealedNumber(full);
    setRevealed(true);
  };

  const handleCopy = async () => {
    setActionError(null);
    if (!revealedNumber) {
      setActionError('Reveal the account number before copying.');
      return;
    }
    await navigator.clipboard.writeText(revealedNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    await onCopy();
  };

  if (variant === 'fund') {
    if (state.status === 'loading') {
      return (
        <div className="text-center py-16 px-6 bg-gray-50 rounded-[2rem] border border-gray-100">
          <RefreshCw className="w-10 h-10 text-primary-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-500 font-medium">Loading your virtual account…</p>
        </div>
      );
    }

    if (state.status === 'error') {
      return (
        <div className="text-center py-16 px-6 bg-gray-50 rounded-[2rem] border border-gray-100">
          <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-4" />
          <h4 className="text-xl font-black text-gray-900 mb-3">Unable to load virtual account</h4>
          <p className="text-gray-500 mb-8 max-w-sm mx-auto font-medium">{state.errorMessage}</p>
          <button
            onClick={onRetry}
            className="inline-flex items-center px-8 py-4 bg-primary-600 text-white font-black rounded-2xl hover:bg-primary-700 transition-all shadow-xl shadow-primary-100 active:scale-95"
          >
            <RefreshCw className="w-5 h-5 mr-3" />
            Retry
          </button>
        </div>
      );
    }

    if (state.status === 'empty') {
      return (
        <div className="text-center py-16 px-6 bg-gray-50 rounded-[2rem] border-2 border-dashed border-gray-200">
          <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-sm border border-gray-100">
            <Building2 className="w-10 h-10 text-gray-300" />
          </div>
          <h4 className="text-2xl font-black text-gray-900 mb-3">No Virtual Account Found</h4>
          <p className="text-gray-500 mb-8 max-w-sm mx-auto font-medium">
            {state.summary.message || "We couldn't find a dedicated account for you. This could be because your KYC is pending or there's a connection delay."}
          </p>
          <button
            onClick={onRetry}
            className="inline-flex items-center px-8 py-4 bg-primary-600 text-white font-black rounded-2xl hover:bg-primary-700 transition-all shadow-xl shadow-primary-100 active:scale-95"
          >
            <RefreshCw className="w-5 h-5 mr-3" />
            Refresh Account Details
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 transition-all hover:bg-gray-100">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] block mb-2">Bank Name</span>
            <span className="text-xl font-black text-gray-900">{state.summary.bankName}</span>
          </div>
          <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 transition-all hover:bg-gray-100">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] block mb-2">Account Name</span>
            <span className="text-xl font-black text-gray-900 truncate block">{state.summary.accountName}</span>
          </div>
        </div>

        <div className="bg-primary-600 p-10 rounded-[2rem] text-white shadow-2xl shadow-primary-200 flex flex-col items-center text-center relative overflow-hidden">
          <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute -left-10 -top-10 w-40 h-40 bg-white/10 rounded-full blur-3xl" />

          <div className="flex items-center justify-between w-full mb-4 relative z-10">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary-200" />
              <span className="text-xs font-bold text-primary-200 uppercase tracking-[0.3em]">Account Number</span>
            </div>
            <button
              onClick={handleReveal}
              className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/10 hover:bg-white/20 transition-colors text-sm font-bold"
            >
              {revealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {revealed ? 'Hide' : 'Reveal'}
            </button>
          </div>

          <div className="flex items-center gap-5 mb-2 relative z-10">
            <span className="text-5xl md:text-6xl font-mono font-black tracking-tighter leading-none select-all">
              {revealed && revealedNumber ? revealedNumber : state.summary.accountNumberMasked}
            </span>
            <button
              onClick={handleCopy}
              className="p-4 bg-white/20 hover:bg-white/30 rounded-2xl transition-all active:scale-95 border border-white/20 disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={!revealedNumber}
              title="Copy Account Number"
            >
              <Copy className="w-7 h-7" />
              {copied && <span className="absolute -top-10 right-0 text-xs font-black text-white bg-green-500 px-3 py-1.5 rounded-xl shadow-lg animate-bounce z-20">COPIED!</span>}
            </button>
          </div>

          {actionError && (
            <div className="mt-4 text-xs text-red-100 bg-red-500/20 border border-red-500/30 rounded px-3 py-2 relative z-10">
              {actionError}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (state.status === 'loading') {
    return (
      <div className="mb-8 bg-gradient-to-r from-primary-600 to-primary-800 rounded-lg shadow-lg p-6 text-white">
        <div className="flex items-center gap-2 mb-2">
          <Wallet className="w-6 h-6 text-primary-200" />
          <h2 className="text-xl font-bold">Loading virtual account…</h2>
        </div>
        <p className="text-primary-100 max-w-md">Fetching your dedicated account details securely.</p>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="mb-8 bg-gradient-to-r from-primary-600 to-primary-800 rounded-lg shadow-lg p-6 text-white">
        <div className="flex items-center gap-2 mb-2">
          <Wallet className="w-6 h-6 text-primary-200" />
          <h2 className="text-xl font-bold">Unable to load virtual account</h2>
        </div>
        <p className="text-primary-100 max-w-md">{state.errorMessage}</p>
        <div className="mt-4">
          <button onClick={onRetry} className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded transition-colors text-sm">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (state.status === 'empty') {
    return (
      <div className="mb-8 bg-gradient-to-r from-primary-600 to-primary-800 rounded-lg shadow-lg p-6 text-white">
        <div className="flex items-center gap-2 mb-2">
          <Wallet className="w-6 h-6 text-primary-200" />
          <h2 className="text-xl font-bold">Virtual account not available yet</h2>
        </div>
        <p className="text-primary-100 max-w-md">{state.summary.message || 'Please check back later.'}</p>
      </div>
    );
  }

  return (
    <div className="mb-8 bg-gradient-to-r from-primary-600 to-primary-800 rounded-lg shadow-lg p-6 text-white transform transition-all hover:scale-[1.01]">
      <div className="flex flex-col md:flex-row justify-between items-center gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="w-6 h-6 text-primary-200" />
            <h2 className="text-xl font-bold">Fund your wallet instantly!</h2>
          </div>
          <p className="text-primary-100 max-w-md">
            Transfer money to your dedicated virtual account number below and your wallet will be funded automatically.
          </p>
        </div>
        <div className="bg-white/10 p-5 rounded-xl backdrop-blur-md border border-white/20 min-w-full md:min-w-[320px] shadow-inner">
          <div className="flex items-center justify-between mb-3 border-b border-white/10 pb-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary-200" />
              <span className="text-sm text-primary-200">Verified Account</span>
            </div>
            <button
              onClick={handleReveal}
              className="flex items-center gap-2 px-3 py-1 rounded bg-white/10 hover:bg-white/20 transition-colors text-sm"
              title={revealed ? 'Hide account number' : 'Reveal account number'}
            >
              {revealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {revealed ? 'Hide' : 'Reveal'}
            </button>
          </div>
          <div className="flex justify-between mb-3 border-b border-white/10 pb-2">
            <span className="text-sm text-primary-200">Bank Name</span>
            <span className="font-bold tracking-wide">{state.summary.bankName}</span>
          </div>
          <div className="flex justify-between mb-3 items-center">
            <span className="text-sm text-primary-200">Account Number</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-2xl font-bold tracking-wider">
                {revealed && revealedNumber ? revealedNumber : state.summary.accountNumberMasked}
              </span>
              <button
                onClick={handleCopy}
                className="p-1 hover:bg-white/20 rounded transition-colors relative disabled:opacity-60 disabled:cursor-not-allowed"
                title="Copy Account Number"
                disabled={!revealedNumber}
              >
                <Copy className="w-4 h-4" />
                {copied && <span className="absolute -top-7 right-0 bg-black text-white text-xs px-2 py-1 rounded">Copied!</span>}
              </button>
            </div>
          </div>
          {actionError && <div className="text-xs text-red-100 bg-red-500/20 border border-red-500/30 rounded px-3 py-2 mb-3">{actionError}</div>}
          <div className="flex justify-between pt-1">
            <span className="text-sm text-primary-200">Account Name</span>
            <span className="font-medium text-sm truncate max-w-[180px]">{state.summary.accountName}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

