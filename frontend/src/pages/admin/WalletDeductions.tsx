import { useEffect, useMemo, useState } from 'react';
import api from '../../services/api';

type UserItem = {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
};

type Deduction = {
  reference: string;
  userId: string;
  adminId: string;
  amount: string | number;
  reason: string;
  balanceBefore: string | number;
  balanceAfter: string | number;
  status: string;
  createdAt: string;
  reversedAt?: string | null;
};

export default function WalletDeductions() {
  const [userSearch, setUserSearch] = useState('');
  const [users, setUsers] = useState<UserItem[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [deductions, setDeductions] = useState<Deduction[]>([]);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const numericAmount = useMemo(() => {
    const n = Number(amount);
    return Number.isFinite(n) ? n : null;
  }, [amount]);

  const refreshWalletAndHistory = async (userId: string) => {
    setRefreshing(true);
    try {
      const [snap, list] = await Promise.all([
        api.get(`/admin/wallet/users/${userId}`),
        api.get('/admin/wallet/deductions', { params: { userId, limit: 20, page: 1 } }),
      ]);
      const bal = Number(snap.data?.data?.wallet?.balance);
      setWalletBalance(Number.isFinite(bal) ? bal : null);
      setDeductions(list.data?.rows || []);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const run = async () => {
      setLoading(false);
    };
    void run();
  }, []);

  useEffect(() => {
    let t: any = null;
    if (!userSearch.trim()) {
      setUsers([]);
      return;
    }
    t = setTimeout(async () => {
      try {
        const res = await api.get('/admin/users', { params: { search: userSearch.trim(), limit: 10, page: 1 } });
        setUsers(res.data?.rows || res.data || []);
      } catch (e) {
        setUsers([]);
      }
    }, 350);
    return () => {
      if (t) clearTimeout(t);
    };
  }, [userSearch]);

  useEffect(() => {
    if (!selectedUser?.id) return;
    void refreshWalletAndHistory(selectedUser.id);
  }, [selectedUser?.id]);

  const submit = async () => {
    if (!selectedUser) {
      alert('Select a user');
      return;
    }
    if (numericAmount === null || numericAmount <= 0) {
      alert('Enter a valid amount');
      return;
    }
    if (!reason.trim()) {
      alert('Enter a reason');
      return;
    }
    if (!adminPassword.trim()) {
      alert('Enter your admin password to confirm');
      return;
    }

    if (walletBalance !== null && numericAmount > walletBalance) {
      alert('Deduction would result in a negative wallet balance');
      return;
    }

    const confirmText = `Confirm wallet deduction\n\nUser: ${selectedUser.name || selectedUser.email || selectedUser.id}\nCurrent balance: ₦${Number(walletBalance || 0).toLocaleString()}\nDeduct: ₦${numericAmount.toLocaleString()}\nReason: ${reason}`;
    if (!window.confirm(confirmText)) return;

    setSubmitting(true);
    try {
      const idempotencyKey = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
      const res = await api.post(
        '/admin/wallet/deductions',
        { userId: selectedUser.id, amount: numericAmount, reason, admin_password: adminPassword },
        { headers: { 'Idempotency-Key': idempotencyKey } }
      );
      alert(`Deduction successful. Ref: ${res.data?.data?.reference || ''}`);
      setAmount('');
      setReason('');
      setAdminPassword('');
      await refreshWalletAndHistory(selectedUser.id);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Deduction failed');
      await refreshWalletAndHistory(selectedUser.id);
    } finally {
      setSubmitting(false);
    }
  };

  const reverse = async (reference: string) => {
    if (!adminPassword.trim()) {
      alert('Enter your admin password to confirm reversal');
      return;
    }
    const revReason = window.prompt('Reversal reason:', 'Reversal: incorrect deduction');
    if (!revReason || !revReason.trim()) return;

    if (!window.confirm(`Reverse deduction ${reference}?`)) return;

    setSubmitting(true);
    try {
      const res = await api.post(`/admin/wallet/deductions/${reference}/reverse`, { reason: revReason, admin_password: adminPassword });
      alert(`Reversal successful. Status: ${res.data?.data?.status || 'reversed'}`);
      await refreshWalletAndHistory(selectedUser!.id);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Reversal failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-full">Loading...</div>;

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Admin Wallet Deduction</h1>
        <p className="text-sm text-gray-500 mt-1">Deduct excess funds from a user wallet with audit trail and optional reversal.</p>
      </div>

      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <div>
          <div className="text-sm font-bold text-gray-700 mb-2">1) Select User</div>
          <input
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            placeholder="Search users by name/email/phone"
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30"
          />
          {users.length > 0 && (
            <div className="mt-2 border border-gray-100 rounded-md divide-y max-h-56 overflow-auto">
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => {
                    setSelectedUser(u);
                    setUsers([]);
                    setUserSearch(u.email || u.name || u.id);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50"
                >
                  <div className="text-sm font-bold text-gray-800">{u.name || '—'}</div>
                  <div className="text-xs text-gray-500">{u.email || ''} {u.phone ? `| ${u.phone}` : ''}</div>
                </button>
              ))}
            </div>
          )}
          {selectedUser && (
            <div className="mt-3 text-sm text-gray-600 flex items-center justify-between">
              <div>
                Selected: <span className="font-bold text-gray-900">{selectedUser.name || selectedUser.email}</span>
              </div>
              <button
                onClick={() => void refreshWalletAndHistory(selectedUser.id)}
                disabled={refreshing}
                className={`px-3 py-2 rounded-md text-sm font-bold ${refreshing ? 'bg-gray-100 text-gray-400' : 'bg-secondary text-white hover:opacity-90'}`}
              >
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-sm font-bold text-gray-700 mb-2">2) Current Wallet Balance</div>
            <div className="text-lg font-bold text-gray-900">
              {walletBalance === null ? '—' : `₦${walletBalance.toLocaleString()}`}
            </div>
          </div>
          <div>
            <div className="text-sm font-bold text-gray-700 mb-2">3) Admin Password (Re-auth)</div>
            <input
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              placeholder="Enter your password"
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-sm font-bold text-gray-700 mb-2">4) Deduction Amount</div>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 45000"
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30"
            />
          </div>
          <div>
            <div className="text-sm font-bold text-gray-700 mb-2">5) Reason</div>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Overfunding correction"
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30"
            />
          </div>
        </div>

        <button
          onClick={() => void submit()}
          disabled={submitting}
          className={`w-full px-4 py-2 rounded-md text-sm font-bold transition-all ${
            submitting ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-primary-600 text-white hover:bg-primary-700'
          }`}
        >
          {submitting ? 'Submitting...' : 'Deduct From Wallet'}
        </button>
      </div>

      {selectedUser && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-3">
            <div className="text-sm font-bold text-gray-700">Recent Deductions</div>
          </div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="py-2 pr-4">Ref</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">When</th>
                  <th className="py-2 pr-4">Reason</th>
                  <th className="py-2 pr-4">Action</th>
                </tr>
              </thead>
              <tbody>
                {deductions.map((d) => (
                  <tr key={d.reference} className="border-t border-gray-100">
                    <td className="py-2 pr-4 font-mono">{d.reference}</td>
                    <td className="py-2 pr-4 font-bold">₦{Number(d.amount || 0).toLocaleString()}</td>
                    <td className="py-2 pr-4">
                      <span className={`font-bold ${d.status === 'reversed' ? 'text-gray-500' : 'text-red-600'}`}>{d.status}</span>
                    </td>
                    <td className="py-2 pr-4">{new Date(d.createdAt).toLocaleString()}</td>
                    <td className="py-2 pr-4 text-gray-600">{d.reason}</td>
                    <td className="py-2 pr-4">
                      {d.status !== 'reversed' ? (
                        <button
                          onClick={() => void reverse(d.reference)}
                          disabled={submitting}
                          className="px-3 py-1.5 rounded-md text-xs font-bold bg-gray-50 hover:bg-gray-100 border border-gray-200 disabled:opacity-50"
                        >
                          Reverse
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {deductions.length === 0 && (
                  <tr>
                    <td className="py-4 text-gray-400" colSpan={6}>
                      No deductions yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="text-xs text-gray-400 mt-3">Reversal requires super-admin privileges and is limited to 24 hours.</div>
        </div>
      )}
    </div>
  );
}

