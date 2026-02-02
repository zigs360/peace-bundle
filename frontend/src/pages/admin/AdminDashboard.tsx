import { useEffect, useState } from 'react';
import api from '../../services/api';
import { BarChart, DollarSign, Users, Activity, Wallet, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import React from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StatData = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Transaction = any;

export default function AdminDashboard() {
  const [stats, setStats] = useState<StatData>(null);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const statsRes = await api.get('/admin/stats');
        setStats(statsRes.data);
        // Use recent transactions from stats endpoint
        setRecentTransactions(statsRes.data.recentTransactions || []);
      } catch (err) {
        console.error('Failed to fetch dashboard data', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-full">Loading...</div>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Dashboard Overview</h1>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <StatCard 
          title="Total Revenue" 
          value={`₦${parseFloat(stats?.stats?.total_revenue || 0).toLocaleString()}`} 
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
                      tx.type === 'fund' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                    }`}>
                      {tx.type === 'fund' ? <Wallet className="w-5 h-5" /> : <Activity className="w-5 h-5" />}
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
                    tx.type === 'fund' ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {tx.type === 'fund' ? <ArrowDownLeft className="w-4 h-4 mr-1" /> : <ArrowUpRight className="w-4 h-4 mr-1" />}
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
              <h3 className="text-lg font-bold text-gray-800 mb-4">System Status</h3>
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
                  <div className="pt-4 border-t border-gray-100">
                      <p className="text-xs text-gray-400">Last updated: {new Date().toLocaleTimeString()}</p>
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
