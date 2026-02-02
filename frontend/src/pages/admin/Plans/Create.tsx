import { useState } from 'react';
import SelectProvider from '../../../components/Forms/SelectProvider';
import api from '../../../services/api';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

export default function CreatePlan() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    provider: 'mtn',
    category: 'sme',
    name: '',
    admin_price: '',
    size: '',
    validity: '30 Days',
    smeplug_plan_id: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      await api.post('/plans', {
        ...formData,
        size_mb: parseInt(formData.size) || 0
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
            <label className="block text-sm font-medium text-gray-700">SMEPlug Plan ID</label>
            <input
              type="text"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm p-2 border"
              value={formData.smeplug_plan_id}
              onChange={(e) => setFormData({ ...formData, smeplug_plan_id: e.target.value })}
              placeholder="e.g. MTN_1GB"
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
            <label className="block text-sm font-medium text-gray-700">Price (₦)</label>
            <input
              type="number"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm p-2 border"
              value={formData.admin_price}
              onChange={(e) => setFormData({ ...formData, admin_price: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Size (MB)</label>
            <input
              type="number"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm p-2 border"
              value={formData.size}
              onChange={(e) => setFormData({ ...formData, size: e.target.value })}
            />
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
