import { useEffect, useState } from 'react';
import api from '../../../services/api';

export default function Airtel() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    const run = async () => {
      try {
        const res = await api.get('/callplans/admin/call-sub/airtel/analytics');
        setData(res.data);
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-full">Loading...</div>;
  if (!data?.success) return <div className="p-6">Failed to load analytics</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Airtel</h2>
        <p className="text-sm text-gray-500 mt-1">Bundle usage and revenue overview for the last 30 days.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-widest text-gray-400 font-black">Total Purchases</div>
          <div className="text-2xl font-black text-gray-900 mt-2">{data.totals?.count || 0}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-widest text-gray-400 font-black">Completed</div>
          <div className="text-2xl font-black text-green-700 mt-2">{data.totals?.completed || 0}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-widest text-gray-400 font-black">Failed</div>
          <div className="text-2xl font-black text-red-700 mt-2">{data.totals?.failed || 0}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-widest text-gray-400 font-black">Amount</div>
          <div className="text-2xl font-black text-gray-900 mt-2">₦{Number(data.totals?.amount || 0).toLocaleString()}</div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="text-sm font-black text-gray-800 mb-3">Top Bundles</div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-2 pr-4">Bundle</th>
                <th className="py-2 pr-4">Count</th>
                <th className="py-2 pr-4">Completed</th>
                <th className="py-2 pr-4">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(data.bundles || []).map((bundle: any) => (
                <tr key={bundle.key} className="border-t border-gray-100">
                  <td className="py-2 pr-4 font-mono text-xs">{bundle.key}</td>
                  <td className="py-2 pr-4 font-black">{bundle.count}</td>
                  <td className="py-2 pr-4 font-black text-green-700">{bundle.completed}</td>
                  <td className="py-2 pr-4 font-black">₦{Number(bundle.amount || 0).toLocaleString()}</td>
                </tr>
              ))}
              {(!data.bundles || data.bundles.length === 0) && (
                <tr>
                  <td className="py-6 text-gray-400" colSpan={4}>
                    No bundle activity yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
