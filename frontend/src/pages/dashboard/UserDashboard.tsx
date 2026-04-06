import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { Wallet, Wifi, Phone, Activity } from 'lucide-react';
import { FadeIn, StaggerContainer, StaggerItem, HoverCard } from '../../components/animations/MotionComponents';
import { User, DashboardStats } from '../../types';
import { useVirtualAccount } from '../../hooks/useVirtualAccount';
import VirtualAccountWidget from '../../components/VirtualAccountWidget';
import { useNotifications } from '../../context/NotificationContext';

export default function UserDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const { state: va, refresh: refreshVa, reveal: revealVa, auditCopy, request: requestVa } = useVirtualAccount();
  const { walletVersion, walletBalance } = useNotifications();

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
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
          const parsedUser = JSON.parse(storedUser);
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

  const fetchStats = useCallback(async (userId: string) => {
    try {
      const res = await api.get(`/transactions/stats/${userId}`);
      setStats(res.data);
    } catch (err) {
      console.error('Failed to fetch stats', err);
    } finally {
      setLoading(false);
    }
  }, []);

  if (loading) return <div className="flex items-center justify-center h-full">Loading...</div>;
  const displayBalance = walletBalance ?? stats?.balance ?? 0;

  return (
    <FadeIn className="p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800">Welcome back, {user?.fullName || user?.name || 'User'}!</h1>
        <p className="text-gray-600">Here's what's happening with your account today.</p>
      </div>

      {/* Virtual Account Section */}
      <VirtualAccountWidget state={va} onReveal={revealVa} onCopy={auditCopy} onRetry={refreshVa} onRequest={requestVa} variant="dashboard" />

      <StaggerContainer className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <StaggerItem>
          <StatCard 
            title="Wallet Balance" 
            value={`₦${Number(displayBalance).toLocaleString() || 0}`} 
            icon={<Wallet className="w-6 h-6 text-primary-600" />} 
            borderClass="border-primary-500"
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard 
            title="Total Spent" 
            value={`₦${stats?.totalSpent?.toLocaleString() || 0}`} 
            icon={<Activity className="w-6 h-6 text-secondary" />} 
            borderClass="border-secondary"
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard 
            title="Total Funded" 
            value={`₦${stats?.totalFunded?.toLocaleString() || 0}`} 
            icon={<Wallet className="w-6 h-6 text-primary-600" />} 
            borderClass="border-primary-500"
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard 
            title="Referrals" 
            value={stats?.referrals || 0} 
            icon={<Activity className="w-6 h-6 text-secondary" />} 
            borderClass="border-secondary"
          />
        </StaggerItem>
      </StaggerContainer>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Quick Actions */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-4">
            <HoverCard>
              <Link to="/dashboard/data" className="flex flex-col items-center justify-center p-4 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors h-full w-full">
                <Wifi className="w-8 h-8 text-primary-600 mb-2" />
                <span className="text-sm font-medium text-primary-700">Buy Data</span>
              </Link>
            </HoverCard>
            <HoverCard>
              <Link to="/dashboard/airtime" className="flex flex-col items-center justify-center p-4 bg-secondary-50 rounded-lg hover:bg-secondary-100 transition-colors h-full w-full">
                <Phone className="w-8 h-8 text-secondary mb-2" />
                <span className="text-sm font-medium text-secondary-700">Buy Airtime</span>
              </Link>
            </HoverCard>
            <HoverCard>
              <Link to="/dashboard/fund" className="flex flex-col items-center justify-center p-4 bg-secondary-50 rounded-lg hover:bg-secondary-100 transition-colors h-full w-full">
                <Wallet className="w-8 h-8 text-secondary mb-2" />
                <span className="text-sm font-medium text-secondary-700">Fund Wallet</span>
              </Link>
            </HoverCard>
            <HoverCard>
               <Link to="/dashboard/bills" className="flex flex-col items-center justify-center p-4 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors h-full w-full">
                <Activity className="w-8 h-8 text-primary-600 mb-2" />
                <span className="text-sm font-medium text-primary-700">Pay Bills</span>
              </Link>
            </HoverCard>
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="lg:col-span-2 bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-lg font-bold text-gray-800">Recent Transactions</h2>
            <button className="text-sm text-primary-600 hover:text-primary-700 font-medium">View All</button>
          </div>
          <div className="divide-y divide-gray-200">
            {stats?.transactions && stats.transactions.length > 0 ? (
              stats.transactions.map((tx) => (
                <div key={tx.id} className="px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center">
                    <div className={`p-2 rounded-full ${
                      tx.type === 'credit' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                    }`}>
                      {tx.type === 'credit' ? <Wallet className="w-4 h-4" /> : <Activity className="w-4 h-4" />}
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-900">{tx.description}</p>
                      <p className="text-xs text-gray-500">{new Date(tx.createdAt || Date.now()).toLocaleDateString()}</p>
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
              <div className="px-6 py-8 text-center text-gray-500">
                No recent transactions found.
              </div>
            )}
          </div>
        </div>
      </div>
    </FadeIn>
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
