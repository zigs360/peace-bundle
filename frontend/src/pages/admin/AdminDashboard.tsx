import { useEffect, useState } from 'react';
import api from '../../services/api';
import { BarChart, DollarSign, Users, Activity, Wallet, ArrowUpRight, ArrowDownLeft, ShieldCheck, Smartphone, Settings, Landmark, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useNotifications } from '../../context/NotificationContext';
import PageHeader from '../../components/ui/PageHeader';
import StatCard from '../../components/ui/StatCard';
import SurfaceCard from '../../components/ui/SurfaceCard';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StatData = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Transaction = any;

export default function AdminDashboard() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<StatData>(null);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [treasuryBalance, setTreasuryBalance] = useState<number | null>(null);
  const [treasuryLastSyncAt, setTreasuryLastSyncAt] = useState<string | null>(null);
  const [treasurySyncing, setTreasurySyncing] = useState(false);
  const [treasuryWithdrawing, setTreasuryWithdrawing] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawDescription, setWithdrawDescription] = useState(t('admin.settlementPayout'));
  const [buildInfo, setBuildInfo] = useState<any>({ frontend: null, backend: null, error: null });
  const [planSummary, setPlanSummary] = useState<any>(null);
  const [recentPriceUpdates, setRecentPriceUpdates] = useState<any[]>([]);
  const [cheapestPlanSnapshot, setCheapestPlanSnapshot] = useState<any>({});
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

        const [statsRes, planSummaryRes, recentPriceRes, cheapestPlanRes] = await Promise.all([
          api.get('/admin/stats'),
          api.get('/admin/stats/summary'),
          api.get('/admin/stats/recent-updates'),
          api.get('/admin/stats/cheapest-plans'),
        ]);
        setStats(statsRes.data);
        applyTreasurySnapshot(statsRes.data?.treasury);
        setPlanSummary(planSummaryRes.data || null);
        setRecentPriceUpdates(recentPriceRes.data?.items || []);
        setCheapestPlanSnapshot(cheapestPlanRes.data?.items || {});
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
    if (!window.confirm(t('admin.generateAccountsConfirm'))) {
      return;
    }

    setIsGenerating(true);
    try {
      const res = await api.post('/admin/users/generate-virtual-accounts');
      alert(res.data.message);
    } catch (err: any) {
      console.error('Failed to generate virtual accounts', err);
      alert(err.response?.data?.message || t('admin.generateAccountsFailed'));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleTreasurySync = async () => {
    setTreasurySyncing(true);
    try {
      const res = await api.post('/admin/treasury/sync', {});
      await refreshTreasury();
      alert(t('admin.treasurySyncCompleted', { amount: Number(res.data?.credited || 0).toLocaleString() }));
    } catch (err: any) {
      console.error('Treasury sync failed', err);
      alert(err.response?.data?.message || t('admin.treasurySyncFailed'));
    } finally {
      setTreasurySyncing(false);
    }
  };

  const handleTreasuryWithdraw = async () => {
    const amt = Number(withdrawAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      alert(t('admin.enterValidAmount'));
      return;
    }
    if (!window.confirm(t('admin.withdrawConfirm', { amount: amt.toLocaleString() }))) return;
    setTreasuryWithdrawing(true);
    try {
      const res = await api.post('/admin/treasury/withdraw', { amount: amt, description: withdrawDescription || null });
      await refreshTreasury();
      const reference = res.data?.data?.reference || t('admin.notAvailable');
      const providerReference = res.data?.data?.providerReference
        ? t('admin.providerReferenceSuffix', { reference: res.data.data.providerReference })
        : '';
      alert(t('admin.withdrawalInitiated', { reference, providerReference }));
      setWithdrawAmount('');
    } catch (err: any) {
      console.error('Treasury withdrawal failed', err);
      alert(err.response?.data?.message || t('admin.treasuryWithdrawalFailed'));
    } finally {
      setTreasuryWithdrawing(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-full">{t('common.loading')}</div>;

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
    <div className="p-1">
      <PageHeader
        eyebrow={t('nav.adminConsole')}
        title={t('admin.overview')}
        description={t('admin.subtitle')}
        actions={
          <div className="flex gap-3">
            <Link to="/admin/plans" className="enterprise-button-secondary">
              {t('admin.openPlans')}
            </Link>
            <Link to="/admin/reports" className="enterprise-button-primary">
              {t('admin.viewReports')}
            </Link>
          </div>
        }
      />

      <div className="mb-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard 
          title={t('admin.recognizedRevenue')} 
          value={recognizedRevenueDisplay} 
          icon={<DollarSign className="h-6 w-6" />} 
          tone="accent"
        />
        <StatCard 
          title={t('admin.activeSims')} 
          value={stats?.stats?.active_sims || 0} 
          icon={<Activity className="h-6 w-6" />} 
          tone="primary"
        />
        <StatCard 
          title={t('admin.totalUsers')} 
          value={stats?.stats?.total_users || 0} 
          icon={<Users className="h-6 w-6" />} 
          tone="success"
        />
        <StatCard 
          title={t('admin.totalTransactions')} 
          value={stats?.stats?.total_transactions || 0} 
          icon={<BarChart className="h-6 w-6" />} 
          tone="neutral"
        />
      </div>

      <SurfaceCard className="mb-8 p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">{t('admin.planSnapshot')}</h2>
            <p className="text-sm text-slate-600">{t('admin.planSnapshotDescription')}</p>
          </div>
          <Link to="/admin/plans" className="text-sm font-semibold text-primary-700 hover:text-primary-800">{t('admin.openPlans')}</Link>
        </div>
        <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="rounded-3xl bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{t('admin.totalPlans')}</div>
            <div className="mt-1 text-2xl font-semibold text-slate-950">{planSummary?.totalPlans || 0}</div>
          </div>
          <div className="rounded-3xl bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{t('admin.activePlansLabel')}</div>
            <div className="mt-1 text-2xl font-semibold text-slate-950">{planSummary?.activePlans || 0}</div>
          </div>
          <div className="rounded-3xl bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{t('admin.zeroPriceInactive')}</div>
            <div className="mt-1 text-2xl font-semibold text-slate-950">{planSummary?.zeroPricePlans || 0}</div>
          </div>
          <div className="rounded-3xl bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{t('admin.recentPriceChanges')}</div>
            <div className="mt-1 text-2xl font-semibold text-slate-950">{recentPriceUpdates.length}</div>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-3 text-sm font-semibold text-slate-900">{t('admin.latestUpdates')}</h3>
            <div className="space-y-3">
              {recentPriceUpdates.slice(0, 5).map((item) => (
                <div key={item.id} className="rounded-3xl border border-slate-100 bg-white/80 p-4 text-sm">
                  <div className="font-medium text-slate-900">{item.plan?.name || t('admin.planFallback')} ({String(item.plan?.provider || '').toUpperCase()})</div>
                  <div className="text-slate-600">{item.field_name}: {item.new_price ?? item.new_value ?? '—'}</div>
                  <div className="text-xs text-slate-500">{item.changed_by}</div>
                </div>
              ))}
              {!recentPriceUpdates.length && <div className="text-sm text-slate-500">{t('admin.noRecentPlanChanges')}</div>}
            </div>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold text-slate-900">{t('admin.cheapestPlans')}</h3>
            <div className="space-y-3">
              {Object.entries(cheapestPlanSnapshot || {}).map(([network, items]: any) => (
                <div key={network} className="rounded-3xl border border-slate-100 bg-white/80 p-4">
                  <div className="mb-2 text-xs uppercase tracking-[0.18em] text-slate-500">{network}</div>
                  <div className="space-y-2">
                    {(items || []).slice(0, 2).map((plan: any) => (
                      <div key={plan.id} className="flex items-center justify-between text-sm">
                        <span className="text-slate-700">{plan.name}</span>
                        <span className="font-semibold text-primary-700">₦{Number(plan.your_price || 0).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </SurfaceCard>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <SurfaceCard className="lg:col-span-2 overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-950">{t('dashboard.recentTransactions')}</h2>
            <Link to="/admin/transactions" className="text-sm font-semibold text-primary-700 hover:text-primary-800">{t('common.viewAll')}</Link>
          </div>
          <div className="divide-y divide-slate-100">
            {recentTransactions.length > 0 ? (
              recentTransactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between px-6 py-4 transition hover:bg-slate-50/80">
                  <div className="flex items-center">
                    <div className={`p-2 rounded-full mr-4 ${
                      isCreditTransaction(tx) ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                    }`}>
                      {isCreditTransaction(tx) ? <Wallet className="w-5 h-5" /> : <Activity className="w-5 h-5" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">{tx.description}</p>
                      <div className="mt-1 flex items-center">
                        <span className="mr-2 text-xs text-slate-500">{new Date(tx.createdAt).toLocaleDateString()}</span>
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
              <div className="px-6 py-8 text-center text-slate-500">
                {t('dashboard.emptyTransactions')}
              </div>
            )}
          </div>
        </SurfaceCard>

        <div className="lg:col-span-1 space-y-6">
           <SurfaceCard className="p-6">
              <h3 className="mb-4 text-lg font-semibold text-slate-950">{t('common.quickActions')}</h3>
              <div className="grid grid-cols-2 gap-4">
                  <QuickActionLink 
                    to="/admin/kyc" 
                    icon={<ShieldCheck className="w-5 h-5" />} 
                    label={t('admin.kycRequests')} 
                    color="bg-blue-50 text-blue-600"
                  />
                  <QuickActionLink 
                    to="/admin/sims" 
                    icon={<Smartphone className="w-5 h-5" />} 
                    label={t('admin.manageSims')} 
                    color="bg-purple-50 text-purple-600"
                  />
                  <QuickActionLink 
                    to="/admin/users" 
                    icon={<Users className="w-5 h-5" />} 
                    label={t('admin.userList')} 
                    color="bg-green-50 text-green-600"
                  />
                  <QuickActionLink 
                    to="/admin/settings" 
                    icon={<Settings className="w-5 h-5" />} 
                    label={t('common.settings')} 
                    color="bg-gray-50 text-gray-600"
                  />
              </div>
           </SurfaceCard>

           <SurfaceCard className="p-6">
              <div className="mb-4 flex justify-between items-center">
                  <h3 className="text-lg font-semibold text-slate-950">{t('admin.treasury')}</h3>
                  <button
                    onClick={handleTreasurySync}
                    disabled={treasurySyncing}
                    className={`rounded-full px-3 py-1 text-[10px] font-bold transition-all ${
                      treasurySyncing ? 'cursor-not-allowed bg-slate-100 text-slate-400' : 'bg-accent-100 text-accent-800 hover:bg-accent-200'
                    }`}
                  >
                    <span className="inline-flex items-center">
                      <RefreshCw className="w-3 h-3 mr-1" />
                      {treasurySyncing ? t('admin.syncing') : t('admin.syncRevenue')}
                    </span>
                  </button>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="inline-flex items-center text-sm text-slate-600">
                    <Landmark className="mr-2 h-4 w-4 text-slate-500" />
                    {t('admin.availableBalance')}
                  </span>
                  <span className="text-sm font-bold text-slate-900">{treasuryBalanceDisplay}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">{t('admin.recognizedRevenue')}</span>
                  <span className="text-sm font-bold text-slate-900">{recognizedRevenueDisplay}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">{t('admin.withdrawnSettled')}</span>
                  <span className="text-sm font-bold text-slate-900">{withdrawnRevenueDisplay}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">{t('admin.pendingWithdrawals')}</span>
                  <span className="text-sm font-bold text-slate-900">{pendingWithdrawalDisplay}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">{t('admin.lastSync')}</span>
                  <span className="text-xs text-slate-500">{treasuryLastSyncAt ? new Date(treasuryLastSyncAt).toLocaleString() : '—'}</span>
                </div>
                {Math.abs(reconciliationDifference) > 0.009 ? (
                  <p className="text-xs text-amber-600">
                    {t('admin.reconciliationDrift', { amount: reconciliationDifference.toLocaleString() })}
                  </p>
                ) : (
                  <p className="text-xs text-gray-500">
                    {t('admin.reconciliationHealthy')}
                  </p>
                )}
                <div className="space-y-2 border-t border-slate-100 pt-3">
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      placeholder={t('admin.amount')}
                      className="enterprise-input"
                    />
                    <button
                      onClick={handleTreasuryWithdraw}
                      disabled={treasuryWithdrawing}
                      className={`w-full rounded-2xl px-3 py-2 text-sm font-bold transition-all ${
                        treasuryWithdrawing ? 'cursor-not-allowed bg-slate-100 text-slate-400' : 'bg-accent-600 text-white hover:bg-accent-700'
                      }`}
                    >
                      {treasuryWithdrawing ? t('admin.withdrawing') : t('admin.withdraw')}
                    </button>
                  </div>
                  <input
                    value={withdrawDescription}
                    onChange={(e) => setWithdrawDescription(e.target.value)}
                    placeholder={t('admin.settlementPayout')}
                    className="enterprise-input"
                  />
                  <p className="text-xs text-slate-500">
                    {t('admin.withdrawHelper')}
                  </p>
                </div>
              </div>
           </SurfaceCard>

           <SurfaceCard className="p-6">
              <div className="mb-4 flex justify-between items-center">
                  <h3 className="text-lg font-semibold text-slate-950">{t('admin.systemStatus')}</h3>
                  <button 
                    onClick={handleGenerateAccounts}
                    disabled={isGenerating}
                    className={`rounded-full px-3 py-1 text-[10px] font-bold transition-all ${
                        isGenerating ? 'cursor-not-allowed bg-slate-100 text-slate-400' : 'bg-primary-100 text-primary-700 hover:bg-primary-200'
                    }`}
                  >
                      {isGenerating ? t('admin.processing') : t('admin.bulkGenerateVirtualAccounts')}
                  </button>
              </div>
              <div className="space-y-4">
                  <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-600">{t('admin.serverStatus')}</span>
                      <span className="px-2 py-1 text-xs font-bold text-green-700 bg-green-100 rounded-full">{t('admin.online')}</span>
                  </div>
                  <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-600">{t('admin.databaseConnection')}</span>
                      <span className="px-2 py-1 text-xs font-bold text-green-700 bg-green-100 rounded-full">{t('admin.connected')}</span>
                  </div>
                  <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-600">{t('admin.apiGateway')}</span>
                      <span className="px-2 py-1 text-xs font-bold text-green-700 bg-green-100 rounded-full">{t('admin.active')}</span>
                  </div>
                  <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-600">{t('admin.frontendBuild')}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">{frontendCommitShort}</span>
                  </div>
                  <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-600">{t('admin.backendBuild')}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">{backendCommitShort}</span>
                  </div>
                  {deploymentMismatch ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      {t('admin.deploymentMismatch')}
                    </div>
                  ) : buildInfo.error ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      {buildInfo.error}
                    </div>
                  ) : null}
                  <div className="border-t border-slate-100 pt-4">
                      <p className="text-xs text-slate-400">
                        {t('admin.frontendBuilt', { time: buildInfo.frontend?.time ? new Date(buildInfo.frontend.time).toLocaleString() : 'unknown' })}
                      </p>
                      <p className="text-xs text-slate-400">
                        {t('admin.backendReported', { time: buildInfo.backend?.time ? new Date(buildInfo.backend.time).toLocaleString() : 'unknown' })}
                      </p>
                  </div>
              </div>
           </SurfaceCard>
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
      className="group flex flex-col items-center rounded-3xl border border-slate-100 bg-white/80 p-4 transition-all hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-soft"
    >
      <div className={`mb-3 rounded-2xl p-3 transition-transform group-hover:scale-110 ${color}`}>
        {icon}
      </div>
      <span className="text-center text-xs font-medium text-slate-600 group-hover:text-primary-700">{label}</span>
    </Link>
  );
}
