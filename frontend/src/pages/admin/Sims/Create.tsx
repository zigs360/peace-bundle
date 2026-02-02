import { useState } from 'react';
import SelectProvider from '../../../components/Forms/SelectProvider';
import api from '../../../services/api';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

export default function CreateSim() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    provider: 'mtn',
    phoneNumber: '',
    notes: '',
    status: 'active'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      await api.post('/sims', formData);
      navigate('/admin/sims');
    } catch (error) {
      console.error('Failed to add SIM', error);
      alert('Failed to add SIM');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto bg-white shadow rounded-lg p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-6">Connect New SIM</h2>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <SelectProvider 
          value={formData.provider} 
          onChange={(val) => setFormData({ ...formData, provider: val })} 
        />

        <div>
          <label className="block text-sm font-medium text-gray-700">Phone Number</label>
          <input
            type="text"
            required
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm p-2 border"
            value={formData.phoneNumber}
            onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
            placeholder="e.g. 08031234567"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">SIM Alias / Name</label>
          <input
            type="text"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm p-2 border"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="e.g. Server 1 (Main)"
          />
        </div>

        <div>
           <label className="block text-sm font-medium text-gray-700">Status</label>
           <select
             className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm p-2 border"
             value={formData.status}
             onChange={(e) => setFormData({ ...formData, status: e.target.value })}
           >
             <option value="active">Active</option>
             <option value="inactive">Inactive</option>
             <option value="paused">Paused</option>
           </select>
        </div>

        <div className="flex justify-end pt-4">
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center disabled:opacity-50"
          >
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Connect SIM
          </button>
        </div>
      </form>
    </div>
  );
}
