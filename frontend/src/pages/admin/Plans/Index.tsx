import { useState, useEffect } from 'react';
import api from '../../../services/api';
import DataTable from '../../../components/Tables/DataTable';
import { Plus } from 'lucide-react';
import { Link } from 'react-router-dom';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function PlansIndex() {
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      const res = await api.get('/plans/admin');
      setPlans(res.data as any[]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    { 
      key: 'provider', 
      header: 'Network',
      render: (value: string) => <span className="uppercase">{value}</span>
    },
    { key: 'name', header: 'Plan Name' },
    { 
      key: 'admin_price', 
      header: 'Price (₦)',
      render: (value: any) => `₦${Number(value).toLocaleString()}`
    },
    {
      key: 'category',
      header: 'Category',
      render: (value: string) => <span className="capitalize">{value.replace('_', ' ')}</span>
    },
    { 
      key: 'is_active', 
      header: 'Status',
      render: (value: boolean) => (
        <span className={`px-2 py-1 rounded-full text-xs ${value ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {value ? 'Active' : 'Inactive'}
        </span>
      )
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Data Plans</h1>
        <Link to="/admin/plans/create" className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
          <Plus className="w-4 h-4 mr-2" />
          Add New Plan
        </Link>
      </div>
      
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <DataTable columns={columns} data={plans} isLoading={loading} />
      </div>
    </div>
  );
}
