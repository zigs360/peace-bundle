import { useEffect, useMemo, useState } from 'react';
import { Search, ShieldAlert, Trash2, XCircle, CheckCircle, Eye } from 'lucide-react';
import { toast } from 'react-hot-toast';
import api from '../../services/api';

type DeletionQueueRow = {
  id: string;
  status: 'pending' | 'cancelled' | 'rejected' | 'approved' | 'completed';
  requestedAt?: string;
  graceEndsAt?: string;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  completedAt?: string | null;
  requestReason?: string | null;
  adminReviewReason?: string | null;
  executionReason?: string | null;
  reviewState: 'grace_period' | 'ready_for_review' | 'closed';
  isReadyForReview: boolean;
  user: null | {
    id: string;
    name?: string;
    email?: string;
    phone?: string;
    role?: string;
    accountStatus?: string;
    createdAt?: string;
    kycStatus?: string;
  };
};

type DeletionRequestDetail = DeletionQueueRow & {
  associatedData?: {
    createdAt?: string;
    lastActivityAt?: string;
    wallet?: {
      balance: number;
      bonusBalance: number;
      commissionBalance: number;
      currency: string;
    } | null;
    counts?: Record<string, number>;
    recentTransactions?: Array<{
      id: string;
      reference: string;
      source: string;
      amount: number;
      status: string;
      createdAt: string;
    }>;
    profile?: {
      accountStatus?: string;
      role?: string;
      kycStatus?: string;
      hasVirtualAccount?: boolean;
      virtualAccountBank?: string | null;
    };
  } | null;
  audits?: Array<{
    id: string;
    actorType: string;
    eventType: string;
    status: string;
    reason?: string | null;
    createdAt: string;
    metadata?: Record<string, any>;
  }>;
};

const statusClasses: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-blue-100 text-blue-700',
  rejected: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-100 text-slate-700',
  completed: 'bg-green-100 text-green-700',
};

function formatStatus(value?: string) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function AccountDeletionQueue() {
  const [items, setItems] = useState<DeletionQueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<DeletionRequestDetail | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('pending');
  const [reviewState, setReviewState] = useState('');
  const [actionReason, setActionReason] = useState('');
  const [actionLoading, setActionLoading] = useState<'approve' | 'reject' | 'execute' | null>(null);

  const loadQueue = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/account-deletion/requests', {
        params: {
          search: search || undefined,
          status: status || undefined,
          reviewState: reviewState || undefined,
          limit: 100,
        },
      });
      setItems(res.data?.rows || []);
    } catch (error) {
      console.error(error);
      toast.error('Failed to load account deletion requests');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (requestId: string) => {
    setDetailLoading(true);
    try {
      const res = await api.get(`/admin/account-deletion/requests/${requestId}`);
      setSelectedRequest(res.data?.request || null);
      setActionReason('');
    } catch (error) {
      console.error(error);
      toast.error('Failed to load deletion request detail');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    void loadQueue();
  }, []);

  const handleAction = async (action: 'approve' | 'reject' | 'execute') => {
    if (!selectedRequest) return;
    const trimmedReason = actionReason.trim();
    if (!trimmedReason) {
      toast.error('A reason is required for this action');
      return;
    }
    if (action === 'execute' && !window.confirm('This permanently deletes the account. Continue?')) {
      return;
    }

    setActionLoading(action);
    try {
      await api.post(`/admin/account-deletion/requests/${selectedRequest.id}/${action}`, {
        reason: trimmedReason,
      });
      toast.success(`Request ${action}d successfully`);
      await loadQueue();
      await loadDetail(selectedRequest.id);
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || `Failed to ${action} request`);
    } finally {
      setActionLoading(null);
    }
  };

  const readyCount = useMemo(
    () => items.filter((item) => item.isReadyForReview && item.status === 'pending').length,
    [items]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Account Deletion Queue</h1>
          <p className="text-sm text-gray-600">
            Review verified deletion requests, enforce grace periods, and maintain a complete compliance trail for every admin action.
          </p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Ready for review: <strong>{readyCount}</strong>
        </div>
      </div>

      <div className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="relative md:col-span-2">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by user name, email, or phone"
              className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2"
            />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2">
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
            <option value="completed">Completed</option>
            <option value="all">All statuses</option>
          </select>
          <select value={reviewState} onChange={(e) => setReviewState(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2">
            <option value="">All review states</option>
            <option value="ready">Ready for review</option>
            <option value="grace">Still in grace period</option>
          </select>
        </div>
        <div className="flex gap-3">
          <button onClick={() => void loadQueue()} className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
            Apply Filters
          </button>
          <button
            onClick={() => {
              setSearch('');
              setStatus('pending');
              setReviewState('');
              void loadQueue();
            }}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_1fr]">
        <div className="rounded-lg border border-gray-100 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {['User', 'Requested', 'Grace Ends', 'Status', 'Review', 'Action'].map((header) => (
                    <th key={header} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-500">Loading requests...</td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-500">No account deletion requests found.</td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4 text-sm text-gray-700">
                        <div className="font-medium text-gray-900">{item.user?.name || 'Deleted user'}</div>
                        <div className="text-xs text-gray-500">{item.user?.email || item.user?.phone || 'No active profile linked'}</div>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-700">{item.requestedAt ? new Date(item.requestedAt).toLocaleString() : '—'}</td>
                      <td className="px-4 py-4 text-sm text-gray-700">{item.graceEndsAt ? new Date(item.graceEndsAt).toLocaleString() : '—'}</td>
                      <td className="px-4 py-4 text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${statusClasses[item.status] || 'bg-slate-100 text-slate-700'}`}>
                          {formatStatus(item.status)}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-700">
                        {item.isReadyForReview ? 'Ready' : item.reviewState === 'grace_period' ? 'Grace period' : 'Closed'}
                      </td>
                      <td className="px-4 py-4 text-sm">
                        <button
                          onClick={() => void loadDetail(item.id)}
                          className="inline-flex items-center px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          View
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-lg border border-gray-100 bg-white shadow-sm p-5 space-y-5">
          {detailLoading ? (
            <div className="text-sm text-gray-500">Loading request detail...</div>
          ) : !selectedRequest ? (
            <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
              Select a request to review the user profile preview, associated data, and audit history.
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Request Detail</h2>
                  <p className="text-sm text-gray-600">{selectedRequest.user?.name || 'Deleted user account'}</p>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${statusClasses[selectedRequest.status] || 'bg-slate-100 text-slate-700'}`}>
                  {formatStatus(selectedRequest.status)}
                </span>
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 space-y-2">
                <div><strong>Email:</strong> {selectedRequest.user?.email || 'No longer available'}</div>
                <div><strong>Phone:</strong> {selectedRequest.user?.phone || 'No longer available'}</div>
                <div><strong>Account Created:</strong> {selectedRequest.associatedData?.createdAt ? new Date(selectedRequest.associatedData.createdAt).toLocaleString() : '—'}</div>
                <div><strong>Last Activity:</strong> {selectedRequest.associatedData?.lastActivityAt ? new Date(selectedRequest.associatedData.lastActivityAt).toLocaleString() : '—'}</div>
                <div><strong>Wallet Balance:</strong> {selectedRequest.associatedData?.wallet ? `${selectedRequest.associatedData.wallet.currency} ${selectedRequest.associatedData.wallet.balance.toLocaleString()}` : '—'}</div>
                {selectedRequest.requestReason && <div><strong>User Reason:</strong> {selectedRequest.requestReason}</div>}
                {selectedRequest.adminReviewReason && <div><strong>Admin Review Note:</strong> {selectedRequest.adminReviewReason}</div>}
                {selectedRequest.executionReason && <div><strong>Execution Note:</strong> {selectedRequest.executionReason}</div>}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Associated Data</h3>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(selectedRequest.associatedData?.counts || {}).map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                      <div className="text-xs uppercase tracking-wide text-gray-500">{formatStatus(label)}</div>
                      <div className="text-lg font-semibold text-gray-900">{Number(value || 0).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Recent Transactions</h3>
                <div className="space-y-2">
                  {(selectedRequest.associatedData?.recentTransactions || []).length === 0 ? (
                    <div className="text-sm text-gray-500">No recent transactions for this account.</div>
                  ) : (
                    selectedRequest.associatedData?.recentTransactions?.map((txn) => (
                      <div key={txn.id} className="rounded-lg border border-gray-100 px-3 py-2 text-sm text-gray-700">
                        <div className="font-medium text-gray-900">{txn.reference}</div>
                        <div>{formatStatus(txn.source)} • {txn.amount.toLocaleString()} • {formatStatus(txn.status)}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Audit Trail</h3>
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {(selectedRequest.audits || []).length === 0 ? (
                    <div className="text-sm text-gray-500">No audit events found.</div>
                  ) : (
                    selectedRequest.audits?.map((audit) => (
                      <div key={audit.id} className="rounded-lg border border-gray-100 px-3 py-2 text-sm text-gray-700">
                        <div className="font-medium text-gray-900">{formatStatus(audit.eventType)}</div>
                        <div>{formatStatus(audit.actorType)} • {formatStatus(audit.status)} • {new Date(audit.createdAt).toLocaleString()}</div>
                        {audit.reason && <div className="text-xs text-gray-500 mt-1">{audit.reason}</div>}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {(selectedRequest.status === 'pending' && selectedRequest.isReadyForReview) || selectedRequest.status === 'approved' ? (
                <div className="space-y-3 border-t pt-4">
                  <label className="block text-sm font-medium text-gray-700">
                    Mandatory Reason
                    <textarea
                      value={actionReason}
                      onChange={(e) => setActionReason(e.target.value)}
                      rows={3}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                      placeholder="Record the business and compliance reason for this action"
                    />
                  </label>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    {selectedRequest.status === 'pending' && (
                      <>
                        <button
                          onClick={() => void handleAction('approve')}
                          disabled={actionLoading !== null}
                          className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          <CheckCircle className="w-4 h-4 mr-2" />
                          {actionLoading === 'approve' ? 'Approving...' : 'Approve'}
                        </button>
                        <button
                          onClick={() => void handleAction('reject')}
                          disabled={actionLoading !== null}
                          className="inline-flex items-center justify-center px-4 py-2 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          <XCircle className="w-4 h-4 mr-2" />
                          {actionLoading === 'reject' ? 'Rejecting...' : 'Reject'}
                        </button>
                      </>
                    )}
                    {selectedRequest.status === 'approved' && (
                      <button
                        onClick={() => void handleAction('execute')}
                        disabled={actionLoading !== null}
                        className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 md:col-span-3"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        {actionLoading === 'execute' ? 'Executing Deletion...' : 'Execute Permanent Deletion'}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 flex items-start">
                  <ShieldAlert className="w-4 h-4 mr-2 mt-0.5" />
                  <span>This request is not currently actionable. Pending requests can only be processed after the grace period, and completed requests are read-only.</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
