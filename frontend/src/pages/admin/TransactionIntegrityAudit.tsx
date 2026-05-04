import { useEffect, useMemo, useState } from 'react';
import api from '../../services/api';

type AuditRow = {
  id: string;
  eventType: string;
  severity: string;
  status: string;
  createdAt: string;
  resolvedAt?: string | null;
  details?: Record<string, any>;
  user?: {
    id: string;
    name?: string;
    email?: string;
    phone?: string;
  };
  transaction: {
    id: string;
    reference: string;
    source: string;
    status: string;
    payment_channel?: string | null;
    fulfillment_route?: string | null;
    delivery_status?: string | null;
    integrity_status?: string | null;
    refund_reference?: string | null;
    anomaly_flag?: boolean;
    createdAt?: string;
  };
};

type SummaryResponse = {
  success: boolean;
  audits: {
    total: number;
    open: number;
    resolved: number;
    bySeverity: Record<string, number>;
    byStatus: Record<string, number>;
    byEventType: Record<string, number>;
  };
  transactions: {
    scanned: number;
    flagged: number;
    refunded: number;
    failed: number;
    pendingIntegrityReview: number;
    byIntegrityStatus: Record<string, number>;
    byPaymentChannel: Record<string, number>;
    byFulfillmentRoute: Record<string, number>;
  };
  latestMonitor: {
    runAt?: string | null;
    report?: {
      duplicateRefunds?: number;
      failedRefundsRecovered?: number;
      staleTransactionsResolved?: number;
      scanned?: number;
    } | null;
  };
};

const EVENT_LABELS: Record<string, string> = {
  duplicate_charge_detected: 'Duplicate Charge',
  failed_delivery_detected: 'Failed Delivery',
  stale_transaction_rolled_back: 'Stale Rollback',
  refund_issued: 'Refund Issued',
  route_locked: 'Route Locked',
};

const badgeClasses: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  warning: 'bg-amber-100 text-amber-700',
  info: 'bg-blue-100 text-blue-700',
  open: 'bg-red-100 text-red-700',
  resolved: 'bg-green-100 text-green-700',
  completed: 'bg-green-100 text-green-700',
  refunded: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
  processing: 'bg-amber-100 text-amber-700',
  queued: 'bg-blue-100 text-blue-700',
  pending: 'bg-slate-100 text-slate-700',
};

const formatLabel = (value?: string | null) => {
  const raw = String(value || '').trim();
  if (!raw) return '—';
  if (EVENT_LABELS[raw]) return EVENT_LABELS[raw];
  return raw
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const formatNumber = (value?: number | null) => Number(value || 0).toLocaleString();

const formatDetails = (details?: Record<string, any>) => {
  if (!details || typeof details !== 'object') return '—';
  if (details.reason) return String(details.reason);
  if (details.message) return String(details.message);
  if (details.keptReference) return `Kept ref: ${details.keptReference}`;
  return JSON.stringify(details);
};

export default function TransactionIntegrityAudit() {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [items, setItems] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [repairing, setRepairing] = useState(false);
  const [sinceHours, setSinceHours] = useState('24');
  const [severity, setSeverity] = useState('');
  const [status, setStatus] = useState('');
  const [eventType, setEventType] = useState('');
  const [transactionReference, setTransactionReference] = useState('');
  const [anomalyOnly, setAnomalyOnly] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const params = {
        sinceHours: Number(sinceHours) || 24,
      };
      const [summaryRes, auditsRes] = await Promise.all([
        api.get('/admin/audit/transaction-integrity/summary', { params }),
        api.get('/admin/audit/transaction-integrity', {
          params: {
            ...params,
            severity: severity || undefined,
            status: status || undefined,
            eventType: eventType || undefined,
            transactionReference: transactionReference || undefined,
            anomalyOnly: anomalyOnly ? 'true' : undefined,
            limit: 100,
          },
        }),
      ]);
      setSummary(summaryRes.data || null);
      setItems(auditsRes.data?.rows || []);
    } catch (error) {
      console.error(error);
      setSummary(null);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const runRepairPass = async () => {
    if (!window.confirm('Run a manual transaction integrity repair pass now?')) return;
    setRepairing(true);
    try {
      await api.post('/admin/audit/transaction-integrity/repair', { limit: 250 });
      await load();
    } catch (error) {
      console.error(error);
      window.alert('Failed to run transaction integrity repair pass.');
    } finally {
      setRepairing(false);
    }
  };

  const monitorSummary = useMemo(() => summary?.latestMonitor?.report || null, [summary]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transaction Integrity Audit</h1>
          <p className="mt-1 text-sm text-gray-600">
            Monitor duplicate charges, failed deliveries, stale rollbacks, and automatic refund recovery across Airtime and Data flows.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => void load()}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Refresh
          </button>
          <button
            onClick={() => void runRepairPass()}
            disabled={repairing}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${
              repairing ? 'bg-gray-400' : 'bg-primary-600 hover:bg-primary-700'
            }`}
          >
            {repairing ? 'Running Repair...' : 'Run Repair Pass'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Open Audits</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">{formatNumber(summary?.audits?.open)}</div>
        </div>
        <div className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Flagged Transactions</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">{formatNumber(summary?.transactions?.flagged)}</div>
        </div>
        <div className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Auto Refund Recoveries</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">{formatNumber(monitorSummary?.failedRefundsRecovered)}</div>
        </div>
        <div className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Stale Rollbacks</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">{formatNumber(monitorSummary?.staleTransactionsResolved)}</div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-gray-500">Window</label>
            <select value={sinceHours} onChange={(e) => setSinceHours(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2">
              <option value="24">Last 24 Hours</option>
              <option value="72">Last 72 Hours</option>
              <option value="168">Last 7 Days</option>
            </select>
          </div>
          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-gray-500">Severity</label>
            <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2">
              <option value="">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
          </div>
          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-gray-500">Audit Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2">
              <option value="">All Statuses</option>
              <option value="open">Open</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-gray-500">Event Type</label>
            <input
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              placeholder="duplicate_charge_detected"
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-gray-500">Transaction Ref</label>
            <input
              value={transactionReference}
              onChange={(e) => setTransactionReference(e.target.value)}
              placeholder="Search reference"
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={anomalyOnly}
              onChange={(e) => setAnomalyOnly(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            Show anomaly-flagged transactions only
          </label>
          <button onClick={() => void load()} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
            Apply Filters
          </button>
          <button
            onClick={() => {
              setSinceHours('24');
              setSeverity('');
              setStatus('');
              setEventType('');
              setTransactionReference('');
              setAnomalyOnly(true);
            }}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
          <div className="text-sm font-semibold text-gray-900">Latest Monitor Pass</div>
          <div className="mt-2 text-sm text-gray-600">
            Last Run: {summary?.latestMonitor?.runAt ? new Date(summary.latestMonitor.runAt).toLocaleString() : 'Never'}
          </div>
          <div className="mt-4 space-y-2 text-sm text-gray-700">
            <div>Scanned: <span className="font-semibold">{formatNumber(monitorSummary?.scanned)}</span></div>
            <div>Duplicate Refunds: <span className="font-semibold">{formatNumber(monitorSummary?.duplicateRefunds)}</span></div>
            <div>Failed Refund Recoveries: <span className="font-semibold">{formatNumber(monitorSummary?.failedRefundsRecovered)}</span></div>
            <div>Stale Rollbacks: <span className="font-semibold">{formatNumber(monitorSummary?.staleTransactionsResolved)}</span></div>
          </div>
        </div>

        <div className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
          <div className="text-sm font-semibold text-gray-900">Payment Channels</div>
          <div className="mt-3 space-y-2 text-sm text-gray-700">
            {summary?.transactions?.byPaymentChannel && Object.keys(summary.transactions.byPaymentChannel).length > 0 ? (
              Object.entries(summary.transactions.byPaymentChannel).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between">
                  <span>{formatLabel(key)}</span>
                  <span className="font-semibold">{formatNumber(value)}</span>
                </div>
              ))
            ) : (
              <div className="text-gray-500">No payment channel data available.</div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
          <div className="text-sm font-semibold text-gray-900">Fulfillment Routes</div>
          <div className="mt-3 space-y-2 text-sm text-gray-700">
            {summary?.transactions?.byFulfillmentRoute && Object.keys(summary.transactions.byFulfillmentRoute).length > 0 ? (
              Object.entries(summary.transactions.byFulfillmentRoute).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between">
                  <span>{formatLabel(key)}</span>
                  <span className="font-semibold">{formatNumber(value)}</span>
                </div>
              ))
            ) : (
              <div className="text-gray-500">No fulfillment route data available.</div>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-4">
          <div className="text-sm font-semibold text-gray-900">Integrity Audit Events</div>
          <div className="text-sm text-gray-500">Review anomaly events, refund actions, and route-locked transaction states.</div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['Transaction', 'Event', 'Severity', 'Audit Status', 'Transaction Status', 'Details', 'Time'].map((header) => (
                  <th key={header} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-sm text-gray-500">Loading transaction integrity data...</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-sm text-gray-500">No transaction integrity audit events found.</td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-4 text-sm text-gray-700">
                      <div className="font-semibold text-gray-900">{item.transaction.reference}</div>
                      <div className="text-xs text-gray-500">{formatLabel(item.transaction.source)}</div>
                      <div className="text-xs text-gray-500">
                        {item.transaction.payment_channel || '—'} / {item.transaction.fulfillment_route || '—'}
                      </div>
                      <div className="text-xs text-gray-500">{item.user?.email || item.user?.phone || item.user?.name || 'Unknown user'}</div>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-700">{formatLabel(item.eventType)}</td>
                    <td className="px-4 py-4 text-sm">
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${badgeClasses[item.severity] || 'bg-slate-100 text-slate-700'}`}>
                        {item.severity}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm">
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${badgeClasses[item.status] || 'bg-slate-100 text-slate-700'}`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm">
                      <div>
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${badgeClasses[item.transaction.status] || 'bg-slate-100 text-slate-700'}`}>
                          {item.transaction.status}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-gray-500">
                        Integrity: {item.transaction.integrity_status || '—'}
                      </div>
                      <div className="text-xs text-gray-500">
                        Refund Ref: {item.transaction.refund_reference || '—'}
                      </div>
                    </td>
                    <td className="max-w-md px-4 py-4 text-sm text-gray-700">
                      <div className="break-words">{formatDetails(item.details)}</div>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-700">
                      <div>{new Date(item.createdAt).toLocaleString()}</div>
                      <div className="text-xs text-gray-500">
                        {item.resolvedAt ? `Resolved ${new Date(item.resolvedAt).toLocaleString()}` : 'Open'}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
