import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../../services/api';
import { Loader2, Save, X, Plus, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function CreateOrEditSubscriptionPlan() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEdit);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    currency: 'NGN',
    billing_cycle: 'monthly',
    features: [] as string[],
    usage_limits: {} as Record<string, any>,
    is_active: true,
    promo_price: '',
    promo_start_date: '',
    promo_end_date: '',
    sort_order: 0
  });

  const [newFeature, setNewFeature] = useState('');

  useEffect(() => {
    if (isEdit) {
      fetchPlan();
    }
  }, [id]);

  const fetchPlan = async () => {
    try {
      const res = await api.get(`/admin/subscription-plans`);
      const plan = res.data.find((p: any) => p.id === id);
      if (plan) {
        setFormData({
          ...plan,
          promo_start_date: plan.promo_start_date ? new Date(plan.promo_start_date).toISOString().split('T')[0] : '',
          promo_end_date: plan.promo_end_date ? new Date(plan.promo_end_date).toISOString().split('T')[0] : '',
        });
      }
    } catch (error) {
      toast.error('Failed to fetch plan details');
      navigate('/admin/subscriptions');
    } finally {
      setFetching(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const payload = {
        ...formData,
        price: parseFloat(formData.price as string),
        promo_price: formData.promo_price ? parseFloat(formData.promo_price as string) : null,
      };

      if (isEdit) {
        await api.put(`/admin/subscription-plans/${id}`, payload);
        toast.success('Plan updated successfully');
      } else {
        await api.post('/admin/subscription-plans', payload);
        toast.success('Plan created successfully');
      }
      navigate('/admin/subscriptions');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  const addFeature = () => {
    if (newFeature.trim()) {
      setFormData({ ...formData, features: [...formData.features, newFeature.trim()] });
      setNewFeature('');
    }
  };

  const removeFeature = (index: number) => {
    const newFeatures = [...formData.features];
    newFeatures.splice(index, 1);
    setFormData({ ...formData, features: newFeatures });
  };

  if (fetching) return <div className="flex justify-center p-12"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="max-w-4xl mx-auto bg-white shadow-xl rounded-2xl p-8 border border-gray-100">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900">{isEdit ? 'Edit' : 'Create'} Subscription Plan</h2>
        <button onClick={() => navigate('/admin/subscriptions')} className="text-gray-400 hover:text-gray-600">
          <X className="w-6 h-6" />
        </button>
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="col-span-2">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Plan Name</label>
            <input
              type="text"
              required
              className="w-full rounded-xl border-gray-200 shadow-sm focus:border-primary-500 focus:ring-primary-500 p-3 border"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Professional Plan"
            />
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Description</label>
            <textarea
              className="w-full rounded-xl border-gray-200 shadow-sm focus:border-primary-500 focus:ring-primary-500 p-3 border"
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe what's included in this plan..."
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Price</label>
            <div className="relative">
              <span className="absolute left-3 top-3 text-gray-400">{formData.currency === 'NGN' ? '₦' : '$'}</span>
              <input
                type="number"
                required
                step="0.01"
                className="w-full rounded-xl border-gray-200 shadow-sm focus:border-primary-500 focus:ring-primary-500 p-3 pl-8 border"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Billing Cycle</label>
            <select
              className="w-full rounded-xl border-gray-200 shadow-sm focus:border-primary-500 focus:ring-primary-500 p-3 border"
              value={formData.billing_cycle}
              onChange={(e) => setFormData({ ...formData, billing_cycle: e.target.value as any })}
            >
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annual">Annual</option>
            </select>
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Features</label>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                className="flex-1 rounded-xl border-gray-200 shadow-sm focus:border-primary-500 focus:ring-primary-500 p-3 border"
                value={newFeature}
                onChange={(e) => setNewFeature(e.target.value)}
                placeholder="Add a feature..."
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addFeature())}
              />
              <button
                type="button"
                onClick={addFeature}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2">
              {formData.features.map((feature, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <span className="text-gray-700">{feature}</span>
                  <button type="button" onClick={() => removeFeature(index)} className="text-red-400 hover:text-red-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="col-span-2 border-t pt-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Promotional Pricing (Optional)</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Promo Price</label>
                <input
                  type="number"
                  className="w-full rounded-xl border-gray-200 shadow-sm focus:border-primary-500 focus:ring-primary-500 p-3 border"
                  value={formData.promo_price}
                  onChange={(e) => setFormData({ ...formData, promo_price: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Start Date</label>
                <input
                  type="date"
                  className="w-full rounded-xl border-gray-200 shadow-sm focus:border-primary-500 focus:ring-primary-500 p-3 border"
                  value={formData.promo_start_date}
                  onChange={(e) => setFormData({ ...formData, promo_start_date: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">End Date</label>
                <input
                  type="date"
                  className="w-full rounded-xl border-gray-200 shadow-sm focus:border-primary-500 focus:ring-primary-500 p-3 border"
                  value={formData.promo_end_date}
                  onChange={(e) => setFormData({ ...formData, promo_end_date: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-3 pt-4">
            <input
              type="checkbox"
              id="is_active"
              className="h-5 w-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
            />
            <label htmlFor="is_active" className="text-sm font-semibold text-gray-700">Plan is Active</label>
          </div>
        </div>

        <div className="flex justify-end pt-8 border-t">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center px-8 py-3 bg-primary-600 text-white rounded-xl font-bold hover:bg-primary-700 transition shadow-lg shadow-primary-500/20 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}
            {isEdit ? 'Update Plan' : 'Create Plan'}
          </button>
        </div>
      </form>
    </div>
  );
}
