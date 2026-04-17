import { useEffect, useState } from 'react';
import api from '../../services/api';
import { BarChart, DollarSign, Users, Activity, Wallet, ArrowUpRight, ArrowDownLeft, ShieldCheck, Smartphone, Settings, Landmark, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import React from 'react';
import { useNotifications } from '../../context/NotificationContext';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StatData = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Transaction = any;

export default function AdminDashboard() {
  const [stats, setStats] = useState<StatData>(null);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [treasuryBalance, setTreasuryBalance] = useState<number | null>(null);
  const [treasuryLastSyncAt, setTreasuryLastSyncAt] = useState<string | null>(null);
  const [treasurySyncing, setTreasurySyncing] = useState(false);
  const [treasuryWithdrawing, setTreasuryWithdrawing] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawDescription, setWithdrawDescription] = useState('Settlement payout');
  const [buildInfo, setBuildInfo] = useState<any>({ frontend: null, backend: null, error: null });
  const { treasuryBalance: rtTreasuryBalance, treasuryBalanceUpdatedAt, treasurySnapshot: rtTreasurySnapshot } = useNotifications();

  const applyTreasurySnapshot = (snapshot: any) => {
    if (!snapshot || typeof snapshot !== 'object') return;
    const nextBalance = typeof snapshot.balance === 'number' ? snapshot.balance : Number(snapshot.balance);
    if (Number.isFinite(nextBalance)) setTreasuryBalance(nextBalance);
    setTreasuryLastSyncAt(snapshot.lastSyncAt || null);
    setStats((prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        treasury: snapshot,
        stats: {
          ...(prev.stats || {}),
          total_revenue: Number(snapshot?.revenue?.totalRecognizedRevenue ?? prev?.stats?.total_revenue ?? 0),
          treasury_available_balance: Number.isFinite(nextBalance) ? nextBalance : Number(prev?.stats?.treasury_available_balance ?? 0),
          treasury_fee_revenue: Number(snapshot?.revenue?.feeRevenue ?? prev?.stats?.treasury_fee_revenue ?? 0),
          treasury_data_profit: Number(snapshot?.revenue?.dataProfit ?? prev?.stats?.treasury_data_profit ?? 0),
          treasury_withdrawn_total: Number(snapshot?.withdrawals?.totalCompletedWithdrawals ?? prev?.stats?.treasury_withdrawn_total ?? 0),
          treasury_pending_withdrawals: Number(snapshot?.withdrawals?.totalPendingWithdrawals ?? prev?.stats?.treasury_pending_withdrawals ?? 0),
          treasury_reconciliation_difference: Number(snapshot?.reconciliation?.difference ?? prev?.stats?.treasury_reconciliation_difference ?? 0),
        },
      };
    });
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [frontendMeta, backendMeta] = await Promise.allSettled([
          fetch('/meta.json', { cache: 'no-store' }).then((res) => (res.ok ? res.json() : null)),
          api.get('/meta').then((res) => res.data),
        ]);
        setBuildInfo({
          frontend: frontendMeta.status === 'fulfilled' ? frontendMeta.value : null,
          backend: backendMeta.status === 'fulfilled' ? backendMeta.value : null,
          error:
            frontendMeta.status === 'rejected' || backendMeta.status === 'rejected'
              ? 'Unable to load full deployment metadata'
              : null,
        });

        const statsRes = await api.get('/admin/stats');
        setStats(statsRes.data);
        applyTreasurySnapshot(statsRes.data?.treasury);
        // Use recent transactions from stats endpoint
        setRecentTransactions(statsRes.data.recentTransactions || []);
        try {
          const treasuryRes = await api.get('/admin/treasury/balance');
          applyTreasurySnapshot(treasuryRes.data);
        } catch (e) {
          setTreasuryBalance(null);
          setTreasuryLastSyncAt(null);
        }
      } catch (err) {
        console.error('Failed to fetch dashboard data', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (rtTreasurySnapshot) {
      applyTreasurySnapshot(rtTreasurySnapshot);
      return;
    }
    if (rtTreasuryBalance === null) return;
    if (!Number.isFinite(rtTreasuryBalance)) return;
    setTreasuryBalance(rtTreasuryBalance);
  }, [rtTreasuryBalance, treasuryBalanceUpdatedAt, rtTreasurySnapshot]);

  useEffect(() => {
    let timer: any = null;
    const tick = async () => {
      try {
        await refreshTreasury();
      } catch (e) {
        void e;
      }
    };
    timer = setInterval(tick, 15000);
    const onFocus = () => void tick();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void tick();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      if (timer) clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const refreshTreasury = async () => {
    const treasuryRes = await api.get('/admin/treasury/balance');
    applyTreasurySnapshot(treasuryRes.data);
  };

  const handleGenerateAccounts = async () => {
    if (!window.confirm('Are you sure you want to generate virtual accounts for all users missing one? This will call the payment provider API for each user.')) {
      return;
    }

    setIsGenerating(true);
    try {
      const res = await api.post('/admin/users/generate-virtual-accounts');
      alert(res.data.message);
    } catch (err: any) {
      console.error('Failed to generate virtual accounts', err);
      alert(err.response?.data?.message || 'Failed to generate virtual accounts');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleTreasurySync = async () => {
    setTreasurySyncing(true);
    try {
      const res = await api.post('/admin/treasury/sync', {});
      await refreshTreasury();
      alert(`Treasury sync completed. Credited: ₦${Number(res.data?.credited || 0).toLocaleString()}`);
    } catch (err: any) {
      console.error('Treasury sync failed', err);
      alert(err.response?.data?.message || 'Treasury sync failed');
    } finally {
      setTreasurySyncing(false);
    }
  };

  const handleTreasuryWithdraw = async () => {
    const amt = Number(withdrawAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      alert('Enter a valid amount');
      return;
    }
    if (!window.confirm(`Withdraw ₦${amt.toLocaleString()} from treasury to settlement account?`)) return;
    setTreasuryWithdrawing(true);
    try {
      const res = await api.post('/admin/treasury/withdraw', { amount: amt, description: withdrawDescription || null });
      await refreshTreasury();
      alert(`Withdrawal initiated. Ref: ${res.data?.data?.reference || 'N/A'}${res.data?.data?.providerReference ? ` | Provider Ref: ${res.data.data.providerReference}` : ''}`);
      setWithdrawAmount('');
    } catch (err: any) {
      console.error('Treasury withdrawal failed', err);
      alert(err.response?.data?.message || 'Treasury withdrawal failed');
    } finally {
      setTreasuryWithdrawing(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-full">Loading...</div>;

  const treasuryBalanceDisplay =
    treasuryBalance !== null && Number.isFinite(treasuryBalance) ? `₦${Number(treasuryBalance).toLocaleString()}` : '—';
  const recognizedRevenueDisplay = `₦${Number(stats?.stats?.total_revenue || 0).toLocaleString()}`;
  const withdrawnRevenueDisplay = `₦${Number(stats?.stats?.treasury_withdrawn_total || 0).toLocaleString()}`;
  const pendingWithdrawalDisplay = `₦${Number(stats?.stats?.treasury_pending_withdrawals || 0).toLocaleString()}`;
  const reconciliationDifference = Number(stats?.stats?.treasury_reconciliation_difference || 0);
  const frontendCommit = String(buildInfo.frontend?.commit || '').trim();
  const backendCommit = String(buildInfo.backend?.commit || '').trim();
  const frontendCommitShort = frontendCommit ? frontendCommit.slice(0, 7) : 'unknown';
  const backendCommitShort = backendCommit ? backendCommit.slice(0, 7) : 'unknown';
  const deploymentMismatch =
    frontendCommit &&
    backendCommit &&
    frontendCommit !== backendCommit;
  const isCreditTransaction = (tx: any) => String(tx?.type || '').toLowerCase() === 'credit';

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Dashboard Overview</h1>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <StatCard 
          title="Recognized Revenue" 
          value={recognizedRevenueDisplay} 
          icon={<DollarSign className="w-6 h-6 text-secondary" />} 
          borderClass="border-secondary"
        />
        <StatCard 
          title="Active SIMs" 
          value={stats?.stats?.active_sims || 0} 
          icon={<Activity className="w-6 h-6 text-primary-600" />} 
          borderClass="border-primary-500"
        />
        <StatCard 
          title="Total Users" 
          value={stats?.stats?.total_users || 0} 
          icon={<Users className="w-6 h-6 text-primary-600" />} 
          borderClass="border-primary-500"
        />
        <StatCard 
          title="Total Transactions" 
          value={stats?.stats?.total_transactions || 0} 
          icon={<BarChart className="w-6 h-6 text-primary-600" />} 
          borderClass="border-primary-500"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Transactions */}
        <div className="lg:col-span-2 bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-lg font-bold text-gray-800">Recent Transactions</h2>
            <a href="/admin/transactions" className="text-sm text-primary-600 hover:text-primary-700 font-medium">View All</a>
          </div>
          <div className="divide-y divide-gray-200">
            {recentTransactions.length > 0 ? (
              recentTransactions.map((tx) => (
                <div key={tx.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition">
                  <div className="flex items-center">
                    <div className={`p-2 rounded-full mr-4 ${
                      isCreditTransaction(tx) ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                    }`}>
                      {isCreditTransaction(tx) ? <Wallet className="w-5 h-5" /> : <Activity className="w-5 h-5" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{tx.description}</p>
                      <div className="flex items-center mt-1">
                        <span className="text-xs text-gray-500 mr-2">{new Date(tx.createdAt).toLocaleDateString()}</span>
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          tx.status === 'success' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {tx.status}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className={`text-sm font-bold flex items-center ${
                    isCreditTransaction(tx) ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {isCreditTransaction(tx) ? <ArrowDownLeft className="w-4 h-4 mr-1" /> : <ArrowUpRight className="w-4 h-4 mr-1" />}
                    ₦{Number(tx.amount).toLocaleString()}
                  </div>
                </div>
              ))
            ) : (
              <div className="px-6 py-8 text-center text-gray-500">
                No recent transactions found.
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions or System Status */}
        <div className="lg:col-span-1 space-y-6">
           <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">Quick Actions</h3>
              <div className="grid grid-cols-2 gap-4">
                  <QuickActionLink 
                    to="/admin/kyc" 
                    icon={<ShieldCheck className="w-5 h-5" />} 
                    label="KYC Requests" 
                    color="bg-blue-50 text-blue-600"
                  />
                  <QuickActionLink 
                    to="/admin/sims" 
                    icon={<Smartphone className="w-5 h-5" />} 
                    label="Manage SIMs" 
                    color="bg-purple-50 text-purple-600"
                  />
                  <QuickActionLink 
                    to="/admin/users" 
                    icon={<Users className="w-5 h-5" />} 
                    label="User List" 
                    color="bg-green-50 text-green-600"
                  />
                  <QuickActionLink 
                    to="/admin/settings" 
                    icon={<Settings className="w-5 h-5" />} 
                    label="Settings" 
                    color="bg-gray-50 text-gray-600"
                  />
              </div>
           </div>

           <div className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-bold text-gray-800">Treasury</h3>
                  <button
                    onClick={handleTreasurySync}
                    disabled={treasurySyncing}
                    className={`text-[10px] font-bold px-3 py-1 rounded-full transition-all ${
                      treasurySyncing ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-secondary/10 text-secondary hover:bg-secondary/20'
                    }`}
                  >
                    <span className="inline-flex items-center">
                      <RefreshCw className="w-3 h-3 mr-1" />
                      {treasurySyncing ? 'Syncing...' : 'Sync Revenue'}
                    </span>
                  </button>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 inline-flex items-center">
                    <Landmark className="w-4 h-4 mr-2 text-gray-500" />
                    Available Balance
                  </span>
                  <span className="text-sm font-bold text-gray-900">{treasuryBalanceDisplay}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Recognized Revenue</span>
                  <span className="text-sm font-bold text-gray-900">{recognizedRevenueDisplay}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Withdrawn / Settled</span>
                  <span className="text-sm font-bold text-gray-900">{withdrawnRevenueDisplay}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Pending Withdrawals</span>
                  <span className="text-sm font-bold text-gray-900">{pendingWithdrawalDisplay}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Last Sync</span>
                  <span className="text-xs text-gray-500">{treasuryLastSyncAt ? new Date(treasuryLastSyncAt).toLocaleString() : '—'}</span>
                </div>
                {Math.abs(reconciliationDifference) > 0.009 ? (
                  <p className="text-xs text-amber-600">
                    Treasury reconciliation drift detected: ₦{reconciliationDifference.toLocaleString()}
                  </p>
                ) : (
                  <p className="text-xs text-gray-500">
                    Available balance equals recognized revenue minus settled and pending withdrawals.
                  </p>
                )}
                <div className="pt-3 border-t border-gray-100 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      placeholder="Amount"
                      className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30"
                    />
                    <button
                      onClick={handleTreasuryWithdraw}
                      disabled={treasuryWithdrawing}
                      className={`w-full px-3 py-2 rounded-md text-sm font-bold transition-all ${
                        treasuryWithdrawing ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-secondary text-white hover:opacity-90'
                      }`}
                    >
                      {treasuryWithdrawing ? 'Withdrawing...' : 'Withdraw'}
                    </button>
                  </div>
                  <input
                    value={withdrawDescription}
                    onChange={(e) => setWithdrawDescription(e.target.value)}
                    placeholder="Description"
                    className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30"
                  />
                  <p className="text-xs text-gray-500">
                    Withdraw sends funds to the configured settlement account and deducts the transfer fee from treasury.
                  </p>
                </div>
              </div>
           </div>

           <div className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-bold text-gray-800">System Status</h3>
                  <button 
                    onClick={handleGenerateAccounts}
                    disabled={isGenerating}
                    className={`text-[10px] font-bold px-3 py-1 rounded-full transition-all ${
                        isGenerating ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-primary-50 text-primary-600 hover:bg-primary-100'
                    }`}
                  >
                      {isGenerating ? 'Processing...' : 'Bulk Generate Virtual Accounts'}
                  </button>
              </div>
              <div className="space-y-4">
                  <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Server Status</span>
                      <span className="px-2 py-1 text-xs font-bold text-green-700 bg-green-100 rounded-full">Online</span>
                  </div>
                  <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Database Connection</span>
                      <span className="px-2 py-1 text-xs font-bold text-green-700 bg-green-100 rounded-full">Connected</span>
                  </div>
                  <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">API Gateway</span>
                      <span className="px-2 py-1 text-xs font-bold text-green-700 bg-green-100 rounded-full">Active</span>
                  </div>
                  <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Frontend Build</span>
                      <span className="px-2 py-1 text-xs font-mono text-gray-700 bg-gray-100 rounded-full">{frontendCommitShort}</span>
                  </div>
                  <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Backend Build</span>
                      <span className="px-2 py-1 text-xs font-mono text-gray-700 bg-gray-100 rounded-full">{backendCommitShort}</span>
                  </div>
                  {deploymentMismatch ? (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      Frontend and backend are running different commits. Deploy both layers for changes to appear consistently.
                    </div>
                  ) : buildInfo.error ? (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      {buildInfo.error}
                    </div>
                  ) : null}
                  <div className="pt-4 border-t border-gray-100">
                      <p className="text-xs text-gray-400">
                        Frontend built: {buildInfo.frontend?.time ? new Date(buildInfo.frontend.time).toLocaleString() : 'unknown'}
                      </p>
                      <p className="text-xs text-gray-400">
                        Backend reported: {buildInfo.backend?.time ? new Date(buildInfo.backend.time).toLocaleString() : 'unknown'}
                      </p>
                  </div>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  borderClass?: string;
}

function StatCard({ title, value, icon, borderClass = "border-gray-200" }: StatCardProps) {
  return (
    <div className={`overflow-hidden bg-white rounded-lg shadow border-t-4 ${borderClass}`}>
      <div className="p-5">
        <div className="flex items-center">
          <div className="flex-shrink-0 p-3 rounded-full bg-gray-50">{icon}</div>
          <div className="flex-1 w-0 ml-5">
            <dl>
              <dt className="text-sm font-medium text-gray-500 truncate">{title}</dt>
              <dd>
                <div className="text-lg font-medium text-gray-900">{value}</div>
              </dd>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}

interface QuickActionLinkProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  color: string;
}

function QuickActionLink({ to, icon, label, color }: QuickActionLinkProps) {
  return (
    <Link 
      to={to} 
      className="flex flex-col items-center p-3 rounded-lg border border-gray-100 hover:border-primary-200 hover:shadow-sm transition-all group"
    >
      <div className={`p-2 rounded-lg mb-2 ${color} group-hover:scale-110 transition-transform`}>
        {icon}
      </div>
      <span className="text-xs font-medium text-gray-600 group-hover:text-primary-600">{label}</span>
    </Link>
  );
}
