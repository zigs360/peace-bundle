import { useEffect, useState } from 'react';
import api from '../../services/api';
import {
  Wallet,
  Activity,
  ArrowUpRight,
  ArrowDownLeft,
  Receipt,
  ChevronLeft,
  ChevronRight,
  User as UserIcon,
} from 'lucide-react';

type TransactionUser = {
  id?: string | number;
  name?: string;
  email?: string;
  phone?: string;
};

type Transaction = {
  id: string | number;
  userId: string | number;
  type: string;
  description?: string;
  amount: number | string;
  status: string;
  createdAt?: string;
  date?: string;
  user?: TransactionUser | null;
};

type AdminTransactionsResponse = {
  transactions?: Transaction[];
  total?: number;
  totalPages?: number;
  currentPage?: number;
};

export default function AdminTransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const isCreditTransaction = (tx: Transaction) =>
    String(tx.type || '').toLowerCase() === 'credit';

  useEffect(() => {
    let cancelled = false;

    const fetchTransactions = async () => {
      setIsFetching(true);
      try {
        const res = await api.get<AdminTransactionsResponse>('/admin/transactions', {
          params: { page, limit },
        });
        if (cancelled) return;
        const rows = res.data.transactions ?? [];
        setTransactions(rows);
        setTotal(typeof res.data.total === 'number' ? res.data.total : rows.length);
        setTotalPages(Math.max(1, res.data.totalPages ?? 1));
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to fetch transactions', err);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setIsFetching(false);
        }
      }
    };

    fetchTransactions();
    return () => {
      cancelled = true;
    };
  }, [page, limit]);

  if (loading) return <div className="text-center py-10">Loading transactions...</div>;

  const startItem = total === 0 ? 0 : (page - 1) * limit + 1;
  const endItem = total === 0 ? 0 : Math.min((page - 1) * limit + transactions.length, total);

  const getStatusBadgeClasses = (status: string) => {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'failed' || normalized === 'error') {
      return 'bg-red-100 text-red-800';
    }
    if (normalized === 'pending' || normalized === 'processing' || normalized === 'queued') {
      return 'bg-amber-100 text-amber-800';
    }
    if (normalized === 'refunded' || normalized === 'reversed') {
      return 'bg-blue-100 text-blue-800';
    }
    return 'bg-green-100 text-green-800';
  };

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center">
          <Receipt className="w-6 h-6 text-primary-600 mr-2" />
          <h2 className="text-xl font-bold text-gray-800">All Transactions</h2>
        </div>

        <div className="flex items-center gap-3 text-sm text-gray-600">
          <span>Rows per page:</span>
          <select
            aria-label="Rows per page"
            value={limit}
            onChange={(e) => {
              setLimit(Number(e.target.value));
              setPage(1);
            }}
            className="border border-gray-300 rounded-md px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      </div>

      <div className={`overflow-x-auto transition-opacity ${isFetching ? 'opacity-60' : 'opacity-100'}`}>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {transactions.length > 0 ? (
              transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="w-8 h-8 rounded-full bg-primary-50 text-primary-700 flex items-center justify-center mr-3 shrink-0">
                        <UserIcon className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-gray-900">
                          {tx.user?.name || 'N/A'}
                        </div>
                        {tx.user?.email && (
                          <div className="text-xs text-gray-500">{tx.user.email}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    #{tx.userId}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className={`p-2 rounded-full mr-3 ${
                        isCreditTransaction(tx) ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                      }`}>
                        {isCreditTransaction(tx) ? <Wallet className="w-4 h-4" /> : <Activity className="w-4 h-4" />}
                      </div>
                      <span className={`text-sm font-medium capitalize ${isCreditTransaction(tx) ? 'text-green-700' : 'text-red-700'}`}>
                        {tx.type.replace('_', ' ')}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {tx.description}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className={`flex items-center text-sm font-bold ${
                      isCreditTransaction(tx) ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {isCreditTransaction(tx) ? <ArrowDownLeft className="w-4 h-4 mr-1" /> : <ArrowUpRight className="w-4 h-4 mr-1" />}
                      ₦{Number(tx.amount).toLocaleString()}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadgeClasses(tx.status)}`}>
                      {tx.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {(tx.createdAt || tx.date) ? new Date((tx.createdAt || tx.date)!).toLocaleString() : 'N/A'}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="px-6 py-10 text-center text-gray-500">
                  No transactions found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex flex-wrap items-center justify-between gap-4 text-sm text-gray-600">
        <div>
          Showing <span className="font-semibold text-gray-900">{startItem}</span> to{' '}
          <span className="font-semibold text-gray-900">{endItem}</span> of{' '}
          <span className="font-semibold text-gray-900">{total}</span> transactions
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || isFetching}
            className="inline-flex items-center px-3 py-1.5 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Previous
          </button>

          <span className="px-3 py-1 font-medium text-gray-700">
            Page {page} of {totalPages}
          </span>

          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || isFetching}
            className="inline-flex items-center px-3 py-1.5 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Next
            <ChevronRight className="w-4 h-4 ml-1" />
          </button>
        </div>
      </div>
    </div>
  );
}
