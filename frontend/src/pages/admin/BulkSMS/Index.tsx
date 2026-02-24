import { useState, useEffect } from 'react';
import api from '../../../services/api';
import DataTable from '../../../components/Tables/DataTable';
import { Plus } from 'lucide-react';
import { Link } from 'react-router-dom';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function BulkSMSIndex() {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1 });

  useEffect(() => {
    fetchHistory();
  }, [pagination.page]);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/admin/bulk-sms?page=${pagination.page}`);
      setHistory((res.data as any).history);
      setPagination({
        page: (res.data as any).currentPage,
        totalPages: (res.data as any).totalPages
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    { 
      key: 'createdAt', 
      header: 'Date',
      render: (value: string) => new Date(value).toLocaleString()
    },
    { 
      key: 'User', 
      header: 'Sender',
      render: (value: any) => value?.name || 'Unknown'
    },
    { 
      key: 'User', 
      header: 'Email',
      render: (value: any) => value?.email || 'N/A'
    },
    { key: 'amount', header: 'Cost (₦)' },
    { key: 'description', header: 'Description' },
    { 
      key: 'status', 
      header: 'Status',
      render: (value: string) => (
        <span className={`px-2 py-1 rounded-full text-xs ${value === 'completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
          {value}
        </span>
      )
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Bulk SMS History</h1>
        <Link to="/admin/bulk-sms/create" className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
          <Plus className="w-4 h-4 mr-2" />
          Send New SMS
        </Link>
      </div>
      
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <DataTable columns={columns} data={history} isLoading={loading} />
      </div>
      
      <div className="flex justify-between items-center mt-4">
        <button 
            disabled={pagination.page <= 1}
            onClick={() => setPagination(p => ({...p, page: p.page - 1}))}
            className="px-4 py-2 bg-gray-200 rounded disabled:opacity-50"
        >
            Previous
        </button>
        <span>Page {pagination.page} of {pagination.totalPages}</span>
        <button 
            disabled={pagination.page >= pagination.totalPages}
            onClick={() => setPagination(p => ({...p, page: p.page + 1}))}
            className="px-4 py-2 bg-gray-200 rounded disabled:opacity-50"
        >
            Next
        </button>
      </div>
    </div>
  );
}
