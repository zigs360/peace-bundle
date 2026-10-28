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
  Flame, 
  ArrowRight,
  ExternalLink,
  ArrowLeft,
  Download,
  AlertTriangle,
  AlertCircle,
  ShieldCheck,
  Clock,
  Calendar,
  Filter,
  ArrowDownLeft,
  ArrowUpRight,
  Receipt,
  Loader2,
  ChevronDown,
  ChevronUp,
  Percent,
  CircleDollarSign,
  Layers,
  ChevronLeft
} from 'lucide-react';
import { toast } from 'react-hot-toast';

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
  referralCode?: string;
  createdAt?: string;
  score?: number;
  totalVolume?: number;
  transactionCount?: number;
  qualifiedReferrals?: number;
  // Referral analytics fields
  totalReferrals?: number;
  activeReferrals?: number;
  inactiveReferrals?: number;
  transactingReferrals?: number;
  conversionRate?: number;
  activeRate?: number;
  totalReferralTransactions?: number;
  totalReferralVolume?: number;
  totalReferralFunding?: number;
  totalBonusEarned?: number;
  lastReferralActivity?: string | null;
}

interface RankingSummary {
  totalRankedUsers: number;
  totalVolume?: number;
  totalTransactions?: number;
  totalReferrals?: number;
  totalActiveReferrals?: number;
  totalTransactingReferrals?: number;
  overallConversionRate?: number;
  totalReferralVolume?: number;
  totalBonusPaid?: number;
  topPerformer: RankedUser | null;
}

interface UserReferralSummary {
  user: {
    id: string;
    name: string;
    email: string;
    phone: string;
    role: string;
    avatar: string | null;
    referralCode: string;
    accountStatus: string;
    walletBalance: number;
    createdAt: string;
  };
  metrics: {
    totalReferrals: number;
    activeReferrals: number;
    inactiveReferrals: number;
    transactingReferrals: number;
    conversionRate: number;
    activeRate: number;
    totalSuccessfulTransactions: number;
    totalServiceTransactions: number;
    totalQualifyingVolume: number;
    totalFundingVolume: number;
    totalBonusEarned: number;
    lastReferralActivity: string | null;
    inactivityDays: number;
    activityBreakdown: {
      active: number;
      inactive: number;
      new: number;
      registered_only: number;
      suspended: number;
    };
    serviceBreakdown: {
      data: { count: number; amount: number };
      airtime: { count: number; amount: number };
      bills: { count: number; amount: number };
      other: { count: number; amount: number };
    };
    integrity: {
      flag: 'clean' | 'suspicious_inactive' | 'high_quality';
      message: string;
    };
  };
}

interface RefereeRecord {
  id: string;
  referralId?: string | null;
  name: string;
  email: string;
  phone: string;
  role: string;
  avatar: string | null;
  accountStatus: string;
  walletBalance: number;
  registeredAt: string;
  activityStatus: 'active' | 'inactive' | 'new' | 'registered_only' | 'suspended';
  referralStatus?: 'pending' | 'credited' | 'flagged' | 'reversed' | string;
  bonusStatus?: 'locked' | 'credited' | 'flagged' | 'reversed' | string;
  bonusAmount?: number;
  qualifyingTxAmount?: number;
  qualifyingTxAt?: string | null;
  flagReason?: string | null;
  reversedAt?: string | null;
  adminNotes?: string | null;
  lastSuccessfulTxDate: string | null;
  funding: {
    count: number;
    amount: number;
    hasFunded: boolean;
  };
  transactions: {
    totalSuccessful: number;
    successfulVolume: number;
    failedCount: number;
    reversedCount: number;
    breakdown: {
      data: { count: number; amount: number };
      airtime: { count: number; amount: number };
      bills: { count: number; amount: number };
    };
  };
  bonusGenerated: number;
}

interface UserTransactionItem {
  id: string;
  type: string;
  amount: number;
  balance_before?: number;
  balance_after?: number;
  source?: string;
  status: string;
  reference?: string;
  description?: string;
  recipient_phone?: string;
  failure_reason?: string;
  createdAt: string;
}

export default function AdminRankingPage() {
  // Navigation & View mode
  const [viewMode, setViewMode] = useState<'leaderboard' | 'user_referrals'>('leaderboard');

  // Leaderboard filters
  const [period, setPeriod] = useState<'week' | 'month' | 'all_time'>('all_time');
  const [category, setCategory] = useState<'volume' | 'transactions' | 'referrals'>('volume');
  const [referralSortBy, setReferralSortBy] = useState<string>('total_referrals');
  const [inactivityDays, setInactivityDays] = useState<number>(30);
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

  // User Referral Analytics Detail View States
  const [targetUser, setTargetUser] = useState<RankedUser | null>(null);
  const [userAnalyticsSummary, setUserAnalyticsSummary] = useState<UserReferralSummary | null>(null);
  const [loadingUserSummary, setLoadingUserSummary] = useState(false);
  const [referralsList, setReferralsList] = useState<RefereeRecord[]>([]);
  const [loadingReferralsList, setLoadingReferralsList] = useState(false);
  const [refListPage, setRefListPage] = useState(1);
  const [refListTotalPages, setRefListTotalPages] = useState(1);
  const [refListTotalCount, setRefListTotalCount] = useState(0);
  const [refListSearch, setRefListSearch] = useState('');
  const [refListSearchInput, setRefListSearchInput] = useState('');
  const [refListStatus, setRefListStatus] = useState<string>('all');
  const [refListSortBy, setRefListSortBy] = useState<string>('registered_at');
  const [isExportingCsv, setIsExportingCsv] = useState(false);

  // Referee Transaction Inspection Modal States
  const [inspectingReferee, setInspectingReferee] = useState<RefereeRecord | null>(null);
  const [refereeTransactions, setRefereeTransactions] = useState<UserTransactionItem[]>([]);
  const [loadingRefereeTxns, setLoadingRefereeTxns] = useState(false);
  const [refereeTxnPage, setRefereeTxnPage] = useState(1);
  const [refereeTxnTotalPages, setRefereeTxnTotalPages] = useState(1);
  const [refereeTxnTotalCount, setRefereeTxnTotalCount] = useState(0);
  const [refereeTxnFilterStatus, setRefereeTxnFilterStatus] = useState('all');
  const [refereeTxnFilterType, setRefereeTxnFilterType] = useState('all');
  const [refereeTxnSearch, setRefereeTxnSearch] = useState('');
  const [refereeTxnSearchInput, setRefereeTxnSearchInput] = useState('');
  const [expandedTxnId, setExpandedTxnId] = useState<string | null>(null);

  // Referral Checkmate Action Modal States
  const [selectedReferralAction, setSelectedReferralAction] = useState<{
    type: 'approve' | 'flag' | 'reverse';
    referee: RefereeRecord;
  } | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [actionNotes, setActionNotes] = useState('');
  const [actionBonusAmount, setActionBonusAmount] = useState('100');
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);

  // Tiered rewards modal
  const [showTierRewardsModal, setShowTierRewardsModal] = useState(false);
  const [tier1Reward, setTier1Reward] = useState('5000');
  const [tier2Reward, setTier2Reward] = useState('2500');
  const [tier3Reward, setTier3Reward] = useState('1000');
  const [isSubmittingTierRewards, setIsSubmittingTierRewards] = useState(false);

  // Fetch rankings
  const fetchRankings = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);

    try {
      let url = `/admin/leaderboard?period=${period}&category=${category}&limit=50`;
      if (category === 'referrals') {
        url += `&sort=${referralSortBy}&inactivityDays=${inactivityDays}`;
      }
      const res = await api.get(url);
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
    if (viewMode === 'leaderboard') {
      fetchRankings();
    }
  }, [period, category, referralSortBy, inactivityDays, viewMode]);

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return leaderboard;
    const q = search.toLowerCase().trim();
    return leaderboard.filter((u) => 
      (u.name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.phone || '').includes(q)
    );
  }, [leaderboard, search]);

  // Fetch User Referral Summary
  const fetchUserReferralSummary = async (userId: string) => {
    setLoadingUserSummary(true);
    try {
      const res = await api.get(`/admin/referrals/user/${userId}/summary?inactivityDays=${inactivityDays}`);
      if (res.data?.success) {
        setUserAnalyticsSummary(res.data.data);
      }
    } catch (err: any) {
      console.error('Failed to fetch user referral summary', err);
      toast.error(err.response?.data?.message || 'Failed to load user referral summary');
    } finally {
      setLoadingUserSummary(false);
    }
  };

  // Fetch User Referrals Paginated List
  const fetchUserReferralsList = async (
    userId: string,
    page = 1,
    status = refListStatus,
    searchVal = refListSearch,
    sortField = refListSortBy
  ) => {
    setLoadingReferralsList(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '10',
        inactivityDays: String(inactivityDays),
        status,
        sortBy: sortField,
        sortOrder: 'DESC'
      });
      if (searchVal.trim()) {
        params.append('search', searchVal.trim());
      }
      const res = await api.get(`/admin/referrals/user/${userId}/list?${params.toString()}`);
      if (res.data?.success) {
        setReferralsList(res.data.data?.referrals || []);
        setRefListPage(res.data.data?.page || 1);
        setRefListTotalPages(res.data.data?.totalPages || 1);
        setRefListTotalCount(res.data.data?.total || 0);
      }
    } catch (err: any) {
      console.error('Failed to fetch referrals list', err);
      toast.error(err.response?.data?.message || 'Failed to load referrals list');
    } finally {
      setLoadingReferralsList(false);
    }
  };

  // Open User Referral Analytics view
  const handleOpenUserAnalytics = (user: RankedUser) => {
    setTargetUser(user);
    setViewMode('user_referrals');
    setRefListPage(1);
    setRefListStatus('all');
    setRefListSearch('');
    setRefListSearchInput('');
    fetchUserReferralSummary(user.id);
    fetchUserReferralsList(user.id, 1, 'all', '', refListSortBy);
  };

  // Back to Leaderboard
  const handleBackToLeaderboard = () => {
    setViewMode('leaderboard');
    setTargetUser(null);
    setUserAnalyticsSummary(null);
  };

  // Export CSV
  const handleExportCsv = async () => {
    if (!targetUser) return;
    setIsExportingCsv(true);
    try {
      const params = new URLSearchParams({
        inactivityDays: String(inactivityDays),
        status: refListStatus
      });
      if (refListSearch.trim()) params.append('search', refListSearch.trim());

      const res = await api.get(`/admin/referrals/user/${targetUser.id}/export?${params.toString()}`, {
        responseType: 'blob'
      });

      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const cleanName = (targetUser.name || 'user').toLowerCase().replace(/[^a-z0-9]/g, '_');
      link.setAttribute('download', `referrals_${cleanName}_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Referrals CSV exported successfully');
    } catch (err: any) {
      console.error('CSV export failed', err);
      toast.error('Failed to export CSV');
    } finally {
      setIsExportingCsv(false);
    }
  };

  // Fetch Referee Transactions for the Inspection Modal
  const fetchRefereeTransactions = async (
    refereeId: string,
    page = 1,
    status = refereeTxnFilterStatus,
    type = refereeTxnFilterType,
    searchVal = refereeTxnSearch
  ) => {
    setLoadingRefereeTxns(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '10'
      });
      if (status !== 'all') params.append('status', status);
      if (type !== 'all') params.append('type', type);
      if (searchVal.trim()) params.append('search', searchVal.trim());

      const res = await api.get(`/admin/users/${refereeId}/transactions?${params.toString()}`);
      if (res.data?.success) {
        setRefereeTransactions(res.data.data?.transactions || []);
        setRefereeTxnPage(res.data.data?.page || 1);
        setRefereeTxnTotalPages(res.data.data?.totalPages || 1);
        setRefereeTxnTotalCount(res.data.data?.total || 0);
      }
    } catch (err: any) {
      console.error('Failed to load referee transactions', err);
      toast.error(err.response?.data?.message || 'Failed to load transaction history');
    } finally {
      setLoadingRefereeTxns(false);
    }
  };

  const handleOpenRefereeTransactions = (referee: RefereeRecord) => {
    setInspectingReferee(referee);
    setRefereeTxnPage(1);
    setRefereeTxnFilterStatus('all');
    setRefereeTxnFilterType('all');
    setRefereeTxnSearch('');
    setRefereeTxnSearchInput('');
    setExpandedTxnId(null);
    fetchRefereeTransactions(referee.id, 1, 'all', 'all', '');
  };

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
        if (viewMode === 'leaderboard') {
          fetchRankings(true);
        } else if (targetUser) {
          fetchUserReferralSummary(targetUser.id);
        }
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

  const getActivityBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Active
          </span>
        );
      case 'new':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
            <Clock className="w-3 h-3 text-blue-600" />
            New (&le;7d)
          </span>
        );
      case 'inactive':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
            <AlertTriangle className="w-3 h-3 text-amber-600" />
            Inactive
          </span>
        );
      case 'registered_only':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
            Registered Only
          </span>
        );
      case 'suspended':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-800 border border-red-200">
            <AlertCircle className="w-3 h-3 text-red-600" />
            Suspended
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-700">
            {status}
          </span>
        );
    }
  };

  const getBonusStatusBadge = (status?: string) => {
    const s = String(status || 'locked').toLowerCase();
    switch (s) {
      case 'credited':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckCircle className="w-3 h-3 text-emerald-600" />
            Credited
          </span>
        );
      case 'flagged':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-800 border border-red-200">
            <AlertTriangle className="w-3 h-3 text-red-600" />
            Flagged
          </span>
        );
      case 'reversed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
            <ArrowDownLeft className="w-3 h-3 text-purple-600" />
            Reversed
          </span>
        );
      case 'locked':
      case 'pending':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200" title="Locked until referee completes qualifying VTU transaction">
            <Clock className="w-3 h-3 text-amber-600" />
            Locked (Pending VTU)
          </span>
        );
    }
  };

  const handleExecuteReferralAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReferralAction || !selectedReferralAction.referee.referralId) return;
    setIsSubmittingAction(true);
    const { type, referee } = selectedReferralAction;
    try {
      if (type === 'approve') {
        const res = await api.post(`/admin/referrals/${referee.referralId}/approve`, {
          notes: actionNotes,
          bonusAmount: parseFloat(actionBonusAmount) || 100
        });
        toast.success(res.data?.message || 'Bonus approved and credited successfully!');
      } else if (type === 'flag') {
        const res = await api.post(`/admin/referrals/${referee.referralId}/flag`, {
          reason: actionReason || 'Suspicious referral pattern',
          notes: actionNotes
        });
        toast.success(res.data?.message || 'Referral flagged successfully!');
      } else if (type === 'reverse') {
        const res = await api.post(`/admin/referrals/${referee.referralId}/reverse`, {
          reason: actionReason || 'Reversed by admin',
          notes: actionNotes
        });
        toast.success(res.data?.message || 'Bonus reversed and clawed back successfully!');
      }
      setSelectedReferralAction(null);
      setActionReason('');
      setActionNotes('');
      if (targetUser) {
        fetchUserReferralsList(targetUser.id, refListPage, refListStatus, refListSearch, refListSortBy);
        fetchUserSummary(targetUser.id, inactivityDays);
      }
    } catch (err: any) {
      console.error('Failed executing referral action', err);
      toast.error(err.response?.data?.message || 'Failed executing referral action');
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handleDistributeTierRewards = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingTierRewards(true);
    try {
      const tiers = [
        { rankStart: 1, rankEnd: 1, rewardAmount: parseFloat(tier1Reward) || 5000, title: '1st Place Champion' },
        { rankStart: 2, rankEnd: 3, rewardAmount: parseFloat(tier2Reward) || 2500, title: 'Top 3 Performer' },
        { rankStart: 4, rankEnd: 10, rewardAmount: parseFloat(tier3Reward) || 1000, title: 'Top 10 Contender' }
      ];
      const res = await api.post('/admin/leaderboard/tier-rewards', { tiers, period });
      toast.success(res.data?.message || `Successfully distributed tier rewards!`);
      setShowTierRewardsModal(false);
      fetchRankings();
    } catch (err: any) {
      console.error('Failed to distribute tier rewards', err);
      toast.error(err.response?.data?.message || 'Failed to distribute tier rewards');
    } finally {
      setIsSubmittingTierRewards(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ========================================================================= */}
      {/* 1. TOP BANNER (Shown in both views, adapted appropriately) */}
      {/* ========================================================================= */}
      <div className="bg-gradient-to-r from-slate-900 via-primary-950 to-primary-900 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-64 h-64 bg-primary-500/10 rounded-full blur-3xl pointer-events-none" />
        
        {viewMode === 'user_referrals' ? (
          <div className="relative z-10 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleBackToLeaderboard}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-2xl text-xs font-bold text-white border border-white/20 transition shadow-sm w-fit"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Leaderboard
              </button>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-300 font-medium">Inactivity Window:</span>
                <div className="inline-flex bg-white/10 p-1 rounded-xl border border-white/10 text-xs font-semibold">
                  {[30, 60, 90].map((days) => (
                    <button
                      key={days}
                      onClick={() => {
                        setInactivityDays(days);
                        if (targetUser) {
                          fetchUserReferralSummary(targetUser.id);
                          fetchUserReferralsList(targetUser.id, 1, refListStatus, refListSearch, refListSortBy);
                        }
                      }}
                      className={`px-3 py-1 rounded-lg transition ${
                        inactivityDays === days 
                          ? 'bg-amber-400 text-slate-950 font-bold shadow-xs' 
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {days} Days
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-xs font-semibold text-amber-300 mb-2 border border-white/10">
                <Users className="w-4 h-4 text-amber-400" />
                Individual Referral & Engagement Intelligence
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
                {targetUser?.name || 'User'} — Referral Analytics Profile
              </h1>
              <p className="text-slate-300 text-sm mt-1 max-w-2xl leading-relaxed">
                Comprehensive audit of direct referrals, registration history, genuine service usage, and wallet funding activity.
              </p>
            </div>
          </div>
        ) : (
          <div className="relative z-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-xs font-semibold text-amber-300 mb-3 border border-white/10">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  Administrative Intelligence
                </div>
                <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Top User Rankings & Referral Analytics</h1>
                <p className="text-slate-300 text-sm mt-1.5 max-w-2xl leading-relaxed">
                  Real-time rankings based on actual purchase transactions and verified referrals. Click any member to audit their referral network, view active conversion rates, and inspect transaction histories.
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6 pt-6 border-t border-white/10 text-white">
                <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-4 border border-white/10">
                  <span className="text-xs text-slate-400 block font-medium">Ranked Active Members</span>
                  <span className="text-xl font-bold mt-1 block">{summary.totalRankedUsers} users</span>
                </div>
                <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-4 border border-white/10">
                  <span className="text-xs text-slate-400 block font-medium">
                    {category === 'volume' 
                      ? 'Total Purchase Volume' 
                      : category === 'transactions' 
                        ? 'Total Transactions' 
                        : 'Total Direct Referrals'}
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
                  <span className="text-xs text-slate-400 block font-medium">
                    {category === 'referrals' ? 'Active Conversion Rate' : 'Top Performer'}
                  </span>
                  <span className="text-xl font-bold mt-1 block truncate">
                    {category === 'referrals'
                      ? `${summary.overallConversionRate || 0}% (${summary.totalTransactingReferrals || 0} active)`
                      : (summary.topPerformer ? summary.topPerformer.name : 'None yet')}
                  </span>
                </div>
                <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-4 border border-white/10">
                  <span className="text-xs text-slate-400 block font-medium">
                    {category === 'referrals' ? 'Total Referral Spend' : 'Current #1 Leader'}
                  </span>
                  <span className="text-xl font-bold mt-1 block">
                    {category === 'referrals'
                      ? `₦${(summary.totalReferralVolume || 0).toLocaleString()}`
                      : (summary.topPerformer ? `₦${Number(summary.topPerformer.walletBalance || 0).toLocaleString()} bal` : '—')}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 2. MAIN VIEW: LEADERBOARD TABLE */}
      {/* ========================================================================= */}
      {viewMode === 'leaderboard' && (
        <div className="space-y-6">
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
                Referrals & Quality
              </button>
            </div>

            {/* Referral-specific Sorting and Inactivity Controls */}
            {category === 'referrals' && (
              <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-slate-500 font-medium">Sort By:</span>
                  <select
                    value={referralSortBy}
                    onChange={(e) => setReferralSortBy(e.target.value)}
                    className="text-xs font-semibold py-1.5 px-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="total_referrals">Total Referrals</option>
                    <option value="active_referrals">Active Referrals</option>
                    <option value="conversion_rate">Conversion Rate (%)</option>
                    <option value="active_rate">Active Rate (%)</option>
                    <option value="volume">Referral Spend (₦)</option>
                    <option value="transactions">Referral Transactions</option>
                    <option value="bonus">Bonus Earned (₦)</option>
                  </select>
                </div>

                <div className="flex items-center gap-1 text-xs bg-slate-100 p-1 rounded-xl">
                  <span className="px-2 text-[10px] text-slate-500 font-semibold uppercase">Active:</span>
                  {[30, 60, 90].map((d) => (
                    <button
                      key={d}
                      onClick={() => setInactivityDays(d)}
                      className={`px-2 py-0.5 rounded-lg text-[11px] font-bold transition ${
                        inactivityDays === d ? 'bg-white text-primary-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {d}d
                    </button>
                  ))}
                </div>
              </div>
            )}

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

              <div className="relative w-full sm:w-56">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search user, email..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
          </div>

          {/* Leaderboard Table Container */}
          <div className="bg-white rounded-2xl shadow-soft border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
              <div>
                <h3 className="font-bold text-sm text-slate-900">
                  {category === 'referrals' ? 'Referral Performance Leaderboard' : 'Rankings Leaderboard'}
                </h3>
                <p className="text-xs text-slate-500">
                  Showing {filteredUsers.length} ranked members • Click any row or &quot;View Analytics&quot; to inspect referral network
                </p>
              </div>

              {category === 'referrals' && (
                <button
                  type="button"
                  onClick={() => setShowTierRewardsModal(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
                  title="Distribute performance-based rewards to top referrers"
                >
                  <Gift className="w-3.5 h-3.5" />
                  Distribute Tiered Rewards
                </button>
              )}
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
                      
                      {category === 'referrals' ? (
                        <>
                          <th className="py-3 px-4">Total Referrals</th>
                          <th className="py-3 px-4">Conversion &amp; Active %</th>
                          <th className="py-3 px-4">Referral Spend (₦)</th>
                          <th className="py-3 px-4">Bonus Earned</th>
                          <th className="py-3 px-4">Last Activity</th>
                        </>
                      ) : (
                        <th className="py-3 px-4">
                          {category === 'volume' ? 'Total Volume (₦)' : 'Completed Txns'}
                        </th>
                      )}

                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {filteredUsers.map((user) => (
                      <tr 
                        key={user.id} 
                        onClick={() => handleOpenUserAnalytics(user)}
                        className="hover:bg-slate-50/90 transition-colors cursor-pointer group"
                      >
                        <td className="py-3.5 px-4 font-bold">
                          {getRankBadge(user.rank)}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-700 overflow-hidden shrink-0 group-hover:border-primary-400 transition-colors">
                              {user.avatar ? (
                                <img src={`${SERVER_ROOT_URL}/${user.avatar}`} alt={user.name} className="w-full h-full object-cover" />
                              ) : (
                                (user.name || user.email || 'U').charAt(0).toUpperCase()
                              )}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                                <span className="group-hover:text-primary-700 transition-colors">{user.name || 'Unnamed User'}</span>
                                {user.accountStatus === 'banned' && (
                                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-red-100 text-red-700">Banned</span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {user.email} • {user.phone || 'No phone'}
                                {user.referralCode && (
                                  <span className="ml-1.5 font-mono text-[10px] bg-slate-100 px-1 py-0.2 rounded text-slate-600">
                                    Ref: {user.referralCode}
                                  </span>
                                )}
                              </div>
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

                        {category === 'referrals' ? (
                          <>
                            <td className="py-3.5 px-4">
                              <div className="font-extrabold text-slate-900 text-sm">
                                {(user.totalReferrals || 0).toLocaleString()} refs
                              </div>
                              <div className="flex items-center gap-1.5 text-[10px] mt-0.5">
                                <span className="text-emerald-700 font-semibold">{user.activeReferrals || 0} active</span>
                                <span className="text-slate-300">•</span>
                                <span className="text-slate-400">{user.inactiveReferrals || 0} inactive</span>
                              </div>
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="font-bold text-primary-700 text-xs">
                                {user.conversionRate || 0}% Conversion
                              </div>
                              <div className="text-[10px] text-slate-500">
                                {user.activeRate || 0}% Active (&le;{inactivityDays}d)
                              </div>
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="font-extrabold text-slate-900 text-sm">
                                ₦{Number(user.totalReferralVolume || 0).toLocaleString()}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                {user.totalReferralTransactions || 0} service txns
                              </div>
                            </td>
                            <td className="py-3.5 px-4 font-bold text-emerald-700 font-mono">
                              ₦{Number(user.totalBonusEarned || 0).toLocaleString()}
                            </td>
                            <td className="py-3.5 px-4 text-slate-500 text-[11px]">
                              {user.lastReferralActivity ? new Date(user.lastReferralActivity).toLocaleDateString() : 'Never'}
                            </td>
                          </>
                        ) : (
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
                            ) : (
                              <div>
                                <span className="font-extrabold text-slate-900 text-sm">
                                  {(user.transactionCount || user.score || 0).toLocaleString()} txns
                                </span>
                                <span className="text-[10px] text-slate-400 block font-mono">
                                  ₦{Number(user.totalVolume || 0).toLocaleString()} volume
                                </span>
                              </div>
                            )}
                          </td>
                        )}

                        <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleOpenUserAnalytics(user)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-primary-50 hover:bg-primary-100 text-primary-700 rounded-xl text-xs font-bold transition shadow-2xs"
                              title="View detailed referral analytics & history"
                            >
                              <Users className="w-3.5 h-3.5" />
                              Analytics
                            </button>
                            <button
                              type="button"
                              onClick={() => openRewardModal(user)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition shadow-xs"
                              title="Reward user with wallet bonus"
                            >
                              <Gift className="w-3.5 h-3.5" />
                              Reward
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. DEDICATED USER REFERRAL ANALYTICS VIEW */}
      {/* ========================================================================= */}
      {viewMode === 'user_referrals' && targetUser && (
        <div className="space-y-6">
          {/* User Profile Overview & Integrity Status Card */}
          <div className="bg-white rounded-2xl shadow-soft border border-slate-100 p-6">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 pb-6 border-b border-slate-100">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-primary-600 to-indigo-600 flex items-center justify-center text-white font-extrabold text-2xl shadow-md overflow-hidden shrink-0">
                  {targetUser.avatar ? (
                    <img src={`${SERVER_ROOT_URL}/${targetUser.avatar}`} alt={targetUser.name} className="w-full h-full object-cover" />
                  ) : (
                    (targetUser.name || targetUser.email || 'U').charAt(0).toUpperCase()
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-xl font-extrabold text-slate-900">{targetUser.name || 'Unnamed User'}</h2>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase ${
                      targetUser.role === 'admin' 
                        ? 'bg-purple-100 text-purple-700' 
                        : targetUser.role === 'reseller'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-slate-100 text-slate-700'
                    }`}>
                      {targetUser.role}
                    </span>
                    {targetUser.accountStatus === 'banned' ? (
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">Banned</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">Active Account</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 flex-wrap">
                    <span>{targetUser.email}</span>
                    <span>•</span>
                    <span>{targetUser.phone || 'No phone'}</span>
                    {targetUser.referralCode && (
                      <>
                        <span>•</span>
                        <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-700 font-semibold">
                          Code: {targetUser.referralCode}
                        </span>
                      </>
                    )}
                    {targetUser.createdAt && (
                      <>
                        <span>•</span>
                        <span>Joined {new Date(targetUser.createdAt).toLocaleDateString()}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 w-full lg:w-auto justify-between lg:justify-end">
                <div className="text-right">
                  <div className="text-xs text-slate-400 font-medium">User Wallet Balance</div>
                  <div className="text-xl font-extrabold text-slate-900 font-mono">
                    ₦{Number(targetUser.walletBalance || 0).toLocaleString()}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => openRewardModal(targetUser)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition shadow-xs"
                >
                  <Gift className="w-4 h-4" />
                  Award Bonus
                </button>
              </div>
            </div>

            {/* Fraud & Integrity Banner */}
            {userAnalyticsSummary?.metrics.integrity && (
              <div className="mt-5">
                {userAnalyticsSummary.metrics.integrity.flag === 'suspicious_inactive' ? (
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-amber-900">Integrity Alert: Low Engagement Warning</h4>
                      <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                        {userAnalyticsSummary.metrics.integrity.message}
                      </p>
                    </div>
                  </div>
                ) : userAnalyticsSummary.metrics.integrity.flag === 'high_quality' ? (
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-3">
                    <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-emerald-900">High Quality Referral Network</h4>
                      <p className="text-xs text-emerald-800 mt-0.5 leading-relaxed">
                        {userAnalyticsSummary.metrics.integrity.message}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-2.5 text-xs text-slate-600">
                    <ShieldCheck className="w-4 h-4 text-primary-600" />
                    <span>{userAnalyticsSummary.metrics.integrity.message}</span>
                  </div>
                )}
              </div>
            )}

            {/* KPI Summary Grid */}
            {loadingUserSummary ? (
              <div className="py-12 text-center text-slate-500">
                <RefreshCw className="w-6 h-6 animate-spin text-primary-600 mx-auto mb-2" />
                <p className="text-xs">Computing referral metrics...</p>
              </div>
            ) : userAnalyticsSummary ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mt-6">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-[11px] font-medium text-slate-500 block">Total Referrals</span>
                  <span className="text-xl font-extrabold text-slate-900 mt-1 block">
                    {userAnalyticsSummary.metrics.totalReferrals}
                  </span>
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Direct signups
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-100">
                  <span className="text-[11px] font-medium text-emerald-700 block">Active (&le;{inactivityDays}d)</span>
                  <span className="text-xl font-extrabold text-emerald-900 mt-1 block">
                    {userAnalyticsSummary.metrics.activeReferrals}
                  </span>
                  <span className="text-[10px] text-emerald-600 mt-0.5 block">
                    {userAnalyticsSummary.metrics.activeRate}% active rate
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-100">
                  <span className="text-[11px] font-medium text-amber-700 block">Inactive</span>
                  <span className="text-xl font-extrabold text-amber-900 mt-1 block">
                    {userAnalyticsSummary.metrics.inactiveReferrals}
                  </span>
                  <span className="text-[10px] text-amber-600 mt-0.5 block">
                    &gt;{inactivityDays}d or no tx
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-100">
                  <span className="text-[11px] font-medium text-blue-700 block">Transacting / Conv.</span>
                  <span className="text-xl font-extrabold text-blue-900 mt-1 block">
                    {userAnalyticsSummary.metrics.transactingReferrals}
                  </span>
                  <span className="text-[10px] text-blue-600 mt-0.5 block">
                    {userAnalyticsSummary.metrics.conversionRate}% conversion
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-purple-50/70 border border-purple-100">
                  <span className="text-[11px] font-medium text-purple-700 block">Referral Spend Volume</span>
                  <span className="text-lg font-extrabold text-purple-900 mt-1 block truncate">
                    ₦{userAnalyticsSummary.metrics.totalQualifyingVolume.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-purple-600 mt-0.5 block">
                    {userAnalyticsSummary.metrics.totalServiceTransactions} service txns
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-100">
                  <span className="text-[11px] font-medium text-emerald-700 block">Bonus Earned</span>
                  <span className="text-lg font-extrabold text-emerald-900 mt-1 block truncate">
                    ₦{userAnalyticsSummary.metrics.totalBonusEarned.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-emerald-600 mt-0.5 block">
                    Signups + commissions
                  </span>
                </div>
              </div>
            ) : null}

            {/* Service Usage Breakdown */}
            {userAnalyticsSummary && (
              <div className="mt-6 pt-6 border-t border-slate-100">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                  Referral Service Spend Breakdown (Excludes Wallet Deposits)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] text-slate-500 font-medium">Data Purchases</span>
                      <div className="font-bold text-sm text-slate-900">
                        ₦{userAnalyticsSummary.metrics.serviceBreakdown.data.amount.toLocaleString()}
                      </div>
                    </div>
                    <span className="text-xs font-bold bg-white px-2 py-1 rounded-lg border border-slate-200 text-slate-600">
                      {userAnalyticsSummary.metrics.serviceBreakdown.data.count} txns
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] text-slate-500 font-medium">Airtime Purchases</span>
                      <div className="font-bold text-sm text-slate-900">
                        ₦{userAnalyticsSummary.metrics.serviceBreakdown.airtime.amount.toLocaleString()}
                      </div>
                    </div>
                    <span className="text-xs font-bold bg-white px-2 py-1 rounded-lg border border-slate-200 text-slate-600">
                      {userAnalyticsSummary.metrics.serviceBreakdown.airtime.count} txns
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] text-slate-500 font-medium">Bills &amp; Utilities</span>
                      <div className="font-bold text-sm text-slate-900">
                        ₦{userAnalyticsSummary.metrics.serviceBreakdown.bills.amount.toLocaleString()}
                      </div>
                    </div>
                    <span className="text-xs font-bold bg-white px-2 py-1 rounded-lg border border-slate-200 text-slate-600">
                      {userAnalyticsSummary.metrics.serviceBreakdown.bills.count} txns
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] text-slate-500 font-medium">Wallet Funding (Deposits)</span>
                      <div className="font-bold text-sm text-slate-900">
                        ₦{userAnalyticsSummary.metrics.totalFundingVolume.toLocaleString()}
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
                      Deposited
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Direct Referrals Directory Table */}
          <div className="bg-white rounded-2xl shadow-soft border border-slate-100 overflow-hidden">
            {/* Table Header & Controls */}
            <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-slate-50/60">
              <div>
                <h3 className="font-bold text-sm text-slate-900">Direct Referrals Directory</h3>
                <p className="text-xs text-slate-500">
                  Showing {referralsList.length} of {refListTotalCount} direct referrals
                </p>
              </div>

              {/* Controls: Search, Status filter, CSV Export */}
              <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
                {/* Search */}
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    setRefListSearch(refListSearchInput);
                    fetchUserReferralsList(targetUser.id, 1, refListStatus, refListSearchInput, refListSortBy);
                  }}
                  className="relative flex-1 sm:w-56"
                >
                  <input
                    type="text"
                    placeholder="Search referee name, email..."
                    value={refListSearchInput}
                    onChange={(e) => setRefListSearchInput(e.target.value)}
                    className="w-full text-xs pl-8 pr-7 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  {refListSearchInput && (
                    <button
                      type="button"
                      onClick={() => {
                        setRefListSearchInput('');
                        setRefListSearch('');
                        fetchUserReferralsList(targetUser.id, 1, refListStatus, '', refListSortBy);
                      }}
                      className="text-slate-400 hover:text-slate-600 absolute right-2.5 top-2.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </form>

                {/* Status Filter */}
                <select
                  value={refListStatus}
                  onChange={(e) => {
                    setRefListStatus(e.target.value);
                    fetchUserReferralsList(targetUser.id, 1, e.target.value, refListSearch, refListSortBy);
                  }}
                  className="text-xs font-semibold py-2 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active (&le;{inactivityDays}d)</option>
                  <option value="inactive">Inactive (&gt;{inactivityDays}d)</option>
                  <option value="new">New (&le;7d)</option>
                  <option value="registered_only">Registered Only (0 tx)</option>
                  <option value="suspended">Suspended</option>
                </select>

                {/* CSV Export */}
                <button
                  type="button"
                  onClick={handleExportCsv}
                  disabled={isExportingCsv || referralsList.length === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition disabled:opacity-50"
                  title="Export referral list as CSV"
                >
                  <Download className={`w-3.5 h-3.5 ${isExportingCsv ? 'animate-bounce' : ''}`} />
                  Export CSV
                </button>
              </div>
            </div>

            {/* Referrals List Table */}
            {loadingReferralsList ? (
              <div className="py-20 text-center">
                <RefreshCw className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-3" />
                <p className="text-sm text-slate-500">Loading referral records...</p>
              </div>
            ) : referralsList.length === 0 ? (
              <div className="py-16 text-center">
                <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h4 className="font-bold text-slate-800 text-sm">No referrals found</h4>
                <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                  {refListSearch || refListStatus !== 'all'
                    ? 'No referrals match your current search or status filter.'
                    : 'This user has not referred any members yet.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 uppercase tracking-wider text-[10px] bg-slate-50/50">
                      <th className="py-3 px-4">Referee Info</th>
                      <th className="py-3 px-4">Engagement Status</th>
                      <th className="py-3 px-4">Bonus Lifecycle</th>
                      <th className="py-3 px-4">Registered Date</th>
                      <th className="py-3 px-4">Wallet Funding (₦)</th>
                      <th className="py-3 px-4">Service Purchases (₦)</th>
                      <th className="py-3 px-4">Bonus Generated</th>
                      <th className="py-3 px-4">Last Activity</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {referralsList.map((ref) => (
                      <tr 
                        key={ref.id} 
                        onClick={() => handleOpenRefereeTransactions(ref)}
                        className="hover:bg-slate-50/90 transition-colors cursor-pointer group"
                      >
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-700 overflow-hidden shrink-0 group-hover:border-primary-400 transition-colors">
                              {ref.avatar ? (
                                <img src={`${SERVER_ROOT_URL}/${ref.avatar}`} alt={ref.name} className="w-full h-full object-cover" />
                              ) : (
                                (ref.name || ref.email || 'U').charAt(0).toUpperCase()
                              )}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                                <span className="group-hover:text-primary-700 transition-colors">{ref.name || 'Unnamed'}</span>
                                {ref.accountStatus === 'banned' && (
                                  <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-red-100 text-red-700">Banned</span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500">{ref.email} • {ref.phone || 'No phone'}</div>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          {getActivityBadge(ref.activityStatus)}
                        </td>

                        <td className="py-3.5 px-4">
                          {getBonusStatusBadge(ref.bonusStatus)}
                        </td>

                        <td className="py-3.5 px-4 text-slate-500 font-mono text-[11px]">
                          {ref.registeredAt ? new Date(ref.registeredAt).toLocaleDateString() : 'N/A'}
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900 font-mono">
                            ₦{Number(ref.funding.amount || 0).toLocaleString()}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {ref.funding.count} deposits {ref.funding.hasFunded ? '(Funded)' : '(Unfunded)'}
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="font-bold text-emerald-700 font-mono">
                            ₦{Number(ref.transactions.successfulVolume || 0).toLocaleString()}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {ref.transactions.totalSuccessful} completed txns
                          </div>
                        </td>

                        <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                          ₦{Number(ref.bonusGenerated || 0).toLocaleString()}
                        </td>

                        <td className="py-3.5 px-4 text-slate-500 text-[11px]">
                          {ref.lastSuccessfulTxDate 
                            ? new Date(ref.lastSuccessfulTxDate).toLocaleDateString() 
                            : <span className="text-slate-400 italic">No transactions</span>}
                        </td>

                        <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={() => handleOpenRefereeTransactions(ref)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-primary-50 hover:text-primary-700 text-slate-700 rounded-xl text-xs font-semibold transition"
                              title="View referee's full transaction history"
                            >
                              <Receipt className="w-3.5 h-3.5" />
                              Txns
                            </button>
                            {ref.referralId && ref.bonusStatus !== 'credited' && (
                              <button
                                type="button"
                                onClick={() => setSelectedReferralAction({ type: 'approve', referee: ref })}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold transition border border-emerald-200"
                                title="Manually approve & credit bonus"
                              >
                                <CheckCircle className="w-3 h-3 text-emerald-600" />
                                Approve
                              </button>
                            )}
                            {ref.referralId && ref.bonusStatus !== 'flagged' && ref.bonusStatus !== 'reversed' && (
                              <button
                                type="button"
                                onClick={() => setSelectedReferralAction({ type: 'flag', referee: ref })}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl text-xs font-bold transition border border-red-200"
                                title="Flag as suspicious referral"
                              >
                                <AlertTriangle className="w-3 h-3 text-red-600" />
                                Flag
                              </button>
                            )}
                            {ref.referralId && ref.bonusStatus === 'credited' && (
                              <button
                                type="button"
                                onClick={() => setSelectedReferralAction({ type: 'reverse', referee: ref })}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-xl text-xs font-bold transition border border-purple-200"
                                title="Reverse bonus & clawback wallet"
                              >
                                <ArrowDownLeft className="w-3 h-3 text-purple-600" />
                                Reverse
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls */}
            {refListTotalPages > 1 && (
              <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 bg-slate-50/50">
                <span>
                  Page {refListPage} of {refListTotalPages} ({refListTotalCount} total referrals)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={refListPage <= 1 || loadingReferralsList}
                    onClick={() => {
                      const next = refListPage - 1;
                      fetchUserReferralsList(targetUser.id, next, refListStatus, refListSearch, refListSortBy);
                    }}
                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-white disabled:opacity-40 transition"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="font-bold text-slate-700 px-2">{refListPage}</span>
                  <button
                    type="button"
                    disabled={refListPage >= refListTotalPages || loadingReferralsList}
                    onClick={() => {
                      const next = refListPage + 1;
                      fetchUserReferralsList(targetUser.id, next, refListStatus, refListSearch, refListSortBy);
                    }}
                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-white disabled:opacity-40 transition"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. REFEREE TRANSACTIONS MODAL */}
      {/* ========================================================================= */}
      {inspectingReferee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-base shadow-xs">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-900 text-base">
                      {inspectingReferee.name || 'Referee'} — Transaction History
                    </h3>
                    {getActivityBadge(inspectingReferee.activityStatus)}
                  </div>
                  <p className="text-xs text-slate-500">
                    {inspectingReferee.email} • {inspectingReferee.phone || 'No phone'} • Wallet Bal: ₦{Number(inspectingReferee.walletBalance || 0).toLocaleString()}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectingReferee(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Metrics of this Referee */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-50/40 border-b border-slate-100 text-xs">
              <div className="p-3 bg-white rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-400 block font-medium uppercase">Service Spending</span>
                <span className="text-base font-bold text-slate-900 font-mono mt-0.5 block">
                  ₦{Number(inspectingReferee.transactions.successfulVolume || 0).toLocaleString()}
                </span>
                <span className="text-[10px] text-slate-500">
                  {inspectingReferee.transactions.totalSuccessful} completed txns
                </span>
              </div>
              <div className="p-3 bg-white rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-400 block font-medium uppercase">Wallet Funding</span>
                <span className="text-base font-bold text-emerald-700 font-mono mt-0.5 block">
                  ₦{Number(inspectingReferee.funding.amount || 0).toLocaleString()}
                </span>
                <span className="text-[10px] text-slate-500">
                  {inspectingReferee.funding.count} deposits
                </span>
              </div>
              <div className="p-3 bg-white rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-400 block font-medium uppercase">Referrer Bonus Generated</span>
                <span className="text-base font-bold text-primary-700 font-mono mt-0.5 block">
                  ₦{Number(inspectingReferee.bonusGenerated || 0).toLocaleString()}
                </span>
                <span className="text-[10px] text-slate-500">Credited to referrer</span>
              </div>
              <div className="p-3 bg-white rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-400 block font-medium uppercase">Tx Integrity</span>
                <span className="text-sm font-bold text-slate-800 mt-0.5 block">
                  {inspectingReferee.transactions.failedCount} Failed • {inspectingReferee.transactions.reversedCount} Rev
                </span>
                <span className="text-[10px] text-slate-400">
                  Registered {inspectingReferee.registeredAt ? new Date(inspectingReferee.registeredAt).toLocaleDateString() : 'N/A'}
                </span>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-white">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={refereeTxnFilterStatus}
                  onChange={(e) => {
                    setRefereeTxnFilterStatus(e.target.value);
                    fetchRefereeTransactions(inspectingReferee.id, 1, e.target.value, refereeTxnFilterType, refereeTxnSearch);
                  }}
                  className="text-xs font-semibold py-1.5 px-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="all">All Statuses</option>
                  <option value="completed">Completed</option>
                  <option value="pending">Pending</option>
                  <option value="failed">Failed</option>
                  <option value="reversed">Refunded / Reversed</option>
                </select>

                <select
                  value={refereeTxnFilterType}
                  onChange={(e) => {
                    setRefereeTxnFilterType(e.target.value);
                    fetchRefereeTransactions(inspectingReferee.id, 1, refereeTxnFilterStatus, e.target.value, refereeTxnSearch);
                  }}
                  className="text-xs font-semibold py-1.5 px-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="all">All Types</option>
                  <option value="credit">Credits (Deposits/Refunds)</option>
                  <option value="debit">Debits (Service Spending)</option>
                  <option value="data">Data Purchase</option>
                  <option value="airtime">Airtime</option>
                  <option value="bills">Bills &amp; Utilities</option>
                </select>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setRefereeTxnSearch(refereeTxnSearchInput);
                  fetchRefereeTransactions(inspectingReferee.id, 1, refereeTxnFilterStatus, refereeTxnFilterType, refereeTxnSearchInput);
                }}
                className="relative w-full sm:w-56"
              >
                <input
                  type="text"
                  placeholder="Search ref, desc, phone..."
                  value={refereeTxnSearchInput}
                  onChange={(e) => setRefereeTxnSearchInput(e.target.value)}
                  className="w-full text-xs pl-8 pr-7 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                {refereeTxnSearchInput && (
                  <button
                    type="button"
                    onClick={() => {
                      setRefereeTxnSearchInput('');
                      setRefereeTxnSearch('');
                      fetchRefereeTransactions(inspectingReferee.id, 1, refereeTxnFilterStatus, refereeTxnFilterType, '');
                    }}
                    className="text-slate-400 hover:text-slate-600 absolute right-2 top-2"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </form>
            </div>

            {/* Transactions List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5 min-h-[300px]">
              {loadingRefereeTxns ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-500">
                  <Loader2 className="w-8 h-8 text-primary-600 animate-spin mb-3" />
                  <p className="text-sm font-medium">Loading transaction records...</p>
                </div>
              ) : refereeTransactions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-500 text-center">
                  <Receipt className="w-12 h-12 text-slate-300 mb-3" />
                  <p className="text-sm font-semibold text-slate-700">No transactions found</p>
                  <p className="text-xs text-slate-400 max-w-sm mt-1">
                    {refereeTxnSearch || refereeTxnFilterStatus !== 'all' || refereeTxnFilterType !== 'all'
                      ? 'No transactions match your current filters.'
                      : 'This user has not performed any transactions yet.'}
                  </p>
                </div>
              ) : (
                refereeTransactions.map((tx) => {
                  const isCredit = ['credit', 'deposit', 'refund', 'wallet_funding'].includes(String(tx.type || '').toLowerCase());
                  const isFailed = String(tx.status || '').toLowerCase() === 'failed';
                  const isCompleted = String(tx.status || '').toLowerCase() === 'completed';
                  const isPending = String(tx.status || '').toLowerCase() === 'pending';
                  const isReversed = String(tx.status || '').toLowerCase() === 'reversed' || String(tx.status || '').toLowerCase() === 'refunded' || String(tx.source || '').toLowerCase() === 'refund';
                  const isExpanded = expandedTxnId === tx.id;

                  return (
                    <div
                      key={tx.id}
                      className={`rounded-xl border transition-all ${
                        isExpanded 
                          ? 'border-primary-300 shadow-sm bg-white' 
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div 
                        onClick={() => setExpandedTxnId(isExpanded ? null : tx.id)}
                        className="p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 cursor-pointer select-none"
                      >
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                            isCredit ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {isCredit ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-slate-900 truncate">
                                {tx.description || `${tx.type?.toUpperCase()} Transaction`}
                              </span>
                              <span className={`px-2 py-0.2 text-[10px] font-semibold rounded-full uppercase ${
                                isCompleted
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : isPending
                                  ? 'bg-amber-100 text-amber-800'
                                  : isReversed
                                  ? 'bg-purple-100 text-purple-800'
                                  : isFailed
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-slate-100 text-slate-800'
                              }`}>
                                {isReversed ? 'refunded' : tx.status || 'unknown'}
                              </span>
                              {tx.type && (
                                <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded uppercase font-semibold">
                                  {tx.type}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5 flex-wrap">
                              <span className="font-mono text-slate-600">{tx.reference || 'No ref'}</span>
                              <span>•</span>
                              <span>{tx.createdAt ? new Date(tx.createdAt).toLocaleString() : 'N/A'}</span>
                              {tx.recipient_phone && (
                                <>
                                  <span>•</span>
                                  <span>To: {tx.recipient_phone}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                          <div className="text-right">
                            <div className={`text-sm font-extrabold ${isCredit ? 'text-emerald-600' : 'text-slate-900'}`}>
                              {isCredit ? '+' : '-'}₦{Number(tx.amount || 0).toLocaleString()}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              Bal: ₦{Number(tx.balance_before || 0).toLocaleString()} &rarr; ₦{Number(tx.balance_after || 0).toLocaleString()}
                            </div>
                          </div>
                          <button className="text-slate-400 hover:text-slate-600 p-1">
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Expanded Details */}
                      {isExpanded && (
                        <div className="px-4 pb-3 pt-2 border-t border-slate-100 bg-slate-50/70 rounded-b-xl space-y-2 text-xs">
                          {tx.failure_reason && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-xs text-red-800">
                              <span className="font-bold flex items-center gap-1 text-red-900 mb-1">
                                <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                                Failure Reason:
                              </span>
                              <div className="font-mono text-[11px] whitespace-pre-wrap break-all bg-white/70 p-2 rounded">
                                {tx.failure_reason}
                              </div>
                            </div>
                          )}

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-slate-600">
                            <div>
                              <span className="text-slate-400 block">Transaction ID:</span>
                              <span className="font-mono">{tx.id}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block">Source / Service:</span>
                              <span>{tx.source || 'default'}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block">Reference:</span>
                              <span className="font-mono">{tx.reference || 'N/A'}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block">Date / Time:</span>
                              <span>{tx.createdAt ? new Date(tx.createdAt).toLocaleString() : 'N/A'}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Pagination */}
            {refereeTxnTotalPages > 1 && (
              <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 bg-slate-50/60">
                <span>
                  Page {refereeTxnPage} of {refereeTxnTotalPages} ({refereeTxnTotalCount} total transactions)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={refereeTxnPage <= 1 || loadingRefereeTxns}
                    onClick={() => {
                      const next = refereeTxnPage - 1;
                      fetchRefereeTransactions(inspectingReferee.id, next, refereeTxnFilterStatus, refereeTxnFilterType, refereeTxnSearch);
                    }}
                    className="p-1 rounded-lg border border-slate-200 hover:bg-white disabled:opacity-40 transition"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="font-bold text-slate-700 px-2">{refereeTxnPage}</span>
                  <button
                    type="button"
                    disabled={refereeTxnPage >= refereeTxnTotalPages || loadingRefereeTxns}
                    onClick={() => {
                      const next = refereeTxnPage + 1;
                      fetchRefereeTransactions(inspectingReferee.id, next, refereeTxnFilterStatus, refereeTxnFilterType, refereeTxnSearch);
                    }}
                    className="p-1 rounded-lg border border-slate-200 hover:bg-white disabled:opacity-40 transition"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. REWARD MODAL */}
      {/* ========================================================================= */}
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
                  {selectedUser.rank && (
                    <div className="text-[10px] font-bold text-amber-600 uppercase mt-0.5">
                      Rank #{selectedUser.rank}
                    </div>
                  )}
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
                      Credit &amp; Award Bonus
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. REFERRAL CHECKMATE ACTION MODAL (Approve, Flag, Reverse) */}
      {/* ========================================================================= */}
      {selectedReferralAction && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden">
            <div className={`p-5 border-b border-slate-100 flex items-center justify-between ${
              selectedReferralAction.type === 'approve' ? 'bg-emerald-50/70' :
              selectedReferralAction.type === 'flag' ? 'bg-red-50/70' : 'bg-purple-50/70'
            }`}>
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-xl text-white ${
                  selectedReferralAction.type === 'approve' ? 'bg-emerald-600' :
                  selectedReferralAction.type === 'flag' ? 'bg-red-600' : 'bg-purple-600'
                }`}>
                  {selectedReferralAction.type === 'approve' ? <CheckCircle className="w-5 h-5" /> :
                   selectedReferralAction.type === 'flag' ? <AlertTriangle className="w-5 h-5" /> :
                   <ArrowDownLeft className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    {selectedReferralAction.type === 'approve' ? 'Approve Referral Bonus' :
                     selectedReferralAction.type === 'flag' ? 'Flag Suspicious Referral' :
                     'Reverse Bonus & Clawback'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Referee: {selectedReferralAction.referee.name || selectedReferralAction.referee.email}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReferralAction(null)}
                className="p-1.5 rounded-xl hover:bg-white text-slate-400 hover:text-slate-600 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleExecuteReferralAction} className="p-6 space-y-4">
              {selectedReferralAction.type === 'reverse' && (
                <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p>
                    <strong>Warning:</strong> Reversing this bonus will automatically claw back ₦{selectedReferralAction.referee.bonusAmount || 100} from the referrer&apos;s wallet balance atomically.
                  </p>
                </div>
              )}

              {selectedReferralAction.type === 'approve' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Bonus Amount to Credit (₦)</label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    value={actionBonusAmount}
                    onChange={(e) => setActionBonusAmount(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono font-bold"
                  />
                </div>
              )}

              {(selectedReferralAction.type === 'flag' || selectedReferralAction.type === 'reverse') && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Reason <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={selectedReferralAction.type === 'flag' ? 'e.g., Shared device ID, duplicate phone match' : 'e.g., Fraudulent referee signup reversal'}
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Internal Admin Notes (Optional)</label>
                <textarea
                  rows={2}
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  placeholder="Additional context or notes for audit logs..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedReferralAction(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAction}
                  className={`px-5 py-2 text-xs font-bold text-white rounded-xl transition shadow-sm disabled:opacity-50 flex items-center gap-1.5 ${
                    selectedReferralAction.type === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' :
                    selectedReferralAction.type === 'flag' ? 'bg-red-600 hover:bg-red-700' : 'bg-purple-600 hover:bg-purple-700'
                  }`}
                >
                  {isSubmittingAction ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      {selectedReferralAction.type === 'approve' ? 'Approve & Credit' :
                       selectedReferralAction.type === 'flag' ? 'Confirm Flag' : 'Confirm Reversal'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. BATCH TIERED REWARDS MODAL */}
      {/* ========================================================================= */}
      {showTierRewardsModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden">
            <div className="p-6 bg-gradient-to-r from-amber-500 to-amber-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-white/20 rounded-2xl backdrop-blur-xs">
                  <Trophy className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-base">Batch Tiered Rewards</h3>
                  <p className="text-xs text-amber-100">
                    Performance bonuses for top referrers ({period === 'all_time' ? 'All Time' : period === 'month' ? 'This Month' : 'This Week'})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTierRewardsModal(false)}
                className="p-1.5 rounded-xl hover:bg-white/20 text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleDistributeTierRewards} className="p-6 space-y-4">
              <p className="text-xs text-slate-600">
                Define the cash reward amounts for top leaderboard tiers. The system will atomically credit each qualifying referrer&apos;s bonus balance and log individual transaction records.
              </p>

              <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200/70">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-amber-400 text-amber-900 font-extrabold text-xs flex items-center justify-center">1</span>
                    <span className="text-xs font-bold text-slate-800">1st Place Champion</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-slate-400 font-bold">₦</span>
                    <input
                      type="number"
                      min="0"
                      value={tier1Reward}
                      onChange={(e) => setTier1Reward(e.target.value)}
                      className="w-28 px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-slate-300 text-slate-800 font-extrabold text-xs flex items-center justify-center">2-3</span>
                    <span className="text-xs font-bold text-slate-800">Top 3 Performers (Rank 2 & 3)</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-slate-400 font-bold">₦</span>
                    <input
                      type="number"
                      min="0"
                      value={tier2Reward}
                      onChange={(e) => setTier2Reward(e.target.value)}
                      className="w-28 px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-amber-200 text-amber-800 font-extrabold text-xs flex items-center justify-center">4-10</span>
                    <span className="text-xs font-bold text-slate-800">Top 10 Contenders (Rank 4 to 10)</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-slate-400 font-bold">₦</span>
                    <input
                      type="number"
                      min="0"
                      value={tier3Reward}
                      onChange={(e) => setTier3Reward(e.target.value)}
                      className="w-28 px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowTierRewardsModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingTierRewards}
                  className="px-5 py-2 text-xs font-bold text-white bg-amber-500 hover:bg-amber-600 rounded-xl transition shadow-sm disabled:opacity-50 flex items-center gap-2"
                >
                  {isSubmittingTierRewards ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Distributing Rewards...
                    </>
                  ) : (
                    <>
                      <Gift className="w-3.5 h-3.5" />
                      Distribute to Top Referrers
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
