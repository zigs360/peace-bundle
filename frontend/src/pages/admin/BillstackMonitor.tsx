import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import {
  Wallet,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Search,
  Zap,
  Clock,
  RotateCcw,
  Eye,
  X,
  CreditCard,
  ShieldAlert,
  ArrowUpRight
} from 'lucide-react';

interface OverviewData {
  provider: {
    name: string;
    configured: boolean;
    baseUrl: string;
    walletBalance: number | null;
    currency: string;
    liveStatus: string;
  };
  metrics: {
    totalVaUsers: number;
    successfulDeposits: number;
    totalVolume: number;
    webhooks: {
      total: number;
      processed: number;
      pending: number;
      failed: number;
      rejected: number;
    };
  };
}

interface WebhookEvent {
  id: string;
  provider: string;
  status: 'received' | 'verified' | 'processed' | 'failed' | 'rejected';
  reference: string | null;
  userId: string | null;
  amount: string | number | null;
  currency: string | null;
  verified: boolean;
  attempts: number;
  error: string | null;
  payload: any;
  createdAt: string;
  processed_at: string | null;
}

export default function BillstackMonitor() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);

  // Filters & Pagination
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalEvents, setTotalEvents] = useState(0);

  // Modal
  const [selectedEvent, setSelectedEvent] = useState<WebhookEvent | null>(null);

  const fetchOverview = useCallback(async () => {
    try {
      const res = await api.get('/admin/billstack/overview');
      if (res.data?.success) {
        setOverview(res.data.data);
      }
    } catch (err: any) {
      console.error('Failed to fetch BillStack overview', err);
    }
  }, []);

  const fetchEvents = useCallback(async () => {
    setEventsLoading(true);
    try {
      const params: any = { page, limit: 20 };
      if (statusFilter !== 'all') params.status = statusFilter;
      if (searchQuery.trim()) params.q = searchQuery.trim();

      const res = await api.get('/admin/billstack/events', { params });
      if (res.data?.success) {
        setEvents(res.data.data.events || []);
        setTotalPages(res.data.data.totalPages || 1);
        setTotalEvents(res.data.data.total || 0);
      }
    } catch (err: any) {
      toast.error('Failed to load webhook events');
    } finally {
      setEventsLoading(false);
    }
  }, [page, statusFilter, searchQuery]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchOverview(), fetchEvents()]).finally(() => setLoading(false));
  }, [fetchOverview, fetchEvents]);

  const handleReconcileAll = async () => {
    if (reconciling) return;
    const confirm = window.confirm(
      'Are you sure you want to reconcile all pending and uncredited BillStack webhook events? This will credit any valid deposits that were previously missed.'
    );
    if (!confirm) return;

    setReconciling(true);
    const toastId = toast.loading('Reconciling BillStack deposits & webhook events...');
    try {
      const res = await api.post('/admin/billstack/reconcile-all');
      if (res.data?.success) {
        toast.success(res.data.message || 'Reconciliation completed!', { id: toastId });
        fetchOverview();
        fetchEvents();
      } else {
        toast.error(res.data?.message || 'Reconciliation returned an error', { id: toastId });
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Reconciliation failed';
      toast.error(msg, { id: toastId });
    } finally {
      setReconciling(false);
    }
  };

  const handleReprocess = async (eventId: string) => {
    setReprocessingId(eventId);
    const toastId = toast.loading('Reprocessing deposit...');
    try {
      const res = await api.post(`/admin/billstack/events/${eventId}/reprocess`);
      if (res.data?.success) {
        toast.success(res.data.message || 'Event processed successfully', { id: toastId });
        fetchOverview();
        fetchEvents();
        if (selectedEvent?.id === eventId) setSelectedEvent(null);
      } else {
        toast.error(res.data?.message || 'Reprocessing failed', { id: toastId });
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Reprocessing failed';
      toast.error(msg, { id: toastId });
    } finally {
      setReprocessingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'processed':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle2 className="w-3 h-3 mr-1" /> Credited
          </span>
        );
      case 'verified':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            <Clock className="w-3 h-3 mr-1" /> Verified
          </span>
        );
      case 'received':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
            <Clock className="w-3 h-3 mr-1" /> Pending
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            <AlertCircle className="w-3 h-3 mr-1" /> Failed
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-800">
            <ShieldAlert className="w-3 h-3 mr-1" /> Rejected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            {status}
          </span>
        );
    }
  };

  const formatNaira = (val: number | string | null) => {
    const num = Number(val || 0);
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(num);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Wallet className="h-7 w-7 text-primary-600" />
            BillStack Monitor & Reconciliation
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Real-time gateway status, virtual account balance monitoring, and 1-click automatic deposit recovery.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              fetchOverview();
              fetchEvents();
            }}
            disabled={loading || eventsLoading}
            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading || eventsLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          <button
            onClick={handleReconcileAll}
            disabled={reconciling}
            className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none disabled:opacity-50"
          >
            <Zap className={`w-4 h-4 mr-2 ${reconciling ? 'animate-spin' : ''}`} />
            Reconcile & Credit All
          </button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* BillStack Gateway Status */}
        <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500">BillStack Gateway</span>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                overview?.provider.liveStatus === 'connected'
                  ? 'bg-green-100 text-green-800'
                  : overview?.provider.configured
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-red-100 text-red-800'
              }`}
            >
              {overview?.provider.liveStatus === 'connected' ? 'Connected' : overview?.provider.configured ? 'Degraded' : 'Not Configured'}
            </span>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-gray-900">
              {overview?.provider.walletBalance !== null && overview?.provider.walletBalance !== undefined
                ? formatNaira(overview.provider.walletBalance)
                : 'Live Connected'}
            </span>
            <p className="mt-1 text-xs text-gray-400">
              {overview?.provider.baseUrl ? overview.provider.baseUrl.replace('https://', '') : 'api.billstack.co'}
            </p>
          </div>
        </div>

        {/* Virtual Account Users */}
        <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500">Virtual Account Users</span>
            <CreditCard className="w-5 h-5 text-gray-400" />
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-gray-900">
              {overview?.metrics.totalVaUsers?.toLocaleString() || 0}
            </span>
            <p className="mt-1 text-xs text-gray-500">Allocated 9PSB / PalmPay Accounts</p>
          </div>
        </div>

        {/* Total Funded Volume */}
        <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500">Funded Volume</span>
            <ArrowUpRight className="w-5 h-5 text-green-500" />
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-gray-900">
              {formatNaira(overview?.metrics.totalVolume || 0)}
            </span>
            <p className="mt-1 text-xs text-gray-500">
              Across {overview?.metrics.successfulDeposits?.toLocaleString() || 0} deposits
            </p>
          </div>
        </div>

        {/* Webhook Activity */}
        <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500">Webhook Success</span>
            <div className="flex gap-1 text-xs">
              <span className="text-green-600 font-semibold">{overview?.metrics.webhooks.processed || 0} OK</span>
              <span className="text-gray-300">/</span>
              <span className="text-red-500 font-semibold">{overview?.metrics.webhooks.failed || 0} Fail</span>
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-gray-900">
              {overview?.metrics.webhooks.total?.toLocaleString() || 0}
            </span>
            <p className="mt-1 text-xs text-gray-500">
              {(overview?.metrics.webhooks.pending || 0) + (overview?.metrics.webhooks.rejected || 0)} pending / unverified
            </p>
          </div>
        </div>
      </div>

      {/* Webhook Logs Section */}
      <div className="bg-white shadow rounded-lg border border-gray-200 overflow-hidden">
        {/* Table Filters & Search */}
        <div className="p-4 border-b border-gray-200 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex flex-1 items-center gap-2 max-w-md">
            <div className="relative w-full">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Search reference, account, or payload..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setPage(1);
                    fetchEvents();
                  }
                }}
                className="block w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              />
            </div>
            <button
              onClick={() => {
                setPage(1);
                fetchEvents();
              }}
              className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-md"
            >
              Search
            </button>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="block w-full pl-3 pr-8 py-2 text-base border-gray-300 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm rounded-md"
            >
              <option value="all">All Webhook Events</option>
              <option value="processed">Credited (Processed)</option>
              <option value="received">Pending (Received)</option>
              <option value="verified">Verified</option>
              <option value="failed">Failed</option>
              <option value="rejected">Rejected / Unsigned</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reference / Account</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Timestamp</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {eventsLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-primary-600" />
                    Loading BillStack events...
                  </td>
                </tr>
              ) : events.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    No BillStack webhook events found matching your criteria.
                  </td>
                </tr>
              ) : (
                events.map((event) => {
                  const data = event.payload?.data || event.payload || {};
                  const acc =
                    data?.account_number ||
                    data?.destination_account_number ||
                    data?.account?.number ||
                    '—';
                  const ref = event.reference || data?.reference || data?.transaction_ref || 'No ref';

                  return (
                    <tr key={event.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(event.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900 font-mono">{ref}</div>
                        <div className="text-xs text-gray-500">
                          Acc: <span className="font-mono">{acc}</span>
                          {data?.payer?.name && ` • ${data.payer.name}`}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                        {formatNaira(event.amount || data?.amount || 0)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                        <div>{new Date(event.createdAt).toLocaleDateString()}</div>
                        <div>{new Date(event.createdAt).toLocaleTimeString()}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                        <button
                          onClick={() => setSelectedEvent(event)}
                          className="text-gray-600 hover:text-gray-900 inline-flex items-center"
                          title="View Payload"
                        >
                          <Eye className="w-4 h-4 mr-1" /> View
                        </button>

                        <button
                          onClick={() => handleReprocess(event.id)}
                          disabled={reprocessingId === event.id}
                          className="text-indigo-600 hover:text-indigo-900 inline-flex items-center disabled:opacity-50"
                          title="Reprocess and credit user wallet"
                        >
                          <RotateCcw className={`w-4 h-4 mr-1 ${reprocessingId === event.id ? 'animate-spin' : ''}`} />
                          Reprocess
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
          <div className="text-sm text-gray-500">
            Showing <span className="font-medium">{events.length}</span> of <span className="font-medium">{totalEvents}</span> events
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 hover:bg-white"
            >
              Previous
            </button>
            <span className="px-3 py-1 text-sm text-gray-700">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 hover:bg-white"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Payload Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Webhook Event Detail</h3>
                <p className="text-xs text-gray-500 font-mono">{selectedEvent.id}</p>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                className="text-gray-400 hover:text-gray-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Status:</span>
                <div className="mt-1">{getStatusBadge(selectedEvent.status)}</div>
              </div>
              <div>
                <span className="text-gray-500">Amount:</span>
                <div className="mt-1 font-semibold text-gray-900">{formatNaira(selectedEvent.amount)}</div>
              </div>
              <div>
                <span className="text-gray-500">Reference:</span>
                <div className="mt-1 font-mono text-xs">{selectedEvent.reference || 'None'}</div>
              </div>
              <div>
                <span className="text-gray-500">Created:</span>
                <div className="mt-1 text-xs">{new Date(selectedEvent.createdAt).toLocaleString()}</div>
              </div>
            </div>

            {selectedEvent.error && (
              <div className="p-3 bg-red-50 text-red-700 rounded-md text-xs font-mono">
                Error: {selectedEvent.error}
              </div>
            )}

            <div>
              <span className="text-sm font-medium text-gray-700">Payload JSON:</span>
              <pre className="mt-2 p-3 bg-gray-900 text-gray-100 rounded-md text-xs overflow-x-auto max-h-60">
                {JSON.stringify(selectedEvent.payload, null, 2)}
              </pre>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t">
              <button
                onClick={() => setSelectedEvent(null)}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
              <button
                onClick={() => handleReprocess(selectedEvent.id)}
                disabled={reprocessingId === selectedEvent.id}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm hover:bg-indigo-700 disabled:opacity-50 flex items-center"
              >
                <RotateCcw className={`w-4 h-4 mr-2 ${reprocessingId === selectedEvent.id ? 'animate-spin' : ''}`} />
                Reprocess & Credit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
