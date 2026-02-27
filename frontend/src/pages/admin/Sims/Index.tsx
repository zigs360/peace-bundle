import { useState, useEffect } from 'react';
import api from '../../../services/api';
import DataTable from '../../../components/Tables/DataTable';
import { Smartphone, Plus, Power, PowerOff, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function SimsIndex() {
  const [sims, setSims] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchSims = async () => {
    try {
      setLoading(true);
      const res = await api.get('/sims');
      // Handle paginated response structure
      const data = res.data.sims?.data || res.data; 
      setSims(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to fetch SIMs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSims();
  }, []);

  const handleConnect = async (id: string) => {
    try {
      setActionLoading(id);
      const res = await api.post(`/sims/${id}/connect`);
      if (res.data.success) {
        toast.success(res.data.message || 'SIM connected successfully');
        // Update local state
        setSims(prev => prev.map(sim => sim.id === id ? res.data.data : sim));
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to connect SIM');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDisconnect = async (id: string) => {
    try {
      setActionLoading(id);
      const res = await api.post(`/sims/${id}/disconnect`);
      if (res.data.success) {
        toast.success(res.data.message || 'SIM disconnected successfully');
        // Update local state
        setSims(prev => prev.map(sim => sim.id === id ? res.data.data : sim));
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to disconnect SIM');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCheckBalance = async (id: string) => {
    try {
      setActionLoading(id);
      const res = await api.post(`/sims/${id}/check-balance`);
      if (res.data.success) {
        toast.success(`Balance updated: ₦${res.data.balance}`);
        // Update local state
        setSims(prev => prev.map(sim => sim.id === id ? res.data.sim : sim));
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to check balance');
    } finally {
      setActionLoading(null);
    }
  };

  const columns = [
    { key: 'notes', header: 'Name' },
    { 
      key: 'provider', 
      header: 'Network',
      render: (value: string) => <span className="uppercase font-bold">{value}</span>
    },
    { key: 'phoneNumber', header: 'Phone Number' },
    { 
      key: 'connectionStatus', 
      header: 'Connection',
      render: (value: string, row: any) => (
        <div className="flex items-center">
          <span className={`flex h-2.5 w-2.5 rounded-full mr-2 ${value === 'connected' ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></span>
          <span className={`text-xs font-medium capitalize ${value === 'connected' ? 'text-green-700' : 'text-gray-500'}`}>
            {value || 'disconnected'}
          </span>
        </div>
      )
    },
    { 
      key: 'status', 
      header: 'Status',
      render: (value: string) => (
        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
          value === 'active' ? 'bg-green-100 text-green-800' : 
          value === 'paused' ? 'bg-yellow-100 text-yellow-800' : 
          'bg-red-100 text-red-800'
        }`}>
          {value}
        </span>
      )
    },
    { 
      key: 'airtimeBalance', 
      header: 'Balance',
      render: (value: number, row: any) => (
        <div className="flex items-center space-x-2">
          <span className="font-mono text-sm font-semibold">₦{Number(value || 0).toLocaleString()}</span>
          <button 
            onClick={() => handleCheckBalance(row.id)}
            disabled={actionLoading === row.id}
            className="p-1 text-gray-400 hover:text-primary-600 transition-colors disabled:opacity-50"
            title="Refresh Balance"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${actionLoading === row.id ? 'animate-spin' : ''}`} />
          </button>
        </div>
      )
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (_: any, row: any) => (
        <div className="flex items-center space-x-2">
          {row.connectionStatus === 'connected' ? (
            <button
              onClick={() => handleDisconnect(row.id)}
              disabled={actionLoading === row.id}
              className="flex items-center px-3 py-1.5 bg-red-50 text-red-600 rounded-md hover:bg-red-100 transition-colors disabled:opacity-50 font-medium text-xs"
            >
              {actionLoading === row.id ? (
                <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <PowerOff className="w-3.5 h-3.5 mr-1.5" />
              )}
              Disconnect
            </button>
          ) : (
            <button
              onClick={() => handleConnect(row.id)}
              disabled={actionLoading === row.id || row.status !== 'active'}
              className="flex items-center px-3 py-1.5 bg-green-50 text-green-600 rounded-md hover:bg-green-100 transition-colors disabled:opacity-50 font-medium text-xs disabled:cursor-not-allowed"
            >
              {actionLoading === row.id ? (
                <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Power className="w-3.5 h-3.5 mr-1.5" />
              )}
              Connect
            </button>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <Smartphone className="w-6 h-6 mr-2 text-primary-600" />
            SIM Management
          </h1>
          <p className="text-sm text-gray-500 mt-1">Manage your hardware SIM connections and balances.</p>
        </div>
        <Link to="/admin/sims/create" className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-all shadow-sm">
          <Plus className="w-4 h-4 mr-2" />
          Add New SIM
        </Link>
      </div>
      
      <div className="bg-white shadow-sm border border-gray-200 rounded-xl overflow-hidden">
        <DataTable columns={columns} data={sims} isLoading={loading} />
      </div>
    </div>
  );
}
