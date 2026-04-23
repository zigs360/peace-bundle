import { useState } from 'react';
import SelectProvider from '../../../components/Forms/SelectProvider';
import api from '../../../services/api';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

export default function CreatePlan() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    source: 'smeplug',
    provider: 'mtn',
    category: 'gifting',
    name: '',
    plan_id: '',
    original_price: '',
    your_price: '',
    wallet_price: '',
    data_size: '',
    size_mb: '',
    validity: '30 Days',
    available_sim: true,
    available_wallet: true,
    is_active: true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      await api.post('/admin/plans', {
        ...formData,
        size_mb: parseInt(formData.size_mb) || 0,
      });
      navigate('/admin/plans');
    } catch (error) {
      console.error('Failed to create plan', error);
      alert('Failed to create plan');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto bg-white shadow rounded-lg p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-6">Create New Data Plan</h2>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700">Source</label>
          <select
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm p-2 border"
            value={formData.source}
            onChange={(e) => setFormData({ ...formData, source: e.target.value })}
          >
            <option value="smeplug">SMEPlug</option>
            <option value="ogdams">OGDams</option>
          </select>
        </div>

        <SelectProvider 
          value={formData.provider} 
          onChange={(val) => setFormData({ ...formData, provider: val })} 
        />

        <div className="grid grid-cols-2 gap-4">
          <div>
             <label className="block text-sm font-medium text-gray-700">Category</label>
             <select
               className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm p-2 border"
               value={formData.category}
               onChange={(e) => setFormData({ ...formData, category: e.target.value })}
             >
               <option value="sme">SME</option>
               <option value="gifting">Gifting</option>
               <option value="corporate_gifting">Corporate Gifting</option>
             </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Plan ID / API Code</label>
            <input
              type="text"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm p-2 border"
              value={formData.plan_id}
              onChange={(e) => setFormData({ ...formData, plan_id: e.target.value })}
              placeholder="e.g. 20002"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Plan Name</label>
          <input
            type="text"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm p-2 border"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g. 1GB SME Data"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Network Price (₦)</label>
            <input
              type="number"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm p-2 border"
              value={formData.original_price}
              onChange={(e) => setFormData({ ...formData, original_price: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Your Price (₦)</label>
            <input
              type="number"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm p-2 border"
              value={formData.your_price}
              onChange={(e) => setFormData({ ...formData, your_price: e.target.value })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Wallet Price (₦)</label>
            <input
              type="number"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm p-2 border"
              value={formData.wallet_price}
              onChange={(e) => setFormData({ ...formData, wallet_price: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Data Size</label>
            <input
              type="text"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm p-2 border"
              value={formData.data_size}
              onChange={(e) => setFormData({ ...formData, data_size: e.target.value })}
              placeholder="e.g. 1GB"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Size (MB)</label>
            <input
              type="number"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm p-2 border"
              value={formData.size_mb}
              onChange={(e) => setFormData({ ...formData, size_mb: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-3 gap-3 items-end">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={formData.available_sim} onChange={(e) => setFormData({ ...formData, available_sim: e.target.checked })} />
              SIM
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={formData.available_wallet} onChange={(e) => setFormData({ ...formData, available_wallet: e.target.checked })} />
              Wallet
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={formData.is_active} onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })} />
              Active
            </label>
          </div>
        </div>
        
        <div>
            <label className="block text-sm font-medium text-gray-700">Validity</label>
            <input
              type="text"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm p-2 border"
              value={formData.validity}
              onChange={(e) => setFormData({ ...formData, validity: e.target.value })}
            />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Create Plan'}
        </button>
      </form>
    </div>
  );
}
