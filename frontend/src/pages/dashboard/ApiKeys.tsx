import { useState, useEffect } from 'react';
import api from '../../services/api';
import { Key, Copy, RefreshCw, Loader2 } from 'lucide-react';

export default function ApiKeys() {
  const [apiKey, setApiKey] = useState('');
  const [isRevealed, setIsRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    fetchApiKey();
  }, []);

  const fetchApiKey = async () => {
    try {
      const res = await api.get('/users/apikey');
      setApiKey((res.data as any).key);
    } catch (error) {
      console.error('Failed to fetch API key', error);
    } finally {
      setLoading(false);
    }
  };

  const regenerateKey = async () => {
    if (!window.confirm('Are you sure? This will invalidate your old key.')) return;
    
    setRegenerating(true);
    try {
      const res = await api.post('/users/apikey/regenerate');
      setApiKey((res.data as any).key);
    } catch (error) {
      console.error('Failed to regenerate API key', error);
    } finally {
      setRegenerating(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(apiKey);
    // Add toast
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center">
        <Key className="w-6 h-6 text-primary-600 mr-2" />
        <h1 className="text-2xl font-bold text-gray-900">API Keys & Webhooks</h1>
      </div>

      <div className="bg-white shadow rounded-lg p-6">
        <p className="text-gray-600 mb-6">
          Use these keys to authenticate your requests to our API. Keep your secret keys safe!
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Public Key</label>
            <div className="flex">
              <input
                type={isRevealed ? "text" : "password"}
                readOnly
                value={apiKey}
                className="flex-1 block w-full rounded-l-md border-gray-300 bg-gray-50 p-2 border sm:text-sm"
              />
              <button
                onClick={copyToClipboard}
                className="inline-flex items-center px-4 py-2 border border-l-0 border-gray-300 rounded-r-md bg-gray-50 text-gray-500 hover:bg-gray-100"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex space-x-4">
            <button
              onClick={() => setIsRevealed(!isRevealed)}
              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              {isRevealed ? 'Hide Key' : 'Reveal Key'}
            </button>
            <button
              onClick={regenerateKey}
              disabled={regenerating}
              className="flex items-center text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50"
            >
              {regenerating ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
              Generate New Key
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Webhook URL</h3>
        <div className="flex">
          <input
            type="url"
            placeholder="https://your-domain.com/webhook"
            className="flex-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 p-2 border sm:text-sm"
          />
          <button className="ml-3 inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
