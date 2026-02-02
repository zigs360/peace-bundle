import { useState, useEffect } from 'react';
import { Users, DollarSign, Share2, Loader2 } from 'lucide-react';
import api from '../../services/api';

interface AffiliateStats {
  referralCode: string;
  referralLink: string;
  totalEarnings: string;
  referredUsersCount: number;
  pendingPayout: string;
  recentReferrals: {
    name: string;
    date: string;
    status: string;
    commission: string;
  }[];
}

export default function Affiliate() {
  const [stats, setStats] = useState<AffiliateStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await api.get('/users/affiliate-stats');
        setStats(res.data);
      } catch (error) {
        console.error('Failed to fetch affiliate stats', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  const referralCode = stats?.referralCode || "LOADING...";
  const referralLink = stats?.referralLink || "https://peacebundle.com/register";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center">
        <Users className="w-6 h-6 text-primary-600 mr-2" />
        <h1 className="text-2xl font-bold text-gray-900">Affiliate Program</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-primary-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Earnings</p>
              <p className="text-2xl font-bold text-gray-900">₦{stats?.totalEarnings || '0.00'}</p>
            </div>
            <DollarSign className="w-8 h-8 text-primary-200" />
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Referred Users</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.referredUsersCount || 0}</p>
            </div>
            <Users className="w-8 h-8 text-green-200" />
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-purple-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Pending Payout</p>
              <p className="text-2xl font-bold text-gray-900">₦{stats?.pendingPayout || '0.00'}</p>
            </div>
            <Share2 className="w-8 h-8 text-purple-200" />
          </div>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Your Referral Link</h3>
        <div className="flex items-center space-x-4">
          <input
            type="text"
            readOnly
            value={referralLink}
            className="flex-1 block w-full rounded-md border-gray-300 bg-gray-50 p-2 border text-gray-500"
          />
          <button
            onClick={() => navigator.clipboard.writeText(referralLink)}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700"
          >
            Copy Link
          </button>
        </div>
        <p className="mt-2 text-sm text-gray-500">
          Share this link with your friends and earn 5% commission on their first deposit!
        </p>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Recent Referrals</h3>
        </div>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Commission</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {stats?.recentReferrals && stats.recentReferrals.length > 0 ? (
              stats.recentReferrals.map((referral, index) => (
                <tr key={index}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{referral.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(referral.date).toLocaleDateString()}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      referral.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {referral.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">₦{referral.commission}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
                  No referrals yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
