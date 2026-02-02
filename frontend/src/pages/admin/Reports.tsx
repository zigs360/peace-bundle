import { useState, useEffect } from 'react';
import TransactionChart from '../../components/Charts/TransactionChart';
import { BarChart3 } from 'lucide-react';
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

  const [chartData, setChartData] = useState<any>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [statsRes, chartRes] = await Promise.all([
          api.get(`/reports/stats?timeRange=${timeRange}`),
          api.get(`/reports/chart?timeRange=${timeRange}`)
        ]);
        
        setStats(statsRes.data);

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
