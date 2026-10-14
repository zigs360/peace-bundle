import { useState, useEffect } from 'react';
import { Users, DollarSign, Share2, Loader2, MousePointerClick, Percent, Award, Eye, EyeOff, CheckCircle2, Clock } from 'lucide-react';
import api from '../../services/api';
import { usePrivacy } from '../../context/PrivacyContext';

interface AffiliateStats {
  referralCode: string;
  referralLink: string;
  totalEarnings: string | number;
  referredUsersCount: number;
  pendingPayout: string | number;
  totalClicks?: number;
  totalConvertedClicks?: number;
  conversionRate?: number;
  totalRefereeRewardsIssued?: string | number;
  recentReferrals: {
    name: string;
    date: string;
    status: string;
    isRewarded?: boolean;
    qualifyingDepositAmount?: number;
    qualifyingDepositAt?: string | null;
    commission: string | number;
    referrerReward?: string | number;
    refereeReward?: string | number;
  }[];
}

export default function Affiliate() {
  const [stats, setStats] = useState<AffiliateStats | null>(null);
  const [loading, setLoading] = useState(true);
  const { isAmountHidden, toggleAmountHidden, formatAmount } = usePrivacy();

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

  const referralLink = stats?.referralLink || "https://peacebundlle.com/register";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <Users className="w-6 h-6 text-primary-600 mr-2" />
          <h1 className="text-2xl font-bold text-gray-900">Affiliate Program</h1>
        </div>
        <button
          onClick={toggleAmountHidden}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
          title={isAmountHidden ? "Show amounts" : "Hide amounts (Privacy Mode)"}
        >
          {isAmountHidden ? <EyeOff size={16} className="text-amber-600" /> : <Eye size={16} />}
          <span>{isAmountHidden ? "Show Amounts" : "Hide Amounts"}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow duration-200">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Earnings</p>
              <p className="text-2xl font-bold text-gray-900">{formatAmount(stats?.totalEarnings)}</p>
            </div>
            <div className="p-3 bg-primary-50 rounded-lg text-primary-600">
              <DollarSign className="w-6 h-6" />
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow duration-200">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Referred Friends</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.referredUsersCount || 0}</p>
            </div>
            <div className="p-3 bg-emerald-50 rounded-lg text-emerald-600">
              <Users className="w-6 h-6" />
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow duration-200">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pending Payout</p>
              <p className="text-2xl font-bold text-gray-900">{formatAmount(stats?.pendingPayout)}</p>
            </div>
            <div className="p-3 bg-purple-50 rounded-lg text-purple-600">
              <Share2 className="w-6 h-6" />
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow duration-200">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Link Clicks</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.totalClicks || 0}</p>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg text-blue-600">
              <MousePointerClick className="w-6 h-6" />
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow duration-200">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Conversion Rate</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.conversionRate !== undefined ? `${stats.conversionRate}%` : '0%'}</p>
            </div>
            <div className="p-3 bg-amber-50 rounded-lg text-amber-600">
              <Percent className="w-6 h-6" />
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow duration-200">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Friend Bonuses Paid</p>
              <p className="text-2xl font-bold text-gray-900">{formatAmount(stats?.totalRefereeRewardsIssued)}</p>
            </div>
            <div className="p-3 bg-rose-50 rounded-lg text-rose-600">
              <Award className="w-6 h-6" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-2">Your Referral Link</h3>
        <p className="text-sm text-gray-500 mb-4">
          Invite friends using your unique referral code. When your friend joins and makes their first qualifying deposit (₦100+), you receive your referral reward and your friend receives a welcome bonus automatically!
        </p>
        <div className="flex items-center space-x-4">
          <input
            type="text"
            readOnly
            value={referralLink}
            className="flex-1 block w-full rounded-md border-gray-300 bg-gray-50 p-2 border text-gray-600 font-mono text-sm"
          />
          <button
            onClick={() => {
              navigator.clipboard.writeText(referralLink);
              alert('Referral link copied to clipboard!');
            }}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 transition-colors"
          >
            Copy Link
          </button>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Recent Referrals & Deposit Status</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Friend</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Registration Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Deposit Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Your Reward</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Friend Bonus</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {stats?.recentReferrals && stats.recentReferrals.length > 0 ? (
                stats.recentReferrals.map((referral, index) => {
                  const isRewarded = Boolean(referral.isRewarded || referral.status === 'rewarded' || referral.status === 'Active');
                  return (
                    <tr key={index} className="hover:bg-slate-50/50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{referral.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(referral.date).toLocaleDateString()}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2.5 py-1 inline-flex items-center gap-1 text-xs leading-4 font-semibold rounded-full ${
                          isRewarded ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {isRewarded ? <CheckCircle2 size={13} className="text-emerald-600" /> : <Clock size={13} className="text-amber-600" />}
                          {isRewarded ? 'Deposit Qualified & Rewarded' : 'Pending Qualifying Deposit'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-700">
                        {isRewarded ? formatAmount(referral.referrerReward || referral.commission) : 'Pending'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {isRewarded ? formatAmount(referral.refereeReward) : 'Pending'}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-8 whitespace-nowrap text-sm text-gray-500 text-center">
                    No referrals yet. Share your referral link above to start earning!
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
