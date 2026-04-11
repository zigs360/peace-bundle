import { useState, useEffect } from 'react';
import api from '../../../services/api';
import DataTable from '../../../components/Tables/DataTable';
import { Smartphone, Plus, Power, PowerOff, RefreshCw, Trash2, RotateCw, Signal, Wifi, Battery, Database } from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import OgdamsDataPurchase from '../OgdamsDataPurchase';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function SimsIndex() {
  const [sims, setSims] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState<'inventory' | 'admin_data'>('inventory');

  const fetchSims = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/sims');
      // Handle paginated response structure
      const data = res.data.sims?.data || res.data.sims || res.data; 
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
      const res = await api.post(`/admin/sims/${id}/connect`);
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
      const res = await api.post(`/admin/sims/${id}/disconnect`);
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

  const handleCheckBalance = async (id: string, force: boolean = false) => {
    try {
      setActionLoading(id);
      const res = await api.post(`/admin/sims/${id}/check-balance`, { force });
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

  const handleSetPoolLink = async (id: string, linked: boolean) => {
    try {
      setActionLoading(id);
      const res = await api.post(`/admin/sims/${id}/ogdams-link`, { linked });
      if (res.data.success) {
        toast.success(res.data.message || 'Updated');
        setSims((prev) => prev.map((sim) => (sim.id === id ? res.data.data : sim)));
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update SIM pool linkage');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to remove this SIM? This action cannot be undone.')) {
      return;
    }

    try {
      setActionLoading(id);
      const res = await api.delete(`/admin/sims/${id}`);
      if (res.data.success || res.status === 200) {
        toast.success(res.data.message || 'SIM removed successfully');
        setSims(prev => prev.filter(sim => sim.id !== id));
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to remove SIM');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSync = async () => {
    try {
      setIsSyncing(true);
      const res = await api.post('/admin/sims/sync');
      if (res.data.success) {
        toast.success(res.data.message);
        fetchSims(); // Refresh list
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to sync SIMs from Smeplug');
    } finally {
      setIsSyncing(false);
    }
  };

  const columns = [
    { key: 'notes', header: 'Name' },
    {
      key: 'ogdamsLinked',
      header: 'Pool',
      render: (value: any, row: any) => (
        <div className="flex items-center space-x-2">
          <span className={`text-xs font-bold ${value ? 'text-purple-700' : 'text-blue-700'}`}>{value ? 'OGDAMS' : 'SMEPLUG'}</span>
          <button
            onClick={() => handleSetPoolLink(row.id, !value)}
            disabled={actionLoading === row.id}
            className="px-2 py-1 rounded-md text-[10px] font-bold border border-gray-200 hover:bg-gray-50 transition-all disabled:opacity-50"
            title="Toggle pool linkage"
          >
            {value ? 'To SMEPlug' : 'To Ogdams'}
          </button>
        </div>
      )
    },
    { 
      key: 'provider', 
      header: 'Network',
      render: (value: string) => <span className="uppercase font-bold">{value}</span>
    },
    { key: 'phoneNumber', header: 'Phone Number' },
    {
      key: 'networkInfo',
      header: 'Signal/Network/Bat',
      render: (_: any, row: any) => (
        <div className="flex flex-col">
          <div className="flex items-center space-x-2">
            <div className="flex items-center text-xs text-gray-600">
              <Signal className="w-3 h-3 mr-1 text-primary-500" />
              <span>{row.signalStrength || 'N/A'}%</span>
            </div>
            {row.batteryLevel !== null && (
              <div className="flex items-center text-xs text-gray-600">
                <Battery className={`w-3 h-3 mr-1 ${row.batteryLevel < 20 ? 'text-red-500' : 'text-green-500'}`} />
                <span>{row.batteryLevel}%</span>
              </div>
            )}
          </div>
          <div className="flex items-center text-[10px] text-gray-400 mt-0.5">
            <Wifi className="w-2.5 h-2.5 mr-1" />
            <span>{row.networkInfo || 'Unknown'}</span>
          </div>
        </div>
      )
    },
    { 
      key: 'connectionStatus', 
      header: 'Connection',
      render: (value: string) => (
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
          <span className="font-mono text-sm font-semibold text-primary-700">₦{Number(value || 0).toLocaleString()}</span>
          <button 
            onClick={() => handleCheckBalance(row.id, true)}
            disabled={actionLoading === row.id}
            className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-full transition-all disabled:opacity-50"
            title="Force Refresh Balance"
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
          <button
            onClick={() => handleDelete(row.id)}
            disabled={actionLoading === row.id}
            className="p-1.5 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
            title="Delete SIM"
          >
            <Trash2 className="w-4 h-4" />
          </button>
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
          <p className="text-sm text-gray-500 mt-1">Unified SIM portal for SMEPlug + Ogdams inventory and admin purchases.</p>
        </div>
        <div className="flex items-center space-x-3">
          <button 
            onClick={handleSync}
            disabled={isSyncing || loading}
            className="flex items-center px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all shadow-sm disabled:opacity-50"
          >
            <RotateCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Syncing...' : 'Sync from Smeplug'}
          </button>
          <Link to="/admin/sims/create" className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-all shadow-sm">
            <Plus className="w-4 h-4 mr-2" />
            Add New SIM
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-2 flex space-x-2">
        <button
          onClick={() => setActiveTab('inventory')}
          className={`flex items-center px-4 py-2 rounded-md text-sm font-bold ${
            activeTab === 'inventory' ? 'bg-primary-600 text-white' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
          }`}
        >
          <Smartphone className="w-4 h-4 mr-2" />
          SIM Inventory
        </button>
        <button
          onClick={() => setActiveTab('admin_data')}
          className={`flex items-center px-4 py-2 rounded-md text-sm font-bold ${
            activeTab === 'admin_data' ? 'bg-primary-600 text-white' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
          }`}
        >
          <Database className="w-4 h-4 mr-2" />
          Admin Data Purchase
        </button>
      </div>

      {activeTab === 'inventory' ? (
        <div className="bg-white shadow-sm border border-gray-200 rounded-xl overflow-hidden">
          <DataTable columns={columns} data={sims} isLoading={loading} />
        </div>
      ) : (
        <OgdamsDataPurchase />
      )}
    </div>
  );
}
