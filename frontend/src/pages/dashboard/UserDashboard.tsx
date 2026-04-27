import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { Wallet, Wifi, Phone, Activity, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { FadeIn, StaggerContainer, StaggerItem, HoverCard } from '../../components/animations/MotionComponents';
import { User, DashboardStats } from '../../types';
import { useVirtualAccount } from '../../hooks/useVirtualAccount';
import VirtualAccountWidget from '../../components/VirtualAccountWidget';
import { useNotifications } from '../../context/NotificationContext';
import { getStoredUser } from '../../utils/storage';
import PageHeader from '../../components/ui/PageHeader';
import StatCard from '../../components/ui/StatCard';
import SurfaceCard from '../../components/ui/SurfaceCard';

export default function UserDashboard() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [statsFetchedAt, setStatsFetchedAt] = useState(0);
  const { state: va, refresh: refreshVa, reveal: revealVa, auditCopy, request: requestVa } = useVirtualAccount();
  const { walletVersion, walletBalance, walletBalanceUpdatedAt, isConnected } = useNotifications();

  const fetchStats = useCallback(async (userId: string | number) => {
    try {
      const res = await api.get(`/transactions/stats/${encodeURIComponent(String(userId))}`);
      setStats(res.data);
      setStatsFetchedAt(Date.now());
    } catch (err) {
      console.error('Failed to fetch stats', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initDashboard = async () => {
      try {
        // 1. Try to get fresh user data first
        const userRes = await api.get('/auth/me');
        const userData = userRes.data;
        setUser(userData);
        const userForStorage = { ...userData };
        delete userForStorage.virtual_account_number;
        delete userForStorage.virtual_account_bank;
        delete userForStorage.virtual_account_name;
        localStorage.setItem('user', JSON.stringify(userForStorage));
        
        // 2. Fetch stats using the fresh user ID
        await fetchStats(userData.id);
      } catch (err) {
        console.error('Failed to refresh user data', err);
        // Fallback: use stored user if API fails
        const parsedUser = getStoredUser<User>();
        if (parsedUser) {
          setUser(parsedUser);
          await fetchStats(parsedUser.id);
        } else {
            setLoading(false);
        }
      }
    };

    initDashboard();
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    void fetchStats(user.id);
  }, [walletVersion, user?.id, fetchStats]);

  useEffect(() => {
    if (!user?.id) return;
    const intervalMs = isConnected ? 30000 : 5000;
    const timer = setInterval(() => {
      void fetchStats(user.id);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [isConnected, user?.id, fetchStats]);

  if (loading) return <div className="flex items-center justify-center h-full">{t('common.loading')}</div>;
  const balanceFromStats = Number((stats as any)?.balance ?? 0);
  const hasRealtime = walletBalance !== null && walletBalanceUpdatedAt > statsFetchedAt;
  const displayBalance = hasRealtime ? walletBalance : balanceFromStats;
  const userName = user?.fullName || user?.name || 'User';

  return (
    <FadeIn className="p-1">
      <PageHeader
        eyebrow={t('nav.userDashboard')}
        title={t('dashboard.welcome', { name: userName })}
        description={t('dashboard.overview')}
      />

      <VirtualAccountWidget state={va} onReveal={revealVa} onCopy={auditCopy} onRetry={refreshVa} onRequest={requestVa} variant="dashboard" />

      <StaggerContainer className="mb-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-2">
        <StaggerItem>
          <StatCard 
            title={t('dashboard.walletBalance')} 
            value={`₦${Number(displayBalance).toLocaleString() || 0}`} 
            icon={<Wallet className="h-6 w-6" />} 
            tone="primary"
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard 
            title={t('dashboard.recentTransactions')} 
            value={stats?.transactionsCount || 0} 
            icon={<Activity className="h-6 w-6" />} 
            tone="accent"
          />
        </StaggerItem>
      </StaggerContainer>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <SurfaceCard className="p-6">
          <h2 className="mb-4 text-lg font-semibold text-slate-950">{t('common.quickActions')}</h2>
          <div className="grid grid-cols-2 gap-4">
            <HoverCard>
              <Link to="/dashboard/data" className="flex h-full w-full flex-col items-center justify-center rounded-3xl bg-primary-50 p-5 text-center hover:bg-primary-100">
                <Wifi className="mb-3 h-8 w-8 text-primary-700" />
                <span className="text-sm font-semibold text-primary-800">{t('dashboard.buyData')}</span>
              </Link>
            </HoverCard>
            <HoverCard>
              <Link to="/dashboard/airtime" className="flex h-full w-full flex-col items-center justify-center rounded-3xl bg-accent-50 p-5 text-center hover:bg-accent-100">
                <Phone className="mb-3 h-8 w-8 text-accent-700" />
                <span className="text-sm font-semibold text-accent-800">{t('dashboard.buyAirtime')}</span>
              </Link>
            </HoverCard>
            <HoverCard>
              <Link to="/dashboard/fund" className="flex h-full w-full flex-col items-center justify-center rounded-3xl bg-emerald-50 p-5 text-center hover:bg-emerald-100">
                <Wallet className="mb-3 h-8 w-8 text-emerald-700" />
                <span className="text-sm font-semibold text-emerald-800">{t('dashboard.fundWallet')}</span>
              </Link>
            </HoverCard>
            <HoverCard>
               <Link to="/dashboard/bills" className="flex h-full w-full flex-col items-center justify-center rounded-3xl bg-sky-50 p-5 text-center hover:bg-sky-100">
                <Activity className="mb-3 h-8 w-8 text-sky-700" />
                <span className="text-sm font-semibold text-sky-800">{t('dashboard.payBills')}</span>
              </Link>
            </HoverCard>
          </div>
        </SurfaceCard>

        <SurfaceCard className="lg:col-span-2 overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
            <h2 className="text-lg font-semibold text-slate-950">{t('dashboard.recentTransactions')}</h2>
            <Link to="/dashboard/transactions" className="inline-flex items-center gap-1 text-sm font-semibold text-primary-700 hover:text-primary-800">
              {t('common.viewAll')} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {stats?.recentTransactions && stats.recentTransactions.length > 0 ? (
              stats.recentTransactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between px-6 py-4">
                  <div className="flex items-center">
                    <div className={`p-2 rounded-full ${
                      tx.type === 'credit' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                    }`}>
                      {tx.type === 'credit' ? <Wallet className="w-4 h-4" /> : <Activity className="w-4 h-4" />}
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-slate-900">{tx.description}</p>
                      <p className="text-xs text-slate-500">{new Date(tx.createdAt || Date.now()).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <span className={`text-sm font-bold ${
                    tx.type === 'credit' ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {tx.type === 'credit' ? '+' : '-'}₦{tx.amount.toLocaleString()}
                  </span>
                </div>
              ))
            ) : (
              <div className="px-6 py-8 text-center text-slate-500">
                {t('dashboard.emptyTransactions')}
              </div>
            )}
          </div>
        </SurfaceCard>
      </div>
    </FadeIn>
  );
}
