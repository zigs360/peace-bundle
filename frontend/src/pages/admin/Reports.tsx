import { useState, useEffect } from 'react';
import TransactionChart from '../../components/Charts/TransactionChart';
import { BarChart3, Users, Gift, TrendingUp } from 'lucide-react';
import api from '../../services/api';

export default function Reports() {
  const [timeRange, setTimeRange] = useState('7d');
  const [stats, setStats] = useState({
    totalTransactions: 0,
    successRate: 0,
    totalVolume: 0,
    activeUsers: 0,
    avgResponseTime: 0
  });

  const [referralStats, setReferralStats] = useState({
    totalReferrals: 0,
    topReferrers: []
  });

  const [chartData, setChartData] = useState<any>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [statsRes, chartRes, referralRes] = await Promise.all([
          api.get(`/reports/stats?timeRange=${timeRange}`),
          api.get(`/reports/chart?timeRange=${timeRange}`),
          api.get('/admin/referrals/analytics')
        ]);
        
        setStats(statsRes.data);
        setReferralStats(referralRes.data);

        // Process Chart Data
        const labels = chartRes.data.map((item: any) => item.date);
        const volumeData = chartRes.data.map((item: any) => item.volume);
        
        setChartData({
          labels,
          datasets: [
            {
              label: 'Transaction Volume (₦)',
              data: volumeData,
              borderColor: 'rgb(75, 192, 192)',
              backgroundColor: 'rgba(75, 192, 192, 0.2)',
              fill: true,
            },
          ],
        });

      } catch (error) {
        console.error('Failed to fetch stats', error);
      }
    };
    fetchStats();
  }, [timeRange]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <BarChart3 className="w-6 h-6 mr-2" />
          System Reports
        </h1>
        <select 
          className="border rounded-md px-3 py-1"
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value)}
        >
          <option value="24h">Last 24 Hours</option>
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Transaction Volume</h3>
          <TransactionChart data={chartData} />
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Revenue Overview</h3>
          <div className="h-64 flex items-center justify-center text-gray-500 flex-col">
            <span className="text-3xl font-bold text-green-600">₦{Number(stats.totalVolume).toLocaleString()}</span>
            <span className="text-sm mt-2">Total Volume in selected period</span>
          </div>
        </div>
      </div>

      {/* Referral Program Analytics Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">Referral Program</h3>
            <Gift className="w-5 h-5 text-primary-600" />
          </div>
          <div className="space-y-4">
            <div className="p-4 bg-primary-50 rounded-xl border border-primary-100">
              <span className="text-sm text-primary-600 font-medium">Total Referrals</span>
              <p className="text-3xl font-bold text-primary-700">{referralStats.totalReferrals}</p>
            </div>
            <div className="text-sm text-gray-500 italic">
              * Reward: ₦100 per successful referral
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">Top Referrers</h3>
            <TrendingUp className="w-5 h-5 text-green-600" />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Count</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Earnings</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {referralStats.topReferrers.length > 0 ? (
                  referralStats.topReferrers.map((referrer: any, idx) => (
                    <tr key={idx}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{referrer.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">{referrer.referral_code}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-bold">{referrer.referral_count}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-bold">₦{(referrer.referral_count * 100).toLocaleString()}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-6 py-4 text-center text-sm text-gray-500">No referral data yet</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-medium text-gray-900 mb-4">System Health</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-green-50 rounded-lg border border-green-100">
            <p className="text-sm text-green-600 font-medium">Success Rate</p>
            <p className="text-2xl font-bold text-green-700">{stats.successRate}%</p>
          </div>
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
            <p className="text-sm text-blue-600 font-medium">Average Response Time</p>
            <p className="text-2xl font-bold text-blue-700">{stats.avgResponseTime}s</p>
          </div>
          <div className="p-4 bg-purple-50 rounded-lg border border-purple-100">
            <p className="text-sm text-purple-600 font-medium">Active Users</p>
            <p className="text-2xl font-bold text-purple-700">{stats.activeUsers}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
