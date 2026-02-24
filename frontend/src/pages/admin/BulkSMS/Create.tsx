import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../../services/api';
import { ArrowLeft, Send } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ApiResponse } from '../../../types';

export default function CreateBulkSMS() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    senderId: '',
    recipients: '',
    message: '',
    targetGroup: '' // '' | 'all_users' | 'resellers'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const res = await api.post<ApiResponse>('/admin/bulk-sms', formData);
      setSuccess(res.data.message || 'SMS sent successfully');
      setTimeout(() => navigate('/admin/bulk-sms'), 2000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to send SMS');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/admin/bulk-sms" className="p-2 hover:bg-gray-100 rounded-full transition-colors">
          <ArrowLeft className="w-6 h-6 text-gray-600" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Send Bulk SMS</h1>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        {error && (
          <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-lg border border-red-200">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-4 bg-green-50 text-green-700 rounded-lg border border-green-200">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Target Audience
            </label>
            <select
              value={formData.targetGroup}
              onChange={(e) => setFormData({ ...formData, targetGroup: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">Manual Entry (Specific Numbers)</option>
              <option value="all_users">All Users</option>
              <option value="resellers">Resellers Only</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sender ID (Max 11 chars)
            </label>
            <input
              type="text"
              maxLength={11}
              value={formData.senderId}
              onChange={(e) => setFormData({ ...formData, senderId: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="e.g., PeaceBundle"
              required
            />
          </div>

          {!formData.targetGroup && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Recipients (Comma separated)
              </label>
              <textarea
                value={formData.recipients}
                onChange={(e) => setFormData({ ...formData, recipients: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent h-32"
                placeholder="08012345678, 09012345678"
                required={!formData.targetGroup}
              />
              <p className="mt-1 text-sm text-gray-500">
                Enter phone numbers separated by commas.
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Message
            </label>
            <textarea
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent h-32"
              placeholder="Type your message here..."
              required
            />
            <p className="mt-1 text-sm text-gray-500">
              {formData.message.length} characters • {Math.ceil(formData.message.length / 160) || 1} page(s)
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center px-4 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Send className="w-5 h-5 mr-2" />
                Send SMS
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
