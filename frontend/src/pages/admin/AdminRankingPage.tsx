import { useState, useEffect, useMemo } from 'react';
import api, { SERVER_ROOT_URL } from '../../services/api';
import { 
  Trophy, 
  Award, 
  Users, 
  TrendingUp, 
  Zap, 
  Search, 
  RefreshCw, 
  Gift, 
  X, 
  CheckCircle, 
  Wallet, 
  UserCheck, 
  Flame, 
  ArrowRight,
  ExternalLink
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

interface RankedUser {
  rank: number;
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  avatar: string | null;
  accountStatus: string;
  walletBalance: number;
  score: number;
  totalVolume?: number;
  transactionCount?: number;
  qualifiedReferrals?: number;
}

interface RankingSummary {
  totalRankedUsers: number;
  totalVolume?: number;
  totalTransactions?: number;
  totalReferrals?: number;
  topPerformer: RankedUser | null;
}

export default function AdminRankingPage() {
  const [period, setPeriod] = useState<'week' | 'month' | 'all_time'>('all_time');
  const [category, setCategory] = useState<'volume' | 'transactions' | 'referrals'>('volume');
  const [leaderboard, setLeaderboard] = useState<RankedUser[]>([]);
  const [summary, setSummary] = useState<RankingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  // Reward Modal States
  const [selectedUser, setSelectedUser] = useState<RankedUser | null>(null);
  const [rewardAmount, setRewardAmount] = useState('');
  const [rewardTitle, setRewardTitle] = useState('Top Activity Award');
  const [rewardReason, setRewardReason] = useState('');
  const [notifyUser, setNotifyUser] = useState(true);
  const [isSubmittingReward, setIsSubmittingReward] = useState(false);

  const fetchRankings = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await api.get(`/admin/leaderboard?period=${period}&category=${category}&limit=50`);
      if (res.data?.success) {
        setLeaderboard(res.data.leaderboard || []);
        setSummary(res.data.summary || null);
      }
    } catch (err: any) {
      console.error('Failed to load admin rankings', err);
      toast.error(err.response?.data?.message || 'Failed to load rankings');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchRankings();
  }, [period, category]);

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return leaderboard;
    const q = search.toLowerCase().trim();
    return leaderboard.filter((u) => 
      (u.name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.phone || '').includes(q)
    );
  }, [leaderboard, search]);

  const openRewardModal = (user: RankedUser) => {
    setSelectedUser(user);
    setRewardAmount('');
    const defaultTitle = 
      category === 'volume' 
        ? (user.rank === 1 ? 'Volume Champion Bonus' : 'Top Spender Reward')
        : category === 'referrals'
          ? 'Referral Star Award'
          : 'High Transaction Bonus';
    setRewardTitle(defaultTitle);
    setRewardReason(`Recognized for exceptional #${user.rank} ranking in ${category === 'volume' ? 'purchase volume' : category} on Peace Bundle.`);
    setNotifyUser(true);
  };

  const handleRewardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    const amountNum = parseFloat(rewardAmount);
    if (!amountNum || amountNum <= 0) {
      toast.error('Please enter a valid reward amount in Naira');
      return;
    }

    try {
      setIsSubmittingReward(true);
      const res = await api.post('/admin/leaderboard/reward', {
        userId: selectedUser.id,
        amount: amountNum,
        title: rewardTitle.trim(),
        reason: rewardReason.trim(),
        notifyUser,
      });

      if (res.data?.success) {
        toast.success(res.data.message || `Successfully rewarded ${selectedUser.name}!`);
        setSelectedUser(null);
        fetchRankings(true);
      }
    } catch (err: any) {
      console.error('Failed to award user', err);
      toast.error(err.response?.data?.message || 'Failed to process reward');
    } finally {
      setIsSubmittingReward(false);
    }
  };

  const getRankBadge = (rank: number) => {
    switch (rank) {
      case 1:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-extrabold bg-amber-100 text-amber-800 border border-amber-300 shadow-xs">
            <Trophy className="w-3.5 h-3.5 text-amber-600 fill-amber-500" /> #1 Champion
          </span>
        );
      case 2:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-800 border border-slate-300 shadow-xs">
            <Award className="w-3.5 h-3.5 text-slate-500" /> #2 Runner-Up
          </span>
        );
      case 3:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-800 border border-orange-200 shadow-xs">
            <Flame className="w-3.5 h-3.5 text-orange-600" /> #3 Finalist
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-700">
            #{rank}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-primary-950 to-primary-900 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-64 h-64 bg-primary-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-xs font-semibold text-amber-300 mb-3 border border-white/10">
              <Trophy className="w-4 h-4 text-amber-400" />
              Administrative Intelligence
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Top User Rankings & Activity Rewards</h1>
            <p className="text-slate-300 text-sm mt-1.5 max-w-2xl leading-relaxed">
              Real-time rankings based on actual purchase transactions and verified referrals. Review member activity, unmask full contact profiles, and distribute bonuses directly into their wallets.
            </p>
          </div>
          <button
            onClick={() => fetchRankings(true)}
            disabled={refreshing || loading}
            className="self-start md:self-auto inline-flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-2xl text-xs font-semibold text-white border border-white/15 transition shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh Data
          </button>
        </div>

        {/* Quick Highlights in Banner */}
        {summary && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 pt-6 border-t border-white/10 text-white">
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-4 border border-white/10">
              <span className="text-xs text-slate-400 block font-medium">Ranked Active Members</span>
              <span className="text-xl font-bold mt-1 block">{summary.totalRankedUsers} users</span>
            </div>
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-4 border border-white/10">
              <span className="text-xs text-slate-400 block font-medium">
                {category === 'volume' ? 'Top Group Spend' : category === 'transactions' ? 'Total Group Transactions' : 'Total Group Referrals'}
              </span>
              <span className="text-xl font-bold mt-1 block">
                {category === 'volume' 
                  ? `₦${(summary.totalVolume || 0).toLocaleString()}` 
                  : category === 'transactions'
                    ? `${(summary.totalTransactions || 0).toLocaleString()} txns`
                    : `${(summary.totalReferrals || 0).toLocaleString()} referrals`}
              </span>
            </div>
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-4 border border-white/10">
              <span className="text-xs text-slate-400 block font-medium">Current #1 Performer</span>
              <span className="text-xl font-bold mt-1 block truncate">
                {summary.topPerformer ? summary.topPerformer.name : 'None yet'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Control Bar: Filters & Search */}
      <div className="bg-white p-5 rounded-2xl shadow-soft border border-slate-100 flex flex-col lg:flex-row items-center justify-between gap-4">
        {/* Category Tabs */}
        <div className="flex bg-slate-100 p-1.5 rounded-xl w-full lg:w-auto">
          <button
            onClick={() => setCategory('volume')}
            className={`flex-1 lg:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
              category === 'volume'
                ? 'bg-white text-primary-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5 text-primary-600" />
            Top Volume (₦)
          </button>
          <button
            onClick={() => setCategory('transactions')}
            className={`flex-1 lg:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
              category === 'transactions'
                ? 'bg-white text-primary-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            Transaction Count
          </button>
          <button
            onClick={() => setCategory('referrals')}
            className={`flex-1 lg:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
              category === 'referrals'
                ? 'bg-white text-primary-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-emerald-600" />
            Referrals
          </button>
        </div>

        {/* Right side: Period filter & Search */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
          <div className="flex bg-slate-100 p-1.5 rounded-xl w-full sm:w-auto">
            <button
              onClick={() => setPeriod('week')}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                period === 'week' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              This Week
            </button>
            <button
              onClick={() => setPeriod('month')}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                period === 'month' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              This Month
            </button>
            <button
              onClick={() => setPeriod('all_time')}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                period === 'all_time' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              All Time
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Filter by name, email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
      </div>

      {/* Main Ranking Table */}
      <div className="bg-white rounded-2xl shadow-soft border border-slate-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
          <div>
            <h3 className="font-bold text-sm text-slate-900">Rankings Leaderboard</h3>
            <p className="text-xs text-slate-500">Showing {filteredUsers.length} ranked members</p>
          </div>
        </div>

        {loading ? (
          <div className="py-20 text-center">
            <RefreshCw className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-3" />
            <p className="text-sm text-slate-500">Loading ranking records...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="py-16 text-center">
            <Award className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h4 className="font-bold text-slate-800 text-sm">No activity found</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
              No completed transactions or qualified referrals found for this filter combination.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 uppercase tracking-wider text-[10px] bg-slate-50/50">
                  <th className="py-3 px-4">Rank</th>
                  <th className="py-3 px-4">Member Info</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Wallet Balance</th>
                  <th className="py-3 px-4">
                    {category === 'volume' ? 'Total Volume (₦)' : category === 'transactions' ? 'Completed Txns' : 'Qualified Referrals'}
                  </th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-bold">
                      {getRankBadge(user.rank)}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-700 overflow-hidden shrink-0">
                          {user.avatar ? (
                            <img src={`${SERVER_ROOT_URL}/${user.avatar}`} alt={user.name} className="w-full h-full object-cover" />
                          ) : (
                            (user.name || user.email || 'U').charAt(0).toUpperCase()
                          )}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                            <span>{user.name || 'Unnamed User'}</span>
                            {user.accountStatus === 'banned' && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-red-100 text-red-700">Banned</span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500">{user.email} • {user.phone || 'No phone'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                        user.role === 'admin' 
                          ? 'bg-purple-100 text-purple-700' 
                          : user.role === 'reseller'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-slate-100 text-slate-600'
                      }`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                      ₦{Number(user.walletBalance || 0).toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4">
                      {category === 'volume' ? (
                        <div>
                          <span className="font-extrabold text-slate-900 text-sm">
                            ₦{Number(user.totalVolume || user.score || 0).toLocaleString()}
                          </span>
                          <span className="text-[10px] text-slate-400 block">
                            {user.transactionCount || 0} transactions
                          </span>
                        </div>
                      ) : category === 'transactions' ? (
                        <div>
                          <span className="font-extrabold text-slate-900 text-sm">
                            {(user.transactionCount || user.score || 0).toLocaleString()} txns
                          </span>
                          <span className="text-[10px] text-slate-400 block font-mono">
                            ₦{Number(user.totalVolume || 0).toLocaleString()} volume
                          </span>
                        </div>
                      ) : (
                        <div>
                          <span className="font-extrabold text-emerald-700 text-sm">
                            {(user.qualifiedReferrals || user.score || 0).toLocaleString()} qualified
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openRewardModal(user)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition shadow-xs"
                          title="Reward this user with wallet bonus"
                        >
                          <Gift className="w-3.5 h-3.5" />
                          Reward
                        </button>
                        <a
                          href={`/admin/users?search=${encodeURIComponent(user.email)}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-medium transition"
                          title="Manage user in User Management"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Manage
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reward Modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-md w-full overflow-hidden flex flex-col">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-amber-50 to-orange-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-amber-500 text-white rounded-2xl shadow-sm">
                  <Gift className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Award User Bonus</h3>
                  <p className="text-xs text-slate-500">Credit wallet directly for outstanding performance</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-white/60 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRewardSubmit} className="p-6 space-y-4">
              {/* Selected User Info Card */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-400">Recipient</div>
                  <div className="font-bold text-sm text-slate-900">{selectedUser.name || 'User'}</div>
                  <div className="text-xs text-slate-500">{selectedUser.email}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-400">Current Balance</div>
                  <div className="font-bold text-sm text-primary-700">
                    ₦{Number(selectedUser.walletBalance || 0).toLocaleString()}
                  </div>
                  <div className="text-[10px] font-bold text-amber-600 uppercase mt-0.5">
                    Rank #{selectedUser.rank}
                  </div>
                </div>
              </div>

              {/* Amount Input */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Reward Amount (₦)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-sm">₦</span>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    required
                    placeholder="Enter bonus amount (e.g. 2000)"
                    value={rewardAmount}
                    onChange={(e) => setRewardAmount(e.target.value)}
                    className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
                    autoFocus
                  />
                </div>
                {/* Preset Chips */}
                <div className="flex gap-2 mt-2">
                  {[500, 1000, 2000, 5000, 10000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setRewardAmount(String(preset))}
                      className="px-2 py-1 bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-800 text-[10px] font-bold rounded-lg transition"
                    >
                      +₦{preset.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Title & Reason */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Award Title
                </label>
                <input
                  type="text"
                  required
                  value={rewardTitle}
                  onChange={(e) => setRewardTitle(e.target.value)}
                  placeholder="e.g. Volume Champion Bonus"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Award Note / Message to User
                </label>
                <textarea
                  rows={2}
                  required
                  value={rewardReason}
                  onChange={(e) => setRewardReason(e.target.value)}
                  placeholder="Explain why this reward is being awarded..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                />
              </div>

              {/* Checkbox for notifications */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={notifyUser}
                  onChange={(e) => setNotifyUser(e.target.checked)}
                  className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500"
                />
                <span className="text-xs text-slate-600 font-medium">
                  Send real-time alert and notification email to member
                </span>
              </label>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedUser(null)}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReward}
                  className="px-5 py-2.5 text-xs font-bold text-white bg-amber-500 hover:bg-amber-600 rounded-xl transition shadow-sm disabled:opacity-50 flex items-center gap-2"
                >
                  {isSubmittingReward ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Crediting Wallet...
                    </>
                  ) : (
                    <>
                      <Gift className="w-3.5 h-3.5" />
                      Credit & Award Bonus
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
