import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { Wallet, Wifi, Phone, Activity, Copy } from 'lucide-react';
import { FadeIn, StaggerContainer, StaggerItem, HoverCard } from '../../components/animations/MotionComponents';
import { User, DashboardStats } from '../../types';

// New component for the virtual account display
const VirtualAccountDisplay = ({ user }: { user: User }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000); // Reset after 2 seconds
  };

  if (!user.virtual_account_number) {
    return null; // Don't render if no account number
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
          <div className="flex justify-between mb-3 border-b border-white/10 pb-2">
            <span className="text-sm text-primary-200">Bank Name</span>
            <span className="font-bold tracking-wide">{user.virtual_account_bank}</span>
          </div>
          <div className="flex justify-between mb-3 items-center">
            <span className="text-sm text-primary-200">Account Number</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-2xl font-bold tracking-wider">{user.virtual_account_number}</span>
              <button 
                  onClick={() => handleCopy(user.virtual_account_number!)}
                  className="p-1 hover:bg-white/20 rounded transition-colors relative"
                  title="Copy Account Number"
              >
                  <Copy className="w-4 h-4" />
                  {copied && <span className="absolute -top-7 right-0 bg-black text-white text-xs px-2 py-1 rounded">Copied!</span>}
              </button>
            </div>
          </div>
          <div className="flex justify-between pt-1">
            <span className="text-sm text-primary-200">Account Name</span>
            <span className="font-medium text-sm truncate max-w-[180px]">{user.virtual_account_name}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function UserDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const initDashboard = async () => {
      try {
        // 1. Try to get fresh user data first
        const userRes = await api.get('/auth/me');
        const userData = userRes.data;
        setUser(userData);
        localStorage.setItem('user', JSON.stringify(userData)); // Keep local storage in sync
        
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

  const fetchStats = async (userId: string) => {
    try {
      const res = await api.get(`/transactions/stats/${userId}`);
      setStats(res.data);
    } catch (err) {
      console.error('Failed to fetch stats', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-full">Loading...</div>;

  return (
    <FadeIn className="p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800">Welcome back, {user?.fullName || user?.name || 'User'}!</h1>
        <p className="text-gray-600">Here's what's happening with your account today.</p>
      </div>

      {/* Virtual Account Section */}
      {user && <VirtualAccountDisplay user={user} />}

      <StaggerContainer className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <StaggerItem>
          <StatCard 
            title="Wallet Balance" 
            value={`₦${stats?.balance?.toLocaleString() || 0}`} 
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
