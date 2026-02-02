import { useState, useEffect } from 'react';
import api from '../../../services/api';
import DataTable from '../../../components/Tables/DataTable';
import { Smartphone, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function SimsIndex() {
  const [sims, setSims] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSims = async () => {
      try {
        const res = await api.get('/sims');
        setSims(res.data as any[]);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchSims();
  }, []);

  const columns = [
    { key: 'notes', header: 'Name' },
    { 
      key: 'provider', 
      header: 'Network',
      render: (value: string) => <span className="uppercase">{value}</span>
    },
    { key: 'phoneNumber', header: 'Phone Number' },
    { 
      key: 'status', 
      header: 'Status',
      render: (value: string) => (
        <span className={`px-2 py-1 rounded-full text-xs ${value === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {value}
        </span>
      )
    },
    { 
      key: 'airtimeBalance', 
      header: 'Balance',
      render: (value: number) => `₦${Number(value || 0).toLocaleString()}`
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <Smartphone className="w-6 h-6 mr-2" />
          SIM Management
        </h1>
        <Link to="/admin/sims/create" className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
          <Plus className="w-4 h-4 mr-2" />
          Connect New SIM
        </Link>
      </div>
      
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <DataTable columns={columns} data={sims} isLoading={loading} />
      </div>
    </div>
  );
}
