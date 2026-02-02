import { useState } from 'react';
import api from '../../services/api';
import { GraduationCap, CheckCircle, Copy } from 'lucide-react';

const EXAM_TYPES = [
  { id: 'WAEC', name: 'WAEC Result', price: 3500 },
  { id: 'NECO', name: 'NECO Result', price: 1200 },
  { id: 'NABTEB', name: 'NABTEB Result', price: 1000 },
];

export default function EducationPins() {
  const [examType, setExamType] = useState(EXAM_TYPES[0].id);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [pins, setPins] = useState<any[]>([]);

  const handlePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setPins([]);

    try {
      const userStr = localStorage.getItem('user');
      if (!userStr) throw new Error('User not found');
      const user = JSON.parse(userStr);

      const res = await api.post('/transactions/result-checker', {
        userId: user.id,
        examType,
        quantity: parseInt(quantity.toString())
      });

      setMessage({ type: 'success', text: 'Pins generated successfully!' });
      const data = res.data as any;
      setPins(data.pins || []);
    } catch (err: any) {
      setMessage({ 
        type: 'error', 
        text: err.response?.data?.message || 'Purchase failed. Please try again.' 
      });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // Could add a toast here
  };

  const selectedExam = EXAM_TYPES.find(e => e.id === examType);
  const totalCost = (selectedExam?.price || 0) * quantity;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center mb-8">
        <div className="p-3 bg-blue-100 rounded-full mr-4">
          <GraduationCap className="w-8 h-8 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Buy Exam Pins</h1>
          <p className="text-gray-600">Instant result checker pins for WAEC, NECO, NABTEB</p>
        </div>
      </div>

      <div className="bg-white p-8 rounded-lg shadow-md border border-gray-100">
        {message && (
          <div className={`p-4 mb-6 rounded-md ${
            message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {message.text}
          </div>
        )}

        <form onSubmit={handlePurchase}>
          <div className="mb-6">
            <label className="block text-gray-700 font-bold mb-2">Select Exam Type</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {EXAM_TYPES.map((exam) => (
                <button
                  key={exam.id}
                  type="button"
                  onClick={() => setExamType(exam.id)}
                  className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center justify-center relative ${
                    examType === exam.id
                      ? 'border-blue-500 bg-blue-50 text-blue-900'
                      : 'border-gray-200 hover:border-blue-200 text-gray-600'
                  }`}
                >
                  <span className="font-bold text-lg mb-1">{exam.name}</span>
                  <span className="text-sm font-medium bg-white px-2 py-1 rounded-full border border-gray-100 shadow-sm">
                    ₦{exam.price}
                  </span>
                  {examType === exam.id && (
                    <div className="absolute top-2 right-2">
                      <CheckCircle className="w-4 h-4 text-blue-600" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-gray-700 font-bold mb-2">Quantity</label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              min="1"
              max="10"
              required
            />
          </div>

          <div className="mb-8 p-4 bg-gray-50 rounded-xl flex justify-between items-center border border-gray-100">
            <span className="text-gray-600 font-medium">Total Cost</span>
            <span className="text-2xl font-bold text-blue-700">₦{totalCost.toLocaleString()}</span>
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-4 px-4 bg-blue-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:bg-blue-700 transition-all transform hover:-translate-y-0.5 ${
              loading ? 'opacity-70 cursor-not-allowed transform-none shadow-none' : ''
            }`}
          >
            {loading ? 'Processing...' : 'Purchase Pins'}
          </button>
        </form>

        {pins.length > 0 && (
          <div className="mt-10 border-t pt-8">
            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
              <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
              Generated Pins
            </h3>
            <div className="space-y-4">
              {pins.map((pin, index) => (
                <div key={index} className="p-4 border border-green-200 bg-green-50 rounded-xl shadow-sm relative group">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-xs text-gray-500 uppercase tracking-wider block mb-1">Pin</span>
                      <span className="text-lg font-mono font-bold text-gray-900 tracking-wide">{pin.pin}</span>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500 uppercase tracking-wider block mb-1">Serial Number</span>
                      <span className="text-lg font-mono font-medium text-gray-700">{pin.serial}</span>
                    </div>
                  </div>
                  <button 
                    onClick={() => copyToClipboard(`Pin: ${pin.pin} Serial: ${pin.serial}`)}
                    className="absolute top-2 right-2 p-2 text-gray-400 hover:text-blue-600 hover:bg-white rounded-lg transition-all opacity-0 group-hover:opacity-100"
                    title="Copy to clipboard"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
