import { useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import { toast } from 'react-hot-toast';

type FundingReviewTransaction = {
  id: string;
  reference: string;
  amount: number | string;
  status: string;
  createdAt?: string;
  metadata?: {
    review_status?: string;
    review_reason?: string;
    gateway?: string;
  };
  user?: {
    id: string;
    name?: string;
    email?: string;
    phone?: string;
  };
};

type PendingReviewResponse = {
  success: boolean;
  transactions: FundingReviewTransaction[];
  total?: number;
  totalPages?: number;
  currentPage?: number;
};

export default function FundingReviews() {
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [transactions, setTransactions] = useState<FundingReviewTransaction[]>([]);

  const pendingReview = useMemo(
    () => transactions.filter((t) => t?.metadata?.review_status === 'pending_review'),
    [transactions]
  );

  const fetchList = async (targetPage: number) => {
    setLoading(true);
    try {
      const res = await api.get<PendingReviewResponse>('/admin/funding/pending-review', {
        params: { page: targetPage, limit: 20 },
      });
      setTransactions(res.data.transactions || []);
      setTotalPages(res.data.totalPages || 1);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to load pending reviews');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchList(page);
  }, [page]);

  const approve = async (id: string) => {
    const ok = window.confirm('Approve this deposit and credit the user wallet?');
    if (!ok) return;

    setSubmittingId(id);
    try {
      await api.post(`/admin/funding/pending-review/${id}/approve`, {});
      toast.success('Approved');
      setTransactions((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status: 'completed', metadata: { ...t.metadata, review_status: 'approved' } } : t))
      );
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Approval failed');
    } finally {
      setSubmittingId(null);
    }
  };

  const reject = async (id: string) => {
    const ok = window.confirm('Reject this deposit?');
    if (!ok) return;

    setSubmittingId(id);
    try {
      await api.post(`/admin/funding/pending-review/${id}/reject`, {});
      toast.success('Rejected');
      setTransactions((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status: 'failed', metadata: { ...t.metadata, review_status: 'rejected' } } : t))
      );
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Rejection failed');
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Pending Funding Reviews</h1>
        <button
          onClick={() => fetchList(page)}
          className="px-4 py-2 rounded-md bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-6 text-gray-600">Loading...</div>
        ) : pendingReview.length === 0 ? (
          <div className="p-6 text-gray-600">No pending review deposits.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reference</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {pendingReview.map((t) => (
                  <tr key={t.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{t.user?.name || 'Unknown'}</div>
                      <div className="text-xs text-gray-500">{t.user?.email || ''}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      ₦{Number(t.amount || 0).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{t.reference}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-600">
                      {t.metadata?.review_reason || 'pending_review'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                      {t.createdAt ? new Date(t.createdAt).toLocaleString() : ''}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="inline-flex gap-2">
                        <button
                          onClick={() => approve(t.id)}
                          disabled={submittingId === t.id}
                          className="px-3 py-1.5 rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => reject(t.id)}
                          disabled={submittingId === t.id}
                          className="px-3 py-1.5 rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <div className="text-sm text-gray-500">
          Page {page} of {totalPages}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            className="px-3 py-2 rounded-md border bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            Prev
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
            className="px-3 py-2 rounded-md border bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

