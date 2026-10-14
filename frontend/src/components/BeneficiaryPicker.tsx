import React, { useState, useEffect, useMemo } from 'react';
import { Users, Search, X, Check, ArrowRight, Bookmark } from 'lucide-react';
import api from '../services/api';

export type Beneficiary = {
  id: string;
  name: string;
  phoneNumber?: string;
  network?: string;
};

interface BeneficiaryPickerProps {
  onSelect: (beneficiary: Beneficiary) => void;
  currentPhone?: string;
  className?: string;
  buttonLabel?: string;
}

export default function BeneficiaryPicker({
  onSelect,
  currentPhone,
  className = '',
  buttonLabel = 'Saved Beneficiaries',
}: BeneficiaryPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const fetchBeneficiaries = async () => {
    try {
      setLoading(true);
      const res = await api.get<Beneficiary[]>('/beneficiaries');
      setBeneficiaries(res.data || []);
    } catch (err) {
      console.error('Failed to load beneficiaries:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBeneficiaries();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return beneficiaries;
    const q = search.toLowerCase().trim();
    return beneficiaries.filter((b) => {
      const nameMatch = (b.name || '').toLowerCase().includes(q);
      const phoneMatch = (b.phoneNumber || '').includes(q);
      const netMatch = (b.network || '').toLowerCase().includes(q);
      return nameMatch || phoneMatch || netMatch;
    });
  }, [beneficiaries, search]);

  const getNetworkBadgeColor = (net?: string) => {
    switch (String(net || '').toLowerCase()) {
      case 'mtn':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'airtel':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'glo':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case '9mobile':
      case 't2':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const handleSelect = (b: Beneficiary) => {
    onSelect(b);
    setIsOpen(false);
  };

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen && beneficiaries.length === 0) {
            fetchBeneficiaries();
          }
        }}
        className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100 hover:border-primary-300 transition-colors shadow-sm"
        title="Choose from saved beneficiaries"
      >
        <Users className="w-3.5 h-3.5 text-primary-600" />
        <span>{buttonLabel}</span>
        {beneficiaries.length > 0 && (
          <span className="ml-0.5 px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-primary-600 text-white">
            {beneficiaries.length}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-md w-full overflow-hidden flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-primary-100 text-primary-700">
                  <Bookmark className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Select Beneficiary</h3>
                  <p className="text-xs text-slate-500">Pick a contact to autofill number & network</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Input */}
            <div className="p-4 border-b border-slate-100">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by name, phone or network..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  autoFocus
                />
              </div>
            </div>

            {/* Beneficiaries List */}
            <div className="p-4 overflow-y-auto space-y-2 flex-1 divide-y divide-slate-50">
              {loading ? (
                <div className="py-12 text-center text-sm text-slate-500">
                  <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  Loading beneficiaries...
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-12 text-center text-slate-500">
                  <Users className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                  <p className="text-sm font-medium text-slate-800">
                    {search ? 'No matching beneficiaries' : 'No saved beneficiaries yet'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                    {search
                      ? 'Try another search term'
                      : 'You can save contacts during purchase by ticking "Save as beneficiary" below.'}
                  </p>
                </div>
              ) : (
                filtered.map((b) => {
                  const isCurrent = currentPhone && b.phoneNumber && currentPhone.endsWith(b.phoneNumber.slice(-10));
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => handleSelect(b)}
                      className={`w-full text-left p-3 rounded-xl transition-all flex items-center justify-between group ${
                        isCurrent
                          ? 'bg-primary-50/80 border border-primary-200'
                          : 'hover:bg-slate-50 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-slate-100 group-hover:bg-primary-100 text-slate-700 group-hover:text-primary-700 font-bold flex items-center justify-center text-sm transition-colors uppercase">
                          {(b.name || b.network || 'B').charAt(0)}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-slate-900 group-hover:text-primary-700 transition-colors flex items-center gap-2">
                            <span>{b.name}</span>
                            {isCurrent && (
                              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-primary-600 text-white">
                                Current
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 font-mono mt-0.5">
                            {b.phoneNumber || 'No phone'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {b.network && (
                          <span
                            className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${getNetworkBadgeColor(
                              b.network
                            )}`}
                          >
                            {b.network}
                          </span>
                        )}
                        <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-primary-600 group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between text-xs text-slate-500">
              <span>{beneficiaries.length} total saved</span>
              <a
                href="/dashboard/beneficiaries"
                className="font-semibold text-primary-600 hover:text-primary-700 hover:underline"
              >
                Manage All Beneficiaries &rarr;
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
