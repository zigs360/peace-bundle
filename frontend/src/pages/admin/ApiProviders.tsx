import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { 
  Server, 
  Plus, 
  CheckCircle2, 
  RefreshCw, 
  Trash2, 
  Edit3, 
  ExternalLink, 
  ShieldCheck, 
  Smartphone, 
  Zap, 
  X,
  Layers
} from 'lucide-react';
import SurfaceCard from '../../components/ui/SurfaceCard';

interface ApiProvider {
  id: string;
  name: string;
  slug: string;
  service_type: string;
  base_url: string;
  api_key?: string;
  secret_key?: string;
  public_key?: string;
  capabilities: string[];
  endpoint_map: Record<string, string>;
  is_active: boolean;
  is_primary: boolean;
  priority: number;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export default function ApiProviders() {
  const [providers, setProviders] = useState<ApiProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSyncingId, setIsSyncingId] = useState<string | null>(null);
  const [editingProvider, setEditingProvider] = useState<ApiProvider | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    service_type: 'all',
    base_url: '',
    api_key: '',
    secret_key: '',
    public_key: '',
    capabilities: ['vtu_data', 'vtu_airtime', 'sim_hosting'],
    is_active: true,
    is_primary: false,
  });

  const [routes, setRoutes] = useState<Record<string, string>>({});
  const [savingRoutes, setSavingRoutes] = useState(false);

  const fetchProviders = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/providers');
      if (res.data.success) {
        setProviders(res.data.providers || []);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to load API providers');
    } finally {
      setLoading(false);
    }
  };

  const fetchRoutes = async () => {
    try {
      const res = await api.get('/admin/providers/routes');
      if (res.data.success) {
        setRoutes(res.data.routes || {});
      }
    } catch (err) {
      // ignore
    }
  };

  useEffect(() => {
    fetchProviders();
    fetchRoutes();
  }, []);

  const handleRouteChange = (key: string, providerSlug: string) => {
    setRoutes(prev => ({
      ...prev,
      [key]: providerSlug
    }));
  };

  const handleSaveRoutes = async () => {
    try {
      setSavingRoutes(true);
      const res = await api.put('/admin/providers/routes', { routes });
      if (res.data.success) {
        toast.success('Provider routing configurations saved successfully');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save provider routes');
    } finally {
      setSavingRoutes(false);
    }
  };

  const openCreateModal = () => {
    setEditingProvider(null);
    setFormData({
      name: '',
      slug: '',
      service_type: 'all',
      base_url: '',
      api_key: '',
      secret_key: '',
      public_key: '',
      capabilities: ['vtu_data', 'vtu_airtime', 'sim_hosting'],
      is_active: true,
      is_primary: false,
    });
    setIsModalOpen(true);
  };

  const applyTemplate = (template: 'quicklysim' | 'smeplug' | 'legitdataway') => {
    if (template === 'quicklysim') {
      setFormData(prev => ({
        ...prev,
        name: 'QuicklySIM',
        slug: 'quicklysim',
        service_type: 'all',
        base_url: 'https://quicklysim.com',
        capabilities: ['vtu_data', 'vtu_airtime', 'sim_hosting'],
      }));
    } else if (template === 'smeplug') {
      setFormData(prev => ({
        ...prev,
        name: 'Smeplug',
        slug: 'smeplug',
        service_type: 'all',
        base_url: 'https://smeplug.ng/api/v1',
        capabilities: ['vtu_data', 'vtu_airtime', 'sim_hosting'],
      }));
    } else if (template === 'legitdataway') {
      setFormData(prev => ({
        ...prev,
        name: 'Legitdataway',
        slug: 'legitdataway',
        service_type: 'data',
        base_url: 'https://legitdataway.com',
        capabilities: ['vtu_data'],
      }));
    }
  };

  const openEditModal = (provider: ApiProvider) => {
    setEditingProvider(provider);
    setFormData({
      name: provider.name,
      slug: provider.slug,
      service_type: provider.service_type || 'all',
      base_url: provider.base_url || '',
      api_key: provider.api_key || '',
      secret_key: provider.secret_key || '',
      public_key: provider.public_key || '',
      capabilities: provider.capabilities || ['vtu_data', 'vtu_airtime', 'sim_hosting'],
      is_active: provider.is_active,
      is_primary: provider.is_primary,
    });
    setIsModalOpen(true);
  };

  const handleActivate = async (id: string) => {
    try {
      const res = await api.post(`/admin/providers/${id}/activate`);
      if (res.data.success) {
        toast.success(res.data.message || 'Provider set as primary');
        fetchProviders();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to activate provider');
    }
  };

  const handleSyncSims = async (provider: ApiProvider) => {
    try {
      setIsSyncingId(provider.id);
      const res = await api.post(`/admin/providers/${provider.id}/sync-sims`);
      if (res.data.success) {
        const stats = res.data.results;
        toast.success(`SIM sync complete: ${stats?.created || 0} added, ${stats?.updated || 0} updated`);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || `Failed to sync SIMs from ${provider.name}`);
    } finally {
      setIsSyncingId(null);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to remove ${name}?`)) return;
    try {
      const res = await api.delete(`/admin/providers/${id}`);
      if (res.data.success) {
        toast.success('Provider deleted successfully');
        fetchProviders();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete provider');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.base_url.trim()) {
      toast.error('Provider name and Base URL are required');
      return;
    }

    try {
      if (editingProvider) {
        await api.put(`/admin/providers/${editingProvider.id}`, formData);
        toast.success('Provider updated successfully');
      } else {
        await api.post('/admin/providers', formData);
        toast.success('New provider added successfully');
      }
      setIsModalOpen(false);
      fetchProviders();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save provider');
    }
  };

  const toggleCapability = (cap: string) => {
    setFormData(prev => {
      const exists = prev.capabilities.includes(cap);
      return {
        ...prev,
        capabilities: exists 
          ? prev.capabilities.filter(c => c !== cap) 
          : [...prev.capabilities, cap]
      };
    });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Server className="w-7 h-7 text-primary-600" />
            API Provider Management
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Configure dynamic VTU, Airtime, and SIM Management API providers (e.g. QuicklySIM, Smeplug) without editing codebase.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition shadow-sm font-semibold self-start"
        >
          <Plus className="w-5 h-5" />
          Add API Provider
        </button>
      </div>

      {/* Providers Grid */}
      {loading ? (
        <div className="p-12 text-center text-slate-500">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-primary-600" />
          Loading API providers...
        </div>
      ) : providers.length === 0 ? (
        <SurfaceCard className="p-8 text-center text-slate-500">
          <Server className="w-12 h-12 mx-auto mb-3 text-slate-400" />
          <p className="font-semibold text-slate-700">No API Providers configured yet</p>
          <p className="text-sm mt-1">Click "Add API Provider" to register QuicklySIM or another provider.</p>
        </SurfaceCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {providers.map((p) => (
            <SurfaceCard 
              key={p.id} 
              className={`p-6 border-2 transition-all ${
                p.is_primary ? 'border-primary-500 ring-2 ring-primary-100 shadow-md' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              {/* Card Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-slate-900">{p.name}</h3>
                    {p.is_primary && (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        PRIMARY
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded mt-1 inline-block">
                    {p.slug}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEditModal(p)}
                    className="p-1.5 text-slate-500 hover:text-slate-800 rounded hover:bg-slate-100 transition"
                    title="Edit Provider"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(p.id, p.name)}
                    className="p-1.5 text-red-500 hover:text-red-700 rounded hover:bg-red-50 transition"
                    title="Delete Provider"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Endpoint & Keys details */}
              <div className="space-y-2 text-xs text-slate-600 mb-4 bg-slate-50 p-3 rounded-lg">
                <div className="flex justify-between items-center overflow-hidden">
                  <span className="font-semibold text-slate-500">Base URL:</span>
                  <span className="font-mono text-slate-800 truncate max-w-[200px]" title={p.base_url}>
                    {p.base_url}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-slate-500">API Key:</span>
                  <span className="font-mono text-slate-700">
                    {p.api_key ? `${p.api_key.slice(0, 6)}...` : 'Not set'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-slate-500">Secret:</span>
                  <span className="font-mono text-slate-700">
                    {p.secret_key ? '••••••••' : 'Not set'}
                  </span>
                </div>
              </div>

              {/* Capabilities */}
              <div className="mb-4">
                <span className="text-xs font-semibold text-slate-500 block mb-1.5">Capabilities:</span>
                <div className="flex flex-wrap gap-1.5">
                  {(p.capabilities || []).map((cap) => (
                    <span 
                      key={cap}
                      className="px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1"
                    >
                      {cap === 'sim_hosting' && <Smartphone className="w-3 h-3" />}
                      {cap === 'vtu_data' && <Zap className="w-3 h-3" />}
                      {cap === 'vtu_airtime' && <Layers className="w-3 h-3" />}
                      {cap.replace('_', ' ')}
                    </span>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-100 flex flex-col gap-2">
                {!p.is_primary && (
                  <button
                    onClick={() => handleActivate(p.id)}
                    className="w-full py-2 px-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Set as Primary Provider
                  </button>
                )}

                {p.capabilities?.includes('sim_hosting') && (
                  <button
                    onClick={() => handleSyncSims(p)}
                    disabled={isSyncingId === p.id}
                    className="w-full py-2 px-3 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncingId === p.id ? 'animate-spin' : ''}`} />
                    {isSyncingId === p.id ? 'Syncing SIMs...' : `Sync SIMs from ${p.name}`}
                  </button>
                )}
              </div>
            </SurfaceCard>
          ))}
        </div>
      )}

      {/* Granular Network & Service Routing Panel */}
      <SurfaceCard className="p-6 border border-slate-200">
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-100 gap-4 mb-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Layers className="w-5 h-5 text-primary-600" />
              Granular Network & Service Provider Routing
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Select specific providers for individual networks (e.g. Glo Data via Legitdataway). Channels set to default automatically route through your active Primary Provider.
            </p>
          </div>
          <button
            onClick={handleSaveRoutes}
            disabled={savingRoutes}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-bold shadow-sm transition disabled:opacity-50 self-start md:self-auto"
          >
            <ShieldCheck className="w-4 h-4" />
            {savingRoutes ? 'Saving...' : 'Save Routing Rules'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* MTN */}
          <div className="p-4 bg-amber-50/50 border border-amber-200 rounded-xl space-y-4">
            <div className="flex items-center gap-2 font-bold text-amber-900 border-b border-amber-200/60 pb-2">
              <div className="w-3 h-3 rounded-full bg-amber-500"></div>
              <span>MTN Network</span>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">MTN Data Provider</label>
              <select
                value={routes['mtn_data'] || ''}
                onChange={(e) => handleRouteChange('mtn_data', e.target.value)}
                className="w-full text-xs p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              >
                <option value="">(Default: Primary Provider)</option>
                {providers.filter(p => p.is_active).map(p => (
                  <option key={p.id} value={p.slug}>{p.name} {p.is_primary ? '(Primary)' : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">MTN Airtime Provider</label>
              <select
                value={routes['mtn_airtime'] || ''}
                onChange={(e) => handleRouteChange('mtn_airtime', e.target.value)}
                className="w-full text-xs p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              >
                <option value="">(Default: Primary Provider)</option>
                {providers.filter(p => p.is_active).map(p => (
                  <option key={p.id} value={p.slug}>{p.name} {p.is_primary ? '(Primary)' : ''}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Airtel */}
          <div className="p-4 bg-red-50/50 border border-red-200 rounded-xl space-y-4">
            <div className="flex items-center gap-2 font-bold text-red-900 border-b border-red-200/60 pb-2">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <span>Airtel Network</span>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Airtel Data Provider</label>
              <select
                value={routes['airtel_data'] || ''}
                onChange={(e) => handleRouteChange('airtel_data', e.target.value)}
                className="w-full text-xs p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              >
                <option value="">(Default: Primary Provider)</option>
                {providers.filter(p => p.is_active).map(p => (
                  <option key={p.id} value={p.slug}>{p.name} {p.is_primary ? '(Primary)' : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Airtel Airtime Provider</label>
              <select
                value={routes['airtel_airtime'] || ''}
                onChange={(e) => handleRouteChange('airtel_airtime', e.target.value)}
                className="w-full text-xs p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              >
                <option value="">(Default: Primary Provider)</option>
                {providers.filter(p => p.is_active).map(p => (
                  <option key={p.id} value={p.slug}>{p.name} {p.is_primary ? '(Primary)' : ''}</option>
                ))}
              </select>
            </div>
          </div>

          {/* GLO */}
          <div className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-xl space-y-4">
            <div className="flex items-center gap-2 font-bold text-emerald-900 border-b border-emerald-200/60 pb-2">
              <div className="w-3 h-3 rounded-full bg-emerald-600"></div>
              <span>Glo Network</span>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Glo Data Provider</label>
              <select
                value={routes['glo_data'] || ''}
                onChange={(e) => handleRouteChange('glo_data', e.target.value)}
                className="w-full text-xs p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 font-bold text-emerald-800"
              >
                <option value="">(Default: Primary Provider)</option>
                {providers.filter(p => p.is_active).map(p => (
                  <option key={p.id} value={p.slug}>{p.name} {p.is_primary ? '(Primary)' : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Glo Airtime Provider</label>
              <select
                value={routes['glo_airtime'] || ''}
                onChange={(e) => handleRouteChange('glo_airtime', e.target.value)}
                className="w-full text-xs p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              >
                <option value="">(Default: Primary Provider)</option>
                {providers.filter(p => p.is_active).map(p => (
                  <option key={p.id} value={p.slug}>{p.name} {p.is_primary ? '(Primary)' : ''}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 9mobile */}
          <div className="p-4 bg-teal-50/50 border border-teal-200 rounded-xl space-y-4">
            <div className="flex items-center gap-2 font-bold text-teal-900 border-b border-teal-200/60 pb-2">
              <div className="w-3 h-3 rounded-full bg-teal-600"></div>
              <span>9mobile / T2 Network</span>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">9mobile Data Provider</label>
              <select
                value={routes['9mobile_data'] || ''}
                onChange={(e) => handleRouteChange('9mobile_data', e.target.value)}
                className="w-full text-xs p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              >
                <option value="">(Default: Primary Provider)</option>
                {providers.filter(p => p.is_active).map(p => (
                  <option key={p.id} value={p.slug}>{p.name} {p.is_primary ? '(Primary)' : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">9mobile Airtime Provider</label>
              <select
                value={routes['9mobile_airtime'] || ''}
                onChange={(e) => handleRouteChange('9mobile_airtime', e.target.value)}
                className="w-full text-xs p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              >
                <option value="">(Default: Primary Provider)</option>
                {providers.filter(p => p.is_active).map(p => (
                  <option key={p.id} value={p.slug}>{p.name} {p.is_primary ? '(Primary)' : ''}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </SurfaceCard>

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h2 className="text-xl font-bold text-slate-900">
                {editingProvider ? `Edit ${editingProvider.name}` : 'Configure New API Provider'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Templates */}
            {!editingProvider && (
              <div className="my-4 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-xs font-bold text-slate-600 block mb-2">QUICK FILL TEMPLATES:</span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => applyTemplate('quicklysim')}
                    className="px-3 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded hover:bg-slate-100 text-slate-800 flex items-center gap-1"
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-500" />
                    QuicklySIM (Recommended)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyTemplate('legitdataway')}
                    className="px-3 py-1.5 text-xs font-semibold bg-white border border-emerald-300 text-emerald-800 rounded hover:bg-emerald-50 flex items-center gap-1"
                  >
                    <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                    Legitdataway (Glo Data)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyTemplate('smeplug')}
                    className="px-3 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded hover:bg-slate-100 text-slate-800 flex items-center gap-1"
                  >
                    <Server className="w-3.5 h-3.5 text-blue-500" />
                    Smeplug
                  </button>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Provider Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. QuicklySIM"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Slug Identifier</label>
                  <input
                    type="text"
                    placeholder="quicklysim"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500"
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Base API URL *</label>
                <input
                  type="url"
                  required
                  placeholder="https://www.quicklysim.com/api"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500"
                  value={formData.base_url}
                  onChange={(e) => setFormData({ ...formData, base_url: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">API Key</label>
                  <input
                    type="text"
                    placeholder="API key or Token"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 font-mono"
                    value={formData.api_key}
                    onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Secret Key</label>
                  <input
                    type="password"
                    placeholder="Secret Key"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 font-mono"
                    value={formData.secret_key}
                    onChange={(e) => setFormData({ ...formData, secret_key: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Public Key / Merchant ID (Optional)</label>
                <input
                  type="text"
                  placeholder="Public Key or Business ID"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 font-mono"
                  value={formData.public_key}
                  onChange={(e) => setFormData({ ...formData, public_key: e.target.value })}
                />
              </div>

              {/* Capabilities Checkboxes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">Enabled Capabilities</label>
                <div className="flex flex-wrap gap-3">
                  {[
                    { key: 'vtu_data', label: 'VTU Data Vending' },
                    { key: 'vtu_airtime', label: 'VTU Airtime' },
                    { key: 'sim_hosting', label: 'SIM Hosting & Sync' },
                  ].map((cap) => (
                    <label key={cap.key} className="flex items-center gap-2 cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={formData.capabilities.includes(cap.key)}
                        onChange={() => toggleCapability(cap.key)}
                        className="rounded text-primary-600 focus:ring-primary-500"
                      />
                      <span>{cap.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Primary Checkbox */}
              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_primary}
                    onChange={(e) => setFormData({ ...formData, is_primary: e.target.checked })}
                    className="rounded text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm font-semibold text-slate-800">
                    Set as active primary provider immediately
                  </span>
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-bold shadow-sm transition"
                >
                  {editingProvider ? 'Update Provider' : 'Save Provider'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
