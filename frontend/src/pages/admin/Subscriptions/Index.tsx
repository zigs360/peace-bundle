import { useState, useEffect } from 'react';
import api from '../../../services/api';
import DataTable from '../../../components/Tables/DataTable';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';

export default function SubscriptionsIndex() {
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      const res = await api.get('/admin/subscription-plans');
      setPlans(res.data as any[]);
    } catch (err) {
      console.error(err);
      toast.error('Failed to fetch subscription plans');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this plan?')) return;
    try {
      await api.delete(`/admin/subscription-plans/${id}`);
      toast.success('Plan deleted successfully');
      fetchPlans();
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete plan');
    }
  };

  const columns = [
    { key: 'name', header: 'Plan Name' },
    { 
      key: 'price', 
      header: 'Price',
      render: (value: any, row: any) => `${row.currency === 'NGN' ? '₦' : row.currency}${Number(value).toLocaleString()}`
    },
    { 
      key: 'billing_cycle', 
      header: 'Billing Cycle',
      render: (value: string) => <span className="capitalize">{value}</span>
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
    {
      key: 'id',
      header: 'Actions',
      render: (id: string) => (
        <div className="flex space-x-2">
          <Link to={`/admin/subscriptions/edit/${id}`} className="text-blue-600 hover:text-blue-800">
            <Edit className="w-4 h-4" />
          </Link>
          <button onClick={() => handleDelete(id)} className="text-red-600 hover:text-red-800">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Subscription Plans</h1>
        <Link to="/admin/subscriptions/create" className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition shadow-md">
          <Plus className="w-4 h-4 mr-2" />
          Add New Plan
        </Link>
      </div>
      
      <div className="bg-white shadow rounded-lg overflow-hidden border border-gray-100">
        <DataTable columns={columns} data={plans} isLoading={loading} />
      </div>
    </div>
  );
}
