import { useState, useEffect } from 'react';
import { Trophy, Award, Users, TrendingUp, ShieldCheck, Flame, RefreshCw, Star, Zap } from 'lucide-react';
import api, { SERVER_ROOT_URL } from '../../services/api';
import { usePrivacy } from '../../context/PrivacyContext';
import { StaggerContainer, StaggerItem } from '../../components/animations/MotionComponents';

interface LeaderboardItem {
  rank: number;
  displayName: string;
  avatar: string | null;
  score: number;
  volume?: number;
  transactionCount?: number;
  qualifiedReferrals?: number;
  isCurrentUser: boolean;
}

interface MyStats {
  rank: number | string;
  score: number;
  volume?: number;
  transactionCount?: number;
  qualifiedReferrals?: number;
  category: string;
}

export default function Leaderboard() {
  const { formatAmount } = usePrivacy();
  const [period, setPeriod] = useState<'week' | 'month' | 'all_time'>('all_time');
  const [category, setCategory] = useState<'volume' | 'transactions' | 'referrals'>('volume');
  const [leaderboard, setLeaderboard] = useState<LeaderboardItem[]>([]);
  const [myStats, setMyStats] = useState<MyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchLeaderboard = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await api.get(`/users/leaderboard?period=${period}&category=${category}`);
      if (res.data?.success) {
        setLeaderboard(res.data.leaderboard || []);
        setMyStats(res.data.myStats || null);
      }
    } catch (err) {
      console.error('Failed to load leaderboard', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard();
  }, [period, category]);

  const topThree = leaderboard.slice(0, 3);
  const remaining = leaderboard.slice(3);

  const renderScore = (score: number, rank?: number) => {
    if (category === 'volume') {
      if (rank === 1) return 'Rank #1 Champion';
      if (rank === 2) return 'Rank #2 Runner-Up';
      if (rank === 3) return 'Rank #3 Finalist';
      return rank ? `Rank #${rank}` : 'Top Ranked';
    }
    if (category === 'transactions') {
      return `${score.toLocaleString()} txns`;
    }
    return `${score.toLocaleString()} qualified`;
  };

  return (
    <StaggerContainer className="space-y-6">
      {/* Header */}
      <StaggerItem>
        <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-primary-600 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
          <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-48 h-48 bg-white/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur-sm text-xs font-semibold mb-2">
                <Trophy className="w-3.5 h-3.5 text-yellow-200" />
                Community Hall of Fame
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Top Users Leaderboard</h1>
              <p className="text-amber-100 text-sm mt-1 max-w-xl">
                Recognizing our most active members. Rankings update automatically based on verified transactions and qualified referrals.
              </p>
            </div>
            <button
              onClick={() => fetchLeaderboard(true)}
              disabled={refreshing || loading}
              className="self-start md:self-auto inline-flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-xl text-xs font-semibold transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </StaggerItem>

      {/* Control Tabs */}
      <StaggerItem>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Category Tabs */}
          <div className="flex bg-gray-100 p-1 rounded-xl w-full md:w-auto">
            <button
              onClick={() => setCategory('volume')}
              className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition ${
                category === 'volume'
                  ? 'bg-white text-primary-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              Top Volume
            </button>
            <button
              onClick={() => setCategory('transactions')}
              className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition ${
                category === 'transactions'
                  ? 'bg-white text-primary-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              Transactions
            </button>
            <button
              onClick={() => setCategory('referrals')}
              className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition ${
                category === 'referrals'
                  ? 'bg-white text-primary-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Referrals
            </button>
          </div>

          {/* Period Selector */}
          <div className="flex bg-gray-100 p-1 rounded-xl w-full md:w-auto">
            <button
              onClick={() => setPeriod('week')}
              className={`flex-1 md:flex-none px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                period === 'week'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              This Week
            </button>
            <button
              onClick={() => setPeriod('month')}
              className={`flex-1 md:flex-none px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                period === 'month'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              This Month
            </button>
            <button
              onClick={() => setPeriod('all_time')}
              className={`flex-1 md:flex-none px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                period === 'all_time'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              All Time
            </button>
          </div>
        </div>
      </StaggerItem>

      {/* User's Own Standing Banner */}
      {myStats && (
        <StaggerItem>
          <div className="bg-primary-50 border border-primary-200 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary-600 text-white flex items-center justify-center font-bold text-base shadow-sm">
                {myStats.rank !== '-' ? `#${myStats.rank}` : '-'}
              </div>
              <div>
                <div className="text-xs font-medium text-primary-700">Your Current Position</div>
                <div className="text-sm font-bold text-gray-900">
                  {myStats.rank !== '-' ? `You are ranked #${myStats.rank} in this leaderboard!` : 'No qualifying activity recorded in this period yet.'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4 text-right">
              <div className="bg-white px-4 py-2 rounded-lg border border-primary-100 shadow-xs">
                <span className="text-xs text-gray-500 block">Your Standing</span>
                <span className="text-sm font-extrabold text-primary-700">
                  {myStats.rank !== '-' ? `Rank #${myStats.rank}` : 'Unranked'}
                </span>
              </div>
            </div>
          </div>
        </StaggerItem>
      )}

      {loading ? (
        <div className="py-20 text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading leaderboard rankings...</p>
        </div>
      ) : leaderboard.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center border border-gray-100 shadow-sm">
          <Award className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-gray-800">No Activity in this Period</h3>
          <p className="text-xs text-gray-500 max-w-sm mx-auto mt-1">
            There are no completed transactions or qualifying referrals recorded for the selected filter. Check back soon or switch timeframes!
          </p>
        </div>
      ) : (
        <>
          {/* Top 3 Podium */}
          {topThree.length > 0 && (
            <StaggerItem>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
                {/* 2nd Place */}
                {topThree[1] && (
                  <div className="order-2 md:order-1 bg-white rounded-xl p-5 border border-slate-200 shadow-sm text-center relative flex flex-col items-center justify-between">
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-slate-200 text-slate-700 border border-slate-300 text-xs font-bold px-3 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                      <Award className="w-3 h-3 text-slate-500" /> 2nd Place
                    </div>
                    <div className="mt-2">
                      <div className="w-16 h-16 rounded-full bg-slate-100 border-2 border-slate-300 flex items-center justify-center font-bold text-lg text-slate-700 mx-auto overflow-hidden">
                        {topThree[1].avatar ? (
                          <img src={`${SERVER_ROOT_URL}/${topThree[1].avatar}`} alt="Avatar" className="w-full h-full object-cover" />
                        ) : (
                          topThree[1].displayName.slice(0, 2)
                        )}
                      </div>
                      <h4 className="font-bold text-sm text-gray-900 mt-2 flex items-center justify-center gap-1">
                        {topThree[1].displayName}
                        {topThree[1].isCurrentUser && (
                          <span className="text-[10px] bg-primary-100 text-primary-700 font-bold px-1.5 py-0.2 rounded">You</span>
                        )}
                      </h4>
                    </div>
                    <div className="mt-3 bg-slate-50 rounded-lg p-2.5 w-full border border-slate-100">
                      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">{category === 'volume' ? 'Standing' : 'Score'}</div>
                      <div className="text-sm font-extrabold text-slate-800">{category === 'volume' ? 'Rank #2 Runner-Up' : renderScore(topThree[1].score, 2)}</div>
                    </div>
                  </div>
                )}

                {/* 1st Place */}
                {topThree[0] && (
                  <div className="order-1 md:order-2 bg-gradient-to-b from-amber-50 to-white rounded-xl p-6 border-2 border-amber-300 shadow-md text-center relative flex flex-col items-center justify-between -translate-y-2">
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-amber-400 text-amber-950 text-xs font-extrabold px-3.5 py-1 rounded-full flex items-center gap-1 shadow-sm">
                      <Trophy className="w-3.5 h-3.5 text-amber-900 fill-amber-900" /> Champion #1
                    </div>
                    <div className="mt-2">
                      <div className="w-20 h-20 rounded-full bg-amber-100 border-3 border-amber-400 flex items-center justify-center font-bold text-xl text-amber-800 mx-auto overflow-hidden shadow-sm">
                        {topThree[0].avatar ? (
                          <img src={`${SERVER_ROOT_URL}/${topThree[0].avatar}`} alt="Avatar" className="w-full h-full object-cover" />
                        ) : (
                          topThree[0].displayName.slice(0, 2)
                        )}
                      </div>
                      <h4 className="font-bold text-base text-gray-900 mt-2 flex items-center justify-center gap-1">
                        {topThree[0].displayName}
                        {topThree[0].isCurrentUser && (
                          <span className="text-[10px] bg-primary-100 text-primary-700 font-bold px-1.5 py-0.2 rounded">You</span>
                        )}
                      </h4>
                    </div>
                    <div className="mt-4 bg-amber-100/70 rounded-lg p-3 w-full border border-amber-200">
                      <div className="text-[10px] uppercase tracking-wider text-amber-800 font-bold">{category === 'volume' ? 'Standing' : 'Top Score'}</div>
                      <div className="text-base font-extrabold text-amber-950">{category === 'volume' ? 'Rank #1 Champion' : renderScore(topThree[0].score, 1)}</div>
                    </div>
                  </div>
                )}

                {/* 3rd Place */}
                {topThree[2] && (
                  <div className="order-3 md:order-3 bg-white rounded-xl p-5 border border-amber-200/70 shadow-sm text-center relative flex flex-col items-center justify-between">
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold px-3 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                      <Flame className="w-3 h-3 text-amber-600" /> 3rd Place
                    </div>
                    <div className="mt-2">
                      <div className="w-16 h-16 rounded-full bg-orange-50 border-2 border-orange-200 flex items-center justify-center font-bold text-lg text-orange-700 mx-auto overflow-hidden">
                        {topThree[2].avatar ? (
                          <img src={`${SERVER_ROOT_URL}/${topThree[2].avatar}`} alt="Avatar" className="w-full h-full object-cover" />
                        ) : (
                          topThree[2].displayName.slice(0, 2)
                        )}
                      </div>
                      <h4 className="font-bold text-sm text-gray-900 mt-2 flex items-center justify-center gap-1">
                        {topThree[2].displayName}
                        {topThree[2].isCurrentUser && (
                          <span className="text-[10px] bg-primary-100 text-primary-700 font-bold px-1.5 py-0.2 rounded">You</span>
                        )}
                      </h4>
                    </div>
                    <div className="mt-3 bg-orange-50/50 rounded-lg p-2.5 w-full border border-orange-100">
                      <div className="text-[10px] uppercase tracking-wider text-orange-700 font-medium">{category === 'volume' ? 'Standing' : 'Score'}</div>
                      <div className="text-sm font-extrabold text-orange-900">{category === 'volume' ? 'Rank #3 Finalist' : renderScore(topThree[2].score, 3)}</div>
                    </div>
                  </div>
                )}
              </div>
            </StaggerItem>
          )}

          {/* Full Rankings Table */}
          {remaining.length > 0 && (
            <StaggerItem>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="font-bold text-sm text-gray-800">Runner-Up Standings</h3>
                  <span className="text-xs text-gray-500">Ranks 4 – {leaderboard.length}</span>
                </div>
                <div className="divide-y divide-gray-100">
                  {remaining.map((user) => (
                    <div
                      key={user.rank}
                      className={`px-6 py-3.5 flex items-center justify-between transition ${
                        user.isCurrentUser ? 'bg-primary-50/70 border-l-4 border-primary-500' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <span className="w-6 text-center text-xs font-extrabold text-gray-500">
                          #{user.rank}
                        </span>
                        <div className="w-9 h-9 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center font-bold text-xs text-gray-600 overflow-hidden">
                          {user.avatar ? (
                            <img src={`${SERVER_ROOT_URL}/${user.avatar}`} alt="Avatar" className="w-full h-full object-cover" />
                          ) : (
                            user.displayName.slice(0, 2)
                          )}
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-gray-900 flex items-center gap-1.5">
                            {user.displayName}
                            {user.isCurrentUser && (
                              <span className="text-[10px] bg-primary-100 text-primary-700 font-bold px-1.5 py-0.2 rounded">You</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-bold text-gray-700 block">
                          {renderScore(user.score, user.rank)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </StaggerItem>
          )}

          {/* Privacy & Fairness Note */}
          <StaggerItem>
            <div className="flex items-start gap-3 bg-gray-50 border border-gray-200/80 rounded-xl p-4 text-xs text-gray-600">
              <ShieldCheck className="w-5 h-5 text-primary-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-gray-800">Privacy & Fair Play: </span>
                All member names are masked to protect personal information, and monetary amounts spent are strictly confidential and never displayed on public rankings. Standings update dynamically based on completed and verified activity.
              </div>
            </div>
          </StaggerItem>
        </>
      )}
    </StaggerContainer>
  );
}
