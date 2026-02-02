import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { Wallet, Wifi, Phone, Activity } from 'lucide-react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StatData = any;

export default function UserDashboard() {
  const [stats, setStats] = useState<StatData>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);
      fetchStats(parsedUser.id);
    }
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
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800">Welcome back, {user?.fullName || 'User'}!</h1>
        <p className="text-gray-600">Here's what's happening with your account today.</p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <StatCard 
          title="Wallet Balance" 
          value={`₦${stats?.balance?.toLocaleString() || 0}`} 
          icon={<Wallet className="w-6 h-6 text-primary-600" />} 
          borderClass="border-primary-500"
        />
        <StatCard 
          title="Total Spent" 
          value={`₦${stats?.totalSpent?.toLocaleString() || 0}`} 
          icon={<Activity className="w-6 h-6 text-secondary" />} 
          borderClass="border-secondary"
        />
        <StatCard 
          title="Total Funded" 
          value={`₦${stats?.totalFunded?.toLocaleString() || 0}`} 
          icon={<Wallet className="w-6 h-6 text-primary-600" />} 
          borderClass="border-primary-500"
        />
        <StatCard 
          title="Referrals" 
          value={stats?.referrals || 0} 
          icon={<Activity className="w-6 h-6 text-secondary" />} 
          borderClass="border-secondary"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Quick Actions */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-4">
            <Link to="/dashboard/buy-data" className="flex flex-col items-center justify-center p-4 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors">
              <Wifi className="w-8 h-8 text-primary-600 mb-2" />
              <span className="text-sm font-medium text-primary-700">Buy Data</span>
            </Link>
            <Link to="/dashboard/buy-airtime" className="flex flex-col items-center justify-center p-4 bg-secondary-50 rounded-lg hover:bg-secondary-100 transition-colors">
              <Phone className="w-8 h-8 text-secondary mb-2" />
              <span className="text-sm font-medium text-secondary-700">Buy Airtime</span>
            </Link>
            <Link to="/dashboard/fund-wallet" className="flex flex-col items-center justify-center p-4 bg-secondary-50 rounded-lg hover:bg-secondary-100 transition-colors">
              <Wallet className="w-8 h-8 text-secondary mb-2" />
              <span className="text-sm font-medium text-secondary-700">Fund Wallet</span>
            </Link>
             <Link to="/dashboard/pay-bills" className="flex flex-col items-center justify-center p-4 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors">
              <Activity className="w-8 h-8 text-primary-600 mb-2" />
              <span className="text-sm font-medium text-primary-700">Pay Bills</span>
            </Link>
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="lg:col-span-2 bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-lg font-bold text-gray-800">Recent Transactions</h2>
            <button className="text-sm text-primary-600 hover:text-primary-700 font-medium">View All</button>
          </div>
          <div className="divide-y divide-gray-200">
            {stats?.transactions?.length > 0 ? (
              stats.transactions.map((tx: any) => (
                <div key={tx.id} className="px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center">
                    <div className={`p-2 rounded-full ${
                      tx.type === 'fund' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                    }`}>
                      {tx.type === 'fund' ? <Wallet className="w-4 h-4" /> : <Activity className="w-4 h-4" />}
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-900">{tx.description}</p>
                      <p className="text-xs text-gray-500">{new Date(tx.date).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <span className={`text-sm font-bold ${
                    tx.type === 'fund' ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {tx.type === 'fund' ? '+' : '-'}₦{tx.amount.toLocaleString()}
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
