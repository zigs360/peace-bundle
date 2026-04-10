import { useEffect, useMemo, useState } from 'react';
import api from '../../services/api';

type UserItem = {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
};

type DataPlan = {
  id: number;
  provider: string;
  name: string;
  size: string;
  validity: string;
  api_cost?: string | number | null;
  ogdams_sku?: string | null;
};

type AdminSim = {
  id: string;
  provider: string;
  status: string;
  connection_status: string;
  phone: string | null;
  iccid_last4: string | null;
  airtime_balance: number | null;
  reserved_airtime: number;
  available_airtime: number | null;
  last_balance_check: string | null;
};

type Purchase = {
  reference: string;
  status: string;
  failureReason?: string | null;
  providerReference?: string | null;
  createdAt?: string;
  completedAt?: string | null;
};

export default function OgdamsDataPurchase() {
  const [userSearch, setUserSearch] = useState('');
  const [users, setUsers] = useState<UserItem[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);
  const [recipientPhone, setRecipientPhone] = useState('');
  const [plans, setPlans] = useState<DataPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<number | ''>('');
  const [sims, setSims] = useState<AdminSim[]>([]);
  const [selectedSimId, setSelectedSimId] = useState<string | ''>('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [purchase, setPurchase] = useState<Purchase | null>(null);

  const selectedPlan = useMemo(() => plans.find((p) => p.id === selectedPlanId) || null, [plans, selectedPlanId]);
  const selectedSim = useMemo(() => sims.find((s) => s.id === selectedSimId) || null, [sims, selectedSimId]);

  const planCost = useMemo(() => {
    if (!selectedPlan) return null;
    const n = Number(selectedPlan.api_cost);
    return Number.isFinite(n) ? n : null;
  }, [selectedPlan]);

  const refreshSims = async (forceBalance = false) => {
    const res = await api.get('/admin/ogdams/sims', { params: { force_balance: forceBalance ? 'true' : 'false' } });
    setSims(res.data?.data || []);
  };

  const refreshPlans = async () => {
    const res = await api.get('/plans');
    setPlans(res.data?.data || res.data || []);
  };

  useEffect(() => {
    const run = async () => {
      try {
        await Promise.all([refreshSims(true), refreshPlans()]);
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, []);

  useEffect(() => {
    if (!selectedUser) return;
    if (!recipientPhone) setRecipientPhone(selectedUser.phone || '');
  }, [selectedUser, recipientPhone]);

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
    let timer: any = null;
    if (!purchase?.reference) return;
    const tick = async () => {
      try {
        const res = await api.get(`/admin/ogdams/data-purchase/${purchase.reference}`);
        const next = res.data?.data;
        if (next) setPurchase(next);
        if (next?.status === 'completed' || next?.status === 'failed') {
          if (timer) clearInterval(timer);
        }
      } catch (e) {
        void e;
      }
    };
    timer = setInterval(tick, 4000);
    void tick();
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [purchase?.reference]);

  const submit = async () => {
    if (!selectedUser) {
      alert('Select a user');
      return;
    }
    if (!recipientPhone.trim()) {
      alert('Enter a recipient phone number');
      return;
    }
    if (!selectedPlanId) {
      alert('Select a data plan');
      return;
    }
    if (!selectedSimId) {
      alert('Select a SIM for billing');
      return;
    }
    if (!selectedPlan?.ogdams_sku) {
      alert('Selected plan is not mapped to Ogdams SKU');
      return;
    }
    if (planCost === null) {
      alert('Selected plan has invalid cost');
      return;
    }

    const confirmText = `Confirm data purchase\n\nUser: ${selectedUser.name || selectedUser.email || selectedUser.id}\nRecipient: ${recipientPhone}\nPlan: ${selectedPlan.provider.toUpperCase()} ${selectedPlan.name} (${selectedPlan.size}, ${selectedPlan.validity})\nCost (SIM): ₦${planCost.toLocaleString()}\nSIM: ${selectedSim?.provider?.toUpperCase()} ${selectedSim?.phone || ''} (Avail ₦${Number(selectedSim?.available_airtime || 0).toLocaleString()})`;
    if (!window.confirm(confirmText)) return;

    setSubmitting(true);
    try {
      const idempotencyKey = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
      const res = await api.post(
        '/admin/ogdams/data-purchase',
        {
          userId: selectedUser.id,
          recipientPhone,
          dataPlanId: selectedPlanId,
          simId: selectedSimId,
        },
        { headers: { 'Idempotency-Key': idempotencyKey } }
      );
      setPurchase(res.data?.data || null);
      await refreshSims(false);
      alert('Purchase submitted');
    } catch (err: any) {
      await refreshSims(false);
      alert(err.response?.data?.message || 'Purchase failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-full">Loading...</div>;

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold text-gray-800">Admin Data Purchase (Ogdams SIM Billing)</h1>
        <button
          onClick={() => void refreshSims(true)}
          className="px-4 py-2 rounded-md text-sm font-bold bg-secondary text-white hover:opacity-90"
        >
          Refresh SIM Balances
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
              <div className="mt-3 text-sm text-gray-600">
                Selected: <span className="font-bold text-gray-900">{selectedUser.name || selectedUser.email}</span>
              </div>
            )}
          </div>

          <div>
            <div className="text-sm font-bold text-gray-700 mb-2">2) Recipient Phone</div>
            <input
              value={recipientPhone}
              onChange={(e) => setRecipientPhone(e.target.value)}
              placeholder="e.g. 08012345678"
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30"
            />
          </div>

          <div>
            <div className="text-sm font-bold text-gray-700 mb-2">3) Data Plan</div>
            <select
              value={selectedPlanId}
              onChange={(e) => setSelectedPlanId(e.target.value ? Number(e.target.value) : '')}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-secondary/30"
            >
              <option value="">Select plan</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {String(p.provider).toUpperCase()} | {p.name} | {p.size} | ₦{Number(p.api_cost || 0).toLocaleString()}
                </option>
              ))}
            </select>
            {selectedPlan && (
              <div className="mt-2 text-xs text-gray-500">
                SKU: {selectedPlan.ogdams_sku || '—'}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <div className="text-sm font-bold text-gray-700">4) Select Admin SIM for Billing</div>
          <div className="space-y-2">
            {sims.map((s) => (
              <label key={s.id} className="flex items-start gap-3 p-3 border border-gray-100 rounded-md hover:bg-gray-50 cursor-pointer">
                <input
                  type="radio"
                  checked={selectedSimId === s.id}
                  onChange={() => setSelectedSimId(s.id)}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="flex justify-between">
                    <div className="text-sm font-bold text-gray-900">
                      {String(s.provider).toUpperCase()} {s.phone ? `(${s.phone})` : ''}
                    </div>
                    <div className="text-sm font-bold text-gray-900">
                      Avail ₦{Number(s.available_airtime || 0).toLocaleString()}
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">
                    Status: {s.status} | Conn: {s.connection_status} {s.iccid_last4 ? `| ICCID ****${s.iccid_last4}` : ''}{' '}
                    {s.last_balance_check ? `| Checked ${new Date(s.last_balance_check).toLocaleString()}` : ''}
                  </div>
                </div>
              </label>
            ))}
            {sims.length === 0 && <div className="text-sm text-gray-500">No admin SIMs found.</div>}
          </div>

          <div className="pt-4 border-t border-gray-100 space-y-3">
            <div className="text-sm font-bold text-gray-700">5) Confirm & Submit</div>
            <div className="text-sm text-gray-600 bg-gray-50 rounded-md p-3">
              <div>User: {selectedUser ? selectedUser.name || selectedUser.email : '—'}</div>
              <div>Recipient: {recipientPhone || '—'}</div>
              <div>Plan: {selectedPlan ? `${String(selectedPlan.provider).toUpperCase()} ${selectedPlan.name} (${selectedPlan.size})` : '—'}</div>
              <div>Cost (SIM): {planCost !== null ? `₦${planCost.toLocaleString()}` : '—'}</div>
              <div>SIM: {selectedSim ? `${String(selectedSim.provider).toUpperCase()} ${selectedSim.phone || ''}` : '—'}</div>
            </div>
            <button
              onClick={() => void submit()}
              disabled={submitting}
              className={`w-full px-4 py-2 rounded-md text-sm font-bold transition-all ${
                submitting ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-primary-600 text-white hover:bg-primary-700'
              }`}
            >
              {submitting ? 'Submitting...' : 'Submit Purchase'}
            </button>
          </div>

          {purchase && (
            <div className="pt-4 border-t border-gray-100">
              <div className="text-sm font-bold text-gray-700 mb-2">Purchase Status</div>
              <div className="text-sm text-gray-700">Reference: <span className="font-bold">{purchase.reference}</span></div>
              <div className="text-sm text-gray-700">Status: <span className="font-bold">{purchase.status}</span></div>
              {purchase.providerReference && <div className="text-sm text-gray-700">Provider Ref: {purchase.providerReference}</div>}
              {purchase.failureReason && <div className="text-sm text-red-600">Reason: {purchase.failureReason}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

