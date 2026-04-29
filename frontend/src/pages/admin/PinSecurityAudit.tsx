import { useEffect, useState } from 'react';
import api from '../../services/api';

type PinSecurityEvent = {
  id: string;
  eventType: string;
  status: 'success' | 'failure' | 'info';
  createdAt: string;
  ip?: string | null;
  metadata?: Record<string, any>;
  user?: {
    id: string;
    name?: string;
    email?: string;
    phone?: string;
  };
};

const EVENT_LABELS: Record<string, string> = {
  pin_created: 'PIN Created',
  pin_changed: 'PIN Changed',
  pin_recovery_otp_requested: 'Recovery OTP Requested',
  pin_recovery_otp_verified: 'Recovery OTP Verified',
  pin_recovery_failed: 'Recovery Failed',
  pin_recovered: 'PIN Recovered',
  pin_verification_failed: 'PIN Verification Failed',
  pin_locked: 'PIN Locked',
  pin_session_created: 'PIN Session Created',
};

function formatMetadata(metadata?: Record<string, any>) {
  if (!metadata || typeof metadata !== 'object') return '—';
  if (Array.isArray(metadata.deliveryChannels) && metadata.deliveryChannels.length > 0) {
    return metadata.deliveryChannels.map((item) => `${item.channel}: ${item.destination}`).join(', ');
  }
  if (metadata.code) return `${metadata.code}${metadata.message ? `: ${metadata.message}` : ''}`;
  if (metadata.reason) return String(metadata.reason);
  if (metadata.scope) return `Scope: ${metadata.scope}`;
  return Object.keys(metadata).length ? JSON.stringify(metadata) : '—';
}

export default function PinSecurityAudit() {
  const [items, setItems] = useState<PinSecurityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [eventType, setEventType] = useState('');
  const [status, setStatus] = useState('');

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/audit/transaction-pin-events', {
        params: {
          search: search || undefined,
          eventType: eventType || undefined,
          status: status || undefined,
          limit: 100,
        },
      });
      setItems(res.data?.rows || []);
    } catch (error) {
      console.error(error);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchEvents();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">PIN Security Audit</h1>
        <p className="text-sm text-gray-600">Review transaction PIN setup, recovery, lockout, and verification events.</p>
      </div>

      <div className="bg-white rounded-lg shadow border border-gray-100 p-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search user name, email, or phone"
            className="rounded-lg border border-gray-300 px-3 py-2"
          />
          <select value={eventType} onChange={(e) => setEventType(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2">
            <option value="">All event types</option>
            {Object.entries(EVENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2">
            <option value="">All statuses</option>
            <option value="success">Success</option>
            <option value="failure">Failure</option>
            <option value="info">Info</option>
          </select>
        </div>
        <div className="flex gap-3 mt-4">
          <button onClick={() => void fetchEvents()} className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
            Apply Filters
          </button>
          <button
            onClick={() => {
              setSearch('');
              setEventType('');
              setStatus('');
              void fetchEvents();
            }}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden border border-gray-100">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['User', 'Event', 'Status', 'Details', 'IP', 'Time'].map((header) => (
                  <th key={header} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-500">Loading...</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-500">No PIN security events found.</td>
                </tr>
              ) : items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-4 text-sm text-gray-700">
                    <div className="font-medium text-gray-900">{item.user?.name || 'Unknown user'}</div>
                    <div className="text-xs text-gray-500">{item.user?.email || item.user?.phone || '—'}</div>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-700">{EVENT_LABELS[item.eventType] || item.eventType}</td>
                  <td className="px-4 py-4 text-sm">
                    <span className={`font-semibold ${
                      item.status === 'success'
                        ? 'text-green-700'
                        : item.status === 'failure'
                          ? 'text-red-700'
                          : 'text-amber-700'
                    }`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-700 break-words max-w-sm">{formatMetadata(item.metadata)}</td>
                  <td className="px-4 py-4 text-sm text-gray-700">{item.ip || '—'}</td>
                  <td className="px-4 py-4 text-sm text-gray-700">{new Date(item.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
