import { useState, useEffect } from 'react';
import axios from 'axios';
import { Search, Filter, MessageSquare, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function AdminSupport() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [replyText, setReplyText] = useState('');
  const [replyStatus, setReplyStatus] = useState('resolved');

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    try {
      const res = await axios.get('/api/support/admin');
      setTickets(res.data);
    } catch (error) {
      console.error(error);
      toast.error('Failed to load tickets');
    } finally {
      setLoading(false);
    }
  };

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket) return;

    try {
      await axios.put(`/api/support/${selectedTicket.id}/reply`, {
        response: replyText,
        status: replyStatus
      });
      toast.success('Reply sent successfully');
      setSelectedTicket(null);
      setReplyText('');
      fetchTickets();
    } catch (error) {
      console.error(error);
      toast.error('Failed to send reply');
    }
  };

  const filteredTickets = tickets.filter(ticket => {
    if (filter === 'all') return true;
    return ticket.status === filter;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-yellow-100 text-yellow-800';
      case 'resolved': return 'bg-green-100 text-green-800';
      case 'closed': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Support Management</h1>
          <p className="text-gray-500">Manage and resolve user support tickets</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex space-x-2 bg-white p-2 rounded-lg shadow-sm w-fit">
        {['all', 'open', 'resolved', 'closed'].map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-4 py-2 rounded-md text-sm font-medium capitalize transition-colors ${
              filter === status
                ? 'bg-primary-100 text-primary-700'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            {status}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ticket List */}
        <div className="lg:col-span-1 bg-white rounded-lg shadow-sm overflow-hidden h-[600px] flex flex-col">
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <h3 className="font-medium text-gray-700">Tickets ({filteredTickets.length})</h3>
          </div>
          <div className="overflow-y-auto flex-1 divide-y divide-gray-200">
            {loading ? (
              <div className="p-4 text-center">Loading...</div>
            ) : filteredTickets.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No tickets found</div>
            ) : (
              filteredTickets.map((ticket) => (
                <div
                  key={ticket.id}
                  onClick={() => setSelectedTicket(ticket)}
                  className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                    selectedTicket?.id === ticket.id ? 'bg-primary-50 border-l-4 border-primary-500' : ''
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-xs font-mono text-gray-500">#{ticket.ticket_number}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${getStatusColor(ticket.status)}`}>
                      {ticket.status}
                    </span>
                  </div>
                  <h4 className="font-medium text-gray-900 mb-1 truncate">{ticket.subject}</h4>
                  <div className="flex justify-between items-center text-xs text-gray-500">
                    <span>{ticket.User?.name || 'Unknown User'}</span>
                    <span>{new Date(ticket.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Ticket Detail & Reply */}
        <div className="lg:col-span-2 bg-white rounded-lg shadow-sm h-[600px] flex flex-col">
          {selectedTicket ? (
            <>
              <div className="p-6 border-b border-gray-200 flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 mb-2">{selectedTicket.subject}</h2>
                  <div className="flex items-center space-x-4 text-sm text-gray-500">
                    <span className="flex items-center">
                      <MessageSquare className="w-4 h-4 mr-1" />
                      {selectedTicket.User?.name} ({selectedTicket.User?.email})
                    </span>
                    <span className="flex items-center">
                      <Clock className="w-4 h-4 mr-1" />
                      {new Date(selectedTicket.createdAt).toLocaleString()}
                    </span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(selectedTicket.status)} capitalize`}>
                      {selectedTicket.status}
                    </span>
                  </div>
                </div>
                <div className={`px-3 py-1 rounded-md text-sm font-medium ${
                  selectedTicket.priority === 'critical' ? 'bg-red-100 text-red-800' : 
                  selectedTicket.priority === 'high' ? 'bg-orange-100 text-orange-800' : 
                  'bg-blue-100 text-blue-800'
                }`}>
                  {selectedTicket.priority} Priority
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* User Message */}
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <p className="text-sm font-medium text-gray-900 mb-2">Message:</p>
                  <p className="text-gray-700 whitespace-pre-wrap">{selectedTicket.message}</p>
                </div>

                {/* Admin Previous Response */}
                {selectedTicket.admin_response && (
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 ml-8">
                    <div className="flex justify-between mb-2">
                      <p className="text-sm font-medium text-blue-900">Admin Response:</p>
                      {selectedTicket.resolved_at && (
                        <span className="text-xs text-blue-700">
                          {new Date(selectedTicket.resolved_at).toLocaleString()}
                        </span>
                      )}
                    </div>
                    <p className="text-blue-800 whitespace-pre-wrap">{selectedTicket.admin_response}</p>
                  </div>
                )}
              </div>

              {/* Reply Form */}
              <div className="p-6 border-t border-gray-200 bg-gray-50">
                <form onSubmit={handleReply}>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Reply & Update Status</label>
                    <textarea
                      rows={3}
                      className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-primary-500 focus:border-primary-500"
                      placeholder="Type your response here..."
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      required
                    />
                  </div>
                  <div className="flex justify-between items-center">
                    <select
                      className="border-gray-300 rounded-lg shadow-sm focus:ring-primary-500 focus:border-primary-500 text-sm"
                      value={replyStatus}
                      onChange={(e) => setReplyStatus(e.target.value)}
                    >
                      <option value="open">Keep Open</option>
                      <option value="resolved">Mark as Resolved</option>
                      <option value="closed">Close Ticket</option>
                    </select>
                    <button
                      type="submit"
                      className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors flex items-center"
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Send Response
                    </button>
                  </div>
                </form>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <MessageSquare className="w-16 h-16 mb-4 opacity-20" />
              <p>Select a ticket to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}